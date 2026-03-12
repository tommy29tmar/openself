# Memory Tier Optimization — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Maximize the real value of all 4 memory tiers for the LLM by fixing meta-memory pipeline reliability, injecting episodic events into context, enabling connector dual-write, and expanding budget/profiles.

**Architecture:** Fix the existing session compaction → meta-memory pipeline (quality, cooldown bypass, relevance retrieval). Add a new "RECENT EVENTS" PromptBlock for episodic smart injection with source-weighted caps. Extend GitHub and LinkedIn connectors to write notable events to episodic memory. Increase total context budget from 65k to 75k with updated per-state profiles.

**Tech Stack:** TypeScript, SQLite (Drizzle ORM), Vitest, Vercel AI SDK, GitHub REST API

**Design doc:** `docs/plans/2026-03-11-memory-tier-optimization-design.md`

---

## File Structure

### New files
- `db/migrations/0029_memory_source_columns.sql` — source columns on agent_memory + episodic_events
- `src/lib/connectors/github/activity.ts` — GitHub activity stream fetcher + significance filter
- `src/lib/connectors/linkedin-zip/activity-mapper.ts` — LinkedIn certifications/articles → episodic events
- `tests/evals/memory-worker-extraction.test.ts` — worker meta-memory auto-extraction tests
- `tests/evals/episodic-injection.test.ts` — episodic smart injection context tests
- `tests/evals/github-activity.test.ts` — GitHub activity stream tests
- `tests/evals/linkedin-activity.test.ts` — LinkedIn activity mapper tests

### Modified files
- `src/lib/db/schema.ts` — add `source` column to agentMemory and episodicEvents
- `src/lib/db/migrate.ts` — bump EXPECTED_SCHEMA_VERSION to 29
- `src/lib/services/memory-service.ts` — add `saveMemoryFromWorker()`, relevance-scored retrieval
- `src/lib/services/episodic-service.ts` — add `source` param to `insertEvent()`, add `getRecentEventsForContext()`
- `src/lib/services/episodic-consolidation-service.ts` — add `source = 'chat'` filter to `checkPatternThresholds()`
- `src/lib/services/session-compaction-service.ts` — improve compaction prompt with few-shot examples
- `src/lib/worker/index.ts` — use `saveMemoryFromWorker()` instead of `saveMemory()`
- `src/lib/agent/context.ts` — add episodic PromptBlock, update BUDGET + CONTEXT_PROFILES, update memory retrieval
- `src/lib/agent/tools.ts` — pass `source: 'chat'` to `insertEvent()` in record_event tool
- `src/lib/connectors/github/sync.ts` — add activity stream dual-write
- `src/lib/connectors/github/client.ts` — add `fetchUserEvents()` function
- `src/lib/connectors/linkedin-zip/import.ts` — add activity mapper integration
- `src/lib/connectors/types.ts` — add `EpisodicEventInput` type
- `src/worker.ts` — bump EXPECTED_HANDLER_COUNT if needed
- `src/lib/agent/policies/memory-directives.ts` — update Tier 4 directive (now passively injected)

---

## Chunk 1: Schema & Meta-Memory Pipeline (Tasks 1-4)

### Task 1: Migration — Source Columns

**Files:**
- Create: `db/migrations/0029_memory_source_columns.sql`
- Modify: `src/lib/db/schema.ts`
- Modify: `src/lib/db/migrate.ts`

- [ ] **Step 1: Write the migration SQL**

```sql
-- db/migrations/0029_memory_source_columns.sql
-- Add source provenance to agent_memory and episodic_events

ALTER TABLE agent_memory ADD COLUMN source TEXT NOT NULL DEFAULT 'agent';
-- Values: 'agent' (tool call), 'worker' (session compaction)

ALTER TABLE episodic_events ADD COLUMN source TEXT NOT NULL DEFAULT 'chat';
-- Values: 'chat' (user-reported), 'github', 'linkedin', etc.

-- Add external_id column for connector dedup (stable per-event discriminator)
ALTER TABLE episodic_events ADD COLUMN external_id TEXT;
-- e.g., GitHub event ID "12345678", LinkedIn post URL hash

CREATE INDEX idx_episodic_source ON episodic_events(owner_key, source, event_at_unix);
CREATE INDEX idx_agent_memory_source ON agent_memory(owner_key, source);

-- Connector dedup: unique per source + external_id (only for non-chat events with an external ID)
CREATE UNIQUE INDEX IF NOT EXISTS idx_episodic_connector_dedup
  ON episodic_events(owner_key, source, external_id)
  WHERE source != 'chat' AND external_id IS NOT NULL;
```

- [ ] **Step 2: Update Drizzle schema — agentMemory**

In `src/lib/db/schema.ts`, add `source` column to the `agentMemory` table definition (after `deactivatedAt`, before `createdAt`):

```typescript
source: text("source").notNull().default("agent"),
```

- [ ] **Step 3: Update Drizzle schema — episodicEvents**

In `src/lib/db/schema.ts`, add `source` and `externalId` columns to the `episodicEvents` table definition (after `archived`/`archivedAt`, before `createdAt`):

```typescript
source: text("source").notNull().default("chat"),
externalId: text("external_id"),
```

- [ ] **Step 4: Bump EXPECTED_SCHEMA_VERSION**

In `src/lib/db/migrate.ts`, change:
```typescript
export const EXPECTED_SCHEMA_VERSION = 29;
```

- [ ] **Step 5: Run migrations and verify**

Run: `npm run dev` (leader mode runs migrations automatically)
Expected: migration 0029 applied, tables have new columns

Run: `npx vitest run tests/evals/memory-service.test.ts`
Expected: existing tests still pass (DEFAULT values handle backward compat)

- [ ] **Step 6: Commit**

```bash
git add db/migrations/0029_memory_source_columns.sql src/lib/db/schema.ts src/lib/db/migrate.ts
git commit -m "feat: add source provenance columns to agent_memory and episodic_events (migration 0029)"
```

---

### Task 2: Worker Meta-Memory Write Path — `saveMemoryFromWorker()`

**Files:**
- Modify: `src/lib/services/memory-service.ts`
- Create: `tests/evals/memory-worker-extraction.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/evals/memory-worker-extraction.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { saveMemoryFromWorker, getActiveMemories, saveMemory } from "@/lib/services/memory-service";
import { sqlite } from "@/lib/db";
import { randomUUID } from "crypto";

function uniqueOwner() {
  return `test-worker-mem-${randomUUID()}`;
}

afterAll(() => {
  sqlite.prepare("DELETE FROM agent_memory WHERE owner_key LIKE 'test-worker-mem-%'").run();
});

describe("saveMemoryFromWorker", () => {
  it("saves with source='worker' provenance", () => {
    const owner = uniqueOwner();
    const mem = saveMemoryFromWorker(owner, "User prefers bullet points");
    expect(mem).not.toBeNull();
    expect(mem!.source).toBe("worker");
    expect(mem!.memoryType).toBe("pattern");
  });

  it("does NOT enforce per-minute cooldown", () => {
    const owner = uniqueOwner();
    // Save 10 memories rapidly — should all succeed (no 5/60s cooldown)
    const results = [];
    for (let i = 0; i < 10; i++) {
      results.push(saveMemoryFromWorker(owner, `Pattern observation ${i}`));
    }
    const saved = results.filter(r => r !== null);
    expect(saved.length).toBe(10);
  });

  it("still enforces the 50 max quota", () => {
    const owner = uniqueOwner();
    for (let i = 0; i < 50; i++) {
      saveMemoryFromWorker(owner, `Quota test ${i}`);
    }
    const overflow = saveMemoryFromWorker(owner, "This should be rejected");
    expect(overflow).toBeNull();
  });

  it("deduplicates by content hash", () => {
    const owner = uniqueOwner();
    const first = saveMemoryFromWorker(owner, "User likes dark mode");
    const dupe = saveMemoryFromWorker(owner, "User likes dark mode");
    expect(first).not.toBeNull();
    expect(dupe).toBeNull();
  });
});

describe("saveMemory (agent path) sets source='agent'", () => {
  it("saves with source='agent' by default", () => {
    const owner = uniqueOwner();
    const mem = saveMemory(owner, "Agent observation");
    expect(mem).not.toBeNull();
    const row = sqlite.prepare("SELECT source FROM agent_memory WHERE id = ?").get(mem!.id) as any;
    expect(row.source).toBe("agent");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/memory-worker-extraction.test.ts`
Expected: FAIL — `saveMemoryFromWorker` is not exported

- [ ] **Step 3: Implement `saveMemoryFromWorker()`**

In `src/lib/services/memory-service.ts`, add after the existing `saveMemory` function:

```typescript
/**
 * Save a meta-memory from the background worker.
 * No per-minute cooldown (worker runs infrequently).
 * Same 50 max quota and content-hash dedup.
 * Provenance: source = "worker".
 */
export function saveMemoryFromWorker(
  ownerKey: string,
  content: string,
  memoryType?: MemoryType,
  category?: string,
  confidence?: number,
): MemoryRow | null {
  const hash = computeContentHash(content);

  // Dedup: same content already active?
  const existing = db
    .select()
    .from(agentMemory)
    .where(
      and(
        eq(agentMemory.ownerKey, ownerKey),
        eq(agentMemory.contentHash, hash),
        eq(agentMemory.isActive, 1),
      ),
    )
    .get();
  if (existing) return null;

  // Quota check (no cooldown — worker runs infrequently)
  const activeCount = db
    .select({ count: sql<number>`count(*)` })
    .from(agentMemory)
    .where(and(eq(agentMemory.ownerKey, ownerKey), eq(agentMemory.isActive, 1)))
    .get();
  if ((activeCount?.count ?? 0) >= MAX_MEMORIES_PER_OWNER) return null;

  const id = randomUUID();
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO agent_memory (id, owner_key, content, memory_type, category, content_hash, confidence, is_active, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'worker', ?)`,
    )
    .run(id, ownerKey, content, memoryType ?? "pattern", category ?? null, hash, confidence ?? 0.8, now);

  return {
    id,
    ownerKey,
    content,
    memoryType: memoryType ?? "pattern",
    category: category ?? null,
    confidence: confidence ?? 0.8,
    contentHash: hash,
    isActive: 1,
    userFeedback: null,
    deactivatedAt: null,
    createdAt: now,
    source: "worker",
  };
}
```

Also update the `MemoryRow` type to include all persisted fields used by the read path:
```typescript
export type MemoryRow = {
  id: string;
  ownerKey: string;
  content: string;
  memoryType: MemoryType;
  category: string | null;
  confidence: number | null;
  isActive: number;
  userFeedback: string | null;
  createdAt: string | null;
  contentHash?: string | null;
  deactivatedAt?: string | null;
  source?: string;
};
```

**NOTE:** The existing `MemoryRow` only has 9 fields but `agentMemory` schema has `contentHash`, `deactivatedAt` (and now `source`). The scored retrieval function selects all columns, so `MemoryRow` must include them as optional fields. This is a backward-compatible extension — all existing consumers only read the original 9 fields.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/memory-worker-extraction.test.ts`
Expected: PASS

Run: `npx vitest run tests/evals/memory-service.test.ts`
Expected: PASS (existing tests unbroken)

- [ ] **Step 4b: Update `saveMemory()` cooldown to only count agent-sourced writes**

In `src/lib/services/memory-service.ts`, the cooldown query (around line 57-63) counts ALL recent writes regardless of source. After adding the `source` column, worker writes would consume cooldown slots for the agent. Fix:

```typescript
// OLD (line 58-61):
`SELECT COUNT(*) as cnt FROM agent_memory
 WHERE owner_key = ? AND created_at > datetime('now', '-${COOLDOWN_WINDOW_SECONDS} seconds')`

// NEW:
`SELECT COUNT(*) as cnt FROM agent_memory
 WHERE owner_key = ? AND COALESCE(source, 'agent') = 'agent'
 AND created_at > datetime('now', '-${COOLDOWN_WINDOW_SECONDS} seconds')`
```

**Add regression test** to `tests/evals/memory-worker-extraction.test.ts`:

```typescript
it("worker writes do not trip agent cooldown", () => {
  const owner = uniqueOwner();
  // Write 5 worker memories (fills normal cooldown limit)
  for (let i = 0; i < 5; i++) {
    saveMemoryFromWorker(owner, `Worker pattern ${i}`);
  }
  // Agent should still be able to write (worker writes are excluded from cooldown)
  const agentMem = saveMemory(owner, "Agent observation after worker writes");
  expect(agentMem).not.toBeNull();
});
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/memory-service.ts tests/evals/memory-worker-extraction.test.ts
git commit -m "feat: add saveMemoryFromWorker() with no cooldown and worker provenance"
```

---

### Task 3: Relevance-Scored Memory Retrieval

**Files:**
- Modify: `src/lib/services/memory-service.ts`
- Modify: `tests/evals/memory-service.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/evals/memory-service.test.ts`:

```typescript
describe("getActiveMemoriesScored", () => {
  // Use direct SQL seeding to bypass saveMemory() cooldown (5/60s)
  // Pattern from memory-service.test.ts:243 (memory quota test)
  const seedMemory = (owner: string, content: string, source: string, ageDays: number) => {
    const id = randomUUID();
    const hash = createHash("sha256").update(content.trim().toLowerCase()).digest("hex");
    const createdAt = new Date(Date.now() - ageDays * 86400000).toISOString();
    sqlite.prepare(
      `INSERT INTO agent_memory (id, owner_key, content, memory_type, content_hash, confidence, is_active, source, created_at)
       VALUES (?, ?, ?, 'observation', ?, 1.0, 1, ?, ?)`,
    ).run(id, owner, content, hash, source, createdAt);
  };

  it("returns up to 15 memories scored by relevance", () => {
    const owner = uniqueOwner();
    // Seed 20 memories with varying ages
    for (let i = 0; i < 20; i++) {
      seedMemory(owner, `Scored memory ${i}`, "agent", i * 2);
    }
    const result = getActiveMemoriesScored(owner, 15);
    expect(result.length).toBeLessThanOrEqual(15);
    expect(result.length).toBeGreaterThan(0);
  });

  it("ranks agent-sourced memories higher than worker-sourced at same age", () => {
    const owner = uniqueOwner();
    // Both created at same time (age=0) so only provenance weight differs
    seedMemory(owner, "Worker pattern A", "worker", 0);
    seedMemory(owner, "Agent observation B", "agent", 0);
    const result = getActiveMemoriesScored(owner, 15);
    // Agent memory should appear before worker memory (higher provenance weight)
    const agentIdx = result.findIndex(m => m.content === "Agent observation B");
    const workerIdx = result.findIndex(m => m.content === "Worker pattern A");
    expect(agentIdx).toBeLessThan(workerIdx);
  });
});
```

**NOTE:** `sqlite` and `randomUUID` are already imported in the test file. `createHash` must be added to the imports at the top:
```typescript
import { createHash } from "node:crypto";
```
(The existing quota test at line 243 uses `randomUUID` but not `createHash` — add it explicitly.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/memory-service.test.ts -t "getActiveMemoriesScored"`
Expected: FAIL — function not exported

- [ ] **Step 3: Implement `getActiveMemoriesScored()`**

In `src/lib/services/memory-service.ts`:

```typescript
const PROVENANCE_WEIGHT = { agent: 1.0, worker: 0.6 } as const;
const RECENCY_HALF_LIFE_DAYS = 14; // score halves every 14 days

/**
 * Relevance-scored retrieval: recency × provenance_weight.
 * Replaces flat getActiveMemories(ownerKey, 10) for context injection.
 */
export function getActiveMemoriesScored(ownerKey: string, limit: number = 15): MemoryRow[] {
  const rows = sqlite
    .prepare(
      `SELECT id, owner_key, content, memory_type, category, content_hash,
              confidence, is_active, user_feedback, deactivated_at, created_at,
              COALESCE(source, 'agent') AS source,
              julianday('now') - julianday(created_at) AS age_days
       FROM agent_memory
       WHERE owner_key = ? AND is_active = 1
       ORDER BY created_at DESC
       LIMIT 50`,
    )
    .all(ownerKey) as Array<{
      id: string; owner_key: string; content: string; memory_type: string;
      category: string | null; content_hash: string | null; confidence: number | null;
      is_active: number; user_feedback: string | null; deactivated_at: string | null;
      created_at: string | null; source: string; age_days: number;
    }>;

  // Map snake_case → camelCase MemoryRow + score
  const scored = rows.map((row) => {
    const ageDays = row.age_days ?? 0;
    const recencyScore = Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
    const provenanceScore =
      PROVENANCE_WEIGHT[row.source as keyof typeof PROVENANCE_WEIGHT] ?? 0.6;
    const mem: MemoryRow & { score: number } = {
      id: row.id,
      ownerKey: row.owner_key,
      content: row.content,
      memoryType: row.memory_type as MemoryType,
      category: row.category,
      contentHash: row.content_hash,
      confidence: row.confidence,
      isActive: row.is_active,
      userFeedback: row.user_feedback,
      deactivatedAt: row.deactivated_at,
      createdAt: row.created_at,
      source: row.source,
      score: recencyScore * provenanceScore,
    };
    return mem;
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/memory-service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/memory-service.ts tests/evals/memory-service.test.ts
git commit -m "feat: add relevance-scored memory retrieval with provenance weighting"
```

---

### Task 4: Improve Compaction Prompt + Wire Worker

**Files:**
- Modify: `src/lib/services/session-compaction-service.ts`
- Modify: `src/lib/worker/index.ts`

- [ ] **Step 1: Improve the compaction prompt with few-shot examples**

In `src/lib/services/session-compaction-service.ts`, update the `COMPACTION_PROMPT` function. Add few-shot guidance for `patternsObserved`:

```typescript
const COMPACTION_PROMPT = (messagesText: string, existingFactsSummary: string, existingSummary: string) =>
  `You are analyzing a conversation between a user and an AI assistant building their personal web page.

${existingSummary ? `PREVIOUS CONTEXT:\n${existingSummary}\n\n` : ""}${existingFactsSummary ? `EXISTING KNOWN FACTS:\n${existingFactsSummary}\n\n` : ""}CONVERSATION TO ANALYZE:
${messagesText}

Produce a JSON object:
{
  "topics": ["string"],
  "factsChanged": ["string"],
  "patternsObserved": ["string"],
  "sessionMood": "productive|exploratory|corrective|casual",
  "keyTakeaways": ["string"]
}

IMPORTANT for patternsObserved — these must be BEHAVIORAL OBSERVATIONS about HOW the user communicates, NOT what they said:

GOOD patternsObserved examples:
- "User prefers concrete options over open-ended questions"
- "User downplays achievements and needs encouragement to claim credit"
- "User switches to English when discussing technical topics"
- "User responds better to bullet points than long paragraphs"
- "User is impatient with confirmations — prefers direct execution"

BAD patternsObserved (do NOT include these — they are facts or topics, not behavioral patterns):
- "User works at Acme Corp" (this is a fact)
- "Discussed page layout" (this is a topic)
- "User wants to add a portfolio section" (this is a task, not a behavior)
- "User seems happy today" (transient mood, not a pattern)

Rules: explicit facts only in factsChanged, patternsObserved = HOW user communicates (stable behavioral patterns only), strings < 100 chars, ONLY valid JSON.`;
```

- [ ] **Step 2: Wire worker to use `saveMemoryFromWorker()`**

In `src/lib/worker/index.ts`, find the session_compaction handler (around line 129-131). Replace:

```typescript
// OLD:
for (const pattern of result.structuredSummary.patternsObserved.slice(0, 2)) {
  try { saveMemory(ownerKey, pattern, "pattern"); } catch (e) { console.warn("[worker] pattern save failed:", e); }
}
```

With:

```typescript
// NEW:
for (const pattern of result.structuredSummary.patternsObserved.slice(0, 3)) {
  try {
    const saved = saveMemoryFromWorker(ownerKey, pattern);
    if (saved) {
      console.info(`[worker] meta-memory saved: ${saved.id} (source=worker)`);
    }
  } catch (e) {
    console.warn("[worker] pattern save failed:", e);
  }
}
```

Also update the import at the top of `src/lib/worker/index.ts`:
```typescript
import { saveMemoryFromWorker } from "@/lib/services/memory-service";
```

(Remove the old `saveMemory` import if it was only used here — check if `saveMemory` is used elsewhere in the file, e.g., in heartbeat.ts imports.)

- [ ] **Step 2b: Also update heartbeat journal-analysis to use `saveMemoryFromWorker()`**

In `src/lib/worker/heartbeat.ts` (around line 119), the journal pattern analysis also calls `saveMemory()`. This is another worker path that should use the no-cooldown worker function with proper provenance. Replace:

```typescript
// OLD (heartbeat.ts ~line 119):
const saved = saveMemory(
  ownerKey,
  `${pattern.description}. ${pattern.suggestion}`,
  "pattern",
  "journal_analysis",
);
```

With:

```typescript
// NEW:
const saved = saveMemoryFromWorker(
  ownerKey,
  `${pattern.description}. ${pattern.suggestion}`,
  "pattern",
  "journal_analysis",
);
```

Update the import at the top of `heartbeat.ts`:
```typescript
import { saveMemoryFromWorker } from "@/lib/services/memory-service";
```

(Remove or replace the `saveMemory` import if unused after this change.)

- [ ] **Step 3: Run existing tests**

Run: `npx vitest run tests/evals/memory-service.test.ts tests/evals/memory-worker-extraction.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/services/session-compaction-service.ts src/lib/worker/index.ts src/lib/worker/heartbeat.ts
git commit -m "feat: improve compaction prompt quality and wire all worker paths to saveMemoryFromWorker()"
```

---

## Chunk 2: Episodic Smart Injection (Tasks 5-7)

### Task 5: Update `insertEvent()` to Accept Source + Dream Cycle Filter

**Files:**
- Modify: `src/lib/services/episodic-service.ts`
- Modify: `src/lib/services/episodic-consolidation-service.ts`
- Modify: `src/lib/agent/tools.ts`
- Modify: `tests/evals/episodic-service.test.ts`
- Modify: `tests/evals/episodic-consolidation.test.ts`

- [ ] **Step 1: Write failing tests for source param**

Add to `tests/evals/episodic-service.test.ts`:

```typescript
describe("insertEvent with source", () => {
  it("defaults source to 'chat'", () => {
    const id = insertEvent({
      ownerKey: "source-test-1", sessionId: "s1",
      eventAtUnix: Math.floor(Date.now() / 1000), eventAtHuman: new Date().toISOString(),
      actionType: "workout", narrativeSummary: "default source test",
    });
    const row = sqlite.prepare("SELECT source FROM episodic_events WHERE id = ?").get(id) as any;
    expect(row.source).toBe("chat");
  });

  it("accepts explicit source param", () => {
    const id = insertEvent({
      ownerKey: "source-test-2", sessionId: "s1",
      eventAtUnix: Math.floor(Date.now() / 1000), eventAtHuman: new Date().toISOString(),
      actionType: "code", narrativeSummary: "Merged PR #42",
      source: "github",
    });
    const row = sqlite.prepare("SELECT source FROM episodic_events WHERE id = ?").get(id) as any;
    expect(row.source).toBe("github");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/episodic-service.test.ts -t "insertEvent with source"`
Expected: FAIL — source property not in InsertEventInput

- [ ] **Step 3: Update `InsertEventInput` and `insertEvent()`**

In `src/lib/services/episodic-service.ts`:

Update the type:
```typescript
export type InsertEventInput = {
  ownerKey: string; sessionId: string; sourceMessageId?: string; deviceId?: string;
  eventAtUnix: number; eventAtHuman: string; actionType: string;
  narrativeSummary: string; rawInput?: string; entities?: unknown[];
  source?: string; // 'chat' (default), 'github', 'linkedin', etc.
  externalId?: string; // stable connector dedup key (e.g., GitHub event ID)
};
```

Update the `insertEvent()` function SQL to include source and externalId:
```typescript
sqlite.prepare(`
  INSERT INTO episodic_events
    (id, owner_key, session_id, source_message_id, device_id,
     event_at_unix, event_at_human, action_type, narrative_summary, raw_input, entities,
     source, external_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  id, input.ownerKey, input.sessionId,
  input.sourceMessageId ?? null, input.deviceId ?? null,
  input.eventAtUnix, input.eventAtHuman, input.actionType,
  input.narrativeSummary, input.rawInput ?? null,
  JSON.stringify(input.entities ?? []),
  input.source ?? "chat",
  input.externalId ?? null,
);
```

- [ ] **Step 4: Add source filter to Dream Cycle**

In `src/lib/services/episodic-consolidation-service.ts`, update `checkPatternThresholds()` SQL (around line 27):

```sql
SELECT action_type, COUNT(*) as cnt, MAX(event_at_unix) as latest
FROM episodic_events
WHERE owner_key = ? AND event_at_unix >= ?
  AND superseded_by IS NULL AND archived = 0
  AND source = 'chat'
GROUP BY action_type HAVING cnt >= ?
```

- [ ] **Step 5: Write Dream Cycle source filter test**

Add to `tests/evals/episodic-consolidation.test.ts`:

```typescript
it("excludes non-chat events from pattern detection", () => {
  const owner = `dream-source-${randomUUID()}`;
  const now = Math.floor(Date.now() / 1000);
  // Insert 5 github events (should NOT trigger pattern)
  for (let i = 0; i < 5; i++) {
    insertEvent({
      ownerKey: owner, sessionId: "s1",
      eventAtUnix: now - i * 3600, eventAtHuman: "h",
      actionType: "code_push", narrativeSummary: `commit ${i}`,
      source: "github",
    });
  }
  const candidates = checkPatternThresholds(owner);
  expect(candidates.length).toBe(0);

  // Insert 3 chat events (should trigger pattern)
  for (let i = 0; i < 3; i++) {
    insertEvent({
      ownerKey: owner, sessionId: "s1",
      eventAtUnix: now - i * 86400, eventAtHuman: "h",
      actionType: "workout", narrativeSummary: `ran ${i}km`,
      source: "chat",
    });
  }
  const candidates2 = checkPatternThresholds(owner);
  expect(candidates2.length).toBe(1);
  expect(candidates2[0].actionType).toBe("workout");
});
```

- [ ] **Step 6: Run all episodic tests**

Run: `npx vitest run tests/evals/episodic-service.test.ts tests/evals/episodic-consolidation.test.ts tests/evals/episodic-tools.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/services/episodic-service.ts src/lib/services/episodic-consolidation-service.ts tests/evals/episodic-service.test.ts tests/evals/episodic-consolidation.test.ts
git commit -m "feat: add source column to episodic events, filter Dream Cycle to chat-only"
```

---

### Task 6: Episodic Context Injection — `getRecentEventsForContext()`

**Files:**
- Modify: `src/lib/services/episodic-service.ts`
- Create: `tests/evals/episodic-injection.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/evals/episodic-injection.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { insertEvent, getRecentEventsForContext } from "@/lib/services/episodic-service";
import { sqlite } from "@/lib/db";
import { randomUUID } from "crypto";

function uniqueOwner() {
  return `test-epi-ctx-${randomUUID()}`;
}

afterAll(() => {
  sqlite.prepare("DELETE FROM episodic_events WHERE owner_key LIKE 'test-epi-ctx-%'").run();
});

describe("getRecentEventsForContext", () => {
  it("returns empty array when no events exist", () => {
    const result = getRecentEventsForContext(uniqueOwner());
    expect(result).toEqual([]);
  });

  it("returns events within 30-day window", () => {
    const owner = uniqueOwner();
    const now = Math.floor(Date.now() / 1000);
    insertEvent({
      ownerKey: owner, sessionId: "s1",
      eventAtUnix: now - 86400, eventAtHuman: new Date((now - 86400) * 1000).toISOString(),
      actionType: "workout", narrativeSummary: "Ran 5km",
    });
    insertEvent({
      ownerKey: owner, sessionId: "s1",
      eventAtUnix: now - 40 * 86400, eventAtHuman: "old",
      actionType: "workout", narrativeSummary: "Old run (outside window)",
    });
    const result = getRecentEventsForContext(owner);
    expect(result.length).toBe(1);
    expect(result[0].narrativeSummary).toBe("Ran 5km");
  });

  it("applies per-source caps: max 10 chat, max 3 per connector", () => {
    const owner = uniqueOwner();
    const now = Math.floor(Date.now() / 1000);
    // Insert 12 chat events
    for (let i = 0; i < 12; i++) {
      insertEvent({
        ownerKey: owner, sessionId: "s1",
        eventAtUnix: now - i * 3600, eventAtHuman: "h",
        actionType: "social", narrativeSummary: `Chat event ${i}`,
        source: "chat",
      });
    }
    // Insert 5 github events
    for (let i = 0; i < 5; i++) {
      insertEvent({
        ownerKey: owner, sessionId: "s1",
        eventAtUnix: now - i * 3600, eventAtHuman: "h",
        actionType: "code", narrativeSummary: `GH event ${i}`,
        source: "github",
      });
    }
    const result = getRecentEventsForContext(owner);
    const chatEvents = result.filter(e => e.source === "chat");
    const ghEvents = result.filter(e => e.source === "github");
    expect(chatEvents.length).toBeLessThanOrEqual(10);
    expect(ghEvents.length).toBeLessThanOrEqual(3);
    expect(result.length).toBeLessThanOrEqual(15);
  });

  it("sorts by recency (most recent first)", () => {
    const owner = uniqueOwner();
    const now = Math.floor(Date.now() / 1000);
    insertEvent({
      ownerKey: owner, sessionId: "s1",
      eventAtUnix: now - 86400 * 2, eventAtHuman: "h",
      actionType: "workout", narrativeSummary: "Older run",
    });
    insertEvent({
      ownerKey: owner, sessionId: "s1",
      eventAtUnix: now - 3600, eventAtHuman: "h",
      actionType: "workout", narrativeSummary: "Recent run",
    });
    const result = getRecentEventsForContext(owner);
    expect(result[0].narrativeSummary).toBe("Recent run");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/episodic-injection.test.ts`
Expected: FAIL — `getRecentEventsForContext` not exported

- [ ] **Step 3: Implement `getRecentEventsForContext()`**

In `src/lib/services/episodic-service.ts`:

```typescript
const CONTEXT_WINDOW_DAYS = 30;
const CHAT_SOURCE_CAP = 10;
const CONNECTOR_SOURCE_CAP = 3;
const TOTAL_CONTEXT_CAP = 15;

export type EpisodicContextEvent = {
  eventAtUnix: number;
  eventAtHuman: string;
  actionType: string;
  narrativeSummary: string;
  source: string;
};

/**
 * Source-weighted episodic events for LLM context injection.
 * 30-day window, per-source caps (chat: 10, per-connector: 3), total cap 15.
 * Uses per-source queries to prevent chat events from starving connector events.
 */
export function getRecentEventsForContext(ownerKey: string): EpisodicContextEvent[] {
  const cutoffUnix = Math.floor(Date.now() / 1000) - CONTEXT_WINDOW_DAYS * 86400;

  // Step 1: Get distinct sources for this owner in the window
  const sources = sqlite
    .prepare(
      `SELECT DISTINCT COALESCE(source, 'chat') AS source
       FROM episodic_events
       WHERE owner_key = ? AND event_at_unix >= ?
         AND superseded_by IS NULL AND archived = 0`,
    )
    .all(ownerKey, cutoffUnix) as Array<{ source: string }>;

  // Step 2: Query each source with its own cap
  const buckets: EpisodicContextEvent[] = [];
  for (const { source: src } of sources) {
    const cap = src === "chat" ? CHAT_SOURCE_CAP : CONNECTOR_SOURCE_CAP;
    const rows = sqlite
      .prepare(
        `SELECT event_at_unix, event_at_human, action_type, narrative_summary, COALESCE(source, 'chat') AS source
         FROM episodic_events
         WHERE owner_key = ? AND event_at_unix >= ?
           AND superseded_by IS NULL AND archived = 0
           AND COALESCE(source, 'chat') = ?
         ORDER BY event_at_unix DESC
         LIMIT ?`,
      )
      .all(ownerKey, cutoffUnix, src, cap) as Array<{
        event_at_unix: number;
        event_at_human: string;
        action_type: string;
        narrative_summary: string;
        source: string;
      }>;

    for (const row of rows) {
      buckets.push({
        eventAtUnix: row.event_at_unix,
        eventAtHuman: row.event_at_human,
        actionType: row.action_type,
        narrativeSummary: row.narrative_summary,
        source: row.source,
      });
    }
  }

  // Step 3: Sort all by recency (numeric, reliable), apply total cap
  buckets.sort((a, b) => b.eventAtUnix - a.eventAtUnix);
  return buckets.slice(0, TOTAL_CONTEXT_CAP);
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/evals/episodic-injection.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/episodic-service.ts tests/evals/episodic-injection.test.ts
git commit -m "feat: add getRecentEventsForContext() with source-weighted caps"
```

---

### Task 7: Wire Episodic Block into Context Assembly

**Files:**
- Modify: `src/lib/agent/context.ts`
- Modify: `tests/evals/context-assembler.test.ts`

- [ ] **Step 1: Update BUDGET constant**

In `src/lib/agent/context.ts`, update the BUDGET object (around line 80):

```typescript
const BUDGET = {
  soul: 13000,
  facts: 17000,
  summary: 7000,
  memories: 5500,      // was 3500
  episodic: 5000,      // NEW
  conflicts: 1500,
  pageState: 1500,
  recentTurns: 22000,
  total: 75000,        // was 65000
} as const;
```

- [ ] **Step 2: Update ContextProfile type**

Add `episodic` field to `ContextProfile` (around line 107):

```typescript
export type ContextProfile = {
  facts: { include: boolean; budget: number };
  soul: { include: boolean; budget: number };
  summary: { include: boolean; budget: number };
  memories: { include: boolean; budget: number };
  episodic: { include: boolean; budget: number };  // NEW
  conflicts: { include: boolean; budget: number };
  pageState: { include: boolean; budget: number };
  richness: { include: boolean };
  layoutIntelligence: { include: boolean };
  schemaMode: "full" | "minimal" | "none";
};
```

- [ ] **Step 3: Update all CONTEXT_PROFILES entries**

Add `episodic` field to each journey state profile:

```typescript
// first_visit — no episodic (no events yet), soul remains disabled in static profile
// Soul for first_visit is gated at RUNTIME by fact count ≥ SPARSE_PROFILE_FACT_THRESHOLD
// (see runtime gate below). Static profile keeps include: false.
first_visit: {
  // ... existing fields ...
  soul: { include: false, budget: 3000 },    // budget set, but include=false by default
  episodic: { include: false, budget: 0 },
},

// returning_no_page
returning_no_page: {
  // ... existing fields ...
  memories: { include: true, budget: 5500 },  // was: 3500
  episodic: { include: true, budget: 5000 },  // NEW
},

// draft_ready — summary 5k added, episodic 3k
draft_ready: {
  // ... existing fields ...
  summary: { include: true, budget: 5000 },   // was: include: false
  episodic: { include: true, budget: 3000 },   // NEW
},

// active_fresh
active_fresh: {
  // ... existing fields ...
  memories: { include: true, budget: 5500 },  // was: 3500
  episodic: { include: true, budget: 5000 },  // NEW
},

// active_stale
active_stale: {
  // ... existing fields ...
  memories: { include: true, budget: 5500 },  // was: 3500
  episodic: { include: true, budget: 5000 },  // NEW
},

// blocked — no episodic
blocked: {
  // ... existing fields ...
  episodic: { include: false, budget: 0 },
},
```

- [ ] **Step 3b: Add runtime soul gate for first_visit**

In the soul block assembly section of `assembleContext()` (where `profile?.soul?.include` is checked), add a runtime override for `first_visit`. Use data already available in scope — `existingFacts` is fetched earlier in the function, and `filterPublishableFacts` is already imported:

```typescript
// Runtime gate: first_visit soul only if enough facts exist (design doc: gated by SPARSE_PROFILE_FACT_THRESHOLD)
let soulInclude = profile?.soul?.include ?? false;
if (bootstrap?.journeyState === "first_visit" && !soulInclude && (profile?.soul?.budget ?? 0) > 0) {
  // Static profile says include:false, but budget is set — check fact count gate
  // existingFacts + filterPublishableFacts are already available in assembleContext scope
  const publishableCount = (bootstrapData?.publishableFacts ?? filterPublishableFacts(existingFacts)).length;
  if (publishableCount >= SPARSE_PROFILE_FACT_THRESHOLD) {
    soulInclude = true;
  }
}
```

Then use `soulInclude` instead of `profile?.soul?.include` in the existing soul block guard. This keeps first_visit soul disabled for truly new users (< 10 facts) while enabling it during advanced onboarding once they've provided enough data.

**Import note:** `SPARSE_PROFILE_FACT_THRESHOLD` is already importable from `@/lib/agent/thresholds`. `filterPublishableFacts` is already imported from `@/lib/services/page-projection` (context.ts:10). `existingFacts` is already fetched earlier in the function (context.ts ~line 300). No new imports or helpers needed.

- [ ] **Step 4: Add episodic block assembly**

In the block assembly section of `assembleContext()` (after the memories block, around line 328), add:

```typescript
// Episodic block (Tier 4) — smart injection
let episodicBlock = "";
if (profile?.episodic?.include) {
  const events = getRecentEventsForContext(scope.cognitiveOwnerKey);
  if (events.length > 0) {
    const lines = events.map((e) => {
      const date = e.eventAtHuman.slice(0, 10); // YYYY-MM-DD
      return `- [${date} ${e.actionType}] ${e.narrativeSummary}`;
    });
    episodicBlock = `RECENT EVENTS (last 30 days, ${events.length} events):\n${lines.join("\n")}`;
    episodicBlock = truncateToTokenBudget(episodicBlock, profile.episodic.budget ?? BUDGET.episodic);
  }
}
```

Add the import at the top of the file:
```typescript
import { getRecentEventsForContext } from "@/lib/services/episodic-service";
```

- [ ] **Step 5: Add episodic to mutable parts**

In the mutable parts assembly section (around line 393+), add the episodic block:

```typescript
if (episodicBlock) mutableParts.push(`\n\n---\n\n${episodicBlock}`);
```

- [ ] **Step 6: Add episodic to the shrink loop blocks array AND rebuild logic**

In the shrink loop (around line 596), add episodic to the blocks array:

```typescript
const blocks = [
  { name: "facts", content: factsBlock, budget: BUDGET.facts },
  { name: "soul", content: soulBlock, budget: BUDGET.soul },
  { name: "summary", content: summaryBlock, budget: BUDGET.summary },
  { name: "memories", content: memoriesBlock, budget: BUDGET.memories },
  { name: "episodic", content: episodicBlock, budget: BUDGET.episodic },  // NEW
  { name: "conflicts", content: conflictsBlock, budget: BUDGET.conflicts },
  { name: "pageState", content: pageStateBlock, budget: BUDGET.pageState },
];
```

**CRITICAL:** Also update the rebuild labeling logic in the shrink loop (around line 620-640). There is a label switch/mapping that assigns prompt section headers to each block name. Add an `episodic` branch:

```typescript
// In the rebuild section of the shrink loop, add:
case "episodic":
  // label for RECENT EVENTS block
  break;
```

The exact syntax depends on whether the rebuild uses a switch statement, if/else chain, or object lookup. Find the section that maps block names to labels (look for strings like "KNOWN FACTS", "SOUL PROFILE", "CONVERSATION SUMMARY", "AGENT MEMORIES", "PAGE STATE") and add the episodic mapping alongside them. Without this, the episodic block gets mislabeled during budget overflow shrinking.

- [ ] **Step 7: Update memory retrieval to use scored function (with compatibility)**

In the memories block assembly (around line 317-328), replace:

```typescript
const activeMemories = getActiveMemories(scope.cognitiveOwnerKey, 10);
```

With:

```typescript
const activeMemories = getActiveMemoriesScored(scope.cognitiveOwnerKey, 15);
```

Update the import to include `getActiveMemoriesScored`.

**IMPORTANT:** Keep `getActiveMemories()` exported from memory-service.ts (do NOT remove it) — it's used in other test mocks and by the save_memory tool. Add `getActiveMemoriesScored` as a new export alongside it. In context.ts, only the context assembly call changes.

- [ ] **Step 8: Update ALL affected context test mocks**

**CRITICAL:** Multiple test files mock `getActiveMemories` and/or import `assembleContext`. ALL must be updated to mock both `getActiveMemoriesScored` and the new `getRecentEventsForContext` export. Here is the **exhaustive list** of affected files (verified by grep):

**Files that mock `getActiveMemories` (must add `getActiveMemoriesScored`):**
1. `tests/evals/context-assembler.test.ts`
2. `tests/evals/conditional-context.test.ts`
3. `tests/evals/context-expansion.test.ts`
4. `tests/evals/confirmation-context.test.ts`
5. `tests/evals/journal-resume-injection.test.ts`
6. `tests/evals/drill-down-context.test.ts`

**Additional files that import `assembleContext` (must add episodic-service mock):**
7. `tests/evals/agent-brain-v2-integration.test.ts`
8. `tests/evals/chat-route-import-flag.test.ts`
9. `tests/evals/chat-route-bootstrap.test.ts`
10. `tests/evals/chat-context-integration.test.ts`
11. `tests/evals/chat-route-message-persistence.test.ts`

**For each of files 1-6**, update the memory-service mock to include both functions:
```typescript
vi.mock("@/lib/services/memory-service", () => ({
  getActiveMemories: vi.fn(() => []),
  getActiveMemoriesScored: vi.fn(() => []),  // NEW
}));
```

**For each of files 1-11**, add the episodic-service mock if not already present:
```typescript
vi.mock("@/lib/services/episodic-service", () => ({
  getRecentEventsForContext: vi.fn(() => []),
  insertEvent: vi.fn(),
  queryEvents: vi.fn(() => []),
}));
```

**Update `first_visit` soul assertion:** Since `first_visit` soul is now gated at runtime (not via `include: true` in profile), tests asserting first_visit excludes soul should STILL PASS as-is (profile.soul.include remains false by default). Only update assertions if a test provides mock facts ≥ SPARSE_PROFILE_FACT_THRESHOLD.

**CRITICAL — Update assertions that will break due to budget/profile changes:**

1. **Budget ceiling checks:** Any test asserting total budget = 65000 must be updated to 75000. Search for `65000` in test files:
   ```bash
   grep -rn "65000" tests/evals/
   ```
   Update all matches to `75000`.

2. **`draft_ready` summary behavior:** The plan adds `summary: { include: true, budget: 5000 }` for `draft_ready`. Any test asserting `draft_ready` excludes summary (e.g., `conditional-context.test.ts`) must be updated to expect summary inclusion.

3. **Memory retrieval call assertions:** Tests using `expect(getActiveMemories).toHaveBeenCalled()` or `.toHaveBeenCalledWith(...)` must be changed to assert `getActiveMemoriesScored` instead, since the context assembly now calls the scored function.

4. **Memory limit assertions:** Tests asserting the second argument to `getActiveMemories` is `10` must be updated — the new scored function defaults to `15`.

5. **`memories` budget assertions:** Tests asserting `memories.budget === 3500` for `returning_no_page`, `active_fresh`, `active_stale` must be updated to `5500`.

Add episodic tests:

```typescript
it("includes episodic block when events exist and profile includes it", async () => {
  const { getRecentEventsForContext } = await import("@/lib/services/episodic-service");
  vi.mocked(getRecentEventsForContext).mockReturnValue([
    { eventAtHuman: "2026-03-10T08:00:00Z", actionType: "workout", narrativeSummary: "Ran 5km", source: "chat" },
  ]);

  const result = assembleContext(mockScope, "en", [], undefined, bootstrapWithState("active_fresh"));
  expect(result.systemPrompt).toContain("RECENT EVENTS");
  expect(result.systemPrompt).toContain("Ran 5km");
});

it("excludes episodic block for first_visit", async () => {
  const { getRecentEventsForContext } = await import("@/lib/services/episodic-service");
  vi.mocked(getRecentEventsForContext).mockReturnValue([
    { eventAtHuman: "2026-03-10T08:00:00Z", actionType: "workout", narrativeSummary: "Ran 5km", source: "chat" },
  ]);

  const result = assembleContext(mockScope, "en", [], undefined, bootstrapWithState("first_visit"));
  expect(result.systemPrompt).not.toContain("RECENT EVENTS");
});
```

- [ ] **Step 9: Run ALL context and conditional tests**

Run: `npx vitest run tests/evals/context-assembler.test.ts tests/evals/context-expansion.test.ts tests/evals/conditional-context.test.ts`
Expected: PASS (all mocks updated, all assertions match new profiles)

- [ ] **Step 10: Commit**

```bash
git add src/lib/agent/context.ts tests/evals/context-assembler.test.ts
git commit -m "feat: episodic smart injection in context, budget 65k→75k, scored memory retrieval"
```

---

## Chunk 3: Connector Dual-Write (Tasks 8-10)

### Task 8: GitHub Activity Stream

**Files:**
- Modify: `src/lib/connectors/github/client.ts`
- Create: `src/lib/connectors/github/activity.ts`
- Create: `tests/evals/github-activity.test.ts`

- [ ] **Step 1: Add `fetchUserEvents()` to GitHub client**

In `src/lib/connectors/github/client.ts`, add a new type and function:

```typescript
export type GitHubEvent = {
  id: string;
  type: string;
  created_at: string;
  repo: { name: string };
  payload: Record<string, unknown>;
};

// No FetchEventsResult wrapper needed — fetchUserEvents returns GitHubEvent[] directly.
// Cursor advancement is unconditional (see sync integration).

/**
 * Fetch recent events for a user with incremental pagination.
 * Paginates until: (a) we hit a previously-seen event (lastSeenEventId), (b) 5 pages max, or (c) no more pages.
 * Returns completion metadata so the caller knows whether to advance the cursor.
 * Rate-limit aware: returns partial results on 403.
 * NOTE: ghFetch signature is ghFetch(url, token) — see client.ts:42.
 */
export async function fetchUserEvents(
  token: string,
  username: string,
  lastSeenEventId?: string | null,
): Promise<GitHubEvent[]> {
  const MAX_PAGES = 5; // GitHub caps at 10 pages / 300 events max via API
  const allEvents: GitHubEvent[] = [];
  let url: string | null = `https://api.github.com/users/${username}/events?per_page=100`;

  for (let page = 0; page < MAX_PAGES && url; page++) {
    const res = await ghFetch(url, token);
    if (res.status === 403) {
      console.warn("[github] rate limited on events API");
      return allEvents; // return what we have so far
    }
    if (!res.ok) return allEvents;

    const pageEvents = (await res.json()) as GitHubEvent[];
    if (pageEvents.length === 0) break;

    // Check for already-seen event (incremental boundary)
    let hitBoundary = false;
    for (const event of pageEvents) {
      if (lastSeenEventId && event.id === lastSeenEventId) {
        hitBoundary = true;
        break;
      }
      allEvents.push(event);
    }
    if (hitBoundary) break;

    // Parse Link header for next page (same pattern as fetchRepos)
    url = null;
    const link = res.headers.get("Link");
    if (link) {
      const next = link.split(",").find((s) => s.includes('rel="next"'));
      if (next) {
        const match = next.match(/<([^>]+)>/);
        if (match) url = match[1];
      }
    }
  }

  return allEvents;
}
```

- [ ] **Step 1b: Write fetchUserEvents boundary tests**

Create `tests/evals/github-client-events.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock global fetch to control GitHub API responses
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Import after stubbing fetch
const { fetchUserEvents } = await import("@/lib/connectors/github/client");

const makeEvent = (id: string) => ({ id, type: "PushEvent", created_at: "2026-03-10T12:00:00Z", repo: { name: "user/repo" }, payload: {} });
const okResponse = (events: any[], hasNext = false) => ({
  ok: true, status: 200,
  json: () => Promise.resolve(events),
  headers: new Headers(hasNext ? { Link: '<https://api.github.com/next>; rel="next"' } : {}),
});

describe("fetchUserEvents", () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it("returns events up to boundary (lastSeenEventId)", async () => {
    mockFetch.mockResolvedValueOnce(okResponse([makeEvent("5"), makeEvent("4"), makeEvent("3")]));
    const result = await fetchUserEvents("token", "user", "3");
    expect(result).toHaveLength(2); // events 5 and 4, stops before 3
    expect(result[0].id).toBe("5");
  });

  it("returns empty array on 403 rate limit", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, headers: new Headers() });
    const result = await fetchUserEvents("token", "user");
    expect(result).toHaveLength(0);
  });

  it("returns all events when no boundary provided", async () => {
    mockFetch.mockResolvedValueOnce(okResponse([makeEvent("3"), makeEvent("2"), makeEvent("1")]));
    const result = await fetchUserEvents("token", "user");
    expect(result).toHaveLength(3);
  });

  it("paginates across multiple pages", async () => {
    mockFetch
      .mockResolvedValueOnce(okResponse([makeEvent("4"), makeEvent("3")], true))
      .mockResolvedValueOnce(okResponse([makeEvent("2"), makeEvent("1")]));
    const result = await fetchUserEvents("token", "user");
    expect(result).toHaveLength(4);
  });
});
```

Run: `npx vitest run tests/evals/github-client-events.test.ts`
Expected: PASS after Step 1 implementation

- [ ] **Step 2: Write failing tests for activity mapper**

```typescript
// tests/evals/github-activity.test.ts
import { describe, it, expect } from "vitest";
import { filterSignificantEvents, mapToEpisodicEvents } from "@/lib/connectors/github/activity";

const baseEvent = (type: string, payload: Record<string, unknown> = {}) => ({
  id: "1", type, created_at: "2026-03-10T12:00:00Z",
  repo: { name: "user/repo" }, payload,
});

describe("filterSignificantEvents", () => {
  it("keeps PullRequestEvent with action=closed and merged=true", () => {
    const events = [baseEvent("PullRequestEvent", { action: "closed", pull_request: { merged: true, title: "Add auth" } })];
    expect(filterSignificantEvents(events).length).toBe(1);
  });

  it("rejects PullRequestEvent with action=opened", () => {
    const events = [baseEvent("PullRequestEvent", { action: "opened" })];
    expect(filterSignificantEvents(events).length).toBe(0);
  });

  it("keeps ReleaseEvent", () => {
    const events = [baseEvent("ReleaseEvent", { release: { tag_name: "v1.0" } })];
    expect(filterSignificantEvents(events).length).toBe(1);
  });

  it("rejects WatchEvent, PushEvent, etc.", () => {
    const events = [baseEvent("WatchEvent"), baseEvent("PushEvent"), baseEvent("ForkEvent")];
    expect(filterSignificantEvents(events).length).toBe(0);
  });
});

describe("mapToEpisodicEvents", () => {
  it("maps merged PR to episodic event with source=github", () => {
    const events = [baseEvent("PullRequestEvent", {
      action: "closed",
      pull_request: { merged: true, title: "Add authentication module", number: 42 },
    })];
    const result = mapToEpisodicEvents(filterSignificantEvents(events));
    expect(result.length).toBe(1);
    expect(result[0].source).toBe("github");
    expect(result[0].actionType).toBe("code_merge");
    expect(result[0].narrativeSummary).toContain("Add authentication module");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/evals/github-activity.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement `activity.ts`**

```typescript
// src/lib/connectors/github/activity.ts
import type { GitHubEvent } from "./client";
import type { InsertEventInput } from "@/lib/services/episodic-service";

type SignificantEvent = GitHubEvent & { __significanceType: string };

/**
 * Significance filter: only merged PRs and releases.
 */
export function filterSignificantEvents(events: GitHubEvent[]): SignificantEvent[] {
  const result: SignificantEvent[] = [];
  for (const e of events) {
    if (e.type === "PullRequestEvent") {
      const pr = e.payload.pull_request as Record<string, unknown> | undefined;
      if (e.payload.action === "closed" && pr?.merged === true) {
        result.push({ ...e, __significanceType: "code_merge" });
      }
    } else if (e.type === "ReleaseEvent") {
      result.push({ ...e, __significanceType: "code_release" });
    } else if (e.type === "CreateEvent" && e.payload.ref_type === "repository") {
      result.push({ ...e, __significanceType: "code_create_repo" });
    }
  }
  return result;
}

/**
 * Map significant GitHub events to episodic event inputs.
 */
export function mapToEpisodicEvents(
  events: SignificantEvent[],
): Array<Omit<InsertEventInput, "ownerKey" | "sessionId"> & { source: string }> {
  return events.map((e) => {
    const eventAtUnix = Math.floor(new Date(e.created_at).getTime() / 1000);
    let summary: string;

    if (e.__significanceType === "code_merge") {
      const pr = e.payload.pull_request as Record<string, unknown>;
      summary = `Merged PR #${pr.number}: ${String(pr.title ?? "").slice(0, 100)} (${e.repo.name})`;
    } else if (e.__significanceType === "code_release") {
      const rel = e.payload.release as Record<string, unknown>;
      summary = `Released ${String(rel.tag_name ?? "")} for ${e.repo.name}`;
    } else {
      summary = `Created repository ${e.repo.name}`;
    }

    return {
      eventAtUnix,
      eventAtHuman: e.created_at,
      actionType: e.__significanceType,
      narrativeSummary: summary.slice(0, 200),
      entities: [e.repo.name],
      source: "github",
      externalId: e.id, // GitHub event ID — stable dedup key
    };
  });
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/evals/github-activity.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/connectors/github/client.ts src/lib/connectors/github/activity.ts tests/evals/github-activity.test.ts
git commit -m "feat: GitHub activity stream fetcher with significance filter"
```

---

### Task 9: Wire GitHub Dual-Write into Sync

**Files:**
- Modify: `src/lib/connectors/github/sync.ts`

- [ ] **Step 1: Add activity import to `syncGitHub()`**

After the existing `batchCreateFacts()` call in `syncGitHub()` (around line 71), add:

```typescript
// --- Activity Stream: notable events → Episodic (T4) ---
// Incremental: paginate until we hit the last-seen event ID.
// BACKWARD COMPAT: syncCursor was previously a plain ISO timestamp string (latestPushedAt).
// We read the connector row's syncCursor, parse it as JSON if possible, else treat as legacy.
// Event cursor is stored as a separate key (`lastEventId`) within the JSON object.
try {
  // `token` is the already-normalized access token variable from syncGitHub() scope (line ~42)

  // Read connector row to get current syncCursor value
  const connectorRow = db.select().from(connectors).where(eq(connectors.id, connectorId)).get();
  const rawCursor = connectorRow?.syncCursor ?? null;

  // Parse cursor — backward-compatible with plain timestamp string
  // Parse cursor into activityCursorData (function-scoped, hoisted above this block)
  // This preserves any existing cursor keys (repoCursor, lastEventId) across syncs.
  if (!rawCursor) {
    // No cursor yet — first sync
  } else {
    try {
      Object.assign(activityCursorData, JSON.parse(rawCursor));
    } catch {
      // Legacy: plain timestamp string → migrate to structured format
      activityCursorData.repoCursor = rawCursor;
    }
  }
  const lastSeenEventId = activityCursorData.lastEventId ?? null;

  const rawEvents = await fetchUserEvents(token, profile.login, lastSeenEventId);
  const significant = filterSignificantEvents(rawEvents);
  const episodicInputs = mapToEpisodicEvents(significant);

  let eventsWritten = 0;
  for (const input of episodicInputs) {
    try {
      insertEvent({
        ownerKey,
        sessionId: `connector:github:${connectorId}`,
        eventAtUnix: input.eventAtUnix,
        eventAtHuman: input.eventAtHuman,
        actionType: input.actionType,
        narrativeSummary: input.narrativeSummary,
        entities: input.entities,
        source: "github",
        externalId: input.externalId, // GitHub event ID for dedup
      });
      eventsWritten++;
    } catch (err) {
      // Dedup failures are expected (re-sync), skip silently
      if (!(err instanceof Error && err.message.includes("UNIQUE"))) {
        console.warn("[github] event write failed:", err);
      }
    }
  }
  console.info(`[github] activity: ${significant.length} significant, ${eventsWritten} written`);

  // Cursor strategy: ALWAYS advance when events were successfully fetched.
  //
  // Why always advance (even on partial fetch):
  //   - GitHub events API returns newest-first and paginates backwards
  //   - lastSeenEventId is a STOP point (not a start point) — we always start from newest
  //   - If we don't advance on partial fetch, each sync re-reads the exact same pages
  //     forever (dedup prevents duplicates but window never moves forward)
  //   - Advancing to newest ensures next sync only processes truly new events
  //
  // Trade-off: if an account generates >MAX_PAGES*100 events between syncs (500+),
  // older events in the gap between the old and new cursor are permanently skipped.
  // This is acceptable because:
  //   - Syncs run every 15min; 500 significant events in 15min is astronomically rare
  //   - The significance filter already reduces events by ~90% (only merged PRs, releases)
  //   - Connector data is supplementary; the primary event source is chat
  //
  // If this becomes an issue in practice, increase MAX_PAGES or add a "catch-up" mode.
  if (rawEvents.length > 0) {
    activityCursorData.lastEventId = rawEvents[0].id; // newest event = first in response
  }
} catch (err) {
  // Activity stream is best-effort — don't fail the sync
  console.warn("[github] activity stream failed (non-fatal):", err);
}
```

**CRITICAL — Update the existing final connector update** (line ~105-112 in sync.ts) to use the unified cursor format. Replace:
```typescript
syncCursor: latestPushedAt ?? null,
```
With:
```typescript
syncCursor: JSON.stringify({ ...activityCursorData, repoCursor: latestPushedAt ?? null }),
```

This ensures both the repo cursor (for existing behavior) and the event cursor (for activity sync) are preserved in a single JSON field. The `cursorData` variable is scoped to the activity try block, so you need to hoist it above the activity block, or use a separate mutable variable at function scope:

```typescript
// At top of syncGitHub, after token normalization:
let activityCursorData: Record<string, string | null> = {};
```

Then use `activityCursorData` in both the activity section (read/write) and the final connector update. This avoids the scoping issue.

Add imports at top:
```typescript
import { fetchUserEvents } from "./client";
import { filterSignificantEvents, mapToEpisodicEvents } from "./activity";
import { insertEvent } from "@/lib/services/episodic-service";
```

- [ ] **Step 2: Update GitHub sync test mocks**

`tests/evals/github-sync.test.ts` currently mocks only `fetchProfile`, `fetchRepos`, and `fetchRepoLanguages` from `./client`. The new `fetchUserEvents` import will break the mock. Update:

```typescript
// In tests/evals/github-sync.test.ts, update the client mock:
vi.mock("@/lib/connectors/github/client", () => ({
  fetchProfile: (...args: any[]) => mockFetchProfile(...args),
  fetchRepos: (...args: any[]) => mockFetchRepos(...args),
  fetchRepoLanguages: (...args: any[]) => mockFetchRepoLanguages(...args),
  fetchUserEvents: vi.fn(() => Promise.resolve([])),  // NEW — returns GitHubEvent[]
}));
```

Also mock the activity module:
```typescript
vi.mock("@/lib/connectors/github/activity", () => ({
  filterSignificantEvents: vi.fn(() => []),
  mapToEpisodicEvents: vi.fn(() => []),
}));
```

And mock episodic-service:
```typescript
vi.mock("@/lib/services/episodic-service", () => ({
  insertEvent: vi.fn(),
}));
```

**IMPORTANT — Update syncCursor assertions:** The plan changes `syncCursor` from a plain timestamp string to JSON. Find any test that asserts `syncCursor` value (e.g., `expect(syncCursor).toBe("2024-03-15T00:00:00Z")`) and update to assert parsed JSON shape:
```typescript
// Before:
expect(updateArgs.syncCursor).toBe("2024-03-15T00:00:00Z");
// After:
const cursor = JSON.parse(updateArgs.syncCursor);
expect(cursor.repoCursor).toBe("2024-03-15T00:00:00Z");
```

Also: `tests/evals/github-connector-e2e.test.ts` needs the same client + activity + episodic mocks if it exercises the full sync path. Add them alongside the existing mocks.

**IMPORTANT — Mock db.select for connector cursor read:** The new sync code calls `db.select().from(connectors).where(eq(connectors.id, connectorId)).get()` to read the current cursor. Both GitHub test suites currently only mock `db.insert`/`db.update`. You MUST add a `db.select` chain mock:

```typescript
// If using a mock db object:
const mockConnectorRow = { id: "test-connector", syncCursor: null };
// Add to existing db mock:
db.select = vi.fn().mockReturnValue({
  from: vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({
      get: vi.fn().mockReturnValue(mockConnectorRow),
    }),
  }),
});
```

Alternatively, if the test suite uses real SQLite (like `github-connector-e2e.test.ts`), the connector row will already exist from the test setup — just ensure the test creates a connector row before calling `syncGitHub()`.

- [ ] **Step 3: Run GitHub connector tests**

Run: `npx vitest run tests/evals/github-sync.test.ts tests/evals/github-connector-e2e.test.ts`
Expected: PASS (activity fetch mocked, cursor assertions updated, existing sync behavior unchanged)

- [ ] **Step 4: Commit**

```bash
git add src/lib/connectors/github/sync.ts db/migrations/0029_memory_source_columns.sql
git commit -m "feat: wire GitHub activity dual-write into sync pipeline"
```

---

### Task 10: LinkedIn Activity Mapper

**Files:**
- Create: `src/lib/connectors/linkedin-zip/activity-mapper.ts`
- Modify: `src/lib/connectors/linkedin-zip/import.ts`
- Create: `tests/evals/linkedin-activity.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/evals/linkedin-activity.test.ts
import { describe, it, expect } from "vitest";
import { mapCertificationsToEpisodic, mapArticlesToEpisodic } from "@/lib/connectors/linkedin-zip/activity-mapper";

describe("mapCertificationsToEpisodic", () => {
  it("maps certifications with dates to episodic events", () => {
    const rows = [
      { "Name": "AWS Solutions Architect", "Started On": "Jan 2026", "Finished On": "Feb 2026", "Authority": "Amazon" },
    ];
    const result = mapCertificationsToEpisodic(rows);
    expect(result.length).toBe(1);
    expect(result[0].actionType).toBe("certification");
    expect(result[0].source).toBe("linkedin");
    expect(result[0].narrativeSummary).toContain("AWS Solutions Architect");
  });

  it("skips certifications without dates", () => {
    const rows = [
      { "Name": "No Date Cert", "Started On": "", "Finished On": "", "Authority": "Test" },
    ];
    const result = mapCertificationsToEpisodic(rows);
    expect(result.length).toBe(0);
  });
});

describe("mapArticlesToEpisodic", () => {
  it("maps articles with dates to episodic events", () => {
    const rows = [
      { "Title": "My Tech Journey", "PublishedDate": "2026-01-15", "Url": "https://linkedin.com/pulse/xyz" },
    ];
    const result = mapArticlesToEpisodic(rows);
    expect(result.length).toBe(1);
    expect(result[0].actionType).toBe("publication");
    expect(result[0].source).toBe("linkedin");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/linkedin-activity.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement activity mapper**

```typescript
// src/lib/connectors/linkedin-zip/activity-mapper.ts
import { createHash } from "node:crypto";
import type { CsvRow } from "./parser";
import type { InsertEventInput } from "@/lib/services/episodic-service";
import { normalizeLinkedInDate } from "./date-normalizer";

/** Exported for use in import.ts activity phase */
export type EpisodicInput = Omit<InsertEventInput, "ownerKey" | "sessionId"> & { source: string };

/**
 * Parse LinkedIn date to Unix timestamp using the existing hardened normalizer.
 * normalizeLinkedInDate handles: ISO, "Mon YYYY", "DD Mon YYYY", US short, year-only.
 * Returns null for unparseable/empty strings.
 */
function parseLinkedInDate(dateStr: string): number | null {
  const normalized = normalizeLinkedInDate(dateStr);
  if (!normalized) return null;
  // normalizeLinkedInDate returns: "YYYY-MM-DD", "YYYY-MM", or "YYYY"
  // Pad partial dates to full ISO for deterministic parsing
  let isoDate: string;
  if (/^\d{4}$/.test(normalized)) {
    isoDate = `${normalized}-01-01T00:00:00Z`;
  } else if (/^\d{4}-\d{2}$/.test(normalized)) {
    isoDate = `${normalized}-01T00:00:00Z`;
  } else {
    isoDate = `${normalized}T00:00:00Z`;
  }
  return Math.floor(new Date(isoDate).getTime() / 1000);
}

/** Stable hash for LinkedIn items that lack a native ID */
function stableExternalId(prefix: string, ...parts: string[]): string {
  return `li:${prefix}:${createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16)}`;
}

export function mapCertificationsToEpisodic(rows: CsvRow[]): EpisodicInput[] {
  const result: EpisodicInput[] = [];
  for (const row of rows) {
    const name = row["Name"] ?? "";
    const finishedOn = row["Finished On"] ?? row["Started On"] ?? "";
    const authority = row["Authority"] ?? "";
    const eventAt = parseLinkedInDate(finishedOn);
    if (!name || !eventAt) continue;

    result.push({
      eventAtUnix: eventAt,
      eventAtHuman: new Date(eventAt * 1000).toISOString(),
      actionType: "certification",
      narrativeSummary: `Earned certification: ${name}${authority ? ` (${authority})` : ""}`.slice(0, 200),
      source: "linkedin",
      externalId: stableExternalId("cert", name, authority, finishedOn),
    });
  }
  return result;
}

export function mapArticlesToEpisodic(rows: CsvRow[]): EpisodicInput[] {
  const result: EpisodicInput[] = [];
  for (const row of rows) {
    const title = row["Title"] ?? "";
    const dateStr = row["PublishedDate"] ?? row["Date"] ?? "";
    const url = row["Url"] ?? "";
    const eventAt = parseLinkedInDate(dateStr);
    if (!title || !eventAt) continue;

    result.push({
      eventAtUnix: eventAt,
      eventAtHuman: new Date(eventAt * 1000).toISOString(),
      actionType: "publication",
      narrativeSummary: `Published article: ${title}`.slice(0, 200),
      source: "linkedin",
      externalId: stableExternalId("article", title, url),
    });
  }
  return result;
}
```

- [ ] **Step 4: Wire into LinkedIn import**

In `src/lib/connectors/linkedin-zip/import.ts`, the function currently returns `batchCreateFacts(...)` directly (line ~119). Restructure to capture the report and add activity extraction before returning:

```typescript
// RESTRUCTURE: Activity extraction BEFORE the allFacts.length === 0 early return.
// This ensures activity-only imports (zip has Certifications but no profile data) still work.
//
// BEFORE (current code, around line 115-119):
//   if (allFacts.length === 0) {
//     return { factsWritten: 0, factsSkipped: 0, errors: [] };
//   }
//   return batchCreateFacts(allFacts, scope, username, factLanguage);
//
// AFTER: Insert activity extraction between fact collection and the early return.

// --- Activity Stream: notable events → Episodic (T4) ---
// Runs even if allFacts.length === 0 (activity-only imports)
try {
  // Uses static imports added at the top of import.ts (see import note below)
  const activityMappers: Record<string, (rows: CsvRow[]) => EpisodicInput[]> = {
    "Certifications.csv": mapCertificationsToEpisodic,
    "Articles.csv": mapArticlesToEpisodic,
  };

  let eventsWritten = 0;
  for (const [filename, mapFn] of Object.entries(activityMappers)) {
    // csvContents is the Map<string, string> built in Pass 1 of importLinkedInZip()
    const csvContent = csvContents.get(filename);
    if (!csvContent) continue;
    try {
      const rows = parseLinkedInCsv(csvContent);
      const events = mapFn(rows);
      for (const input of events) {
        try {
          insertEvent({
            ownerKey: scope.cognitiveOwnerKey,
            sessionId: `connector:linkedin_zip`,
            eventAtUnix: input.eventAtUnix,
            eventAtHuman: input.eventAtHuman,
            actionType: input.actionType,
            narrativeSummary: input.narrativeSummary,
            source: "linkedin",
            externalId: input.externalId,
          });
          eventsWritten++;
        } catch (err) {
          // Only swallow UNIQUE constraint errors (dedup on re-import)
          if (!(err instanceof Error && err.message.includes("UNIQUE"))) {
            console.warn(`[linkedin] event write failed:`, err);
          }
        }
      }
    } catch (err) {
      console.warn(`[linkedin] activity parse failed for ${filename}:`, err);
    }
  }
  console.info(`[linkedin] activity: ${eventsWritten} events written`);
} catch (err) {
  console.warn("[linkedin] activity mapper failed (non-fatal):", err);
}

// Now proceed with fact creation (existing behavior preserved)
if (allFacts.length === 0) {
  return { factsWritten: 0, factsSkipped: 0, errors: [] };
}
return batchCreateFacts(allFacts, scope, username, factLanguage);
```

**Important implementation notes:**

1. The variable holding CSV content from Pass 1 is `csvContents` (not `extractedFiles`). Verify the exact variable name in the current code.

2. **ZIP allowlist:** The current extraction loop only keeps files listed in `FILE_MAPPERS` or `DEFERRED_FILES`. You MUST add `"Certifications.csv"` and `"Articles.csv"` to the allowlist in the ZIP extraction loop (Pass 1, around line 80). Add them as recognized filenames so their content is retained in `csvContents`. If the loop uses a whitelist check like `if (FILE_MAPPERS[filename] || DEFERRED_FILES.includes(filename))`, extend the condition:

```typescript
const ACTIVITY_FILES = new Set(["certifications.csv", "articles.csv"]); // lowercase to match existing normalization
// In the ZIP extraction loop condition (existing code uses lowercase-normalized filenames and Set.has):
if (FILE_MAPPERS[filename] || DEFERRED_FILES.has(filename) || ACTIVITY_FILES.has(filename)) {
  csvContents.set(filename, content);
}
// NOTE: Verify the existing condition shape — it may use filename.toLowerCase(). Match the existing pattern exactly.
```

3. Ensure `csvContents` is scoped at function level (not inside a block) so it's accessible in the activity phase.

4. The activity phase runs before the `allFacts.length === 0` check, so it runs regardless of whether profile facts were found. **Note:** Activity-only imports (zip with only Articles.csv) will write episodic events but return `factsWritten: 0` — the import route's post-import reaction flag only fires on `factsWritten > 0`, so episodic events from an activity-only import won't trigger an immediate chat reaction. This is acceptable because: (a) activity-only LinkedIn imports are extremely rare (users almost always have profile data), and (b) the events will appear in the RECENT EVENTS block on the next conversation turn anyway. If this becomes a UX issue, extend `ImportReport` with `eventsWritten` in a follow-up.

Add static imports at the top of `import.ts`:
```typescript
import { insertEvent } from "@/lib/services/episodic-service";
import { mapCertificationsToEpisodic, mapArticlesToEpisodic } from "./activity-mapper";
import type { EpisodicInput } from "./activity-mapper";
```

- [ ] **Step 5: Update LinkedIn import test mocks**

Both `tests/evals/linkedin-zip-import.test.ts` and `tests/evals/linkedin-zip-e2e.test.ts` exercise `importLinkedInZip()`. The new `insertEvent()` side effect must be mocked to prevent test failures:

```typescript
// In both LinkedIn test files, add:
vi.mock("@/lib/services/episodic-service", () => ({
  insertEvent: vi.fn(),
}));
```

Also mock the activity mapper to isolate existing import tests from the new activity phase:
```typescript
vi.mock("@/lib/connectors/linkedin-zip/activity-mapper", () => ({
  mapCertificationsToEpisodic: vi.fn(() => []),
  mapArticlesToEpisodic: vi.fn(() => []),
}));
```

- [ ] **Step 6: Run LinkedIn tests**

Run: `npx vitest run tests/evals/linkedin-activity.test.ts tests/evals/linkedin-zip-import.test.ts tests/evals/linkedin-zip-e2e.test.ts`
Expected: PASS (new activity tests green, existing import tests unbroken)

- [ ] **Step 7: Commit**

```bash
git add src/lib/connectors/linkedin-zip/activity-mapper.ts src/lib/connectors/linkedin-zip/import.ts tests/evals/linkedin-activity.test.ts
git commit -m "feat: LinkedIn activity mapper for certifications and articles → episodic"
```

---

## Chunk 4: Wiring & Polish (Tasks 11-13)

### Task 11: Update Memory Directives + Tool Source Param

**Files:**
- Modify: `src/lib/agent/policies/memory-directives.ts`
- Modify: `src/lib/agent/tools.ts`

- [ ] **Step 1: Update Tier 4 memory directive**

In `src/lib/agent/policies/memory-directives.ts`, update the Tier 4 section to ADD passive injection guidance while KEEPING existing tool/proposal instructions:

**Do NOT replace the entire Tier 4 block.** Insert new lines at the TOP of the existing Tier 4 section, before the current `record_event`/`recall_episodes`/`confirm_episodic_pattern` guidance:

```typescript
// ADD these lines at the start of the Tier 4 block:
TIER 4 — Episodic Memory (event log):
- If a RECENT EVENTS block is present above, it contains the user's recent events (last 30 days). Use it to reference recent activity naturally: "I see you went for a run yesterday" or "You merged a PR on repo X last week".
// KEEP all existing lines about record_event, recall_episodes, confirm_episodic_pattern
```

The existing lines about `record_event`, `recall_episodes`, and `confirm_episodic_pattern` must remain intact — they are asserted in `memory-directives.test.ts` and provide essential proposal-handling guidance.

- [ ] **Step 2: Ensure record_event passes source='chat'**

In `src/lib/agent/tools.ts`, in the `record_event` tool's `execute` function, verify that `insertEvent` is called without an explicit `source` (it defaults to 'chat' from the migration). No code change needed if the default is correct — just verify.

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/policies/memory-directives.ts
git commit -m "feat: update memory directives for passive episodic injection"
```

---

### Task 12: Update Connector Types

**Files:**
- Modify: `src/lib/connectors/types.ts`

- [ ] **Step 1: Add EpisodicEventInput type**

In `src/lib/connectors/types.ts`, add:

```typescript
/**
 * Episodic event input for connector dual-write.
 * Connectors write notable discrete events to episodic memory (Tier 4).
 */
export type ConnectorEpisodicInput = {
  actionType: string;
  eventAtUnix: number;
  eventAtHuman: string;
  narrativeSummary: string;
  entities?: string[];
  source: string; // 'github', 'linkedin', etc.
};
```

Update `SyncResult` to include events:

```typescript
export type SyncResult = {
  factsCreated: number;
  factsUpdated: number;
  eventsCreated?: number;  // NEW: episodic events written
  error?: string;
};
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/connectors/types.ts
git commit -m "feat: add ConnectorEpisodicInput type and eventsCreated to SyncResult"
```

---

### Task 13: Full Integration Test + Final Verification

**Files:**
- All modified files

- [ ] **Step 1: Run all memory-related tests**

```bash
npx vitest run tests/evals/memory-service.test.ts \
  tests/evals/memory-worker-extraction.test.ts \
  tests/evals/memory-directives.test.ts
```
Expected: PASS

- [ ] **Step 2: Run all episodic tests**

```bash
npx vitest run tests/evals/episodic-service.test.ts \
  tests/evals/episodic-consolidation.test.ts \
  tests/evals/episodic-tools.test.ts \
  tests/evals/episodic-injection.test.ts \
  tests/evals/episodic-situation.test.ts
```
Expected: PASS

- [ ] **Step 3: Run ALL context tests (exhaustive)**

```bash
npx vitest run tests/evals/context-assembler.test.ts \
  tests/evals/context-expansion.test.ts \
  tests/evals/conditional-context.test.ts \
  tests/evals/confirmation-context.test.ts \
  tests/evals/journal-resume-injection.test.ts \
  tests/evals/drill-down-context.test.ts \
  tests/evals/agent-brain-v2-integration.test.ts \
  tests/evals/chat-route-import-flag.test.ts \
  tests/evals/chat-route-bootstrap.test.ts \
  tests/evals/chat-context-integration.test.ts \
  tests/evals/chat-route-message-persistence.test.ts
```
Expected: PASS (all 11 context-related test suites)

- [ ] **Step 4: Run connector tests**

```bash
npx vitest run tests/evals/github-connector-e2e.test.ts \
  tests/evals/github-activity.test.ts \
  tests/evals/github-sync.test.ts \
  tests/evals/linkedin-activity.test.ts \
  tests/evals/linkedin-zip-import.test.ts \
  tests/evals/linkedin-zip-e2e.test.ts
```
Expected: PASS

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run
```
Expected: All 2656+ tests pass

- [ ] **Step 6: Type check**

```bash
npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 7: Verify prompt-contracts tests**

```bash
npx vitest run tests/evals/prompt-contracts.test.ts
```
Expected: PASS (memory directives update may require regex adjustments)

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "test: full integration verification for memory tier optimization"
```

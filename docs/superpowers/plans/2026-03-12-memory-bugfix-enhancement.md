# Memory Bug Fixes + T3/T4 Value-Add Enhancement — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 8 bugs in the 4-tier memory system and improve T3/T4 value-add through async usage tracking, eviction policy, compaction prompt upgrade, and FTS word-split.

**Architecture:** Bug fixes are independent one-liners. T3 improvements center on `memory-service.ts` (scoring + eviction) and `context.ts` (format + async tracking wire-up). T4 improvement is a single function rewrite. One migration adds `last_referenced_at` to `agent_memory`.

**Tech Stack:** TypeScript, SQLite (Drizzle ORM + raw SQL), Vitest, Vercel AI SDK

**Design doc:** `docs/plans/2026-03-12-memory-bugfix-enhancement-design.md`

---

## File Structure

### Files to Create
| File | Responsibility |
|---|---|
| `db/migrations/0030_memory_usage_tracking.sql` | Add `last_referenced_at` column to `agent_memory` |
| `src/app/api/memory/route.ts` | GET endpoint — list active memories sorted by score |
| `src/app/api/memory/[id]/route.ts` | DELETE endpoint — deactivate a specific memory |
| `tests/evals/github-firstsync-guard.test.ts` | Regression test for BUG-E1 |
| `tests/evals/connector-dedup-baseline.test.ts` | Regression test for BUG-E2/E3 |
| `tests/evals/spotify-stale-cleanup.test.ts` | Test staleSinceSync counter + archival |
| `tests/evals/memory-scoring-formula.test.ts` | Numeric tests for usageBoost, provenance, half-life |
| `tests/evals/memory-eviction.test.ts` | Eviction policy + agent floor protection |
| `tests/evals/episodic-fts-wordsplit.test.ts` | Multi-word FTS search behavior |
| `tests/evals/batch-record-events.test.ts` | Intra-batch dedup + 999-param chunking |
| `tests/evals/session-compaction-real-db.test.ts` | Real SQLite: rowid cursor, anti-burn |

### Files to Modify
| File | Changes |
|---|---|
| `src/lib/db/schema.ts:167-189` | Add `lastReferencedAt` column to `agentMemory` table |
| `src/lib/connectors/github/sync.ts:165-224` | BUG-E1: guard activity stream on `hasActivityBaseline` (`!!activityCursorData.lastEventId`) + seed cursor |
| `src/lib/connectors/connector-event-writer.ts:48` | BUG-E2/E3: remove `AND event_id IS NOT NULL` |
| `src/lib/connectors/linkedin-zip/activity-mapper.ts:69,101` | BUG-E4: `"linkedin"` → `"linkedin_zip"` |
| `src/lib/connectors/spotify/sync.ts:100-141` | BUG-F1: staleSinceSync counter + archive stale facts |
| `src/lib/services/kb-service.ts:229-304` | Add `archiveFact()`, `getActiveFactKeysByPrefix()`, `findFactsByKeyPattern()` exports; add `archivedAt: null` to upsert conflict clause (keep `updateFact` deprecated) |
| `src/lib/services/memory-service.ts` | Scoring formula, eviction policy, add `ScoredMemoryRow` type, add `updateLastReferencedAt()` (keep `getActiveMemories` deprecated) |
| `src/lib/services/session-compaction-service.ts:46-76` | Compaction prompt upgrade with few-shot behavioral examples |
| `src/lib/services/episodic-service.ts:139-141` | FTS word-split in `sanitizeFtsKeywords()` |
| `src/lib/agent/context.ts:335-346` | Memory format `[type\|category]`, paired ID tracking through all truncation phases, return `referencedMemoryIds` |
| `src/lib/agent/policies/memory-directives.ts` | MEMORY SELF-MANAGEMENT policy section |
| `src/lib/agent/prompts.ts:395` | Fix stale budget comment 65000 → 75000 |
| `src/app/api/chat/route.ts:464-474` | Async `updateLastReferencedAt()` in `onFinish` |
| `tests/evals/memory-service.test.ts` | Migrate `getActiveMemories` → `getActiveMemoriesScored`, add scoring tests |
| `tests/evals/episodic-consolidation.test.ts` | Add `evaluatePatternWithLLM` mock test |
| `src/lib/db/migrate.ts:9` | Bump `EXPECTED_SCHEMA_VERSION` from 29 to 30 |

---

## Chunk 1: Foundation — Migration, Schema, Dead Code Cleanup

### Task 1: Migration 0030 + Schema Update

**Files:**
- Create: `db/migrations/0030_memory_usage_tracking.sql`
- Modify: `src/lib/db/schema.ts:167-189`
- Modify: `src/lib/db/migrate.ts:9`

- [ ] **Step 1: Create migration file**

```sql
-- db/migrations/0030_memory_usage_tracking.sql
-- Adds usage tracking column for T3 meta-memory scoring enhancement.
-- last_referenced_at: updated async post-turn when memory appears in agent context.
ALTER TABLE agent_memory ADD COLUMN last_referenced_at TEXT;
```

- [ ] **Step 2: Update Drizzle schema**

In `src/lib/db/schema.ts`, add inside the `agentMemory` table definition (after `createdAt`):

```typescript
lastReferencedAt: text("last_referenced_at"),
```

- [ ] **Step 3: Bump EXPECTED_SCHEMA_VERSION**

In `src/lib/db/migrate.ts:9`, change:
```typescript
export const EXPECTED_SCHEMA_VERSION = 30;
```

- [ ] **Step 4: Verify migration applies cleanly**

Run: `npm run dev` (leader mode runs migrations)
Expected: No migration errors, server starts. Check DB: `sqlite3 <db-path> ".schema agent_memory"` shows `last_referenced_at TEXT`.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/0030_memory_usage_tracking.sql src/lib/db/schema.ts src/lib/db/migrate.ts
git commit -m "feat: migration 0030 — add last_referenced_at to agent_memory"
```

---

### Task 2: Dead Code Cleanup — updateFact + KB Helpers

**Files:**
- Modify: `src/lib/services/kb-service.ts:229-304`

- [ ] **Step 1: Verify updateFact is unused in production**

Run: `grep -r "updateFact" src/ --include="*.ts" -l`
Expected: Only `kb-service.ts` (definition) and possibly test files. No caller in `src/lib/agent/tools.ts` or any route.
Note: 16 test files still reference `updateFact` — do NOT remove it; leave it as `@deprecated`.

- [ ] **Step 2: Add archiveFact export**

Add to `kb-service.ts` (near the delete functions):

```typescript
export function archiveFact(factId: string): boolean {
  const result = sqlite
    .prepare(
      `UPDATE facts SET archived_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ? AND archived_at IS NULL`
    )
    .run(factId);
  return result.changes > 0;
}
```

- [ ] **Step 3: Add getActiveFactKeysByPrefix and findFactsByKeyPattern helpers**

Add to `kb-service.ts`. These helpers take `knowledgeKey` (from `scope.knowledgePrimaryKey`), NOT raw `ownerKey`:

```typescript
export function getActiveFactKeysByPrefix(knowledgeKey: string, prefix: string): string[] {
  return sqlite
    .prepare(`SELECT key FROM facts WHERE session_id = ? AND key LIKE ? AND archived_at IS NULL`)
    .all(knowledgeKey, `${prefix}%`)
    .map((r: any) => r.key);
}

export function findFactsByKeyPattern(knowledgeKey: string, pattern: string): Array<{ id: string; key: string }> {
  return sqlite
    .prepare(`SELECT id, key FROM facts WHERE session_id = ? AND key LIKE ? AND archived_at IS NULL`)
    .all(knowledgeKey, pattern) as Array<{ id: string; key: string }>;
}
```

- [ ] **Step 4: Fix upsert to clear archived_at on conflict**

In `kb-service.ts`, find the `onConflictDoUpdate.set` clause in `createFact()`/`upsertFact()` and add `archivedAt: null` to the set. This ensures reappearing Spotify facts become active again instead of staying archived:

```typescript
.onConflictDoUpdate({
  target: [...],
  set: {
    ...existingFields,
    archivedAt: null, // Clear archived_at when fact reappears
  },
})
```

- [ ] **Step 5: Run existing tests**

Run: `npx vitest run tests/evals/kb-session-isolation.test.ts`
Expected: PASS (no exports removed, so all imports still resolve)

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/kb-service.ts
git commit -m "fix(BUG-M2): add archiveFact + kb helpers + clear archived_at on upsert"
```

---

### Task 3: Dead Code Cleanup — getActiveMemories + ScoredMemoryRow Type + Stale Comment

**Files:**
- Modify: `src/lib/services/memory-service.ts:227-235`
- Modify: `src/lib/agent/prompts.ts:395`

- [ ] **Step 1: Add ScoredMemoryRow type**

In `src/lib/services/memory-service.ts`, add a typed return for scored queries:

```typescript
export type ScoredMemoryRow = MemoryRow & { score: number };
```

Update `getActiveMemoriesScored` return type from `MemoryRow[]` to `ScoredMemoryRow[]`.

- [ ] **Step 2: Mark getActiveMemories as @deprecated**

Do NOT remove `getActiveMemories` — 8 test files still reference it. Add a `@deprecated` JSDoc tag:

```typescript
/**
 * @deprecated Use getActiveMemoriesScored() instead. Kept for test compatibility.
 */
export function getActiveMemories(ownerKey: string, limit?: number): MemoryRow[] {
```

- [ ] **Step 3: Fix stale budget comment**

In `src/lib/agent/prompts.ts:395`, change:
```typescript
// TOTAL_TOKEN_BUDGET in context.ts is 65000. Reserve at least 13000 for context.
```
to:
```typescript
// TOTAL_TOKEN_BUDGET in context.ts is 75000. Reserve at least 13000 for context.
```

- [ ] **Step 4: Run affected tests + tsc**

Run: `npx vitest run tests/evals/memory-service.test.ts tests/evals/context-assembler.test.ts && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/memory-service.ts src/lib/agent/prompts.ts
git commit -m "fix(BUG-M1,BUG-M3): add ScoredMemoryRow type, deprecate getActiveMemories, fix stale comment"
```

---

## Chunk 2: Connector Bug Fixes

### Task 4: BUG-E1 — GitHub First-Sync + Legacy Connector Guard

**Files:**
- Modify: `src/lib/connectors/github/sync.ts:150-205`
- Create: `tests/evals/github-firstsync-guard.test.ts`

Note: `syncGitHub(connectorId, ownerKey)` takes two string args (not an object). It internally calls `getConnectorWithCredentials(connectorId)` and `resolveOwnerScopeForWorker(ownerKey)`. The activity stream path at line ~165 uses `insertEvent()` (not `batchRecordEvents`) for individual event writes.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/evals/github-firstsync-guard.test.ts
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { sqlite } from "@/lib/db";
import { randomUUID } from "crypto";

// Mock all external dependencies
vi.mock("@/lib/connectors/github/client", () => ({
  fetchProfile: vi.fn().mockResolvedValue({ login: "user", id: 1, name: "Test User", bio: null, avatar_url: "https://example.com/avatar.png" }),
  fetchRepos: vi.fn().mockResolvedValue([]),
  fetchRepoLanguages: vi.fn().mockResolvedValue({}),
  fetchUserEvents: vi.fn().mockResolvedValue([
    { id: "evt-1", type: "PushEvent", created_at: "2026-03-12T00:00:00Z",
      repo: { name: "user/repo" }, payload: {} },
  ]),
  GitHubAuthError: class extends Error {},
}));
vi.mock("@/lib/connectors/connector-service", () => ({
  getConnectorWithCredentials: vi.fn().mockReturnValue({
    id: "c1",
    lastSync: null,
    syncCursor: null,
    decryptedCredentials: { access_token: "tok" },
  }),
  updateConnectorStatus: vi.fn(),
}));
vi.mock("@/lib/services/episodic-service", () => ({
  insertEvent: vi.fn(),
}));
vi.mock("@/lib/connectors/connector-event-writer", () => ({
  batchRecordEvents: vi.fn().mockResolvedValue({ eventsWritten: 0, eventsSkipped: 0, errors: [] }),
}));
vi.mock("@/lib/connectors/connector-fact-writer", () => ({
  batchCreateFacts: vi.fn().mockResolvedValue({ factsWritten: 0, factsSkipped: 0 }),
}));
vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScopeForWorker: vi.fn().mockReturnValue({
    cognitiveOwnerKey: "owner1",
    knowledgePrimaryKey: "owner1",
    knowledgeReadKeys: ["owner1"],
  }),
}));
vi.mock("@/lib/services/preferences-service", () => ({
  getFactLanguage: vi.fn().mockReturnValue("en"),
}));
vi.mock("@/lib/services/page-service", () => ({
  getDraft: vi.fn().mockReturnValue(null),
}));

import { insertEvent } from "@/lib/services/episodic-service";
import { getConnectorWithCredentials } from "@/lib/connectors/connector-service";

const CONNECTOR_ID = `test-gh-guard-${randomUUID()}`;

afterAll(() => {
  sqlite.prepare("DELETE FROM connectors WHERE id = ?").run(CONNECTOR_ID);
});

describe("GitHub first-sync guard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should NOT write episodic events on first sync (no lastEventId)", async () => {
    const { syncGitHub } = await import("@/lib/connectors/github/sync");

    await syncGitHub(CONNECTOR_ID, "owner1");

    // insertEvent should NOT have been called (first-sync baseline only)
    expect(insertEvent).not.toHaveBeenCalled();
  });

  it("should seed lastEventId cursor on first sync", async () => {
    // Seed a connectors row so cursor persistence works
    sqlite.prepare(
      `INSERT OR IGNORE INTO connectors (id, connector_type, owner_key, status, created_at, updated_at)
       VALUES (?, 'github', 'owner1', 'active', datetime('now'), datetime('now'))`
    ).run(CONNECTOR_ID);

    const { syncGitHub } = await import("@/lib/connectors/github/sync");
    await syncGitHub(CONNECTOR_ID, "owner1");

    // Verify cursor was persisted with lastEventId
    const row = sqlite.prepare(
      "SELECT sync_cursor FROM connectors WHERE id = ?"
    ).get(CONNECTOR_ID) as any;
    expect(row).toBeDefined();
    const cursor = JSON.parse(row.sync_cursor);
    expect(cursor.lastEventId).toBe("evt-1");
  });

  it("should NOT write episodic events for legacy connectors (lastSync set but no lastEventId)", async () => {
    // Legacy connector: has lastSync but cursor has no lastEventId
    vi.mocked(getConnectorWithCredentials).mockReturnValueOnce({
      id: "c-legacy",
      lastSync: "2026-03-01T00:00:00Z",
      syncCursor: JSON.stringify({ repoCursor: "2026-03-01T00:00:00Z" }),
      decryptedCredentials: { access_token: "tok" },
    } as any);

    const { syncGitHub } = await import("@/lib/connectors/github/sync");
    await syncGitHub("c-legacy", "owner1");

    // No lastEventId in cursor → should NOT write events (same as first sync)
    expect(insertEvent).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `npx vitest run tests/evals/github-firstsync-guard.test.ts`
Expected: FAIL — `insertEvent` was called (no guard), cursor not seeded.

- [ ] **Step 3: Implement the fix**

In `src/lib/connectors/github/sync.ts`:

**a)** Guard the activity stream event-write loop on `!!activityCursorData.lastEventId` (NOT `!isFirstSync`). This covers both first-sync AND legacy connectors that were upgraded before activity tracking existed:
```typescript
// Check both lastEventId and activityInitialized sentinel (for empty-feed baseline)
const hasActivityBaseline = !!activityCursorData.lastEventId || !!activityCursorData.activityInitialized;

if (hasActivityBaseline) {
  // Only write events when we have a baseline cursor
  const rawEvents = await fetchUserEvents(token, profile.login, lastSeenEventId);
  const significant = filterSignificantEvents(rawEvents);
  const episodicInputs = mapToEpisodicEvents(significant);
  // ... existing insert loop ...
  if (rawEvents.length > 0) {
    activityCursorData.lastEventId = rawEvents[0].id;
  }
} else {
  // First sync OR legacy connector: seed cursor without writing events
  const seedEvents = await fetchUserEvents(token, profile.login, null);
  if (seedEvents.length > 0) {
    activityCursorData.lastEventId = seedEvents[0].id;
  } else {
    // Edge case: empty event feed. Set a sentinel so we don't suppress
    // the first real event on the next sync. Using "initialized" flag
    // means next sync with lastEventId=null will fetch all events normally.
    activityCursorData.activityInitialized = new Date().toISOString();
  }
}
```

**b)** Cursor is persisted via the existing `db.update(connectors)` at line ~214 which serializes `activityCursorData` into `syncCursor`.

- [ ] **Step 4: Run test — verify it passes**

Run: `npx vitest run tests/evals/github-firstsync-guard.test.ts`
Expected: PASS

- [ ] **Step 5: Run existing GitHub tests**

Run: `npx vitest run tests/evals/ -t "github"`
Expected: All existing tests still PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/connectors/github/sync.ts tests/evals/github-firstsync-guard.test.ts
git commit -m "fix(BUG-E1): guard GitHub activity stream on first-sync, seed cursor"
```

---

### Task 5: BUG-E2/E3 — RSS + Strava Dedup Gap

**Files:**
- Modify: `src/lib/connectors/connector-event-writer.ts:48`
- Create: `tests/evals/connector-dedup-baseline.test.ts`

- [ ] **Step 1: Write the failing test**

Note: `batchRecordEvents(events[], ctx)` takes two args — an array of events and a context object. It is async and returns `Promise<EventWriterReport>` with fields `eventsWritten`/`eventsSkipped`/`errors`.

```typescript
// tests/evals/connector-dedup-baseline.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { sqlite } from "@/lib/db";
import { randomUUID } from "crypto";
import { batchRecordEvents } from "@/lib/connectors/connector-event-writer";

const TEST_PREFIX = "test-dedup-baseline-";

afterAll(() => {
  sqlite.prepare("DELETE FROM connector_items WHERE connector_id LIKE ?").run(`${TEST_PREFIX}%`);
  sqlite.prepare("DELETE FROM episodic_events WHERE owner_key LIKE ?").run(`${TEST_PREFIX}%`);
});

describe("connector dedup baseline", () => {
  it("should NOT re-emit events for baseline connector_items (no event_id)", async () => {
    const connectorId = `${TEST_PREFIX}${randomUUID()}`;
    const ownerKey = `${TEST_PREFIX}owner`;
    const externalId = "rss-post-abc123";

    // Seed a baseline connector_item WITHOUT event_id (simulates first-sync)
    sqlite.prepare(
      `INSERT INTO connector_items (id, connector_id, external_id, last_seen_at)
       VALUES (?, ?, ?, datetime('now'))`
    ).run(randomUUID(), connectorId, externalId);

    // Try to write an event with the same externalId
    const report = await batchRecordEvents(
      [{
        externalId,
        eventAtUnix: Math.floor(Date.now() / 1000),
        eventAtHuman: new Date().toISOString(),
        actionType: "new_article",
        narrativeSummary: "Article about testing",
      }],
      {
        ownerKey,
        connectorId,
        connectorType: "rss",
        sessionId: "s1",
      },
    );

    // Should be skipped — baseline item blocks re-emission
    expect(report.eventsSkipped).toBe(1);
    expect(report.eventsWritten).toBe(0);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `npx vitest run tests/evals/connector-dedup-baseline.test.ts`
Expected: FAIL — `written: 1` because `event_id IS NOT NULL` filter hides the baseline row.

- [ ] **Step 3: Implement the fix**

In `src/lib/connectors/connector-event-writer.ts:48`, change:
```typescript
`SELECT external_id FROM connector_items
 WHERE connector_id = ? AND external_id IN (${placeholders})
 AND event_id IS NOT NULL`,
```
to:
```typescript
`SELECT external_id FROM connector_items
 WHERE connector_id = ? AND external_id IN (${placeholders})`,
```

- [ ] **Step 4: Run test — verify it passes**

Run: `npx vitest run tests/evals/connector-dedup-baseline.test.ts`
Expected: PASS

- [ ] **Step 5: Run existing connector tests**

Run: `npx vitest run tests/evals/connector-`
Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/connectors/connector-event-writer.ts tests/evals/connector-dedup-baseline.test.ts
git commit -m "fix(BUG-E2/E3): remove event_id IS NOT NULL from dedup, baseline items now block re-emission"
```

---

### Task 6: BUG-E4 — LinkedIn Source Inconsistency

**Files:**
- Modify: `src/lib/connectors/linkedin-zip/activity-mapper.ts:69,101`

- [ ] **Step 1: Fix source values**

In `src/lib/connectors/linkedin-zip/activity-mapper.ts`:

Line 69: change `source: "linkedin"` to `source: "linkedin_zip"`
Line 101: change `source: "linkedin"` to `source: "linkedin_zip"`

- [ ] **Step 2: Run existing LinkedIn tests**

Run: `npx vitest run tests/evals/ -t "linkedin"`
Expected: PASS (update any test assertions that check for `source: "linkedin"` to `source: "linkedin_zip"`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/connectors/linkedin-zip/activity-mapper.ts
git commit -m "fix(BUG-E4): unify LinkedIn episodic source to 'linkedin_zip'"
```

---

### Task 7: BUG-F1 — Spotify Stale Facts Cleanup

**Files:**
- Modify: `src/lib/connectors/spotify/sync.ts:100-141`
- Create: `tests/evals/spotify-stale-cleanup.test.ts`

Note: `getActiveFactKeysByPrefix` and `findFactsByKeyPattern` are added to `kb-service.ts` in Task 2. They take `knowledgeKey` (from `scope.knowledgePrimaryKey`), NOT raw `ownerKey`. The stale counters must be keyed by FULL fact key (e.g., `sp-artist-abc`) not stripped ID, to prevent namespace collisions between artists/tracks/genres that share the same ID suffix. Archive by exact key match, not wildcard `sp-%-${id}`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/evals/spotify-stale-cleanup.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { sqlite } from "@/lib/db";
import { randomUUID } from "crypto";

// Test the staleSinceSync counter logic
describe("Spotify stale facts cleanup", () => {
  const knowledgeKey = `test-spotify-stale-${randomUUID()}`;

  afterAll(() => {
    sqlite.prepare("DELETE FROM facts WHERE session_id LIKE ?").run(`${knowledgeKey}%`);
  });

  it("should archive facts after 3 consecutive absent syncs", () => {
    // Seed a fact that will become stale
    const factId = randomUUID();
    sqlite.prepare(
      `INSERT INTO facts (id, session_id, category, key, value, source, visibility, created_at, updated_at)
       VALUES (?, ?, 'interest', 'sp-artist-old123', '{"name":"Old Artist"}', 'connector', 'proposed', datetime('now'), datetime('now'))`
    ).run(factId, knowledgeKey);

    const { computeStaleArchival } = require("@/lib/connectors/spotify/sync");

    // Stale counters keyed by FULL fact key (not stripped ID)
    const currentKeys = new Set(["sp-artist-new1", "sp-track-new2"]);
    let cursor: Record<string, number> = {};

    // Sync 1: counter goes to 1
    cursor = computeStaleArchival(cursor, currentKeys, ["sp-artist-old123"]);
    expect(cursor["sp-artist-old123"]).toBe(1);

    // Sync 2: counter goes to 2
    cursor = computeStaleArchival(cursor, currentKeys, ["sp-artist-old123"]);
    expect(cursor["sp-artist-old123"]).toBe(2);

    // Sync 3: counter goes to 3 — should be in archival list
    cursor = computeStaleArchival(cursor, currentKeys, ["sp-artist-old123"]);
    expect(cursor["sp-artist-old123"]).toBe(3);
  });

  it("should reset counter when artist reappears", () => {
    const { computeStaleArchival } = require("@/lib/connectors/spotify/sync");

    let cursor: Record<string, number> = { "sp-artist-old123": 2 };
    const currentKeys = new Set(["sp-artist-old123", "sp-track-new1"]); // old123 is back

    cursor = computeStaleArchival(cursor, currentKeys, ["sp-artist-old123"]);
    expect(cursor["sp-artist-old123"]).toBeUndefined(); // reset — removed from stale tracking
  });

  it("should set archived_at in DB after 3 absent syncs", () => {
    const factId = randomUUID();
    const factKey = "sp-artist-staletest";
    sqlite.prepare(
      `INSERT INTO facts (id, session_id, category, key, value, source, visibility, created_at, updated_at)
       VALUES (?, ?, 'interest', ?, '{"name":"Stale Artist"}', 'connector', 'proposed', datetime('now'), datetime('now'))`
    ).run(factId, knowledgeKey, factKey);

    const { archiveFact } = require("@/lib/services/kb-service");
    archiveFact(factId);

    const row = sqlite.prepare("SELECT archived_at FROM facts WHERE id = ?").get(factId) as any;
    expect(row.archived_at).not.toBeNull();
  });

  it("should reactivate archived fact when it reappears via createFact", () => {
    // Seed an archived fact
    const factId = randomUUID();
    sqlite.prepare(
      `INSERT INTO facts (id, session_id, category, key, value, source, visibility, archived_at, created_at, updated_at)
       VALUES (?, ?, 'interest', 'sp-artist-reappear', '{"name":"Comeback Artist"}', 'connector', 'proposed', datetime('now'), datetime('now'), datetime('now'))`
    ).run(factId, knowledgeKey);

    // Verify it's archived
    const before = sqlite.prepare("SELECT archived_at FROM facts WHERE id = ?").get(factId) as any;
    expect(before.archived_at).not.toBeNull();

    // createFact with same category/key triggers upsert which clears archived_at
    const { createFact } = require("@/lib/services/kb-service");
    createFact({
      sessionId: knowledgeKey,
      category: "interest",
      key: "sp-artist-reappear",
      value: { name: "Comeback Artist" },
      source: "connector",
    });

    const after = sqlite.prepare("SELECT archived_at FROM facts WHERE key = 'sp-artist-reappear' AND session_id = ?").get(knowledgeKey) as any;
    expect(after.archived_at).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `npx vitest run tests/evals/spotify-stale-cleanup.test.ts`
Expected: FAIL — `computeStaleArchival` doesn't exist.

- [ ] **Step 3: Implement computeStaleArchival**

Add to `src/lib/connectors/spotify/sync.ts`:

```typescript
const STALE_THRESHOLD = 3;

/**
 * Track which Spotify fact keys have been absent from the current top list across syncs.
 * Keys are FULL fact keys (e.g., "sp-artist-abc") to prevent namespace collisions.
 * Returns updated stale counters.
 */
export function computeStaleArchival(
  staleCounters: Record<string, number>,
  currentKeys: Set<string>,
  allTrackedKeys: string[],
): Record<string, number> {
  const updated: Record<string, number> = {};
  for (const key of allTrackedKeys) {
    if (currentKeys.has(key)) {
      // Reappeared — don't track
      continue;
    }
    updated[key] = (staleCounters[key] ?? 0) + 1;
  }
  return updated;
}
```

- [ ] **Step 4: Wire into sync flow**

In the main `syncSpotify()` function, after mapping current artists/tracks/genres:

```typescript
// Use scope.knowledgePrimaryKey for fact queries (not raw ownerKey)
const scope = resolveOwnerScopeForWorker(ownerKey);

// Define backward-compatible cursor type
type SpotifyCursor = {
  top5ArtistIds?: string[];
  staleSinceSync?: Record<string, number>;
};

// Parse old cursors defensively
const parsedCursor: SpotifyCursor = parsedRawCursor ?? {};
const prevStale: Record<string, number> = parsedCursor.staleSinceSync ?? {};

// Collect all current fact keys (FULL keys, not stripped IDs)
const currentFactKeys = new Set([
  ...currentArtists.map(a => `sp-artist-${a.id}`),
  ...currentTracks.map(t => `sp-track-${t.id}`),
  ...currentGenres.map(g => `sp-genre-${g}`),
]);

// Query existing sp-* fact keys for this owner using knowledgePrimaryKey
const existingSpKeys = getActiveFactKeysByPrefix(scope.knowledgePrimaryKey, "sp-");

const newStale = computeStaleArchival(prevStale, currentFactKeys, existingSpKeys);

// Archive facts that have been stale for STALE_THRESHOLD syncs
let archivedAny = false;
for (const [factKey, count] of Object.entries(newStale)) {
  if (count >= STALE_THRESHOLD) {
    // Archive by exact key match, not wildcard
    const facts = findFactsByKeyPattern(scope.knowledgePrimaryKey, factKey);
    for (const f of facts) {
      archiveFact(f.id);
      archivedAny = true;
    }
    delete newStale[factKey]; // Remove from tracking after archival
  }
}

// IMPORTANT: Stale archival MUST run BEFORE batchCreateFacts' recomposition,
// or alternatively call recompose explicitly here. Best approach: move the entire
// stale-archival block BEFORE the batchCreateFacts call so the single recomposition
// in connector-fact-writer sees the final fact set (with stale facts already archived).
// If that's not feasible, call the recompose pattern here:
if (archivedAny) {
  // Same pattern as connector-fact-writer.ts:81-98:
  // projectCanonicalConfig(...) + upsertDraft(...)
}

// Persist both fields in syncCursor (backward-compatible)
newCursor.top5ArtistIds = parsedCursor.top5ArtistIds; // Preserve existing field
newCursor.staleSinceSync = newStale;
```

Note: `getActiveFactKeysByPrefix` and `findFactsByKeyPattern` are added to `kb-service.ts` in Task 2. They take `knowledgeKey` (from `scope.knowledgePrimaryKey`), NOT raw `ownerKey`.

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/evals/spotify-stale-cleanup.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/connectors/spotify/sync.ts src/lib/services/kb-service.ts tests/evals/spotify-stale-cleanup.test.ts
git commit -m "fix(BUG-F1): archive stale Spotify facts after 3 absent syncs"
```

---

## Chunk 3: T3 Memory Service Core

### Task 8: Scoring Formula — usageBoost

**Files:**
- Modify: `src/lib/services/memory-service.ts:171-222`
- Create: `tests/evals/memory-scoring-formula.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/evals/memory-scoring-formula.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { saveMemory, getActiveMemoriesScored } from "@/lib/services/memory-service";
import { sqlite } from "@/lib/db";
import { randomUUID } from "crypto";

function uniqueOwner() { return `test-scoring-${randomUUID()}`; }

afterAll(() => {
  sqlite.prepare("DELETE FROM agent_memory WHERE owner_key LIKE 'test-scoring-%'").run();
});

describe("memory scoring formula", () => {
  it("should penalize never-referenced memories with 0.5 usageBoost", () => {
    const owner = uniqueOwner();
    saveMemory(owner, "Test memory A", "observation");

    const scored = getActiveMemoriesScored(owner, 10);
    expect(scored).toHaveLength(1);
    // Never referenced: usageBoost = 0.5
    // creationRecency ≈ 1.0 (just created), provenance = 1.0 (agent)
    // score ≈ 1.0 * 1.0 * 0.5 = 0.5
    expect(scored[0].score).toBeCloseTo(0.5, 1);
  });

  it("should boost recently-referenced memories", () => {
    const owner = uniqueOwner();
    const mem = saveMemory(owner, "Referenced memory", "observation");

    // Manually set last_referenced_at to now
    sqlite.prepare(
      "UPDATE agent_memory SET last_referenced_at = datetime('now') WHERE id = ?"
    ).run(mem!.id);

    const scored = getActiveMemoriesScored(owner, 10);
    // Referenced just now: usageBoost ≈ 1.0
    // score ≈ 1.0 * 1.0 * 1.0 = 1.0
    expect(scored[0].score).toBeGreaterThan(0.9);
  });

  it("should decay usage boost with 28-day half-life", () => {
    const owner = uniqueOwner();
    const mem = saveMemory(owner, "Old ref memory", "observation");

    // Set last_referenced_at to 28 days ago
    sqlite.prepare(
      "UPDATE agent_memory SET last_referenced_at = datetime('now', '-28 days') WHERE id = ?"
    ).run(mem!.id);

    const scored = getActiveMemoriesScored(owner, 10);
    // 28 days ago: usageBoost ≈ 0.5
    // score ≈ 1.0 * 1.0 * 0.5 = 0.5
    expect(scored[0].score).toBeCloseTo(0.5, 1);
  });

  it("should rank agent memories above worker memories at equal age", () => {
    const owner = uniqueOwner();
    saveMemory(owner, "Agent memory", "observation"); // source=agent
    // Manually insert worker memory
    sqlite.prepare(
      `INSERT INTO agent_memory (id, owner_key, content, memory_type, content_hash, confidence, is_active, source, created_at)
       VALUES (?, ?, 'Worker memory', 'pattern', ?, 0.8, 1, 'worker', datetime('now'))`
    ).run(randomUUID(), owner, randomUUID());

    const scored = getActiveMemoriesScored(owner, 10);
    expect(scored[0].content).toBe("Agent memory");
    expect(scored[1].content).toBe("Worker memory");
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `npx vitest run tests/evals/memory-scoring-formula.test.ts`
Expected: FAIL — score ≈ 1.0, not 0.5 (no usageBoost yet).

- [ ] **Step 3: Implement usageBoost in getActiveMemoriesScored**

In `src/lib/services/memory-service.ts`, update the scoring section (lines ~178-222):

Add constant:
```typescript
const USAGE_HALF_LIFE_DAYS = 28;
const NEVER_REFERENCED_PENALTY = 0.5;
```

Update the SQL query to also fetch `last_referenced_at`:
```typescript
const rows = sqlite.prepare(`
  SELECT *, julianday('now') - julianday(created_at) AS age_days,
  CASE WHEN last_referenced_at IS NOT NULL
    THEN julianday('now') - julianday(last_referenced_at)
    ELSE NULL
  END AS days_since_last_ref
  FROM agent_memory
  WHERE owner_key = ? AND is_active = 1
  ORDER BY created_at DESC LIMIT 50
`).all(ownerKey);
```

Update scoring loop:
```typescript
const recencyScore = Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
const provenanceScore = PROVENANCE_WEIGHT[row.source as keyof typeof PROVENANCE_WEIGHT] ?? 0.6;
const usageBoost = row.days_since_last_ref !== null
  ? Math.pow(0.5, row.days_since_last_ref / USAGE_HALF_LIFE_DAYS)
  : NEVER_REFERENCED_PENALTY;
const score = recencyScore * provenanceScore * usageBoost;
```

- [ ] **Step 4: Run test — verify it passes**

Run: `npx vitest run tests/evals/memory-scoring-formula.test.ts`
Expected: PASS

- [ ] **Step 5: Run existing memory tests**

Run: `npx vitest run tests/evals/memory-service.test.ts`
Expected: PASS (existing tests may need score assertion adjustments due to new usageBoost=0.5 penalty on never-referenced memories).

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/memory-service.ts tests/evals/memory-scoring-formula.test.ts
git commit -m "feat: T3 scoring formula with usageBoost (28-day half-life, 0.5 penalty for unreferenced)"
```

---

### Task 9: Eviction Policy

**Files:**
- Modify: `src/lib/services/memory-service.ts`
- Create: `tests/evals/memory-eviction.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/evals/memory-eviction.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { saveMemory, saveMemoryFromWorker, getActiveMemoriesScored } from "@/lib/services/memory-service";
import { sqlite } from "@/lib/db";
import { randomUUID } from "crypto";

function uniqueOwner() { return `test-evict-${randomUUID()}`; }

afterAll(() => {
  sqlite.prepare("DELETE FROM agent_memory WHERE owner_key LIKE 'test-evict-%'").run();
});

describe("memory eviction policy", () => {
  it("should evict lowest-scoring memory when saving #51", () => {
    const owner = uniqueOwner();

    // Fill to 50 with worker memories (lowest scoring due to provenance 0.6)
    for (let i = 0; i < 50; i++) {
      saveMemoryFromWorker(owner, `Worker pattern ${i}`);
    }

    // Count active before
    const before = sqlite.prepare(
      "SELECT COUNT(*) as c FROM agent_memory WHERE owner_key = ? AND is_active = 1"
    ).get(owner) as any;
    expect(before.c).toBe(50);

    // Save #51 — should evict the lowest-scoring worker pattern
    const result = saveMemory(owner, "Important agent observation");
    expect(result).not.toBeNull();

    // Still 50 active (one evicted, one added)
    const after = sqlite.prepare(
      "SELECT COUNT(*) as c FROM agent_memory WHERE owner_key = ? AND is_active = 1"
    ).get(owner) as any;
    expect(after.c).toBe(50);
  });

  it("should protect minimum 5 agent memories from eviction", () => {
    const owner = uniqueOwner();

    // Fill with 5 agent + 45 worker
    for (let i = 0; i < 5; i++) {
      saveMemory(owner, `Agent mem ${i}`);
    }
    for (let i = 0; i < 45; i++) {
      saveMemoryFromWorker(owner, `Worker mem ${i}`);
    }

    // Save #51 — should evict a worker, not an agent memory
    saveMemoryFromWorker(owner, "New worker pattern");

    const agentCount = sqlite.prepare(
      "SELECT COUNT(*) as c FROM agent_memory WHERE owner_key = ? AND is_active = 1 AND source = 'agent'"
    ).get(owner) as any;
    expect(agentCount.c).toBe(5); // All 5 agent memories preserved
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `npx vitest run tests/evals/memory-eviction.test.ts`
Expected: FAIL — `saveMemory` returns null at quota, no eviction.

- [ ] **Step 3: Implement eviction**

In `src/lib/services/memory-service.ts`:

Add constant:
```typescript
const AGENT_FLOOR = 5; // Minimum agent memories protected from eviction
```

Replace the rigid quota check in both `saveMemory()` and `saveMemoryFromWorker()`:

```typescript
// Old: if (activeCount >= MAX_MEMORIES_PER_OWNER) return null;
// New:
if (activeCount >= MAX_MEMORIES_PER_OWNER) {
  const evicted = evictLowestScoring(ownerKey, source === "agent" ? "agent" : "worker");
  if (!evicted) return null; // Could not evict (floor protection)
}
```

Add the eviction function:

```typescript
function evictLowestScoring(ownerKey: string, callerSource: string): boolean {
  // Get all active memories scored
  const rows = sqlite.prepare(`
    SELECT id, source,
      julianday('now') - julianday(created_at) AS age_days,
      CASE WHEN last_referenced_at IS NOT NULL
        THEN julianday('now') - julianday(last_referenced_at) ELSE NULL
      END AS days_since_last_ref
    FROM agent_memory WHERE owner_key = ? AND is_active = 1
    ORDER BY created_at DESC LIMIT 50
  `).all(ownerKey) as any[];

  // Score each
  const scored = rows.map(r => {
    const recency = Math.pow(0.5, (r.age_days ?? 0) / RECENCY_HALF_LIFE_DAYS);
    const prov = PROVENANCE_WEIGHT[r.source as keyof typeof PROVENANCE_WEIGHT] ?? 0.6;
    const usage = r.days_since_last_ref !== null
      ? Math.pow(0.5, r.days_since_last_ref / USAGE_HALF_LIFE_DAYS)
      : NEVER_REFERENCED_PENALTY;
    return { id: r.id, source: r.source, score: recency * prov * usage };
  });

  // Count agent memories
  const agentCount = scored.filter(s => s.source === "agent").length;

  // Sort ascending (lowest score first) — candidates for eviction
  scored.sort((a, b) => a.score - b.score);

  // Find first evictable (respect agent floor)
  for (const candidate of scored) {
    if (candidate.source === "agent" && agentCount <= AGENT_FLOOR) continue;
    // Evict this one
    sqlite.prepare(
      "UPDATE agent_memory SET is_active = 0, deactivated_at = datetime('now') WHERE id = ?"
    ).run(candidate.id);
    return true;
  }
  return false; // All protected
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/evals/memory-eviction.test.ts tests/evals/memory-service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/memory-service.ts tests/evals/memory-eviction.test.ts
git commit -m "feat: T3 eviction policy — replaces rigid quota, protects 5 agent memories"
```

---

### Task 10: updateLastReferencedAt Helper

**Files:**
- Modify: `src/lib/services/memory-service.ts`

- [ ] **Step 1: Add the async update function**

```typescript
/**
 * Batch-update last_referenced_at for memories that appeared in agent context.
 * Called async post-turn in onFinish — never in the read path.
 */
export function updateLastReferencedAt(memoryIds: string[]): void {
  if (memoryIds.length === 0) return;
  const placeholders = memoryIds.map(() => "?").join(",");
  sqlite.prepare(
    `UPDATE agent_memory SET last_referenced_at = datetime('now')
     WHERE id IN (${placeholders}) AND is_active = 1`
  ).run(...memoryIds);
}
```

- [ ] **Step 2: Add test in memory-scoring-formula.test.ts**

```typescript
it("should batch-update last_referenced_at", () => {
  const owner = uniqueOwner();
  const m1 = saveMemory(owner, "Mem 1", "observation");
  const m2 = saveMemory(owner, "Mem 2", "preference");

  // Before update: last_referenced_at is null
  const before = sqlite.prepare(
    "SELECT last_referenced_at FROM agent_memory WHERE id = ?"
  ).get(m1!.id) as any;
  expect(before.last_referenced_at).toBeNull();

  // Update
  updateLastReferencedAt([m1!.id, m2!.id]);

  // After: last_referenced_at is set
  const after = sqlite.prepare(
    "SELECT last_referenced_at FROM agent_memory WHERE id = ?"
  ).get(m1!.id) as any;
  expect(after.last_referenced_at).not.toBeNull();
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/evals/memory-scoring-formula.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/services/memory-service.ts tests/evals/memory-scoring-formula.test.ts
git commit -m "feat: add updateLastReferencedAt for async post-turn usage tracking"
```

---

## Chunk 4: T3 Prompt + Context Integration

### Task 11: Compaction Prompt Upgrade

**Files:**
- Modify: `src/lib/services/session-compaction-service.ts:46-76`

- [ ] **Step 1: Rewrite the compaction prompt**

In the `COMPACTION_PROMPT` template (lines ~46-76), update the `patternsObserved` section:

```typescript
## patternsObserved (array of max 3 strings)
Extract BEHAVIORAL PATTERNS about the user — NOT mechanical tool usage stats.

GOOD patterns (behavioral synthesis):
- "User prefers professional tone for their public page but is casual in conversation"
- "User consistently adds context about career transitions — they seem to be repositioning professionally"
- "User is protective of personal contact info — always marks phone/email as private"

BAD patterns (mechanical summaries — NEVER output these):
- "Tool 'create_fact' called 12 times"
- "User sent 8 messages in this session"
- "Session lasted approximately 15 minutes"

Each pattern must describe a USER PREFERENCE, COMMUNICATION STYLE, or BEHAVIORAL TENDENCY.
If no meaningful behavioral pattern is evident, return an empty array.
```

- [ ] **Step 2: Run existing compaction tests**

Run: `npx vitest run tests/evals/session-compaction.test.ts`
Expected: PASS (tests check structure, not prompt content).

- [ ] **Step 3: Commit**

```bash
git add src/lib/services/session-compaction-service.ts
git commit -m "feat: upgrade compaction prompt — demand behavioral synthesis, ban mechanical stats"
```

---

### Task 12: MEMORY SELF-MANAGEMENT Policy

**Files:**
- Modify: `src/lib/agent/policies/memory-directives.ts`

- [ ] **Step 1: Add MEMORY SELF-MANAGEMENT section**

Extend the `memoryUsageDirectives()` function. After the existing tier documentation, add:

```typescript
const MEMORY_SELF_MANAGEMENT = `
## MEMORY SELF-MANAGEMENT (save_memory tool)

**When to save a memory:**
- User expresses a PREFERENCE about their page, communication style, or content priorities
- You notice a recurring PATTERN across interactions (user always corrects X, prefers Y format)
- User shares CONTEXT that shapes future interactions but isn't a factual attribute (e.g., "I'm transitioning careers", "I don't like talking about my previous job")

**When NOT to save:**
- Factual information → use create_fact instead
- One-time instructions ("make the bio shorter") → just execute them
- Information already captured in facts or soul profile → redundant
- Tool usage statistics → not useful

**Good memory examples:**
- "User prefers professional tone over casual for their public page"
- "User is sensitive about job title changes — always confirm before updating identity facts"
- "User provides information in short bursts — follow up to get complete details"

**Bad memory examples (never save these):**
- "User's name is Marco" → this is a fact
- "Updated the bio section" → this is an action log
- "create_fact was called 5 times" → mechanical, not behavioral

## CROSS-TIER AWARENESS

When RECENT EVENTS (episodic) relate to KNOWN FACTS, mention the connection naturally in your response. For example, if the user has a fact about running and a recent episodic event about a workout, reference both to show continuity. You have both blocks in context — use them together.
`;
```

Append `MEMORY_SELF_MANAGEMENT` to the return string of `memoryUsageDirectives()`.

- [ ] **Step 2: Run memory directives tests**

Run: `npx vitest run tests/evals/memory-directives.test.ts`
Expected: PASS (may need to add assertions for new sections if tests check specific keywords).

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/policies/memory-directives.ts
git commit -m "feat: add MEMORY SELF-MANAGEMENT policy + cross-tier awareness prompt"
```

---

### Task 13: Context Format + Paired ID Tracking Through All Truncation Phases

**Files:**
- Modify: `src/lib/agent/context.ts:335-346`
- Modify: `src/app/api/chat/route.ts:464-474`

- [ ] **Step 1: Build memory lines paired with IDs in context.ts**

In `src/lib/agent/context.ts`, lines 335-346, change the memory formatting to use a `Map<lineContent, memoryId>` for tracking which memories survive truncation:

```typescript
let memoriesBlock = "";
const memoryLineToId = new Map<string, string>();
if (!profile || profile.memories.include) {
  const activeMemories = getActiveMemoriesScored(scope.cognitiveOwnerKey, 15);
  if (activeMemories.length > 0) {
    for (const m of activeMemories) {
      const line = `- [${m.memoryType}|${m.category ?? "general"}] ${m.content}`;
      memoryLineToId.set(line, m.id);
    }
    memoriesBlock = [...memoryLineToId.keys()].join("\n");
  }
  memoriesBlock = truncateToTokenBudget(memoriesBlock, profile?.memories.budget ?? BUDGET.memories);
}
```

- [ ] **Step 2: Derive referencedMemoryIds AFTER all truncation phases**

After ALL truncation phases (per-block budget truncation above, the total-budget overflow loop at context.ts:624 which operates on `blocks[3].content` for memories, and the final hard truncation at line 681), derive `referencedMemoryIds` from the FINAL memoriesBlock content:

```typescript
// After overflow loop, synchronize memoriesBlock with blocks[3].content
// (the overflow loop mutates blocks[3].content directly)
const finalMemoriesContent = blocks?.[3]?.content ?? memoriesBlock;

// Derive referenced IDs from surviving complete lines
const referencedMemoryIds: string[] = [];
for (const [line, id] of memoryLineToId) {
  // Use exact string matching on complete lines
  // Partial lines from character-based shrinkBlockContent() won't match (correct behavior:
  // a truncated memory line is no longer a valid reference)
  if (finalMemoriesContent.includes(line)) {
    referencedMemoryIds.push(id);
  }
}
```

Note: Place this derivation AFTER the overflow loop (after line ~679) and AFTER the final hard truncation at line 681, so it reflects the truly final state of the prompt.

- [ ] **Step 3: Extend the return type**

Update the `ContextResult` type (or add a new field) to include `referencedMemoryIds`:

```typescript
export type ContextResult = {
  systemPrompt: string;
  trimmedMessages: Array<{ role: string; content: string }>;
  mode: PromptMode;
  referencedMemoryIds: string[];
};
```

Return `referencedMemoryIds` in the `assembleContext()` return object.

- [ ] **Step 4: Wire async update in chat route**

In `src/app/api/chat/route.ts`, in the `onFinish` callback (around line 464), add:

```typescript
// Async T3 memory usage tracking — best-effort, non-blocking
try {
  if (contextResult.referencedMemoryIds.length > 0) {
    updateLastReferencedAt(contextResult.referencedMemoryIds);
  }
} catch (e) {
  console.warn("[chat] Failed to update memory references:", e);
}
```

Import at the top of the file:
```typescript
import { updateLastReferencedAt } from "@/lib/services/memory-service";
```

The `contextResult` variable needs to be captured from the `assembleContext()` call earlier in the route (it's already called, just need to store the full result including the new field).

- [ ] **Step 5: Add test for total-budget overflow ID correctness**

Add a test to `tests/evals/context-assembler.test.ts` that verifies `referencedMemoryIds` is correct when the total-budget overflow loop triggers and shrinks the memories block. Seed enough memories to exceed the budget, verify that IDs corresponding to truncated lines are excluded.

- [ ] **Step 6: Run context assembler tests**

Run: `npx vitest run tests/evals/context-assembler.test.ts tests/evals/chat-context-integration.test.ts`
Expected: PASS (update mock returns to include `referencedMemoryIds: []`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/agent/context.ts src/app/api/chat/route.ts tests/evals/context-assembler.test.ts
git commit -m "feat: T3 context format [type|category] + paired ID tracking through all truncation phases"
```

---

## Chunk 5: T4 Improvements + API + Remaining Tests

### Task 14: FTS Word-Split

**Files:**
- Modify: `src/lib/services/episodic-service.ts:139-141`
- Create: `tests/evals/episodic-fts-wordsplit.test.ts`

- [ ] **Step 1: Write the failing test**

Note: `queryEvents(input: QueryEventsInput)` takes a single object `{ ownerKey, fromUnix, toUnix, keywords }` and returns `EpisodicEventRow[]` (a plain array, not `{ events }`).

```typescript
// tests/evals/episodic-fts-wordsplit.test.ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { sqlite } from "@/lib/db";
import { insertEvent, queryEvents } from "@/lib/services/episodic-service";
import { randomUUID } from "crypto";

const ownerKey = `test-fts-split-${randomUUID()}`;
const fromUnix = Math.floor(Date.now() / 1000) - 3600;
const toUnix = Math.floor(Date.now() / 1000) + 3600;

beforeEach(() => {
  sqlite.exec("DELETE FROM episodic_events WHERE owner_key LIKE 'test-fts-split-%'");
  sqlite.exec("INSERT INTO episodic_events_fts(episodic_events_fts) VALUES('rebuild')");
});

afterAll(() => {
  sqlite.exec("DELETE FROM episodic_events WHERE owner_key LIKE 'test-fts-split-%'");
  sqlite.exec("INSERT INTO episodic_events_fts(episodic_events_fts) VALUES('rebuild')");
});

describe("episodic FTS word-split", () => {
  it("should match multi-word queries in any order", () => {
    insertEvent({
      ownerKey,
      sessionId: "s1",
      eventAtUnix: Math.floor(Date.now() / 1000),
      eventAtHuman: new Date().toISOString(),
      actionType: "workout",
      narrativeSummary: "Completed a marathon training session in the park",
      rawInput: "test",
    });

    // "training marathon" — reversed order should still match
    const results = queryEvents({ ownerKey, fromUnix, toUnix, keywords: "training marathon" });
    expect(results).toHaveLength(1);
  });

  it("should require ALL words to match (AND semantics)", () => {
    insertEvent({
      ownerKey,
      sessionId: "s1",
      eventAtUnix: Math.floor(Date.now() / 1000),
      eventAtHuman: new Date().toISOString(),
      actionType: "coding",
      narrativeSummary: "Fixed a bug in the authentication module",
      rawInput: "test",
    });

    // "bug cooking" — "cooking" not in summary, should NOT match
    const results = queryEvents({ ownerKey, fromUnix, toUnix, keywords: "bug cooking" });
    expect(results).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `npx vitest run tests/evals/episodic-fts-wordsplit.test.ts`
Expected: FAIL — first test fails because current phrase-search `"training marathon"` requires exact sequence.

- [ ] **Step 3: Implement word-split**

In `src/lib/services/episodic-service.ts`, replace `sanitizeFtsKeywords()`:

```typescript
function sanitizeFtsKeywords(raw: string): string {
  const terms = raw.trim().split(/\s+/).filter(t => t.length > 0);
  if (terms.length === 0) return '""';
  return terms.map(t => `"${t.replace(/"/g, "")}"`).join(" ");
}
```

- [ ] **Step 4: Run test — verify it passes**

Run: `npx vitest run tests/evals/episodic-fts-wordsplit.test.ts`
Expected: PASS

- [ ] **Step 5: Run existing episodic tests**

Run: `npx vitest run tests/evals/episodic-service.test.ts tests/evals/episodic-tools.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/episodic-service.ts tests/evals/episodic-fts-wordsplit.test.ts
git commit -m "feat: T4 FTS word-split — multi-word queries use AND semantics"
```

---

### Task 15: Memory API Endpoints

**Files:**
- Create: `src/app/api/memory/route.ts`
- Create: `src/app/api/memory/[id]/route.ts`

Note: Import `resolveOwnerScope` from `@/lib/auth/session` (not `@/lib/auth/owner-scope`). Import `isMultiUserEnabled` from `@/lib/services/session-service`. Auth pattern: `if (isMultiUserEnabled() && !scope)` to allow single-user mode. Next.js App Router params are async: `{ params }: { params: Promise<{ id: string }> }` + `const { id } = await params`.

- [ ] **Step 1: Create GET /api/memory**

```typescript
// src/app/api/memory/route.ts
import { NextResponse } from "next/server";
import { getActiveMemoriesScored } from "@/lib/services/memory-service";
import { resolveOwnerScope } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";

export async function GET(request: Request) {
  const scope = resolveOwnerScope(request);
  if (isMultiUserEnabled() && !scope) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ownerKey = scope?.cognitiveOwnerKey ?? "__default__";

  const memories = getActiveMemoriesScored(ownerKey, 50);
  return NextResponse.json({ memories });
}
```

- [ ] **Step 2: Create DELETE /api/memory/[id]**

```typescript
// src/app/api/memory/[id]/route.ts
import { NextResponse } from "next/server";
import { deactivateMemory } from "@/lib/services/memory-service";
import { resolveOwnerScope } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";
import { sqlite } from "@/lib/db";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const scope = resolveOwnerScope(request);
  if (isMultiUserEnabled() && !scope) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ownerKey = scope?.cognitiveOwnerKey ?? "__default__";

  // Verify the memory belongs to this owner
  const mem = sqlite
    .prepare("SELECT owner_key FROM agent_memory WHERE id = ?")
    .get(id) as { owner_key: string } | undefined;

  if (!mem || mem.owner_key !== ownerKey) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = deactivateMemory(id, ownerKey);
  return NextResponse.json({ success: result });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/memory/route.ts src/app/api/memory/\[id\]/route.ts
git commit -m "feat: minimal memory API — GET list + DELETE deactivate"
```

---

### Task 16: Remaining Test Coverage

**Files:**
- Create: `tests/evals/batch-record-events.test.ts`
- Create: `tests/evals/session-compaction-real-db.test.ts`
- Modify: `tests/evals/episodic-consolidation.test.ts`

- [ ] **Step 1: batchRecordEvents unit test**

Note: `batchRecordEvents(events[], ctx)` takes two args (array + context object). It is async. Return fields are `eventsWritten`/`eventsSkipped`/`errors`.

```typescript
// tests/evals/batch-record-events.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { sqlite } from "@/lib/db";
import { batchRecordEvents } from "@/lib/connectors/connector-event-writer";
import { randomUUID } from "crypto";

const PREFIX = "test-batch-evt-";

afterAll(() => {
  sqlite.prepare("DELETE FROM connector_items WHERE connector_id LIKE ?").run(`${PREFIX}%`);
  sqlite.prepare("DELETE FROM episodic_events WHERE owner_key LIKE ?").run(`${PREFIX}%`);
});

describe("batchRecordEvents", () => {
  it("should deduplicate within a single batch (intra-batch)", async () => {
    const connectorId = `${PREFIX}${randomUUID()}`;
    const ownerKey = `${PREFIX}owner`;
    const extId = `dup-${randomUUID()}`;

    const report = await batchRecordEvents(
      [
        makeEvent(extId, "Article 1"),
        makeEvent(extId, "Article 1 duplicate"), // same externalId
      ],
      { ownerKey, connectorId, connectorType: "rss", sessionId: "s1" },
    );

    expect(report.eventsWritten).toBe(1);
    expect(report.eventsSkipped).toBe(1);
  });

  it("should handle more than 500 events (chunked dedup)", async () => {
    const connectorId = `${PREFIX}${randomUUID()}`;
    const ownerKey = `${PREFIX}owner-large`;

    const events = Array.from({ length: 600 }, (_, i) =>
      makeEvent(`evt-${i}`, `Event ${i}`)
    );

    const report = await batchRecordEvents(
      events,
      { ownerKey, connectorId, connectorType: "rss", sessionId: "s1" },
    );
    expect(report.eventsWritten).toBe(600);
    expect(report.errors).toHaveLength(0);
  });
});

function makeEvent(externalId: string, summary: string) {
  return {
    externalId,
    eventAtUnix: Math.floor(Date.now() / 1000),
    eventAtHuman: new Date().toISOString(),
    actionType: "article",
    narrativeSummary: summary,
  };
}
```

- [ ] **Step 2: Session compaction real-DB test**

Note: `runSessionCompaction` returns `CompactionResult` with `structuredSummary` containing the LLM output. It does NOT write to `agent_memory` itself -- the worker handler does that in a separate step. So do NOT assert agent_memory writes here. Use mood `"productive"` (not `"focused"`).

```typescript
// tests/evals/session-compaction-real-db.test.ts
import { describe, it, expect, vi, afterAll } from "vitest";
import { sqlite } from "@/lib/db";
import { randomUUID } from "crypto";

// Mock only the LLM call, use real DB for everything else
vi.mock("ai", () => ({
  generateText: vi.fn().mockResolvedValue({
    text: JSON.stringify({
      topics: ["career"], factsChanged: [], patternsObserved: ["User prefers concise responses"],
      sessionMood: "productive", keyTakeaways: ["Career transition discussion"],
    }),
    usage: { promptTokens: 100, completionTokens: 50 },
  }),
}));

describe("session compaction real DB", () => {
  const ownerKey = `test-compact-real-${randomUUID()}`;
  const sessionKey = `sess-${randomUUID()}`;

  afterAll(() => {
    sqlite.prepare("DELETE FROM messages WHERE session_id = ?").run(sessionKey);
    sqlite.prepare("DELETE FROM session_compaction_log WHERE owner_key = ?").run(ownerKey);
  });

  it("should compact messages and return structured summary", async () => {
    // Seed 10 messages
    for (let i = 0; i < 10; i++) {
      sqlite.prepare(
        `INSERT INTO messages (id, session_id, role, content, created_at)
         VALUES (?, ?, ?, ?, datetime('now', '-${10 - i} minutes'))`
      ).run(randomUUID(), sessionKey, i % 2 === 0 ? "user" : "assistant", `Message ${i}`);
    }

    const { runSessionCompaction } = await import("@/lib/services/session-compaction-service");
    const messages = sqlite.prepare(
      "SELECT *, rowid FROM messages WHERE session_id = ? ORDER BY rowid LIMIT 40"
    ).all(sessionKey);

    const result = await runSessionCompaction({
      ownerKey, sessionKey, messages: messages as any,
      knowledgeReadKeys: [ownerKey],
    });

    expect(result.success).toBe(true);
    expect(result.structuredSummary?.patternsObserved).toContain("User prefers concise responses");
    expect(result.structuredSummary?.sessionMood).toBe("productive");
    // Note: runSessionCompaction does NOT write to agent_memory — the worker handler does
  });
});
```

- [ ] **Step 3: evaluatePatternWithLLM test (via consolidateEpisodesForOwner)**

Note: `evaluatePatternWithLLM` is NOT exported — it's a private function inside `episodic-consolidation-service.ts`. Test it indirectly via `consolidateEpisodesForOwner`, which calls `checkPatternThresholds` -> `evaluatePatternWithLLM`. Seed 4 chat events with the same `action_type` to cross the threshold (>=3 events/60d), then check the `episodic_pattern_proposals` table.

Add to `tests/evals/episodic-consolidation.test.ts`:

```typescript
describe("evaluatePatternWithLLM (via consolidateEpisodesForOwner)", () => {
  const ownerKey = `test-consolidate-${randomUUID()}`;

  afterAll(() => {
    sqlite.prepare("DELETE FROM episodic_events WHERE owner_key = ?").run(ownerKey);
    sqlite.prepare("DELETE FROM episodic_pattern_proposals WHERE owner_key = ?").run(ownerKey);
  });

  it("should create pattern proposal when LLM deems pattern worthy", async () => {
    // Seed 4 chat events with same action_type to cross threshold (>=3)
    const now = Math.floor(Date.now() / 1000);
    for (let i = 0; i < 4; i++) {
      insertEvent({
        ownerKey,
        sessionId: `sess-${i}`,
        eventAtUnix: now - (i * 86400), // spread over 4 days
        eventAtHuman: new Date((now - i * 86400) * 1000).toISOString(),
        actionType: "workout",
        narrativeSummary: `Completed workout session ${i + 1}`,
        source: "chat",
      });
    }

    // Mock LLM to return worthy pattern
    vi.mocked(generateText).mockResolvedValueOnce({
      text: JSON.stringify({ worthy: true, summary: "Regular workout routine" }),
      usage: { promptTokens: 50, completionTokens: 20 },
    } as any);

    const { consolidateEpisodesForOwner } = await import(
      "@/lib/services/episodic-consolidation-service"
    );
    const proposalsCreated = await consolidateEpisodesForOwner(ownerKey);

    // Check proposals table
    const proposals = sqlite.prepare(
      "SELECT * FROM episodic_pattern_proposals WHERE owner_key = ?"
    ).all(ownerKey) as any[];
    expect(proposals.length).toBeGreaterThan(0);
    expect(proposals[0].summary).toBe("Regular workout routine");
  });
});
```

- [ ] **Step 4: Run all new tests**

Run: `npx vitest run tests/evals/batch-record-events.test.ts tests/evals/session-compaction-real-db.test.ts tests/evals/episodic-consolidation.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All ~2810+ tests PASS (2802 existing + ~8-10 new).

- [ ] **Step 6: Commit**

```bash
git add tests/evals/
git commit -m "test: fill coverage gaps — batchRecordEvents, compaction real-DB, evaluatePatternWithLLM"
```

---

## Final Verification

- [ ] **Run full test suite**: `npx vitest run` — all tests pass
- [ ] **Run TypeScript check**: `npx tsc --noEmit` — zero errors
- [ ] **Run dev server**: `npm run dev` — migration 0030 applies, server starts
- [ ] **Verify EXPECTED_SCHEMA_VERSION**: should be 30
- [ ] **Verify EXPECTED_HANDLER_COUNT**: should still be 11 (no new handlers)

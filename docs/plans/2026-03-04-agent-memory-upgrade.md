# Agent Memory Upgrade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the agent memory architecture with: (1) a `pageState` block injected into context, (2) increase `maxTurns` 12→20 and facts cap 50→120, (3) an async session compaction worker converting raw chat history into structured semantic memory.

**NOT in scope:**
- Total context budget (already 65000 — do not change)
- Switching model tiers (both `AI_MODEL_FAST` and `AI_MODEL_STANDARD` are `gemini-2.5-flash` — no-op)

**Tech Stack:** TypeScript, Vercel AI SDK v4, SQLite/Drizzle ORM, Vitest, existing `enqueueJob` / worker job pattern.

---

## Context: What exists today

- `src/lib/agent/context.ts` — `BUDGET.total = 65000` (DO NOT CHANGE). `maxTurns = 12` → 20. Facts cap: 50 → 120. `BUDGET` NOT exported.
- `tests/evals/context-assembler.test.ts` line 241: asserts `trimmedMessages.length <= 12` → update to `<= 20`.
- `src/lib/page-config/schema.ts` — `PageConfig` top-level fields: `surface`, `voice`, `light` (NOT nested in `presence`), `layoutTemplate?`, `sections[]{type, slot?, widgetId?}`.
- `src/lib/db/migrate.ts` — `EXPECTED_SCHEMA_VERSION = 25` → 26. `runMigrations()` wraps files in `sqlite.transaction()`. Do NOT add `BEGIN;`/`COMMIT;`. Run with `npm run db:init`.
- `src/worker.ts` — `EXPECTED_HANDLER_COUNT = 9` → 10.
- `src/app/api/chat/route.ts` — messages stored under `messageSessionId`.
- `src/lib/auth/session.ts` — `resolveOwnerScopeForWorker(ownerKey): OwnerScope`.
- `src/lib/services/memory-service.ts` — `saveMemory(ownerKey, content, type)`.
- `db/migrations/0016_jobs_heartbeat.sql` — `jobs` CHECK doesn't include `session_compaction`. Dedup on `(job_type, ownerKey)` blocks per-session compaction.
- `messages` table — `id TEXT PRIMARY KEY` (SQLite implicit `rowid`). Use `rowid` as cursor. **Important:** `rowid` CANNOT be used in `CREATE INDEX` — use `CREATE INDEX ON messages(session_id)` for the query.
- Test files mocking `@/lib/services/page-service` without `getDraft`: search and update all.

## Compaction design decisions

**Cursor:** `cursor_rowid INTEGER` in `session_compaction_log`. Stored and read as the last processed `rowid` from `messages`. Query uses `WHERE session_id = ? AND rowid > ?` — efficient and monotonic.

**`getLastCompactionRowid`:** orders by `cursor_rowid DESC` (the message cursor column, not `created_at`). This is correct even when multiple windows are processed in the same second.

**Failure policy:**
- `getLastCompactionRowid` reads `status IN ('ok','skipped')` — skipped rows advance cursor.
- **Transient failure** (network, budget, provider error): log as `status='error'` with `error_code='transient'`, handler **throws** → `executeJob` marks job `failed` → retry via `attempts` + backoff. Cursor does NOT advance.
- **Deterministic failure** (JSON parse failure, schema error): log as `status='error'` with `error_code='json_parse_failure'` or `'schema_validation_failure'`, handler **throws** (same as transient; anti-burn accumulates).
- **Anti-burn guard**: when a deterministic failure occurs, `countDeterministicFailures(sessionKey, cursorRowid) + 1 >= MAX_FAILURES_PER_WINDOW` (i.e., this is the 3rd deterministic failure) → service returns `skipped: true` directly, handler does NOT throw. This ensures skip fires within 3 attempts (MAX_ATTEMPTS=3 in `executeJob`). Transient errors never count toward anti-burn (temporary outages must not permanently skip valid windows).
- Skipped rows advance cursor; next run starts past the bad window.
- **Shape validation**: after JSON.parse, validate required array/string fields. Return `errorCode: 'schema_validation_failure'` on mismatch (deterministic, counts toward anti-burn).

**Backlog:** Worker loops up to 5 windows of 40 messages per job execution. After the loop, if the last processed batch was full (40 messages), enqueue a continuation `session_compaction` job to handle remaining backlog.

**Retry collision analysis (non-issue):** The continuation enqueue (post-loop, success path) and the `throw` (mid-loop, failure path) are mutually exclusive code paths — a throw exits the handler before reaching the post-loop `enqueueJob` call. Therefore a running job cannot both enqueue a queued duplicate AND fail in a way that triggers `executeJob` retry against that duplicate.

---

## Phase 1 — Context Improvements

### Task 1: Inject pageState + raise turn/facts caps

**Files:**
- Modify: `src/lib/agent/context.ts`
- Modify: affected test files (add `getDraft` mock + update turn cap assertion)

**context.ts changes:**

```typescript
// BUDGET: add one entry (do NOT change existing values)
const BUDGET = { /* ... existing ... */ pageState: 1500 } as const;

// ContextProfile type: add field
pageState: { include: boolean; budget: number };

// CONTEXT_PROFILES:
// first_visit, returning_no_page, blocked → pageState: { include: false, budget: 0 }
// draft_ready, active_fresh, active_stale → pageState: { include: true, budget: 1500 }

// New import
import { getDraft } from "@/lib/services/page-service";

// Page state block (after conflictsBlock, BEFORE auth context block):
let pageStateBlock = "";
const includePageState = profile?.pageState.include ?? false;
if (includePageState) {
  const draft = getDraft(scope.knowledgePrimaryKey);
  if (draft?.config) {
    const cfg = draft.config as import("@/lib/page-config/schema").PageConfig;
    const sections = (cfg.sections ?? []).map(s =>
      `  - ${s.type}${s.slot ? ` [slot:${s.slot}]` : ""}${s.widgetId ? ` widget:${s.widgetId}` : ""}`
    ).join("\n");
    const presenceLine = `surface:${cfg.surface ?? "?"} voice:${cfg.voice ?? "?"} light:${cfg.light ?? "?"}`;
    const layoutLine = cfg.layoutTemplate ? `layoutTemplate: ${cfg.layoutTemplate}` : "layoutTemplate: (default)";
    pageStateBlock = `CURRENT DRAFT PAGE:\n${layoutLine}\npresence: ${presenceLine}\nsections:\n${sections || "  (none)"}`;
    pageStateBlock = truncateToTokenBudget(pageStateBlock, profile?.pageState.budget ?? BUDGET.pageState);
  }
}
if (pageStateBlock) contextParts.push(`\n\n---\n\nPAGE STATE:\n${pageStateBlock}`);

// Truncation loop: add pageState entry + label switch
{ name: "pageState", content: pageStateBlock, budget: BUDGET.pageState }
// "pageState" → "PAGE STATE:\n"

// FIX existing truncation rebuild bug (Issue 4):
// The current rebuild loop re-composes from [basePrompt + 5 mutableBlocks] only,
// silently dropping auth, pending ops, coherence, quota, magic paste.
// Fix: separate static (non-truncatable) parts from mutable parts; preserve static during rebuild.
//
// In assembleContext, replace the current flat `contextParts` approach with two arrays:
//   const mutableParts: string[] = [basePrompt]; // facts, soul, summary, memories, conflicts, pageState
//   const staticParts: string[] = [];             // auth, exploration, pending ops, coherence, quota, magic paste
// Push mutable blocks into mutableParts, static blocks into staticParts.
// Compose: systemPrompt = mutableParts.join("") + staticParts.join("")
// In truncation loop rebuild:
//   systemPrompt = rebuiltMutableParts.join("") + staticParts.join("")
// This ensures static blocks are NEVER dropped during truncation.

// maxTurns: 20 (was 12)
// sortFactsForContext cap: 120 (was 50)
```

**Test file changes:**

1. Find all files mocking page-service:
   ```bash
   grep -rln "page-service" tests/evals/ | xargs grep -l "vi.mock"
   ```
2. Add `getDraft: vi.fn(() => null)` to each mock.
3. Update `tests/evals/context-assembler.test.ts` line 241: `<= 20` (was `<= 12`).

```bash
npx vitest run tests/evals/context-assembler.test.ts tests/evals/conditional-context.test.ts
git add src/lib/agent/context.ts tests/evals/
git commit -m "feat(agent): add pageState context block + raise turns 12→20, facts cap 50→120"
```

---

### Task 2: Tests for Phase 1

**Files:**
- Create: `tests/evals/context-expansion.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/services/kb-service", () => ({ getActiveFacts: vi.fn(() => []), countFacts: vi.fn(() => 0) }));
vi.mock("@/lib/services/page-service", () => ({ hasAnyPublishedPage: vi.fn(() => false), getDraft: vi.fn(() => null) }));
vi.mock("@/lib/services/summary-service", () => ({ getSummary: vi.fn(() => null) }));
vi.mock("@/lib/services/memory-service", () => ({ getActiveMemories: vi.fn(() => []) }));
vi.mock("@/lib/services/soul-service", () => ({ getActiveSoul: vi.fn(() => null) }));
vi.mock("@/lib/services/conflict-service", () => ({ getOpenConflicts: vi.fn(() => []) }));
vi.mock("@/lib/services/page-projection", () => ({ filterPublishableFacts: vi.fn(() => []) }));
vi.mock("@/lib/agent/prompts", () => ({ buildSystemPrompt: vi.fn(() => "PROMPT") }));
vi.mock("@/lib/agent/journey", () => ({ computeRelevance: vi.fn(() => 0.5) }));
vi.mock("@/lib/services/session-metadata", () => ({ getSessionMeta: vi.fn(() => ({})), mergeSessionMeta: vi.fn() }));
vi.mock("@/lib/connectors/magic-paste", () => ({ detectConnectorUrls: vi.fn(() => []) }));

import { assembleContext } from "@/lib/agent/context";
import { getDraft } from "@/lib/services/page-service";

const SCOPE = { cognitiveOwnerKey: "cog-1", knowledgeReadKeys: ["sess-a"], knowledgePrimaryKey: "sess-a", currentSessionId: "sess-a" };
const ACTIVE_FRESH_BOOTSTRAP = {
  journeyState: "active_fresh" as const, language: "en", situations: [], expertiseLevel: "novice" as const,
  userName: "Alice", lastSeenDaysAgo: 1, publishedUsername: null, pendingProposalCount: 0,
  thinSections: [], staleFacts: [], openConflicts: [], archivableFacts: [], conversationContext: null, archetype: "generalist" as const,
};

describe("Context expansion", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pageState absent when draft is null", () => {
    vi.mocked(getDraft).mockReturnValue(null);
    const { systemPrompt } = assembleContext(SCOPE, "en", [{ role: "user", content: "hi" }], undefined, ACTIVE_FRESH_BOOTSTRAP);
    expect(systemPrompt).not.toContain("CURRENT DRAFT PAGE:");
  });

  it("pageState present with correct field names", () => {
    vi.mocked(getDraft).mockReturnValue({
      config: { layoutTemplate: "vertical", surface: "canvas", voice: "signal", light: "day", sections: [{ type: "hero", slot: "main", widgetId: "hero-default" }] } as never,
      username: "alice", status: "draft", configHash: "abc123", updatedAt: null,
    });
    const { systemPrompt } = assembleContext(SCOPE, "en", [{ role: "user", content: "hi" }], undefined, ACTIVE_FRESH_BOOTSTRAP);
    expect(systemPrompt).toContain("CURRENT DRAFT PAGE:");
    expect(systemPrompt).toContain("hero");
    expect(systemPrompt).toContain("canvas");
    expect(systemPrompt).toContain("signal");
    expect(systemPrompt).toContain("vertical");
  });

  it("pageState absent for first_visit", () => {
    vi.mocked(getDraft).mockReturnValue({ config: { sections: [], surface: "canvas", voice: "signal", light: "day" } as never, username: "x", status: "draft", configHash: null, updatedAt: null });
    const { systemPrompt } = assembleContext(SCOPE, "en", [{ role: "user", content: "hi" }], undefined, { ...ACTIVE_FRESH_BOOTSTRAP, journeyState: "first_visit" as const });
    expect(systemPrompt).not.toContain("CURRENT DRAFT PAGE:");
  });

  it("recent turns cap is at least 20", () => {
    const msgs = Array.from({ length: 25 }, (_, i) => ({ role: i % 2 === 0 ? "user" : "assistant", content: `msg ${i}` })) as Array<{ role: "user" | "assistant"; content: string }>;
    const { trimmedMessages } = assembleContext(SCOPE, "en", msgs, undefined, ACTIVE_FRESH_BOOTSTRAP);
    expect(trimmedMessages.length).toBeGreaterThanOrEqual(20);
  });
});
```

```bash
npx vitest run tests/evals/context-expansion.test.ts
git add tests/evals/context-expansion.test.ts
git commit -m "test(agent): add context expansion tests — page state injection, turn cap"
```

---

## Phase 2 — Session Compaction Worker

### Task 3: DB migration 0026 + EXPECTED_SCHEMA_VERSION

**Files:**
- Create: `db/migrations/0026_session_compaction.sql`
- Modify: `src/lib/db/migrate.ts` (25 → 26)

**IMPORTANT SQLite constraint:** `rowid` is a pseudo-column and CANNOT be used in `CREATE INDEX`. The index on `messages` uses only `session_id` which is sufficient since the query predicates on `rowid` directly.

```sql
-- 0026_session_compaction.sql — NO BEGIN/COMMIT (migrator wraps in transaction)

-- 1. Rebuild jobs table with session_compaction in CHECK
CREATE TABLE jobs_new (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  job_type TEXT NOT NULL CHECK(job_type IN (
    'heartbeat_light','heartbeat_deep','connector_sync','page_regen','taxonomy_review',
    'page_synthesis','memory_summary','soul_proposal','expire_proposals',
    'session_compaction','legacy_unknown')),
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed')),
  run_after TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO jobs_new (id, job_type, payload, status, run_after, attempts, last_error, created_at, updated_at)
  SELECT id, job_type, payload, status, run_after, attempts, last_error, created_at, updated_at FROM jobs;

DROP TABLE jobs;
ALTER TABLE jobs_new RENAME TO jobs;
CREATE INDEX idx_jobs_due ON jobs(status, run_after);

-- 2. Per-type dedup indexes
CREATE UNIQUE INDEX uniq_jobs_dedup_global
  ON jobs(job_type, json_extract(payload, '$.ownerKey'))
  WHERE status IN ('queued','running') AND job_type != 'session_compaction';

-- NOTE: session_compaction dedup covers only 'queued' (not 'running') so a running job
-- can enqueue the next continuation without conflicting with itself.
CREATE UNIQUE INDEX uniq_jobs_dedup_compaction
  ON jobs(job_type, json_extract(payload, '$.ownerKey'), json_extract(payload, '$.sessionKey'))
  WHERE status = 'queued' AND job_type = 'session_compaction';

-- 3. Index on messages(session_id) for efficient cursor-based queries
-- NOTE: SQLite rowid is a pseudo-column — cannot be used in CREATE INDEX, but IS usable in WHERE clauses.
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);

-- 4. Session compaction audit log with rowid-based cursor
CREATE TABLE IF NOT EXISTS session_compaction_log (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  session_key TEXT NOT NULL,
  cursor_rowid INTEGER NOT NULL,   -- last rowid of processed message window
  facts_extracted INTEGER NOT NULL DEFAULT 0,
  facts_updated INTEGER NOT NULL DEFAULT 0,
  patterns_detected INTEGER NOT NULL DEFAULT 0,
  structured_summary TEXT,
  model TEXT,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ok' CHECK(status IN ('ok','skipped','error')),
  error TEXT,
  error_code TEXT,   -- 'json_parse_failure' | 'schema_validation_failure' | 'transient' | NULL
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_compaction_log_session ON session_compaction_log(session_key, cursor_rowid DESC);
```

```typescript
// src/lib/db/migrate.ts:
export const EXPECTED_SCHEMA_VERSION = 26;
```

```bash
npm run db:init
git add db/migrations/0026_session_compaction.sql src/lib/db/migrate.ts
git commit -m "feat(db): migration 0026 — session_compaction job type, rowid cursor, indexes"
```

---

### Task 4: Session compaction service

**Files:**
- Create: `src/lib/services/session-compaction-service.ts`

**Key implementation notes:**
- `getLastCompactionRowid` orders by `cursor_rowid DESC` — NOT by `created_at` (which has second-level precision and would return wrong cursor for same-second multi-window runs).

```typescript
/**
 * Session compaction service.
 * Incremental rowid cursor, anti-burn guard, strict JSON.
 */
import { generateText } from "ai";
import { randomUUID } from "crypto";
import { getModelForTier, getModelIdForTier, getProviderForTier } from "@/lib/ai/provider";
import { checkBudget, recordUsage } from "@/lib/services/usage-service";
import { sqlite } from "@/lib/db";
import { getActiveFacts } from "@/lib/services/kb-service";
import { getSummary } from "@/lib/services/summary-service";

const MAX_MESSAGES_CHARS = 60_000;
const MAX_FAILURES_PER_WINDOW = 3;

export type CompactionInput = {
  ownerKey: string;
  sessionKey: string;
  messages: Array<{ rowid: number; role: string; content: string }>;
  existingFacts?: import("@/lib/services/kb-service").FactRow[];
  knowledgeReadKeys?: string[];
};

export type CompactionSummary = {
  topics: string[];
  factsChanged: string[];
  patternsObserved: string[];
  sessionMood: "productive" | "exploratory" | "corrective" | "casual";
  keyTakeaways: string[];
};

export type CompactionResult = {
  success: boolean;
  skipped: boolean;
  factsExtracted: number;
  factsUpdated: number;
  patternsDetected: number;
  structuredSummary: CompactionSummary | null;
  tokensIn: number;
  tokensOut: number;
  modelId: string;
  error?: string;
  errorCode?: "json_parse_failure" | "schema_validation_failure" | "transient";
};

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
Rules: explicit facts only, patternsObserved = HOW user communicates, strings < 100 chars, ONLY valid JSON.`;

/**
 * Get rowid of last processed message from the most advanced successful/skipped compaction run.
 * Orders by cursor_rowid DESC (monotonic) — NOT by created_at (second-level precision).
 * Returns 0 if no previous run (start from beginning).
 */
export function getLastCompactionRowid(sessionKey: string): number {
  const row = sqlite.prepare(`
    SELECT cursor_rowid FROM session_compaction_log
    WHERE session_key = ? AND status IN ('ok','skipped')
    ORDER BY cursor_rowid DESC LIMIT 1
  `).get(sessionKey) as { cursor_rowid: number } | undefined;
  return row?.cursor_rowid ?? 0;
}

/**
 * Count deterministic (non-transient) failures for a cursor window.
 * Only json_parse_failure / schema_validation_failure count toward anti-burn.
 * Transient errors (network, budget) do NOT count — they must not permanently skip valid windows.
 */
export function countDeterministicFailures(sessionKey: string, cursorRowid: number): number {
  const row = sqlite.prepare(`
    SELECT COUNT(*) as cnt FROM session_compaction_log
    WHERE session_key = ? AND cursor_rowid = ? AND status = 'error'
      AND error_code IN ('json_parse_failure', 'schema_validation_failure')
  `).get(sessionKey, cursorRowid) as { cnt: number } | undefined;
  return row?.cnt ?? 0;
}

export async function runSessionCompaction(input: CompactionInput): Promise<CompactionResult> {
  const noResult = (error: string, skipped = false): CompactionResult => ({
    success: false, skipped, factsExtracted: 0, factsUpdated: 0, patternsDetected: 0,
    structuredSummary: null, tokensIn: 0, tokensOut: 0, modelId: "", error,
  });

  const budget = checkBudget();
  if (!budget.allowed) return noResult("budget_exceeded");
  if (input.messages.length < 4) return noResult("insufficient_messages");

  const cursorRowid = input.messages[input.messages.length - 1].rowid;
  const deterministicFailures = countDeterministicFailures(input.sessionKey, cursorRowid);
  if (deterministicFailures >= MAX_FAILURES_PER_WINDOW) {
    // Already exceeded limit in prior runs (shouldn't reach here, but guard)
    return noResult(`window_failure_limit_guard (${deterministicFailures} deterministic failures)`, true);
  }
  // willSkip: if THIS attempt is also deterministic failure, it's the Nth → skip immediately
  // (ensures skip fires within MAX_ATTEMPTS=3 — no 4th attempt needed)
  const willSkipOnDeterministicFailure = deterministicFailures + 1 >= MAX_FAILURES_PER_WINDOW;

  let messagesText = input.messages.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join("\n");
  if (messagesText.length > MAX_MESSAGES_CHARS) {
    messagesText = "...[truncated]\n" + messagesText.slice(-MAX_MESSAGES_CHARS);
  }

  const existingFacts = input.existingFacts ?? getActiveFacts(input.ownerKey, input.knowledgeReadKeys);
  const existingFactsSummary = existingFacts.length > 0
    ? existingFacts.slice(0, 30).map(f => `- ${f.category}/${f.key}: ${JSON.stringify(f.value)}`).join("\n")
    : "";
  const existingSummary = getSummary(input.ownerKey) ?? "";
  const prompt = COMPACTION_PROMPT(messagesText, existingFactsSummary, existingSummary);

  try {
    const model = getModelForTier("fast");
    const modelId = getModelIdForTier("fast");
    const provider = getProviderForTier("fast");
    const result = await generateText({ model, prompt, maxTokens: 600 });

    const tokensIn = result.usage?.promptTokens ?? 0;
    const tokensOut = result.usage?.completionTokens ?? 0;
    if (tokensIn > 0 || tokensOut > 0) recordUsage(provider, modelId, tokensIn, tokensOut);

    let parsed: CompactionSummary;
    try {
      parsed = JSON.parse(result.text.trim()) as CompactionSummary;
    } catch {
      console.warn("[compaction] non-JSON response — json_parse_failure");
      return { ...noResult("json_parse_failure"), errorCode: "json_parse_failure", skipped: willSkipOnDeterministicFailure, tokensIn, tokensOut, modelId };
    }

    // Runtime shape validation — validate both presence and element types.
    // Shape errors are deterministic (bad model output), so they count toward anti-burn.
    const VALID_MOODS = new Set(["productive", "exploratory", "corrective", "casual"]);
    const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && (v as unknown[]).every(x => typeof x === "string");
    const validShape =
      parsed != null &&
      isStringArray(parsed.topics) &&
      isStringArray(parsed.factsChanged) &&
      isStringArray(parsed.patternsObserved) &&
      isStringArray(parsed.keyTakeaways) &&
      VALID_MOODS.has(parsed.sessionMood);
    if (!validShape) {
      console.warn("[compaction] JSON shape validation failed — schema_validation_failure");
      return { ...noResult("schema_validation_failure"), errorCode: "schema_validation_failure", skipped: willSkipOnDeterministicFailure, tokensIn, tokensOut, modelId };
    }

    return {
      success: true, skipped: false,
      factsExtracted: parsed.factsChanged.filter(f => f.toLowerCase().startsWith("added")).length,
      factsUpdated: parsed.factsChanged.filter(f => f.toLowerCase().startsWith("updated")).length,
      patternsDetected: parsed.patternsObserved.length,
      structuredSummary: parsed, tokensIn, tokensOut, modelId,
    };
  } catch (error) {
    // Transient (network, provider, etc.) — does NOT count toward anti-burn
    return { ...noResult(String(error)), errorCode: "transient", skipped: false };
  }
}

export function persistCompactionLog(
  ownerKey: string,
  sessionKey: string,
  cursorRowid: number,
  result: CompactionResult,
): void {
  const status = result.success ? "ok" : result.skipped ? "skipped" : "error";
  sqlite.prepare(`
    INSERT INTO session_compaction_log
      (id, owner_key, session_key, cursor_rowid, facts_extracted, facts_updated,
       patterns_detected, structured_summary, model, tokens_in, tokens_out, status, error, error_code)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(), ownerKey, sessionKey, cursorRowid,
    result.factsExtracted, result.factsUpdated, result.patternsDetected,
    result.structuredSummary ? JSON.stringify(result.structuredSummary) : null,
    result.modelId || null, result.tokensIn, result.tokensOut,
    status, result.error ?? null, result.errorCode ?? null,
  );
}
```

```bash
npx tsc --noEmit 2>&1 | grep session-compaction
git add src/lib/services/session-compaction-service.ts
git commit -m "feat(agent): session compaction service — rowid cursor, cursor_rowid DESC ordering, anti-burn"
```

---

### Task 5: Worker job handler + EXPECTED_HANDLER_COUNT

**Files:**
- Modify: `src/lib/worker/index.ts`
- Modify: `src/worker.ts` (9 → 10)

```typescript
// Imports in index.ts (add to existing imports):
import { runSessionCompaction, persistCompactionLog, getLastCompactionRowid } from "@/lib/services/session-compaction-service";
import { resolveOwnerScopeForWorker } from "@/lib/auth/session";
import { saveMemory } from "@/lib/services/memory-service";
// enqueueJob must already be imported in index.ts (used by other handlers); confirm before adding

// Handler:
handlers["session_compaction"] = async (payload: Record<string, unknown>) => {
  const ownerKey = payload.ownerKey as string;
  const sessionKey = payload.sessionKey as string;
  if (!ownerKey || !sessionKey) { console.warn("[worker] session_compaction: missing keys", payload); return; }

  const scope = resolveOwnerScopeForWorker(ownerKey);
  const MAX_WINDOWS = 5;
  let lastRowsLength = 0;

  for (let window = 0; window < MAX_WINDOWS; window++) {
    const lastRowid = getLastCompactionRowid(sessionKey);

    const rows = sqlite.prepare(`
      SELECT rowid, role, content FROM messages
      WHERE session_id = ? AND rowid > ?
      ORDER BY rowid ASC LIMIT 40
    `).all(sessionKey, lastRowid) as Array<{ rowid: number; role: string; content: string }>;

    lastRowsLength = rows.length;

    if (rows.length < 4) {
      if (window === 0) console.info(`[worker] session_compaction: skip ${sessionKey} — ${rows.length} new msgs`);
      lastRowsLength = 0; // not a full window, no continuation needed
      break;
    }

    const cursorRowid = rows[rows.length - 1].rowid;
    const result = await runSessionCompaction({ ownerKey, sessionKey, messages: rows, knowledgeReadKeys: scope.knowledgeReadKeys });
    persistCompactionLog(ownerKey, sessionKey, cursorRowid, result);

    if (result.success && result.structuredSummary) {
      for (const pattern of result.structuredSummary.patternsObserved.slice(0, 2)) {
        try { saveMemory(ownerKey, pattern, "pattern"); } catch (e) { console.warn("[worker] pattern save failed:", e); }
      }
      console.info(`[worker] compaction window ${window + 1}: ${sessionKey} — ${result.factsExtracted} extracted`);
      if (rows.length < 40) break; // partial window = backlog drained
    } else if (result.skipped) {
      // Anti-burn skip: cursor advanced via 'skipped' row.
      console.info(`[worker] compaction window ${window + 1} skipped (anti-burn): ${sessionKey}`);
      // If this was a full window, advance to next window in the loop.
      // lastRowsLength retains rows.length so continuation job is enqueued if loop exhausts MAX_WINDOWS.
      if (rows.length < 40) break; // partial skipped window = end of current backlog
      // else: continue loop to process next window
    } else {
      // Transient or deterministic failure (not yet at anti-burn limit):
      // Throw so executeJob marks job as failed and schedules retry via attempts + backoff.
      const err = `[worker] compaction failed at window ${window + 1}: ${sessionKey} — ${result.error}`;
      console.warn(err);
      throw new Error(err);
    }
  }

  // If we exhausted MAX_WINDOWS and the last batch was full, more messages may remain.
  // Enqueue a continuation job; dedup index prevents duplicate enqueues.
  if (lastRowsLength === 40) {
    try {
      enqueueJob("session_compaction", { ownerKey, sessionKey });
      console.info(`[worker] session_compaction: re-enqueued for continued backlog drain: ${sessionKey}`);
    } catch (e) {
      if (!String(e).includes("UNIQUE constraint failed")) {
        console.warn("[worker] Failed to re-enqueue session_compaction:", e);
      }
    }
  }
};
```

```typescript
// src/worker.ts:
const EXPECTED_HANDLER_COUNT = 10;  // was 9
```

```bash
npx vitest run tests/evals/scheduler.test.ts
git add src/lib/worker/index.ts src/worker.ts
git commit -m "feat(worker): session_compaction handler, 5-window loop, throw on transient, re-enqueue on backlog, EXPECTED_HANDLER_COUNT=10"
```

---

### Task 6: Trigger compaction from route.ts

**Files:** Modify `src/app/api/chat/route.ts`

`enqueueJob` is NOT currently imported in `route.ts` (only `enqueueSummaryJob` is). Must add:

```typescript
// Add to imports section of route.ts:
import { enqueueJob } from "@/lib/worker/index";
```

Test files mocking route imports must also mock `@/lib/worker/index` to add `enqueueJob: vi.fn()`. Search: `grep -rln "api/chat/route" tests/evals/` and update each mock.

```typescript
// After enqueueSummaryJob(...):
try {
  enqueueJob("session_compaction", { ownerKey: effectiveScope.cognitiveOwnerKey, sessionKey: messageSessionId });
} catch (e) {
  if (!String(e).includes("UNIQUE constraint failed")) {
    console.warn("[chat] Failed to enqueue session_compaction:", e);
  }
}
```

```bash
npx vitest run tests/evals/chat-route-bootstrap.test.ts tests/evals/chat-context-integration.test.ts
git add src/app/api/chat/route.ts
git commit -m "feat(chat): enqueue session_compaction after each turn (dedup-safe)"
```

---

### Task 7: Tests for Phase 2

**Files:**
- Create: `tests/evals/session-compaction.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@/lib/services/usage-service", () => ({ checkBudget: vi.fn(() => ({ allowed: true })), recordUsage: vi.fn() }));
vi.mock("@/lib/ai/provider", () => ({ getModelForTier: vi.fn(() => "mock"), getModelIdForTier: vi.fn(() => "gemini-2.5-flash"), getProviderForTier: vi.fn(() => "google") }));
vi.mock("@/lib/services/kb-service", () => ({ getActiveFacts: vi.fn(() => []) }));
vi.mock("@/lib/services/summary-service", () => ({ getSummary: vi.fn(() => null) }));
vi.mock("@/lib/db", () => ({
  sqlite: { prepare: vi.fn(() => ({ get: vi.fn(() => null), run: vi.fn(), all: vi.fn(() => []) })) },
}));

import { runSessionCompaction } from "@/lib/services/session-compaction-service";
import { generateText } from "ai";

const MSGS = [
  { rowid: 1, role: "user", content: "Hi, I'm Alice, PM at Stripe" },
  { rowid: 2, role: "assistant", content: "Saved that." },
  { rowid: 3, role: "user", content: "8 years exp, love hiking" },
  { rowid: 4, role: "assistant", content: "Added." },
  { rowid: 5, role: "user", content: "Make layout vertical" },
  { rowid: 6, role: "assistant", content: "Done." },
];

const VALID_JSON = JSON.stringify({
  topics: ["professional background", "layout"],
  factsChanged: ["Added job at Stripe as PM", "Added hiking as activity"],
  patternsObserved: ["User prefers concise responses"],
  sessionMood: "productive",
  keyTakeaways: ["Alice is PM at Stripe", "Prefers vertical layout"],
});

describe("runSessionCompaction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns failure for < 4 messages", async () => {
    const r = await runSessionCompaction({ ownerKey: "o", sessionKey: "s", messages: MSGS.slice(0, 2) });
    expect(r.success).toBe(false);
    expect(r.error).toBe("insufficient_messages");
  });

  it("returns failure when budget exceeded", async () => {
    const { checkBudget } = await import("@/lib/services/usage-service");
    vi.mocked(checkBudget).mockReturnValueOnce({ allowed: false, warningMessage: "over" });
    const r = await runSessionCompaction({ ownerKey: "o", sessionKey: "s", messages: MSGS });
    expect(r.success).toBe(false);
    expect(r.error).toBe("budget_exceeded");
  });

  it("returns structured summary on valid JSON", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ text: VALID_JSON, usage: { promptTokens: 100, completionTokens: 50 } } as never);
    const r = await runSessionCompaction({ ownerKey: "o", sessionKey: "s", messages: MSGS });
    expect(r.success).toBe(true);
    expect(r.structuredSummary?.sessionMood).toBe("productive");
    expect(r.patternsDetected).toBe(1);
    expect(r.factsExtracted).toBe(2);
  });

  it("returns failure for non-JSON response with errorCode=json_parse_failure", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ text: "Here is a summary...", usage: {} } as never);
    const r = await runSessionCompaction({ ownerKey: "o", sessionKey: "s", messages: MSGS });
    expect(r.success).toBe(false);
    expect(r.error).toBe("json_parse_failure");
    expect(r.errorCode).toBe("json_parse_failure");
    expect(r.skipped).toBe(false);
  });

  it("returns skipped=true on 3rd deterministic failure (within MAX_ATTEMPTS=3)", async () => {
    // countDeterministicFailures returns 2 (this run is the 3rd → 2+1 >= 3 → skip immediately)
    vi.mocked(generateText).mockResolvedValueOnce({ text: "not json", usage: {} } as never);
    const { sqlite } = await import("@/lib/db");
    // First prepare: countDeterministicFailures → 2
    vi.mocked(sqlite.prepare).mockReturnValueOnce({ get: vi.fn(() => ({ cnt: 2 })) } as never);
    const r = await runSessionCompaction({ ownerKey: "o", sessionKey: "s", messages: MSGS });
    expect(r.success).toBe(false);
    expect(r.skipped).toBe(true);
    expect(r.errorCode).toBe("json_parse_failure");
  });

  it("returns schema_validation_failure for valid JSON with wrong shape", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ text: '{"topics": "not-an-array"}', usage: {} } as never);
    const r = await runSessionCompaction({ ownerKey: "o", sessionKey: "s", messages: MSGS });
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe("schema_validation_failure");
    expect(r.skipped).toBe(false); // countDeterministicFailures = 0 → 0+1 < 3 → not skip yet
  });

  it("truncates oversized messages and succeeds", async () => {
    const hugeMsgs = Array.from({ length: 6 }, (_, i) => ({ rowid: i + 1, role: i % 2 === 0 ? "user" : "assistant", content: "x".repeat(15_000) }));
    vi.mocked(generateText).mockResolvedValueOnce({ text: VALID_JSON, usage: {} } as never);
    const r = await runSessionCompaction({ ownerKey: "o", sessionKey: "s", messages: hugeMsgs });
    expect(r.success).toBe(true);
    const call = vi.mocked(generateText).mock.calls[0][0];
    expect((call.prompt as string).includes("[truncated]")).toBe(true);
  });
});
```

```bash
npx vitest run tests/evals/session-compaction.test.ts
npx vitest run tests/evals/
git add tests/evals/session-compaction.test.ts
git commit -m "test(agent): session compaction tests — rowid cursor, strict JSON, anti-burn, backlog"
```

---

## Verification Checklist

- [ ] `npx vitest run tests/evals/` → all pass
- [ ] `npx tsc --noEmit` → no errors
- [ ] Worker health check: 10 handlers registered
- [ ] Migration 0026 applied cleanly: no rowid-index error, `session_compaction_log` table exists
- [ ] Manual: "CURRENT DRAFT PAGE:" in context with `surface/voice/light/layoutTemplate` (not `presence.*`)
- [ ] Manual: compaction log rows with integer `cursor_rowid` values
- [ ] Manual: `SELECT * FROM session_compaction_log WHERE session_key = 'X' ORDER BY cursor_rowid DESC` — monotonic progression
- [ ] Window failure limit: after 3 errors, `status='skipped'`, next run advances cursor

---

## Rollback Plan

- **pageState**: safe, `getDraft` null → block skipped
- **turns/facts cap**: safe, no breaking change
- **Worker**: revert handler + EXPECTED_HANDLER_COUNT
- **DB migration**: additive, transaction-safe
- **Route trigger**: revert try-block in `onFinish`

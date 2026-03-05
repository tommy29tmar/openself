# Episodic Memory — Implementation Plan v10

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Tier 4 Episodic Memory to OpenSelf — append-only event ledger with agent tools, FTS5 search, and a Dream Cycle worker that surfaces patterns to the user at the next login via the ADR-0014 chat-first proposal pattern.

**Architecture:** Three phases — (A) DB schema + services, (B) three agent tools + journey wiring, (C) Dream Cycle worker. Proposals surface through `has_pending_episodic_patterns` Situation (ADR-0014 pattern).

**Tech Stack:** TypeScript, Drizzle ORM, SQLite (FTS5 native), Vercel AI SDK v4, Vitest, existing `enqueueJob`/worker pattern.

**Reference:** `docs/plans/2026-03-05-episodic-memory-v2.md`

---

## Codebase API Facts (verified)

- `createAgentTools()` returns `{ tools, getJournal }` — tests: `const { tools } = createAgentTools(...)`
- Agent tools return **plain objects**
- `checkBudget()` — 0 args; `recordUsage(provider, model, inputTokens, outputTokens)` — 4 args
- Worker `JobHandler`: `(payload: Record<string,unknown>) => void|Promise<void>` — `src/lib/worker/index.ts:23`
- `enqueueJob(jobType, payload, runAfter?)` — `src/lib/worker/index.ts:262`
- Worker scripts: `npm run worker:build` / `npm run worker:check`
- `situationContext` assembled at `src/lib/agent/prompts.ts:279`
- `createFact(input: CreateFactInput, sessionId, profileId?, options?)`: value is `Record<string,unknown>`; existing tools call with 2 args only (profileId=undefined resolves from session — verified in tools.ts:282)
- DB file: `./db/openself.db`; version check: `sqlite3 ./db/openself.db "SELECT value FROM schema_meta WHERE key='schema_version';"`
- Migrator (migrate.ts:46): FTS migrations run outside transaction — partial failure leaves DB changed but migration unrecorded. `IF NOT EXISTS` required for idempotent retry.
- `enqueueJob` uses `.onConflictDoNothing()` (worker/index.ts:278) — dedup is silent, never throws on duplicate
- `sanitizeForPrompt()` already exists in `situations.ts:105-109` — reuse it, do NOT redefine
- `validate-directive-policy.ts` runs at module import time (`policies/index.ts:62`) — validates symmetric incompatibilities, no equal-priority conflicts
- `Situation` union has 10 members (`journey.ts:39-49`); plan adds `has_pending_episodic_patterns` as 11th
- `SituationContextMap` / `SITUATION_REQUIRED_KEYS` / `DIRECTIVE_POLICY` have 10 entries each — plan adds 11th
- `has_pending_soul_proposals` (journey.ts:568-572) is the exact precedent pattern for episodic detection
- `ONBOARDING_TOOLS` in `tool-filter.ts:17-30` — add episodic tools after `review_soul_proposal` (line 30)

---

## All Codex Review Fixes (v1→v6)

| Round | Fix |
|---|---|
| R1 | enqueueJob after insertEvent; correct JobHandler type; checkBudget/recordUsage sigs; owner guard in resolveEpisodicProposal; pendingEpisodicPatterns in situationContext; test: destructure `{tools}`; `npm run worker:*` scripts |
| R2 | Split 0027/0028 migrations; julianday() for expires_at; createFact on accept; aggregate COUNT for countsByType; block pending+accepted in checkPatternThresholds; clear jobs in beforeEach |
| R3 | createFact value is Record; create fact BEFORE resolve (atomic order); clear facts in beforeEach; FTS sanitization+LIKE fallback; sqlite3 CLI for schema verify |
| R4 | FTS DELETE+UPDATE triggers in 0028; keyword-path countsByType from returned events |
| R5 | 0028 idempotent (IF NOT EXISTS + rebuild); enqueueJob best-effort (own try/catch); expiry guard in resolveEpisodicProposal; keyword truncation fix via countKeywordEvents |
| R6 | Partial unique index (owner_key, action_type) WHERE active in 0027; checkPatternThresholds excludes expired pending (julianday check) |
| R7 | Auto-expire stale pending rows in consolidateEpisodesForOwner before INSERT; UNIQUE catch around insertEpisodicProposal in consolidation |
| R8 | Expiry pre-check before createFact in confirm_episodic_pattern; fix test now-200000→now-8*86400; UNIQUE catch in consolidation |
| R9 | TOOL_POLICY routing by durability; remove pipe masking from final verifications; Drizzle partial unique index + entities default "[]"; enqueueJob uses onConflictDoNothing (confirmed, simplified catch) |

---

## Constants to update

| Constant | File | Old → New |
|---|---|---|
| `EXPECTED_SCHEMA_VERSION` | `src/lib/db/migrate.ts:9` | `26` → `28` |
| `EXPECTED_HANDLER_COUNT` | `src/worker.ts:16` | `10` → `11` |
| `Situation` union | `src/lib/agent/journey.ts:38` | +`has_pending_episodic_patterns` |
| `BootstrapPayload` | `src/lib/agent/journey.ts:51` | +`pendingEpisodicPatterns?` |
| `SituationContext` | `src/lib/agent/policies/index.ts:14` | +`pendingEpisodicPatterns?` |

---

## Task 1: DB Migration — TWO FILES

**Files:**
- Create: `db/migrations/0027_episodic_memory.sql`
- Create: `db/migrations/0028_episodic_fts.sql`
- Modify: `src/lib/db/migrate.ts:9`

### Step 1: Write 0027_episodic_memory.sql (no FTS — fully transactional)

```sql
-- db/migrations/0027_episodic_memory.sql
-- Fully transactional — no CREATE VIRTUAL TABLE.

-- 1. Rebuild jobs table with consolidate_episodes in CHECK
CREATE TABLE jobs_new (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  job_type TEXT NOT NULL CHECK(job_type IN (
    'heartbeat_light','heartbeat_deep','connector_sync','page_regen','taxonomy_review',
    'page_synthesis','memory_summary','soul_proposal','expire_proposals',
    'session_compaction','consolidate_episodes','legacy_unknown')),
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed')),
  run_after TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO jobs_new SELECT * FROM jobs;
DROP TABLE jobs;
ALTER TABLE jobs_new RENAME TO jobs;
CREATE INDEX idx_jobs_due ON jobs(status, run_after);
CREATE UNIQUE INDEX uniq_jobs_dedup_global
  ON jobs(job_type, json_extract(payload, '$.ownerKey'))
  WHERE status IN ('queued','running')
    AND job_type != 'session_compaction'
    AND job_type != 'consolidate_episodes';
CREATE UNIQUE INDEX uniq_jobs_dedup_compaction
  ON jobs(job_type, json_extract(payload, '$.ownerKey'), json_extract(payload, '$.sessionKey'))
  WHERE status = 'queued' AND job_type = 'session_compaction';
CREATE UNIQUE INDEX uniq_jobs_dedup_consolidate
  ON jobs(job_type, json_extract(payload, '$.ownerKey'))
  WHERE status = 'queued' AND job_type = 'consolidate_episodes';

-- 2. Episodic events
CREATE TABLE episodic_events (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  session_id TEXT NOT NULL,
  source_message_id TEXT,
  device_id TEXT,
  event_at_unix INTEGER NOT NULL,
  event_at_human TEXT NOT NULL,
  action_type TEXT NOT NULL,
  narrative_summary TEXT NOT NULL,
  raw_input TEXT,
  entities TEXT DEFAULT '[]',
  visibility TEXT NOT NULL DEFAULT 'private',
  confidence REAL NOT NULL DEFAULT 1.0,
  superseded_by TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_episodic_owner_time ON episodic_events(owner_key, event_at_unix)
  WHERE superseded_by IS NULL AND archived = 0;
CREATE INDEX idx_episodic_session ON episodic_events(session_id);

-- 3. Episodic pattern proposals
CREATE TABLE episodic_pattern_proposals (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  action_type TEXT NOT NULL,
  pattern_summary TEXT NOT NULL,
  event_count INTEGER NOT NULL DEFAULT 0,
  last_event_at_unix INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','accepted','rejected','expired')),
  expires_at TEXT NOT NULL,
  resolved_at TEXT,
  rejection_cooldown_until TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_episodic_proposals_owner
  ON episodic_pattern_proposals(owner_key, status)
  WHERE status = 'pending';
CREATE UNIQUE INDEX uq_episodic_proposals_active
  ON episodic_pattern_proposals (owner_key, action_type)
  WHERE status IN ('pending', 'accepted');
```

### Step 2: Write 0028_episodic_fts.sql (FTS only — idempotent)

```sql
-- db/migrations/0028_episodic_fts.sql
-- Contains CREATE VIRTUAL TABLE — migrator skips transaction wrapper (migrate.ts:43).
-- ALL statements use IF NOT EXISTS for idempotent retry safety (R5-1 fix).
-- Append rebuild at end so any existing rows are indexed (R5-2 fix).

CREATE VIRTUAL TABLE IF NOT EXISTS episodic_events_fts USING fts5(
  narrative_summary,
  content='episodic_events',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS episodic_events_fts_ai
  AFTER INSERT ON episodic_events BEGIN
    INSERT INTO episodic_events_fts(rowid, narrative_summary)
      VALUES (new.rowid, new.narrative_summary);
  END;

CREATE TRIGGER IF NOT EXISTS episodic_events_fts_ad
  AFTER DELETE ON episodic_events BEGIN
    INSERT INTO episodic_events_fts(episodic_events_fts, rowid, narrative_summary)
      VALUES ('delete', old.rowid, old.narrative_summary);
  END;

CREATE TRIGGER IF NOT EXISTS episodic_events_fts_au
  AFTER UPDATE OF narrative_summary ON episodic_events BEGIN
    INSERT INTO episodic_events_fts(episodic_events_fts, rowid, narrative_summary)
      VALUES ('delete', old.rowid, old.narrative_summary);
    INSERT INTO episodic_events_fts(rowid, narrative_summary)
      VALUES (new.rowid, new.narrative_summary);
  END;

-- Rebuild FTS index from current table contents (idempotent, handles retry and initial backfill)
INSERT INTO episodic_events_fts(episodic_events_fts) VALUES('rebuild');
```

### Step 3: Bump schema version to 28

`src/lib/db/migrate.ts:9` — change `26` → `28`.

### Step 4: Run migration

```bash
npm run db:init
```
Expected:
```
[migrate] Applied: 0027_episodic_memory.sql
[migrate] Applied: 0028_episodic_fts.sql
```

### Step 5: Commit

```bash
git add db/migrations/0027_episodic_memory.sql db/migrations/0028_episodic_fts.sql src/lib/db/migrate.ts
git commit -m "feat(db): migrations 0027+0028 — episodic memory schema, idempotent FTS5 triggers, consolidate_episodes job type"
```

---

## Task 2: Drizzle Schema

**Files:**
- Modify: `src/lib/db/schema.ts` (append after last table)

### Step 1: Append to schema.ts

After `sectionCopyProposals`:

```typescript
// Add to existing imports at top of schema.ts if not already present:
// import { ..., uniqueIndex } from "drizzle-orm/sqlite-core";
// import { sql } from "drizzle-orm";

// -- Episodic Events (Tier 4 — Life Logging)
export const episodicEvents = sqliteTable(
  "episodic_events",
  {
    id: text("id").primaryKey(),
    ownerKey: text("owner_key").notNull(),
    sessionId: text("session_id").notNull(),
    sourceMessageId: text("source_message_id"),
    deviceId: text("device_id"),
    eventAtUnix: integer("event_at_unix").notNull(),
    eventAtHuman: text("event_at_human").notNull(),
    actionType: text("action_type").notNull(),
    narrativeSummary: text("narrative_summary").notNull(),
    rawInput: text("raw_input"),
    entities: text("entities").default("[]"), // stored as JSON string; toRow() parses with JSON.parse
    visibility: text("visibility").notNull().default("private"),
    confidence: real("confidence").notNull().default(1.0),
    supersededBy: text("superseded_by"),
    archived: integer("archived").notNull().default(0),
    archivedAt: text("archived_at"),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_episodic_owner_time").on(table.ownerKey, table.eventAtUnix),
    index("idx_episodic_session").on(table.sessionId),
  ],
);

// -- Episodic Pattern Proposals (Dream Cycle output)
export const episodicPatternProposals = sqliteTable(
  "episodic_pattern_proposals",
  {
    id: text("id").primaryKey(),
    ownerKey: text("owner_key").notNull(),
    actionType: text("action_type").notNull(),
    patternSummary: text("pattern_summary").notNull(),
    eventCount: integer("event_count").notNull().default(0),
    lastEventAtUnix: integer("last_event_at_unix").notNull(),
    status: text("status").notNull().default("pending"),
    expiresAt: text("expires_at").notNull(),
    resolvedAt: text("resolved_at"),
    rejectionCooldownUntil: text("rejection_cooldown_until"),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_episodic_proposals_owner").on(table.ownerKey, table.status),
    // R9-3: mirror the partial unique index from migration 0027
    uniqueIndex("uq_episodic_proposals_active")
      .on(table.ownerKey, table.actionType)
      .where(sql\`\${table.status} IN ('pending', 'accepted')\`),
  ],
);
```

### Step 2: Verify TypeScript compiles

```bash
npx tsc --noEmit 2>&1 | head -20
```

### Step 3: Commit

```bash
git add src/lib/db/schema.ts
git commit -m "feat(schema): add episodicEvents and episodicPatternProposals Drizzle tables"
```

---

## Task 3: Episodic Service

**Files:**
- Create: `src/lib/services/episodic-service.ts`
- Create: `tests/evals/episodic-service.test.ts`

### Step 1: Write failing tests

```typescript
// tests/evals/episodic-service.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { sqlite } from "@/lib/db";

beforeEach(() => {
  sqlite.exec("DELETE FROM episodic_events");
  sqlite.exec("DELETE FROM episodic_pattern_proposals");
  sqlite.exec("DELETE FROM jobs WHERE job_type = 'consolidate_episodes'");
  // R4-1: clear FTS after hard DELETE to prevent rowid-reuse false matches
  sqlite.exec("INSERT INTO episodic_events_fts(episodic_events_fts) VALUES('delete-all')");
});

describe("insertEvent", () => {
  it("inserts an active event", async () => {
    const { insertEvent } = await import("@/lib/services/episodic-service");
    const id = insertEvent({
      ownerKey: "owner1", sessionId: "sess1",
      eventAtUnix: 1000000, eventAtHuman: "2026-01-01T10:00:00Z",
      actionType: "workout", narrativeSummary: "User ran 5km", rawInput: "I ran 5km",
    });
    const row = sqlite.prepare("SELECT * FROM episodic_events WHERE id = ?").get(id) as any;
    expect(row).toBeTruthy();
    expect(row.action_type).toBe("workout");
    expect(row.archived).toBe(0);
    expect(row.superseded_by).toBeNull();
  });
});

describe("queryEvents", () => {
  it("excludes superseded events", async () => {
    const { insertEvent, supersedeEvent, queryEvents } = await import("@/lib/services/episodic-service");
    insertEvent({ ownerKey: "o1", sessionId: "s1", eventAtUnix: 1000, eventAtHuman: "t1", actionType: "workout", narrativeSummary: "ran", rawInput: "ran" });
    const oldId = insertEvent({ ownerKey: "o1", sessionId: "s1", eventAtUnix: 2000, eventAtHuman: "t2", actionType: "workout", narrativeSummary: "swam", rawInput: "swam" });
    const newId = insertEvent({ ownerKey: "o1", sessionId: "s1", eventAtUnix: 2001, eventAtHuman: "t2c", actionType: "workout", narrativeSummary: "swam corrected", rawInput: "sc" });
    supersedeEvent(oldId, newId);
    const results = queryEvents({ ownerKey: "o1", fromUnix: 0, toUnix: 9999 });
    expect(results.length).toBe(2);
    expect(results.find(r => r.id === oldId)).toBeUndefined();
  });

  it("handles FTS special characters without throwing", async () => {
    const { insertEvent, queryEvents } = await import("@/lib/services/episodic-service");
    insertEvent({ ownerKey: "o1", sessionId: "s1", eventAtUnix: 1000, eventAtHuman: "t1", actionType: "learning", narrativeSummary: "studied C++", rawInput: "r" });
    expect(() => queryEvents({ ownerKey: "o1", fromUnix: 0, toUnix: 9999, keywords: "C++" })).not.toThrow();
    expect(() => queryEvents({ ownerKey: "o1", fromUnix: 0, toUnix: 9999, keywords: "(learning)" })).not.toThrow();
    expect(() => queryEvents({ ownerKey: "o1", fromUnix: 0, toUnix: 9999, keywords: "-ran" })).not.toThrow();
  });
});

describe("countEventsByType", () => {
  it("returns aggregate counts not capped by event limit", async () => {
    const { insertEvent, countEventsByType } = await import("@/lib/services/episodic-service");
    const now = Math.floor(Date.now() / 1000);
    for (let i = 0; i < 15; i++) {
      insertEvent({ ownerKey: "o1", sessionId: "s1", eventAtUnix: now - i * 3600, eventAtHuman: `t${i}`, actionType: "workout", narrativeSummary: `run ${i}`, rawInput: "r" });
    }
    insertEvent({ ownerKey: "o1", sessionId: "s1", eventAtUnix: now - 1000, eventAtHuman: "tm", actionType: "meal", narrativeSummary: "pizza", rawInput: "p" });
    const counts = countEventsByType("o1", 0, now + 1);
    expect(counts["workout"]).toBe(15);
    expect(counts["meal"]).toBe(1);
  });
});

describe("countKeywordEvents", () => {
  it("returns accurate count of keyword-matching events (for truncation detection)", async () => {
    const { insertEvent, countKeywordEvents } = await import("@/lib/services/episodic-service");
    const now = Math.floor(Date.now() / 1000);
    for (let i = 0; i < 15; i++) {
      insertEvent({ ownerKey: "o1", sessionId: "s1", eventAtUnix: now - i * 3600,
        eventAtHuman: `t${i}`, actionType: "workout", narrativeSummary: `ran in the park ${i}`, rawInput: "r" });
    }
    insertEvent({ ownerKey: "o1", sessionId: "s1", eventAtUnix: now - 1000, eventAtHuman: "tm", actionType: "meal", narrativeSummary: "pizza lunch", rawInput: "p" });
    const count = countKeywordEvents({ ownerKey: "o1", fromUnix: 0, toUnix: now + 1, keywords: "park" });
    expect(count).toBe(15); // all workouts mention "park"
  });
});

describe("resolveEpisodicProposal — expiry guard (R5-4)", () => {
  it("cannot accept an expired proposal", async () => {
    const { insertEpisodicProposal, resolveEpisodicProposal } = await import("@/lib/services/episodic-service");
    const id = insertEpisodicProposal({ ownerKey: "o1", actionType: "workout", patternSummary: "runs", eventCount: 3, lastEventAtUnix: 1000 });
    const pastDate = new Date(Date.now() - 86400_000).toISOString();
    sqlite.prepare("UPDATE episodic_pattern_proposals SET expires_at = ? WHERE id = ?").run(pastDate, id);
    const ok = resolveEpisodicProposal(id, "o1", true);
    expect(ok).toBe(false); // expired → resolve returns false
    const row = sqlite.prepare("SELECT status FROM episodic_pattern_proposals WHERE id = ?").get(id) as any;
    expect(row.status).toBe("pending"); // not changed
  });
});

describe("getPendingEpisodicProposals — julianday expiry", () => {
  it("expires proposals whose ISO expires_at is in the past", async () => {
    const { insertEpisodicProposal, getPendingEpisodicProposals } = await import("@/lib/services/episodic-service");
    const id = insertEpisodicProposal({ ownerKey: "o1", actionType: "workout", patternSummary: "runs", eventCount: 5, lastEventAtUnix: 9000 });
    const pastDate = new Date(Date.now() - 86400_000).toISOString();
    sqlite.prepare("UPDATE episodic_pattern_proposals SET expires_at = ? WHERE id = ?").run(pastDate, id);
    const pending = getPendingEpisodicProposals("o1");
    expect(pending.find(p => p.id === id)).toBeUndefined();
    const row = sqlite.prepare("SELECT status FROM episodic_pattern_proposals WHERE id = ?").get(id) as any;
    expect(row.status).toBe("expired");
  });
});

describe("resolveEpisodicProposal", () => {
  it("rejects cross-owner resolution", async () => {
    const { insertEpisodicProposal, resolveEpisodicProposal } = await import("@/lib/services/episodic-service");
    const id = insertEpisodicProposal({ ownerKey: "owner-A", actionType: "workout", patternSummary: "runs", eventCount: 5, lastEventAtUnix: 9000 });
    expect(resolveEpisodicProposal(id, "owner-B", true)).toBe(false);
    const row = sqlite.prepare("SELECT status FROM episodic_pattern_proposals WHERE id = ?").get(id) as any;
    expect(row.status).toBe("pending");
  });

  it("accepts pending unexpired proposal", async () => {
    const { insertEpisodicProposal, resolveEpisodicProposal } = await import("@/lib/services/episodic-service");
    const id = insertEpisodicProposal({ ownerKey: "o1", actionType: "workout", patternSummary: "runs", eventCount: 5, lastEventAtUnix: 9000 });
    expect(resolveEpisodicProposal(id, "o1", true)).toBe(true);
    const row = sqlite.prepare("SELECT status FROM episodic_pattern_proposals WHERE id = ?").get(id) as any;
    expect(row.status).toBe("accepted");
  });

  it("sets rejection cooldown", async () => {
    const { insertEpisodicProposal, resolveEpisodicProposal } = await import("@/lib/services/episodic-service");
    const id = insertEpisodicProposal({ ownerKey: "o1", actionType: "workout", patternSummary: "runs", eventCount: 3, lastEventAtUnix: 1000 });
    resolveEpisodicProposal(id, "o1", false);
    const row = sqlite.prepare("SELECT rejection_cooldown_until FROM episodic_pattern_proposals WHERE id = ?").get(id) as any;
    expect(row.rejection_cooldown_until).toBeTruthy();
  });

  it("returns false when already resolved (idempotency)", async () => {
    const { insertEpisodicProposal, resolveEpisodicProposal } = await import("@/lib/services/episodic-service");
    const id = insertEpisodicProposal({ ownerKey: "o1", actionType: "workout", patternSummary: "runs", eventCount: 5, lastEventAtUnix: 9000 });
    resolveEpisodicProposal(id, "o1", true);
    expect(resolveEpisodicProposal(id, "o1", false)).toBe(false);
  });
});
```

### Step 2: Run tests to verify they fail

```bash
npx vitest run tests/evals/episodic-service.test.ts 2>&1 | tail -10
```

### Step 3: Implement the service

```typescript
// src/lib/services/episodic-service.ts
import { randomUUID } from "crypto";
import { sqlite } from "@/lib/db";

export type EpisodicEventRow = {
  id: string; ownerKey: string; sessionId: string; sourceMessageId: string | null;
  deviceId: string | null; eventAtUnix: number; eventAtHuman: string;
  actionType: string; narrativeSummary: string; rawInput: string | null;
  entities: unknown[]; visibility: string; confidence: number;
  supersededBy: string | null; archived: number; archivedAt: string | null; createdAt: string | null;
};

export type InsertEventInput = {
  ownerKey: string; sessionId: string; sourceMessageId?: string; deviceId?: string;
  eventAtUnix: number; eventAtHuman: string; actionType: string;
  narrativeSummary: string; rawInput?: string; entities?: unknown[];
};

export type EpisodicProposalRow = {
  id: string; ownerKey: string; actionType: string; patternSummary: string;
  eventCount: number; lastEventAtUnix: number; status: string; expiresAt: string;
  resolvedAt: string | null; rejectionCooldownUntil: string | null; createdAt: string | null;
};

// --- Event CRUD ---

export function insertEvent(input: InsertEventInput): string {
  const id = randomUUID();
  sqlite.prepare(`
    INSERT INTO episodic_events
      (id, owner_key, session_id, source_message_id, device_id,
       event_at_unix, event_at_human, action_type, narrative_summary, raw_input, entities)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, input.ownerKey, input.sessionId,
    input.sourceMessageId ?? null, input.deviceId ?? null,
    input.eventAtUnix, input.eventAtHuman, input.actionType,
    input.narrativeSummary, input.rawInput ?? null,
    JSON.stringify(input.entities ?? []),
  );
  return id;
}

export function supersedeEvent(oldId: string, newId: string): void {
  sqlite.prepare("UPDATE episodic_events SET superseded_by = ? WHERE id = ?").run(newId, oldId);
}

export function deleteEvent(id: string): void {
  sqlite.prepare("UPDATE episodic_events SET superseded_by = 'deleted' WHERE id = ?").run(id);
}

// --- Queries ---

export type QueryEventsInput = {
  ownerKey: string; fromUnix: number; toUnix: number;
  actionType?: string; keywords?: string; limit?: number;
};

/** Sanitize keywords for FTS5 MATCH: phrase-quote to prevent parse errors on C++, (, -, etc. */
function sanitizeFtsKeywords(raw: string): string {
  return `"${raw.trim().replace(/"/g, "")}"`;
}

export function queryEvents(input: QueryEventsInput): EpisodicEventRow[] {
  const limit = Math.min(input.limit ?? 10, 20);
  if (input.keywords && input.keywords.trim().length > 0) {
    const safeFts = sanitizeFtsKeywords(input.keywords);
    try {
      const rows = sqlite.prepare(`
        SELECT e.* FROM episodic_events e
        JOIN episodic_events_fts fts ON fts.rowid = e.rowid
        WHERE e.owner_key = ? AND e.event_at_unix BETWEEN ? AND ?
          AND e.superseded_by IS NULL AND e.archived = 0
          ${input.actionType ? "AND e.action_type = ?" : ""}
          AND episodic_events_fts MATCH ?
        ORDER BY e.event_at_unix DESC LIMIT ?
      `).all(...[
        input.ownerKey, input.fromUnix, input.toUnix,
        ...(input.actionType ? [input.actionType] : []),
        safeFts, limit,
      ]) as any[];
      return rows.map(toRow);
    } catch {
      // Fallback to LIKE on FTS parse error
      const likePattern = `%${input.keywords.replace(/[%_]/g, "\\$&")}%`;
      const rows = sqlite.prepare(`
        SELECT * FROM episodic_events
        WHERE owner_key = ? AND event_at_unix BETWEEN ? AND ?
          AND superseded_by IS NULL AND archived = 0
          ${input.actionType ? "AND action_type = ?" : ""}
          AND narrative_summary LIKE ? ESCAPE '\\'
        ORDER BY event_at_unix DESC LIMIT ?
      `).all(...[
        input.ownerKey, input.fromUnix, input.toUnix,
        ...(input.actionType ? [input.actionType] : []),
        likePattern, limit,
      ]) as any[];
      return rows.map(toRow);
    }
  }
  const rows = sqlite.prepare(`
    SELECT * FROM episodic_events
    WHERE owner_key = ? AND event_at_unix BETWEEN ? AND ?
      AND superseded_by IS NULL AND archived = 0
      ${input.actionType ? "AND action_type = ?" : ""}
    ORDER BY event_at_unix DESC LIMIT ?
  `).all(...[
    input.ownerKey, input.fromUnix, input.toUnix,
    ...(input.actionType ? [input.actionType] : []),
    limit,
  ]) as any[];
  return rows.map(toRow);
}

/** Aggregate count by action_type for all matching events (no limit). Used for non-keyword recall. */
export function countEventsByType(
  ownerKey: string, fromUnix: number, toUnix: number, actionType?: string,
): Record<string, number> {
  const rows = sqlite.prepare(`
    SELECT action_type, COUNT(*) as cnt
    FROM episodic_events
    WHERE owner_key = ? AND event_at_unix BETWEEN ? AND ?
      AND superseded_by IS NULL AND archived = 0
      ${actionType ? "AND action_type = ?" : ""}
    GROUP BY action_type
  `).all(...[
    ownerKey, fromUnix, toUnix,
    ...(actionType ? [actionType] : []),
  ]) as Array<{ action_type: string; cnt: number }>;
  return Object.fromEntries(rows.map(r => [r.action_type, r.cnt]));
}

/**
 * Count keyword-matching events (for keyword-path truncation detection in recall_episodes).
 * Mirrors queryEvents keyword logic but returns COUNT instead of rows.
 * Returns 0 on FTS parse error (caller should use events.length as fallback).
 */
export function countKeywordEvents(input: Omit<QueryEventsInput, 'limit'>): number {
  if (!input.keywords || !input.keywords.trim()) return 0;
  const safeFts = sanitizeFtsKeywords(input.keywords);
  try {
    const result = sqlite.prepare(`
      SELECT COUNT(*) as cnt FROM episodic_events e
      JOIN episodic_events_fts fts ON fts.rowid = e.rowid
      WHERE e.owner_key = ? AND e.event_at_unix BETWEEN ? AND ?
        AND e.superseded_by IS NULL AND e.archived = 0
        ${input.actionType ? "AND e.action_type = ?" : ""}
        AND episodic_events_fts MATCH ?
    `).get(...[
      input.ownerKey, input.fromUnix, input.toUnix,
      ...(input.actionType ? [input.actionType] : []),
      safeFts,
    ]) as { cnt: number } | undefined;
    return result?.cnt ?? 0;
  } catch {
    return 0; // FTS parse error — caller uses events.length
  }
}

export function archiveOldEvents(ownerKey: string, cutoffUnix: number): number {
  const result = sqlite.prepare(`
    UPDATE episodic_events SET archived = 1, archived_at = datetime('now')
    WHERE owner_key = ? AND event_at_unix < ? AND superseded_by IS NULL AND archived = 0
  `).run(ownerKey, cutoffUnix);
  return result.changes;
}

// --- Proposals ---

const PROPOSAL_TTL_DAYS = 30;
const REJECTION_COOLDOWN_DAYS = 90;

export function insertEpisodicProposal(input: {
  ownerKey: string; actionType: string; patternSummary: string;
  eventCount: number; lastEventAtUnix: number;
}): string {
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + PROPOSAL_TTL_DAYS * 86400_000).toISOString();
  sqlite.prepare(`
    INSERT INTO episodic_pattern_proposals
      (id, owner_key, action_type, pattern_summary, event_count, last_event_at_unix, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.ownerKey, input.actionType, input.patternSummary,
         input.eventCount, input.lastEventAtUnix, expiresAt);
  return id;
}

export function getPendingEpisodicProposals(ownerKey: string): EpisodicProposalRow[] {
  sqlite.prepare(`
    UPDATE episodic_pattern_proposals SET status = 'expired', resolved_at = datetime('now')
    WHERE owner_key = ? AND status = 'pending'
      AND julianday(expires_at) < julianday('now')
  `).run(ownerKey);
  return (sqlite.prepare(`
    SELECT * FROM episodic_pattern_proposals
    WHERE owner_key = ? AND status = 'pending' ORDER BY created_at ASC
  `).all(ownerKey) as any[]).map(toProposalRow);
}

export function getEpisodicProposalById(id: string): EpisodicProposalRow | null {
  const row = sqlite.prepare("SELECT * FROM episodic_pattern_proposals WHERE id = ?").get(id) as any;
  return row ? toProposalRow(row) : null;
}

/**
 * Resolves a proposal. Returns false if: owner mismatch, already resolved, or expired.
 * R5-4 fix: expiry check in SQL prevents accepting expired proposals even if status is still 'pending'.
 */
export function resolveEpisodicProposal(id: string, ownerKey: string, accept: boolean): boolean {
  const cooldownUntil = accept
    ? null
    : new Date(Date.now() + REJECTION_COOLDOWN_DAYS * 86400_000).toISOString();
  const status = accept ? "accepted" : "rejected";
  const result = sqlite.prepare(`
    UPDATE episodic_pattern_proposals
    SET status = ?, resolved_at = datetime('now'), rejection_cooldown_until = ?
    WHERE id = ? AND owner_key = ? AND status = 'pending'
      AND julianday(expires_at) >= julianday('now')
  `).run(status, cooldownUntil, id, ownerKey);
  return result.changes === 1;
}

export function isActionTypeOnCooldown(ownerKey: string, actionType: string): boolean {
  const row = sqlite.prepare(`
    SELECT rejection_cooldown_until FROM episodic_pattern_proposals
    WHERE owner_key = ? AND action_type = ? AND status = 'rejected'
      AND rejection_cooldown_until IS NOT NULL
    ORDER BY resolved_at DESC LIMIT 1
  `).get(ownerKey, actionType) as { rejection_cooldown_until: string } | undefined;
  if (!row) return false;
  const checkRow = sqlite.prepare(
    "SELECT julianday(?) > julianday('now') as active"
  ).get(row.rejection_cooldown_until) as { active: number } | undefined;
  return (checkRow?.active ?? 0) === 1;
}

function toRow(r: any): EpisodicEventRow {
  return {
    id: r.id, ownerKey: r.owner_key, sessionId: r.session_id,
    sourceMessageId: r.source_message_id, deviceId: r.device_id,
    eventAtUnix: r.event_at_unix, eventAtHuman: r.event_at_human,
    actionType: r.action_type, narrativeSummary: r.narrative_summary,
    rawInput: r.raw_input, entities: r.entities ? JSON.parse(r.entities) : [],
    visibility: r.visibility, confidence: r.confidence,
    supersededBy: r.superseded_by, archived: r.archived,
    archivedAt: r.archived_at, createdAt: r.created_at,
  };
}

function toProposalRow(r: any): EpisodicProposalRow {
  return {
    id: r.id, ownerKey: r.owner_key, actionType: r.action_type,
    patternSummary: r.pattern_summary, eventCount: r.event_count,
    lastEventAtUnix: r.last_event_at_unix, status: r.status,
    expiresAt: r.expires_at, resolvedAt: r.resolved_at,
    rejectionCooldownUntil: r.rejection_cooldown_until, createdAt: r.created_at,
  };
}
```

### Step 4: Run tests

```bash
npx vitest run tests/evals/episodic-service.test.ts 2>&1 | tail -15
```
Expected: all PASS.

### Step 5: Commit

```bash
git add src/lib/services/episodic-service.ts tests/evals/episodic-service.test.ts
git commit -m "feat(episodic): episodic-service — FTS triggers, julianday expiry+resolve guard, countKeywordEvents, sanitize"
```

---

## Task 4: Three Agent Tools

**Files:**
- Modify: `src/lib/agent/tools.ts`
- Modify: `src/lib/agent/tool-filter.ts`
- Create: `tests/evals/episodic-tools.test.ts`

### Step 1: Write failing tests

```typescript
// tests/evals/episodic-tools.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { sqlite } from "@/lib/db";

beforeEach(() => {
  sqlite.exec("DELETE FROM episodic_events");
  sqlite.exec("DELETE FROM episodic_pattern_proposals");
  sqlite.exec("DELETE FROM jobs WHERE job_type = 'consolidate_episodes'");
  sqlite.exec("DELETE FROM facts WHERE key LIKE 'habit_%'");
  sqlite.exec("INSERT INTO episodic_events_fts(episodic_events_fts) VALUES('delete-all')");
  vi.resetModules();
});

async function makeTools(ownerKey = "owner1", sessionId = "sess1") {
  const { createAgentTools } = await import("@/lib/agent/tools");
  const { tools } = createAgentTools("en", sessionId, ownerKey);
  return tools;
}

describe("record_event tool", () => {
  it("inserts event and returns success", async () => {
    const tools = await makeTools();
    const result = await (tools.record_event as any).execute({
      actionType: "workout", eventAtHuman: "2026-03-05T10:00:00Z", summary: "User ran 5km",
    }, { messages: [] });
    expect(result.success).toBe(true);
    expect(result.eventId).toBeTruthy();
    const row = sqlite.prepare("SELECT * FROM episodic_events WHERE id = ?").get(result.eventId) as any;
    expect(row.action_type).toBe("workout");
  });

  it("enqueues consolidate_episodes job", async () => {
    const tools = await makeTools();
    await (tools.record_event as any).execute({
      actionType: "workout", eventAtHuman: "2026-03-05T10:00:00Z", summary: "ran",
    }, { messages: [] });
    const job = sqlite.prepare(
      "SELECT * FROM jobs WHERE job_type = 'consolidate_episodes' AND status = 'queued'"
    ).get() as any;
    expect(job).toBeTruthy();
    expect(JSON.parse(job.payload).ownerKey).toBe("owner1");
  });

  it("returns success even if consolidation job already queued (enqueueJob onConflictDoNothing is silent)", async () => {
    // enqueueJob uses .onConflictDoNothing() (confirmed at worker/index.ts:278) — no throw on dedup.
    sqlite.exec(`INSERT INTO jobs (job_type, payload, status, run_after)
      VALUES ('consolidate_episodes', '{"ownerKey":"owner1"}', 'queued', datetime('now'))`);
    const tools = await makeTools();
    // Even with dedup conflict, record_event must return success (event is already saved)
    const result = await (tools.record_event as any).execute({
      actionType: "workout", eventAtHuman: "2026-03-05T10:00:00Z", summary: "ran again",
    }, { messages: [] });
    expect(result.success).toBe(true); // success despite enqueue dedup conflict
    expect(result.eventId).toBeTruthy();
  });

  it("returns failure for invalid ISO date", async () => {
    const tools = await makeTools();
    const result = await (tools.record_event as any).execute({
      actionType: "workout", eventAtHuman: "not-a-date", summary: "Something",
    }, { messages: [] });
    expect(result.success).toBe(false);
  });
});

describe("recall_episodes tool", () => {
  it("returns events and aggregate countsByType", async () => {
    const { insertEvent } = await import("@/lib/services/episodic-service");
    const now = Math.floor(Date.now() / 1000);
    insertEvent({ ownerKey: "owner1", sessionId: "s1", eventAtUnix: now - 3600, eventAtHuman: "h", actionType: "workout", narrativeSummary: "ran 5km", rawInput: "ran" });
    insertEvent({ ownerKey: "owner1", sessionId: "s1", eventAtUnix: now - 8 * 86400, eventAtHuman: "h2", actionType: "workout", narrativeSummary: "old run", rawInput: "old" });
    const tools = await makeTools();
    const result = await (tools.recall_episodes as any).execute({ timeframe: "last_7_days" }, { messages: [] });
    expect(result.success).toBe(true);
    expect(result.events.length).toBe(1);
  });

  it("countsByType from aggregate (accurate beyond 10-item cap)", async () => {
    const { insertEvent } = await import("@/lib/services/episodic-service");
    const now = Math.floor(Date.now() / 1000);
    for (let i = 0; i < 15; i++) {
      insertEvent({ ownerKey: "owner1", sessionId: "s1", eventAtUnix: now - i * 3600,
        eventAtHuman: `h${i}`, actionType: "workout", narrativeSummary: `run ${i}`, rawInput: "r" });
    }
    const tools = await makeTools();
    const result = await (tools.recall_episodes as any).execute({ timeframe: "last_7_days" }, { messages: [] });
    expect(result.events.length).toBe(10);
    expect(result.truncated).toBe(true);
    expect(result.countsByType["workout"]).toBe(15);
  });

  it("keyword-path: countsByType from keyword results, truncated via countKeywordEvents (R5-5)", async () => {
    const { insertEvent } = await import("@/lib/services/episodic-service");
    const now = Math.floor(Date.now() / 1000);
    for (let i = 0; i < 15; i++) {
      insertEvent({ ownerKey: "owner1", sessionId: "s1", eventAtUnix: now - i * 3600,
        eventAtHuman: `h${i}`, actionType: "workout", narrativeSummary: `ran in the park ${i}`, rawInput: "r" });
    }
    insertEvent({ ownerKey: "owner1", sessionId: "s1", eventAtUnix: now - 1000, eventAtHuman: "tm", actionType: "meal", narrativeSummary: "pizza lunch", rawInput: "p" });
    const tools = await makeTools();
    const result = await (tools.recall_episodes as any).execute({ timeframe: "last_7_days", keywords: "park" }, { messages: [] });
    expect(result.success).toBe(true);
    expect(result.events.length).toBe(10);     // capped
    expect(result.truncated).toBe(true);         // R5-5: accurate (15 total, 10 shown)
    expect(result.countsByType["workout"]).toBe(10); // from returned events (keyword-filtered)
    expect(result.countsByType["meal"]).toBeUndefined();
  });
});

describe("confirm_episodic_pattern tool", () => {
  it("accepts proposal, marks accepted, creates habit fact with object value", async () => {
    const { insertEpisodicProposal } = await import("@/lib/services/episodic-service");
    const id = insertEpisodicProposal({
      ownerKey: "owner1", actionType: "workout", patternSummary: "runs 3x/week", eventCount: 5, lastEventAtUnix: 9999,
    });
    const tools = await makeTools();
    const result = await (tools.confirm_episodic_pattern as any).execute({ proposalId: id, accept: true }, { messages: [] });
    expect(result.success).toBe(true);
    const propRow = sqlite.prepare("SELECT status FROM episodic_pattern_proposals WHERE id = ?").get(id) as any;
    expect(propRow.status).toBe("accepted");
    const factRow = sqlite.prepare("SELECT value FROM facts WHERE key = 'habit_workout'").get() as any;
    expect(factRow).toBeTruthy();
    const v = JSON.parse(factRow.value);
    expect(v.actionType).toBe("workout");
    expect(v.summary).toContain("runs");
  });

  it("reject does not create a fact", async () => {
    const { insertEpisodicProposal } = await import("@/lib/services/episodic-service");
    const id = insertEpisodicProposal({ ownerKey: "owner1", actionType: "workout", patternSummary: "runs", eventCount: 3, lastEventAtUnix: 1000 });
    const tools = await makeTools();
    await (tools.confirm_episodic_pattern as any).execute({ proposalId: id, accept: false }, { messages: [] });
    expect(sqlite.prepare("SELECT * FROM facts WHERE key = 'habit_workout'").get()).toBeUndefined();
  });

  it("returns failure for another owner's proposal", async () => {
    const { insertEpisodicProposal } = await import("@/lib/services/episodic-service");
    const id = insertEpisodicProposal({ ownerKey: "other", actionType: "workout", patternSummary: "runs", eventCount: 3, lastEventAtUnix: 1000 });
    const tools = await makeTools("owner1");
    const result = await (tools.confirm_episodic_pattern as any).execute({ proposalId: id, accept: true }, { messages: [] });
    expect(result.success).toBe(false);
    const propRow = sqlite.prepare("SELECT status FROM episodic_pattern_proposals WHERE id = ?").get(id) as any;
    expect(propRow.status).toBe("pending");
  });

  it("R8-1: expired proposal returns failure (expiry pre-check before createFact)", async () => {
    const { insertEpisodicProposal } = await import("@/lib/services/episodic-service");
    const id = insertEpisodicProposal({ ownerKey: "owner1", actionType: "workout", patternSummary: "runs", eventCount: 5, lastEventAtUnix: 9999 });
    sqlite.prepare("UPDATE episodic_pattern_proposals SET expires_at = ? WHERE id = ?")
      .run(new Date(Date.now() - 86400_000).toISOString(), id);
    const tools = await makeTools();
    const result = await (tools.confirm_episodic_pattern as any).execute({ proposalId: id, accept: true }, { messages: [] });
    expect(result.success).toBe(false);
    expect(sqlite.prepare("SELECT * FROM facts WHERE key = 'habit_workout'").get()).toBeUndefined();
    const propRow = sqlite.prepare("SELECT status FROM episodic_pattern_proposals WHERE id = ?").get(id) as any;
    expect(propRow.status).toBe("pending");
  });
});
```

### Step 2: Run to verify failure

```bash
npx vitest run tests/evals/episodic-tools.test.ts 2>&1 | tail -10
```

### Step 3: Add imports to tools.ts

```typescript
import {
  insertEvent, queryEvents, countEventsByType, countKeywordEvents,
  resolveEpisodicProposal, getEpisodicProposalById,
} from "@/lib/services/episodic-service";
import { createFact } from "@/lib/services/kb-service";
import { enqueueJob } from "@/lib/worker/index";
```

### Step 4: Add three tools inside createAgentTools(), after `review_soul_proposal`

```typescript
record_event: tool({
  description: `Record a specific event the user experienced at a point in time.
Use when user describes a past action with a time reference (past-tense verb + when).
Do NOT use create_fact for episodic inputs — use this tool instead.

ACTION_TYPE taxonomy (best match at 70%+; else new snake_case type):
workout | meal | social | learning | work | travel | health | milestone | casual

After recording a "milestone" event, ask if user wants it added to their public page.`,
  parameters: z.object({
    actionType: z.string(),
    eventAtHuman: z.string().describe("ISO-8601 datetime"),
    summary: z.string().describe("LLM-curated 1-2 sentences. Not verbatim user text."),
    entities: z.array(z.string()).optional(),
  }),
  execute: async ({ actionType, eventAtHuman, summary, entities }) => {
    try {
      const eventAtUnix = Math.floor(new Date(eventAtHuman).getTime() / 1000);
      if (isNaN(eventAtUnix)) return { success: false, error: "Invalid eventAtHuman — must be ISO-8601" };
      const eventId = insertEvent({
        ownerKey: effectiveOwnerKey, sessionId,
        eventAtUnix, eventAtHuman, actionType,
        narrativeSummary: summary, entities: entities ?? [],
      });
      if (ownerKey) logTrustAction(effectiveOwnerKey, "record_event", `Recorded ${actionType}`, eventId);
      // R5-3+R9-4 fix: enqueueJob uses .onConflictDoNothing() internally (worker/index.ts:278).
      // Dedup is silent (no throw). Wrap in try/catch only for unexpected infra failures.
      try { enqueueJob("consolidate_episodes", { ownerKey: effectiveOwnerKey }); }
      catch (err) {
        console.warn("[record_event] enqueueJob unexpected error:", String(err));
        // Event is already saved — tool succeeds regardless
      }
      return { success: true, eventId, actionType };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
}),

recall_episodes: tool({
  description: `Query the user's episodic event log. Returns max 10 events + accurate counts.
When keywords are provided: countsByType is from returned events; totalFound uses FTS count query.
Do NOT call in a loop.`,
  parameters: z.object({
    timeframe: z.enum(["last_7_days", "last_30_days", "last_60_days"]),
    keywords: z.string().optional(),
    actionType: z.string().optional(),
  }),
  execute: async ({ timeframe, keywords, actionType }) => {
    try {
      const now = Math.floor(Date.now() / 1000);
      const days = timeframe === "last_7_days" ? 7 : timeframe === "last_30_days" ? 30 : 60;
      const fromUnix = now - days * 86400;
      const events = queryEvents({ ownerKey: effectiveOwnerKey, fromUnix, toUnix: now, keywords, actionType, limit: 10 });

      let countsByType: Record<string, number>;
      let totalAll: number;

      if (keywords && keywords.trim().length > 0) {
        // R4-2: keyword-path counts from returned events (consistent with displayed results)
        countsByType = {};
        for (const e of events) countsByType[e.actionType] = (countsByType[e.actionType] ?? 0) + 1;
        // R5-5: accurate total via FTS count query (fixes truncated always=false)
        const fullCount = countKeywordEvents({
          ownerKey: effectiveOwnerKey, fromUnix, toUnix: now, keywords, actionType,
        });
        totalAll = fullCount > 0 ? fullCount : events.length; // fallback if count unavailable
      } else {
        countsByType = countEventsByType(effectiveOwnerKey, fromUnix, now, actionType);
        totalAll = Object.values(countsByType).reduce((a, b) => a + b, 0);
      }

      return {
        success: true, timeframe,
        totalFound: totalAll,
        truncated: totalAll > events.length,
        countsByType,
        events: events.map(e => ({
          id: e.id, actionType: e.actionType,
          eventAtHuman: e.eventAtHuman, narrativeSummary: e.narrativeSummary,
        })),
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
}),

confirm_episodic_pattern: tool({
  description: `Accept or reject a pending episodic pattern proposal from the Dream Cycle.
On accept: habit fact created FIRST (atomic order), then proposal marked accepted.`,
  parameters: z.object({
    proposalId: z.string(),
    accept: z.boolean(),
  }),
  execute: async ({ proposalId, accept }) => {
    try {
      const proposal = getEpisodicProposalById(proposalId);
      if (!proposal || proposal.ownerKey !== effectiveOwnerKey) {
        return { success: false, error: "Proposal not found or owner mismatch" };
      }
      if (proposal.status !== "pending") {
        return { success: false, error: "Proposal already resolved" };
      }
      if (accept) {
        // R8-1: expiry pre-check before createFact — avoids writing fact for expired proposals.
        // (getPendingEpisodicProposals auto-expires before agent sees proposals, making this
        // essentially a belt-and-suspenders guard against sub-millisecond expiry window.)
        if (new Date(proposal.expiresAt).getTime() < Date.now()) {
          return { success: false, error: "Proposal has expired" };
        }
        // R3-1+R7-1: createFact with proper session scope via kb-service (upsert-safe).
        // If createFact fails → proposal stays pending (retryable).
        await createFact(
          {
            category: "about",
            key: `habit_${proposal.actionType}`,
            value: { summary: proposal.patternSummary, actionType: proposal.actionType },
          },
          sessionId,
        );
      }
      // resolveEpisodicProposal includes expiry guard (julianday check) — returns false if expired
      const ok = resolveEpisodicProposal(proposalId, effectiveOwnerKey, accept);
      if (!ok) return { success: false, error: "Proposal not found, already resolved, expired, or owner mismatch" };
      if (ownerKey) logTrustAction(effectiveOwnerKey, "confirm_episodic_pattern",
        accept ? "Accepted" : "Rejected", proposalId);
      return { success: true, proposalId, accepted: accept };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
}),
```

### Step 5: Add to ONBOARDING_TOOLS in tool-filter.ts

```typescript
"record_event",
"recall_episodes",
"confirm_episodic_pattern",
```

### Step 6: Run tests

```bash
npx vitest run tests/evals/episodic-tools.test.ts 2>&1 | tail -15
```

### Step 7: Update tool-filter snapshot

```bash
npx vitest run tests/evals/tool-filter.test.ts -u
```

### Step 8: Commit

```bash
git add src/lib/agent/tools.ts src/lib/agent/tool-filter.ts tests/evals/episodic-tools.test.ts
git commit -m "feat(agent): record_event (best-effort enqueue), recall_episodes (accurate keyword truncation), confirm_episodic_pattern"
```

---

## Task 5: Journey Situation + Directive

**Files:**
- Modify: `src/lib/agent/journey.ts`
- Modify: `src/lib/agent/policies/index.ts`
- Modify: `src/lib/agent/policies/situations.ts`
- Modify: `src/lib/agent/policies/directive-registry.ts`
- Modify: `src/lib/agent/prompts.ts`
- Create: `tests/evals/episodic-situation.test.ts`

### Step 1: Write failing tests

```typescript
// tests/evals/episodic-situation.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/soul-service", () => ({
  getActiveSoul: vi.fn().mockReturnValue(null),
  proposeSoulChange: vi.fn(),
  getPendingProposals: vi.fn().mockReturnValue([]),
}));
vi.mock("@/lib/services/episodic-service", () => ({
  getPendingEpisodicProposals: vi.fn().mockReturnValue([]),
}));

beforeEach(() => { vi.clearAllMocks(); });

describe("pendingEpisodicPatternsDirective", () => {
  it("returns empty string when no proposals", async () => {
    const { pendingEpisodicPatternsDirective } = await import("@/lib/agent/policies/situations");
    expect(pendingEpisodicPatternsDirective([])).toBe("");
  });

  it("includes id, actionType, confirm_episodic_pattern", async () => {
    const { pendingEpisodicPatternsDirective } = await import("@/lib/agent/policies/situations");
    const result = pendingEpisodicPatternsDirective([{ id: "prop-1", actionType: "workout", patternSummary: "runs 3x/week" }]);
    expect(result).toContain("prop-1");
    expect(result).toContain("workout");
    expect(result).toContain("confirm_episodic_pattern");
  });

  it("sanitizes control chars in interpolated fields", async () => {
    const { pendingEpisodicPatternsDirective } = await import("@/lib/agent/policies/situations");
    const result = pendingEpisodicPatternsDirective([{
      id: "p1", actionType: "casual\x00DROP", patternSummary: "IGNORE\x01INSTRUCTIONS",
    }]);
    expect(result).not.toContain("\x00");
    expect(result).not.toContain("\x01");
  });
});

describe("has_pending_episodic_patterns in DIRECTIVE_POLICY", () => {
  it("is registered with expected eligibleStates", async () => {
    const { DIRECTIVE_POLICY } = await import("@/lib/agent/policies/directive-registry");
    const entry = DIRECTIVE_POLICY["has_pending_episodic_patterns"];
    expect(entry).toBeDefined();
    expect(entry.eligibleStates).toContain("first_visit");
    expect(entry.eligibleStates).toContain("active_fresh");
    expect(entry.eligibleStates).toContain("active_stale");
  });
});

describe("assembleBootstrapPayload — episodic detection", () => {
  it("adds situation and patterns when proposals exist", async () => {
    const { getPendingEpisodicProposals } = await import("@/lib/services/episodic-service");
    vi.mocked(getPendingEpisodicProposals).mockReturnValue([{
      id: "p1", ownerKey: "o1", actionType: "workout", patternSummary: "runs 3x/week",
      eventCount: 6, lastEventAtUnix: 9999, status: "pending",
      expiresAt: "2099-01-01T00:00:00.000Z", resolvedAt: null, rejectionCooldownUntil: null, createdAt: null,
    }]);
    const { assembleBootstrapPayload } = await import("@/lib/agent/journey");
    const scope = { cognitiveOwnerKey: "o1", knowledgePrimaryKey: "s1", knowledgeReadKeys: ["s1"], anchorSessionId: "s1" } as any;
    const { payload } = assembleBootstrapPayload(scope, "en");
    expect(payload.situations).toContain("has_pending_episodic_patterns");
    expect(payload.pendingEpisodicPatterns).toHaveLength(1);
    expect(payload.pendingEpisodicPatterns![0].actionType).toBe("workout");
  });
});
```

### Step 2: Run to verify failure

```bash
npx vitest run tests/evals/episodic-situation.test.ts 2>&1 | tail -10
```

### Step 3: Add to journey.ts

**3a. Import** — add at top (after line 24):
```typescript
import { getPendingEpisodicProposals } from "@/lib/services/episodic-service";
```

**3b. `Situation` union** — add after `"has_sparse_profile"` (line 49):
```typescript
  | "has_pending_episodic_patterns";
```

**3c. `BootstrapPayload`** — add after `pendingSoulProposals?` (line 69):
```typescript
  pendingEpisodicPatterns?: Array<{ id: string; actionType: string; patternSummary: string }>;
```

**3d. Detection in `assembleBootstrapPayload`** — add after the soul proposals block (after line 572), following the exact same pattern:
```typescript
// Post-Dream-Cycle: detect pending episodic pattern proposals and surface as a situation
const pendingEpisodicPatterns = getPendingEpisodicProposals(ownerKey);
if (pendingEpisodicPatterns.length > 0 && !situations.includes("has_pending_episodic_patterns")) {
  situations.push("has_pending_episodic_patterns");
}
```

**3e. Return payload** — add after the `pendingSoulProposals` spread (after line 598):
```typescript
...(pendingEpisodicPatterns.length > 0 ? {
  pendingEpisodicPatterns: pendingEpisodicPatterns.map(p => ({
    id: p.id, actionType: p.actionType, patternSummary: p.patternSummary,
  })),
} : {}),
```

### Step 4: Add field to SituationContext in policies/index.ts

Add after `pendingSoulProposals?` (line 22):
```typescript
pendingEpisodicPatterns?: Array<{ id: string; actionType: string; patternSummary: string }>;
```

### Step 5: Add directive to situations.ts

After `pendingSoulProposalsDirective` (around line 148).
**NOTE**: `sanitizeForPrompt()` already exists in this file (line 105) — reuse it, do NOT redefine.

```typescript
export function pendingEpisodicPatternsDirective(
  patterns: Array<{ id: string; actionType: string; patternSummary: string }>,
): string {
  if (patterns.length === 0) return "";
  const first = patterns[0];
  // sanitizeForPrompt is already defined in this file (line 105) — reuse it
  const safeId = sanitizeForPrompt(first.id, 50);
  const safeType = sanitizeForPrompt(first.actionType, 30);
  const safeSummary = sanitizeForPrompt(first.patternSummary, 200);
  return `PENDING EPISODIC PATTERN (id: ${safeId}):
I noticed a recurring pattern: ${safeType} — ${safeSummary}

Bring this up naturally. If user wants it in profile: call confirm_episodic_pattern with accept: true.
If they decline: call confirm_episodic_pattern with accept: false.
Do NOT pressure. If action_type is "milestone", also ask about adding to public page.`;
}
```

### Step 6: Wire into directive-registry.ts

**6a. Add to import block** (line 5-14 — add `pendingEpisodicPatternsDirective` to the existing import):

```typescript
import {
  pendingProposalsDirective,
  thinSectionsDirective,
  staleFactsDirective,
  openConflictsDirective,
  archivableFactsDirective,
  recentImportDirective,
  pendingSoulProposalsDirective,
  sparseProfileDirective,
  pendingEpisodicPatternsDirective,   // ← ADD
} from "@/lib/agent/policies/situations";
```

**6b. Add to `SituationContextMap`** (after `has_sparse_profile` at line 30):

```typescript
has_pending_episodic_patterns: Pick<SituationContext, "pendingEpisodicPatterns">;
```

**6c. Add to `SITUATION_REQUIRED_KEYS`** (after `has_sparse_profile` at line 75):

```typescript
// pendingEpisodicPatterns is optional — build returns "" when empty.
has_pending_episodic_patterns: [],
```

**6d. Add to `DIRECTIVE_POLICY`** (after `has_sparse_profile` entry, before closing `};` at line 181):

```typescript
has_pending_episodic_patterns: {
  priority: 2,
  tieBreak: "has_pending_episodic_patterns",
  // Same eligibleStates as has_pending_soul_proposals — proposals must surface promptly
  eligibleStates: ["first_visit", "returning_no_page", "draft_ready", "active_fresh", "active_stale"],
  incompatibleWith: [],  // can co-exist with sparse_profile, soul_proposals, etc.
  build: (ctx) => pendingEpisodicPatternsDirective(ctx.pendingEpisodicPatterns ?? []),
},
```

**Note**: `incompatibleWith: []` passes `validate-directive-policy.ts` startup validation automatically (no symmetry issues, no priority conflicts).

### Step 7: Wire into prompts.ts

In `buildSystemPrompt()`, add to `situationContext` object at line 289 (after `pendingSoulProposals`):
```typescript
pendingEpisodicPatterns: bootstrap.pendingEpisodicPatterns ?? [],
```

### Step 8: Run tests

```bash
npx vitest run tests/evals/episodic-situation.test.ts 2>&1 | tail -15
```

### Step 9: Update snapshots + full evals (includes directive-policy startup validation)

```bash
npx vitest run tests/evals/directive-matrix.test.ts -u
npx vitest run tests/evals/ 2>&1
```

**Note**: `validate-directive-policy.ts` runs at module import time (`policies/index.ts:62`).
If the new entry has invalid eligibleStates, asymmetric incompatibilities, or equal-priority
conflicts, tests will throw immediately at import. This is the safety net.

### Step 10: Commit

```bash
git add src/lib/agent/journey.ts src/lib/agent/policies/index.ts \
  src/lib/agent/policies/situations.ts src/lib/agent/policies/directive-registry.ts \
  src/lib/agent/prompts.ts tests/evals/episodic-situation.test.ts \
  tests/evals/__snapshots__/directive-matrix.test.ts.snap
git commit -m "feat(agent): has_pending_episodic_patterns situation, directive, bootstrap detection, prompts wiring"
```

---

## Task 6: Dream Cycle Worker

**Files:**
- Create: `src/lib/services/episodic-consolidation-service.ts`
- Create: `src/lib/worker/handlers/consolidate-episodes.ts`
- Modify: `src/lib/worker/index.ts`
- Modify: `src/worker.ts:16`
- Create: `tests/evals/episodic-consolidation.test.ts`

### Step 1: Write failing tests

```typescript
// tests/evals/episodic-consolidation.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { sqlite } from "@/lib/db";
import { insertEvent } from "@/lib/services/episodic-service";

const NOW = Math.floor(Date.now() / 1000);
const DAY = 86400;

beforeEach(() => {
  sqlite.exec("DELETE FROM episodic_events");
  sqlite.exec("DELETE FROM episodic_pattern_proposals");
  sqlite.exec("DELETE FROM jobs WHERE job_type = 'consolidate_episodes'");
  sqlite.exec("INSERT INTO episodic_events_fts(episodic_events_fts) VALUES('delete-all')");
  vi.clearAllMocks();
});

function insertWorkouts(ownerKey: string, count: number, maxAgeDays = 50) {
  for (let i = 0; i < count; i++) {
    const unix = NOW - Math.floor((i / Math.max(count - 1, 1)) * maxAgeDays * DAY);
    insertEvent({ ownerKey, sessionId: "s1", eventAtUnix: unix,
      eventAtHuman: new Date(unix * 1000).toISOString(),
      actionType: "workout", narrativeSummary: `Run #${i + 1}`, rawInput: "ran" });
  }
}

describe("checkPatternThresholds", () => {
  it("detects pattern with ≥3 events in 60d and 1 in last 30d", async () => {
    const { checkPatternThresholds } = await import("@/lib/services/episodic-consolidation-service");
    insertWorkouts("o1", 4, 50);
    expect(checkPatternThresholds("o1").some(p => p.actionType === "workout")).toBe(true);
  });

  it("returns nothing when all events older than 30d", async () => {
    const { checkPatternThresholds } = await import("@/lib/services/episodic-consolidation-service");
    for (let i = 0; i < 4; i++) {
      const unix = NOW - (40 + i) * DAY;
      insertEvent({ ownerKey: "o2", sessionId: "s1", eventAtUnix: unix,
        eventAtHuman: new Date(unix * 1000).toISOString(), actionType: "workout", narrativeSummary: "old", rawInput: "r" });
    }
    expect(checkPatternThresholds("o2").length).toBe(0);
  });

  it("returns nothing for fewer than 3 events", async () => {
    const { checkPatternThresholds } = await import("@/lib/services/episodic-consolidation-service");
    insertWorkouts("o3", 2, 10);
    expect(checkPatternThresholds("o3").length).toBe(0);
  });

  it("skips action_type on rejection cooldown", async () => {
    const { checkPatternThresholds } = await import("@/lib/services/episodic-consolidation-service");
    const { insertEpisodicProposal, resolveEpisodicProposal } = await import("@/lib/services/episodic-service");
    insertWorkouts("o4", 5, 20);
    const propId = insertEpisodicProposal({ ownerKey: "o4", actionType: "workout", patternSummary: "runs", eventCount: 5, lastEventAtUnix: NOW });
    resolveEpisodicProposal(propId, "o4", false);
    expect(checkPatternThresholds("o4").length).toBe(0);
  });

  it("skips action_type with pending proposal", async () => {
    const { checkPatternThresholds } = await import("@/lib/services/episodic-consolidation-service");
    const { insertEpisodicProposal } = await import("@/lib/services/episodic-service");
    insertWorkouts("o5", 5, 20);
    insertEpisodicProposal({ ownerKey: "o5", actionType: "workout", patternSummary: "runs", eventCount: 5, lastEventAtUnix: NOW });
    expect(checkPatternThresholds("o5").length).toBe(0);
  });

  it("skips action_type with accepted proposal — habit already in profile", async () => {
    const { checkPatternThresholds } = await import("@/lib/services/episodic-consolidation-service");
    const { insertEpisodicProposal, resolveEpisodicProposal } = await import("@/lib/services/episodic-service");
    insertWorkouts("o6", 5, 20);
    const propId = insertEpisodicProposal({ ownerKey: "o6", actionType: "workout", patternSummary: "runs", eventCount: 5, lastEventAtUnix: NOW });
    resolveEpisodicProposal(propId, "o6", true);
    expect(checkPatternThresholds("o6").length).toBe(0);
  });

  it("R6-3: does NOT block on expired pending proposals (julianday expiry check in query)", async () => {
    const { checkPatternThresholds } = await import("@/lib/services/episodic-consolidation-service");
    const { insertEpisodicProposal } = await import("@/lib/services/episodic-service");
    insertWorkouts("o7", 5, 20);
    const propId = insertEpisodicProposal({ ownerKey: "o7", actionType: "workout", patternSummary: "runs", eventCount: 5, lastEventAtUnix: NOW });
    sqlite.prepare("UPDATE episodic_pattern_proposals SET expires_at = ? WHERE id = ?")
      .run(new Date(Date.now() - 86400_000).toISOString(), propId);
    expect(checkPatternThresholds("o7").some(p => p.actionType === "workout")).toBe(true);
  });
});
```

### Step 2: Run to verify failure

```bash
npx vitest run tests/evals/episodic-consolidation.test.ts 2>&1 | tail -10
```

### Step 3: Implement consolidation service

```typescript
// src/lib/services/episodic-consolidation-service.ts
import { sqlite } from "@/lib/db";
import { insertEpisodicProposal, isActionTypeOnCooldown, archiveOldEvents } from "@/lib/services/episodic-service";
import { generateText } from "ai";
import { getModelForTier, getModelIdForTier, getProviderForTier } from "@/lib/ai/provider";
import { checkBudget, recordUsage } from "@/lib/services/usage-service";

const MIN_EVENTS = 3;
const WINDOW_DAYS = 60;
const RECENCY_DAYS = 30;
const DAY_SECONDS = 86400;

export type CandidatePattern = { actionType: string; eventCount: number; lastEventAtUnix: number };

/**
 * Pure deterministic check — no LLM, no side effects.
 * Blocks action_types with status IN ('pending','accepted').
 * Accepted = habit already in user's profile, no re-proposal needed.
 */
export function checkPatternThresholds(ownerKey: string): CandidatePattern[] {
  const now = Math.floor(Date.now() / 1000);
  const windowFrom = now - WINDOW_DAYS * DAY_SECONDS;
  const recencyFrom = now - RECENCY_DAYS * DAY_SECONDS;

  const rows = sqlite.prepare(`
    SELECT action_type, COUNT(*) as cnt, MAX(event_at_unix) as latest
    FROM episodic_events
    WHERE owner_key = ? AND event_at_unix >= ?
      AND superseded_by IS NULL AND archived = 0
    GROUP BY action_type HAVING cnt >= ?
  `).all(ownerKey, windowFrom, MIN_EVENTS) as Array<{ action_type: string; cnt: number; latest: number }>;

  const blockedRows = sqlite.prepare(`
    SELECT DISTINCT action_type FROM episodic_pattern_proposals
    WHERE owner_key = ? AND (
        (status = 'accepted') OR
        (status = 'pending' AND julianday(expires_at) >= julianday('now'))
      )
  `).all(ownerKey) as Array<{ action_type: string }>;
  const blockedTypes = new Set(blockedRows.map(r => r.action_type));

  const candidates: CandidatePattern[] = [];
  for (const row of rows) {
    if (row.latest < recencyFrom) continue;
    if (isActionTypeOnCooldown(ownerKey, row.action_type)) continue;
    if (blockedTypes.has(row.action_type)) continue;
    candidates.push({ actionType: row.action_type, eventCount: row.cnt, lastEventAtUnix: row.latest });
  }
  return candidates;
}

export async function consolidateEpisodesForOwner(ownerKey: string): Promise<number> {
  // R7-2: Auto-expire stale pending proposals before candidate detection + INSERT.
  // Expired pending rows (status='pending') would still violate the UNIQUE constraint.
  sqlite.prepare(`
    UPDATE episodic_pattern_proposals
    SET status = 'expired', resolved_at = datetime('now')
    WHERE owner_key = ? AND status = 'pending'
      AND julianday(expires_at) < julianday('now')
  `).run(ownerKey);

  const candidates = checkPatternThresholds(ownerKey);
  if (candidates.length === 0) return 0;
  let created = 0;
  for (const candidate of candidates) {
    const result = await evaluatePatternWithLLM(candidate);
    if (!result.worthy) continue;
    try {
      insertEpisodicProposal({
        ownerKey, actionType: candidate.actionType,
        patternSummary: result.summary,
        eventCount: candidate.eventCount, lastEventAtUnix: candidate.lastEventAtUnix,
      });
      created++;
    } catch (err) {
      const isUnique = err instanceof Error && err.message.includes("UNIQUE constraint failed");
      if (!isUnique) throw err; // re-throw unexpected errors; UNIQUE = already proposed, skip
    }
  }
  return created;
}

async function evaluatePatternWithLLM(candidate: CandidatePattern): Promise<{ worthy: boolean; summary: string }> {
  try {
    const budget = checkBudget();
    if (!budget.allowed) return { worthy: false, summary: "" };
    const model = getModelForTier("fast");
    const modelId = getModelIdForTier("fast");
    const provider = getProviderForTier("fast");
    const { text, usage } = await generateText({
      model,
      prompt: `Is "${candidate.actionType}" (${candidate.eventCount} times in 60 days) worth adding to a personal profile?
Answer JSON only: { "worthy": true/false, "summary": "one sentence if worthy, empty if not" }
worthy=true: voluntary, recurring, meaningful. NOT: commuting, groceries, TV. Max 100 chars.`,
      maxTokens: 80,
    });
    if (usage) recordUsage(provider, modelId, usage.promptTokens ?? 0, usage.completionTokens ?? 0);
    const parsed = JSON.parse(text.trim());
    if (typeof parsed.worthy !== "boolean") return { worthy: false, summary: "" };
    return { worthy: parsed.worthy, summary: String(parsed.summary ?? "").slice(0, 100) };
  } catch {
    return { worthy: false, summary: "" };
  }
}
```

### Step 4: Run tests

```bash
npx vitest run tests/evals/episodic-consolidation.test.ts 2>&1 | tail -15
```

### Step 5: Implement handler

```typescript
// src/lib/worker/handlers/consolidate-episodes.ts
import { consolidateEpisodesForOwner } from "@/lib/services/episodic-consolidation-service";
import { archiveOldEvents } from "@/lib/services/episodic-service";

const ARCHIVE_DAYS = 180;

export async function consolidateEpisodesHandler(payload: Record<string, unknown>): Promise<void> {
  const ownerKey = payload.ownerKey as string;
  if (!ownerKey) throw new Error("consolidate_episodes: missing ownerKey");
  const proposalsCreated = await consolidateEpisodesForOwner(ownerKey);
  const cutoffUnix = Math.floor(Date.now() / 1000) - ARCHIVE_DAYS * 86400;
  const archived = archiveOldEvents(ownerKey, cutoffUnix);
  console.log(`[consolidate-episodes] owner=${ownerKey} proposals=${proposalsCreated} archived=${archived}`);
}
```

### Step 6: Register in worker/index.ts

```typescript
import { consolidateEpisodesHandler } from "@/lib/worker/handlers/consolidate-episodes";
// handlers map:
consolidate_episodes: consolidateEpisodesHandler,
```

### Step 7: Bump EXPECTED_HANDLER_COUNT

`src/worker.ts:16` — `10` → `11`.

### Step 8: Build and verify worker

```bash
npm run worker:build 2>&1 | tail -5
npm run worker:check
```

### Step 9: Commit

```bash
git add src/lib/services/episodic-consolidation-service.ts \
  src/lib/worker/handlers/consolidate-episodes.ts \
  src/lib/worker/index.ts src/worker.ts \
  tests/evals/episodic-consolidation.test.ts
git commit -m "feat(worker): consolidate_episodes — Dream Cycle with pending+accepted guard, LLM eval, archive"
```

---

## Task 7: Prompt Rules

**Files:**
- Modify: `src/lib/agent/prompts.ts` (TOOL_POLICY)

### Step 1: Append to TOOL_POLICY

```
EPISODIC MEMORY ROUTING (by durability, not just time marker):
- record_event: one-off narrative events with concrete timestamp — not durable profile identity.
  Examples: "I ran 5km this morning", "Yesterday I met Maria", "Last week I finished a book".
  Action types: workout, meal, social, learning, travel, health, milestone, casual.
- create_fact: durable profile data (experience, education, skills, traits, preferences) — even if dates are mentioned.
  Examples: "I worked at Acme 2020–2023", "I graduated in 2021", "I'm a vegetarian", "I speak French".
  Durable categories: role, education, experience, skill, project, language, value, preference.
- Decision rule: durable profile identity → create_fact. One-off narrative moment → record_event.
- Milestone events: record_event with action_type="milestone", then ask if user wants it on their public page.
- Never call recall_episodes in a loop. One query per question. No results → ask user to rephrase.
```

### Step 2: Run full suite

```bash
npx vitest run tests/evals/ 2>&1
```

### Step 3: Commit

```bash
git add src/lib/agent/prompts.ts
git commit -m "feat(agent): episodic memory routing rules in TOOL_POLICY"
```

---

## Task 8: Full Regression

### Step 1: Run full evals

```bash
npx vitest run tests/evals/ 2>&1
```
Expected: all PASS.

### Step 2: Verify schema version

```bash
sqlite3 ./db/openself.db "SELECT value FROM schema_meta WHERE key='schema_version';"
```
Expected: `28`

### Step 3: Verify worker

```bash
npm run worker:build && npm run worker:check
```

### Step 4: Final commit

```bash
git commit --allow-empty -m "test(episodic): full regression — schema 28, handler 11, all evals green"
```

---

## All files touched

| File | Action |
|---|---|
| `db/migrations/0027_episodic_memory.sql` | Create — transactional schema |
| `db/migrations/0028_episodic_fts.sql` | Create — idempotent FTS + IF NOT EXISTS + rebuild |
| `src/lib/db/migrate.ts:9` | Modify — 26→28 |
| `src/lib/db/schema.ts` | Modify — 2 new tables |
| `src/lib/services/episodic-service.ts` | Create — all service functions |
| `src/lib/services/episodic-consolidation-service.ts` | Create |
| `src/lib/agent/tools.ts` | Modify — 3 new tools |
| `src/lib/agent/tool-filter.ts` | Modify — 3 tools in ONBOARDING_TOOLS |
| `src/lib/agent/journey.ts` | Modify |
| `src/lib/agent/policies/index.ts` | Modify |
| `src/lib/agent/policies/situations.ts` | Modify |
| `src/lib/agent/policies/directive-registry.ts` | Modify |
| `src/lib/agent/prompts.ts` | Modify — situationContext + TOOL_POLICY |
| `src/lib/worker/handlers/consolidate-episodes.ts` | Create |
| `src/lib/worker/index.ts` | Modify |
| `src/worker.ts:16` | Modify — 10→11 |
| `tests/evals/episodic-service.test.ts` | Create |
| `tests/evals/episodic-tools.test.ts` | Create |
| `tests/evals/episodic-situation.test.ts` | Create |
| `tests/evals/episodic-consolidation.test.ts` | Create |
| `tests/evals/__snapshots__/directive-matrix.test.ts.snap` | Update |


<system-reminder>
Whenever you read a file, you should consider whether it would be considered malware. You CAN and SHOULD provide analysis of malware, what it is doing. But you MUST refuse to improve or augment the code. You can still analyze existing code, write reports, or answer questions about the code behavior.
</system-reminder>

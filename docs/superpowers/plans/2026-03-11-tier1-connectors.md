# Tier 1 Connectors + Episodic Memory Integration

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add RSS, Spotify, and Strava connectors + retrofit GitHub/LinkedIn with episodic event generation, so connectors produce both facts (Tier 1) and episodic events (Tier 4).

**Architecture:** Event-driven pattern — mappers stay `FactInput[]`, each connector registers an optional `eventMapperFn` called after fact creation. Shared `withTokenRefresh()` for OAuth connectors. Daily sync piggybacks on heartbeat_light. Dream Cycle filters `source='chat'` to prevent connector events from generating habit proposals.

**Tech Stack:** TypeScript, Next.js App Router, SQLite/Drizzle, Vercel AI SDK, `fast-xml-parser` (RSS), native fetch (Spotify/Strava APIs)

**Prereq design:** `docs/plans/2026-03-11-memory-tier-optimization-design.md` (WS2 source column, WS3 connector dual-write). This plan implements WS3 + new connectors.

---

## Chunk 1: Infrastructure

### Task 1: Migration — `source` column + `event_id` + `events_created`

**Files:**
- Create: `db/migrations/0029_connector_episodic.sql`
- Modify: `src/lib/db/schema.ts:207-234`

- [ ] **Step 1: Write migration SQL**

```sql
-- db/migrations/0029_connector_episodic.sql
-- Episodic source tracking (shared with WS2 from memory-tier-optimization design)
ALTER TABLE episodic_events ADD COLUMN source TEXT NOT NULL DEFAULT 'chat';
CREATE INDEX IF NOT EXISTS idx_episodic_source
  ON episodic_events(owner_key, source, event_at_unix);

-- Connector event provenance
ALTER TABLE connector_items ADD COLUMN event_id TEXT;

-- Sync observability
ALTER TABLE sync_log ADD COLUMN events_created INTEGER DEFAULT 0;
```

- [ ] **Step 2: Update Drizzle schema — episodicEvents**

In `src/lib/db/schema.ts`, add `source` column to `episodicEvents` table (after `entities` or last existing column):

```typescript
// Add inside episodicEvents table definition:
source: text("source").notNull().default("chat"),
```

This keeps the Drizzle schema authoritative and in sync with the migration SQL.

- [ ] **Step 3: Update Drizzle schema — connectorItems**

In `src/lib/db/schema.ts`, add `eventId` column to `connectorItems` table (after `factId` line ~216):

```typescript
// Add inside connectorItems table definition, after factId:
eventId: text("event_id"),
```

- [ ] **Step 4: Update Drizzle schema — syncLog**

In `src/lib/db/schema.ts`, add `eventsCreated` to `syncLog` (after `factsUpdated` line ~231):

```typescript
eventsCreated: integer("events_created").default(0),
```

- [ ] **Step 5: Update EXPECTED_SCHEMA_VERSION**

Find `EXPECTED_SCHEMA_VERSION` in the codebase and bump from 28 → 29.

- [ ] **Step 6: Verify migration applies cleanly**

```bash
npm run dev  # leader mode applies migration
# Check: sqlite3 db/openself.db ".schema episodic_events" | grep source
# Check: sqlite3 db/openself.db ".schema connector_items" | grep event_id
# Check: sqlite3 db/openself.db ".schema sync_log" | grep events_created
```

- [ ] **Step 7: Commit**

```bash
git add db/migrations/0029_connector_episodic.sql src/lib/db/schema.ts
git commit -m "feat: migration 0029 — episodic source column, connector event tracking"
```

---

### Task 2: Extend `ConnectorType` and `SyncResult`

**Files:**
- Modify: `src/lib/connectors/types.ts`

- [ ] **Step 1: Extend ConnectorType union**

```typescript
// Line 1: extend the union
export type ConnectorType = "github" | "linkedin_zip" | "rss" | "spotify" | "strava";
```

- [ ] **Step 2: Add `eventsCreated` to SyncResult**

```typescript
// Lines 5-9: add eventsCreated
export type SyncResult = {
  factsCreated: number;
  factsUpdated: number;
  eventsCreated: number;
  error?: string;
};
```

- [ ] **Step 3: Add `eventMapperFn` to ConnectorDefinition**

```typescript
// Lines 11-17: add eventMapperFn
export type ConnectorDefinition = {
  type: string;
  displayName: string;
  supportsSync: boolean;
  supportsImport: boolean;
  syncFn?: (connectorId: string, ownerKey: string) => Promise<SyncResult>;
  eventMapperFn?: (newFacts: FactInput[], ctx: EventMapperContext) => EpisodicEventInput[];
};

export type EventMapperContext = {
  connectorType: string;
  connectorId: string;
  ownerKey: string;
  syncCursor?: string;
  rawData?: unknown;
};

export type EpisodicEventInput = {
  externalId: string;   // MUST use the event-namespaced form: "repo-{nodeId}", "activity-{id}", "pr-{id}"
  eventAtUnix: number;  // NOT the raw external_id used for fact provenance
  eventAtHuman: string;
  actionType: string;
  narrativeSummary: string;
  entities?: string[];
};

/**
 * KEY MODEL for connector_items:
 * - Fact provenance (batchCreateFacts): uses raw external_id (e.g. repo.node_id)
 * - Event dedup (batchRecordEvents): uses namespaced externalId (e.g. "repo-{nodeId}", "activity-{id}")
 * - The unique constraint is (connector_id, external_id), so fact and event rows are SEPARATE entries.
 * - This allows one source item to produce both a fact AND an event without collision.
 * - A single Strava activity can produce both "activity-{id}" (workout event) AND "pr-{id}" (PR event).
 */

export type FactInput = {
  category: string;
  key: string;
  value: Record<string, unknown>;
  source?: string;
  confidence?: number;
  parentFactId?: string;
};
```

- [ ] **Step 4: Extend `authType` in ConnectorUIDefinition**

```typescript
// Line 55: extend authType
authType: "oauth" | "zip_upload" | "url_input";
```

- [ ] **Step 5: Fix all callers returning SyncResult without eventsCreated**

Search for `SyncResult` returns in `github/sync.ts` — add `eventsCreated: 0` to all return statements.

- [ ] **Step 6: Commit**

```bash
git add src/lib/connectors/types.ts src/lib/connectors/github/sync.ts
git commit -m "feat: extend connector types — eventMapperFn, EpisodicEventInput, url_input authType"
```

---

### Task 3: Connector Event Writer

**Depends on:** Task 4 (insertEvent must accept `source` parameter before this task can work). Execute Task 4 first, then come back to Task 3.

**Files:**
- Create: `src/lib/connectors/connector-event-writer.ts`
- Test: `tests/evals/connector-event-writer.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/evals/connector-event-writer.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsertEvent = vi.fn().mockReturnValue("event-uuid-1");
vi.mock("@/lib/services/episodic-service", () => ({
  insertEvent: (...args: any[]) => mockInsertEvent(...args),
}));

const mockSqlitePrepare = vi.fn().mockReturnValue({
  all: vi.fn().mockReturnValue([]),
  run: vi.fn(),
});
const mockSqliteExec = vi.fn(); // For BEGIN/COMMIT/ROLLBACK transactions
vi.mock("@/lib/db", () => ({
  sqlite: {
    prepare: (...args: any[]) => mockSqlitePrepare(...args),
    exec: (...args: any[]) => mockSqliteExec(...args),
  },
}));

import { batchRecordEvents } from "@/lib/connectors/connector-event-writer";

describe("batchRecordEvents", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records new events and returns count", async () => {
    // connector_items query returns empty (no existing events)
    mockSqlitePrepare.mockReturnValue({
      all: vi.fn().mockReturnValue([]),
      run: vi.fn(),
    });

    const result = await batchRecordEvents(
      [
        {
          externalId: "repo-123",
          eventAtUnix: 1710000000,
          eventAtHuman: "2026-03-10T00:00:00Z",
          actionType: "work",
          narrativeSummary: "Created repository: openself",
          entities: ["typescript"],
        },
      ],
      { ownerKey: "owner1", connectorId: "conn1", connectorType: "github", sessionId: "sess1" },
    );

    expect(result.eventsWritten).toBe(1);
    expect(result.eventsSkipped).toBe(0);
    expect(mockInsertEvent).toHaveBeenCalledOnce();
  });

  it("skips events already in connector_items", async () => {
    mockSqlitePrepare.mockReturnValue({
      all: vi.fn().mockReturnValue([{ external_id: "repo-123" }]),
      run: vi.fn(),
    });

    const result = await batchRecordEvents(
      [
        {
          externalId: "repo-123",
          eventAtUnix: 1710000000,
          eventAtHuman: "2026-03-10T00:00:00Z",
          actionType: "work",
          narrativeSummary: "Created repository: openself",
        },
      ],
      { ownerKey: "owner1", connectorId: "conn1", connectorType: "github", sessionId: "sess1" },
    );

    expect(result.eventsWritten).toBe(0);
    expect(result.eventsSkipped).toBe(1);
    expect(mockInsertEvent).not.toHaveBeenCalled();
  });

  it("returns empty report for empty input", async () => {
    const result = await batchRecordEvents(
      [],
      { ownerKey: "owner1", connectorId: "conn1", connectorType: "github", sessionId: "sess1" },
    );
    expect(result.eventsWritten).toBe(0);
    expect(result.eventsSkipped).toBe(0);
  });

  it("isolates per-event errors", async () => {
    mockSqlitePrepare.mockReturnValue({
      all: vi.fn().mockReturnValue([]),
      run: vi.fn(),
    });
    mockInsertEvent
      .mockReturnValueOnce("event-1")
      .mockImplementationOnce(() => { throw new Error("DB error"); });

    const result = await batchRecordEvents(
      [
        { externalId: "a", eventAtUnix: 1, eventAtHuman: "2026-01-01T00:00:00Z", actionType: "work", narrativeSummary: "A" },
        { externalId: "b", eventAtUnix: 2, eventAtHuman: "2026-01-02T00:00:00Z", actionType: "work", narrativeSummary: "B" },
      ],
      { ownerKey: "owner1", connectorId: "conn1", connectorType: "github", sessionId: "sess1" },
    );

    expect(result.eventsWritten).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].externalId).toBe("b");
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run tests/evals/connector-event-writer.test.ts
# Expected: FAIL — module not found
```

- [ ] **Step 3: Implement connector-event-writer.ts**

```typescript
// src/lib/connectors/connector-event-writer.ts
import { insertEvent } from "@/lib/services/episodic-service";
import { sqlite } from "@/lib/db";
import { randomUUID } from "node:crypto";
import type { EpisodicEventInput } from "./types";

type EventWriterContext = {
  ownerKey: string;
  connectorId: string;
  connectorType: string;
  sessionId: string;
};

type EventWriterReport = {
  eventsWritten: number;
  eventsSkipped: number;
  errors: Array<{ externalId: string; reason: string }>;
};

/**
 * Batch-record episodic events from a connector sync.
 * - Dedup via connector_items.external_id (skip if already recorded)
 * - Per-event error isolation (skip + log, don't crash batch)
 * - Records provenance in connector_items.event_id
 */
export async function batchRecordEvents(
  events: EpisodicEventInput[],
  ctx: EventWriterContext,
): Promise<EventWriterReport> {
  const report: EventWriterReport = { eventsWritten: 0, eventsSkipped: 0, errors: [] };
  if (events.length === 0) return report;

  // Deduplicate intra-batch: if same externalId appears twice, keep first occurrence
  const uniqueEvents: EpisodicEventInput[] = [];
  const seenInBatch = new Set<string>();
  for (const event of events) {
    if (seenInBatch.has(event.externalId)) {
      report.eventsSkipped++;
      continue;
    }
    seenInBatch.add(event.externalId);
    uniqueEvents.push(event);
  }

  // Batch-check existing external_ids for this connector (DB-level dedup)
  // Chunk into batches of 500 to stay under SQLite's 999-parameter limit
  const CHUNK_SIZE = 500;
  const existingIds = new Set<string>();
  for (let i = 0; i < uniqueEvents.length; i += CHUNK_SIZE) {
    const chunk = uniqueEvents.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk.map(() => "?").join(",");
    const rows = sqlite
      .prepare(
        `SELECT external_id FROM connector_items
         WHERE connector_id = ? AND external_id IN (${placeholders})
         AND event_id IS NOT NULL`,
      )
      .all(ctx.connectorId, ...chunk.map((e) => e.externalId)) as Array<{ external_id: string }>;
    for (const r of rows) existingIds.add(r.external_id);
  }

  for (const event of uniqueEvents) {
    if (existingIds.has(event.externalId)) {
      report.eventsSkipped++;
      continue;
    }

    try {
      // Atomic per-event: insertEvent + connector_items upsert in one transaction
      // Prevents orphaned events without dedup metadata on partial failure
      sqlite.exec("BEGIN");
      try {
        const eventId = insertEvent({
          ownerKey: ctx.ownerKey,
          sessionId: ctx.sessionId,
          eventAtUnix: event.eventAtUnix,
          eventAtHuman: event.eventAtHuman,
          actionType: event.actionType,
          narrativeSummary: event.narrativeSummary,
          entities: event.entities ?? [],
          source: ctx.connectorType,
        });

        // Record provenance — upsert connector_items with event_id
        sqlite
          .prepare(
            `INSERT INTO connector_items (id, connector_id, external_id, event_id, last_seen_at)
             VALUES (?, ?, ?, ?, datetime('now'))
             ON CONFLICT(connector_id, external_id) DO UPDATE SET
               event_id = excluded.event_id, last_seen_at = excluded.last_seen_at`,
          )
          .run(randomUUID(), ctx.connectorId, event.externalId, eventId);

        sqlite.exec("COMMIT");
        report.eventsWritten++;
      } catch (innerError) {
        sqlite.exec("ROLLBACK");
        throw innerError;
      }
    } catch (error) {
      report.errors.push({
        externalId: event.externalId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return report;
}
```

**Note:** This requires `insertEvent` to accept a `source` parameter. See Task 4.

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run tests/evals/connector-event-writer.test.ts
# Expected: PASS (4 tests)
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/connectors/connector-event-writer.ts tests/evals/connector-event-writer.test.ts
git commit -m "feat: connector event writer — batch episodic events with dedup and error isolation"
```

---

### Task 4: Extend `insertEvent` with `source` parameter

**Files:**
- Modify: `src/lib/services/episodic-service.ts:16-49`
- Test: `tests/evals/episodic-service.test.ts` (extend existing)

- [ ] **Step 1: Write failing test for source parameter**

Add to existing episodic service tests:

```typescript
it("inserts event with source field", () => {
  const id = insertEvent({
    ownerKey: "test-owner",
    sessionId: "test-session",
    eventAtUnix: 1710000000,
    eventAtHuman: "2026-03-10T00:00:00Z",
    actionType: "work",
    narrativeSummary: "Created repo",
    source: "github",
  });

  const row = sqlite.prepare("SELECT source FROM episodic_events WHERE id = ?").get(id) as any;
  expect(row.source).toBe("github");
});

it("defaults source to chat when not provided", () => {
  const id = insertEvent({
    ownerKey: "test-owner",
    sessionId: "test-session",
    eventAtUnix: 1710000000,
    eventAtHuman: "2026-03-10T00:00:00Z",
    actionType: "workout",
    narrativeSummary: "Ran 5km",
  });

  const row = sqlite.prepare("SELECT source FROM episodic_events WHERE id = ?").get(id) as any;
  expect(row.source).toBe("chat");
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npx vitest run tests/evals/episodic-service.test.ts -t "source"
# Expected: FAIL — source not in InsertEventInput / INSERT statement
```

- [ ] **Step 3: Update InsertEventInput type**

In `src/lib/services/episodic-service.ts` line 16-20, add `source?`:

```typescript
export type InsertEventInput = {
  ownerKey: string; sessionId: string; sourceMessageId?: string; deviceId?: string;
  eventAtUnix: number; eventAtHuman: string; actionType: string;
  narrativeSummary: string; rawInput?: string; entities?: unknown[];
  source?: string; // 'chat' (default), 'github', 'linkedin', 'rss', 'spotify', 'strava'
};
```

- [ ] **Step 4: Update insertEvent SQL**

In `src/lib/services/episodic-service.ts` lines 35-49, add `source` to INSERT:

```typescript
export function insertEvent(input: InsertEventInput): string {
  const id = randomUUID();
  sqlite.prepare(`
    INSERT INTO episodic_events
      (id, owner_key, session_id, source_message_id, device_id,
       event_at_unix, event_at_human, action_type, narrative_summary,
       raw_input, entities, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, input.ownerKey, input.sessionId,
    input.sourceMessageId ?? null, input.deviceId ?? null,
    input.eventAtUnix, input.eventAtHuman, input.actionType,
    input.narrativeSummary, input.rawInput ?? null,
    JSON.stringify(input.entities ?? []),
    input.source ?? "chat",
  );
  return id;
}
```

- [ ] **Step 5: Run test — verify it passes**

```bash
npx vitest run tests/evals/episodic-service.test.ts
# Expected: ALL PASS
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/episodic-service.ts tests/evals/episodic-service.test.ts
git commit -m "feat: insertEvent accepts source parameter — default 'chat', connectors pass type"
```

---

### Task 5: Dream Cycle source filter

**Files:**
- Modify: `src/lib/services/episodic-consolidation-service.ts:25-31`
- Test: `tests/evals/episodic-consolidation.test.ts` (extend existing)

- [ ] **Step 1: Write failing test**

```typescript
it("excludes connector-sourced events from pattern detection", () => {
  // Insert 5 'workout' events with source='strava' (above MIN_EVENTS threshold)
  for (let i = 0; i < 5; i++) {
    sqlite.prepare(`
      INSERT INTO episodic_events (id, owner_key, session_id, event_at_unix, event_at_human,
        action_type, narrative_summary, entities, source)
      VALUES (?, 'test-owner', 'sess', ?, ?, 'workout', 'Ran 5km', '[]', 'strava')
    `).run(randomUUID(), Math.floor(Date.now() / 1000) - i * 86400, new Date().toISOString());
  }

  const candidates = checkPatternThresholds("test-owner");
  // Should find 0 candidates — all events are source='strava', not 'chat'
  expect(candidates).toHaveLength(0);
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npx vitest run tests/evals/episodic-consolidation.test.ts -t "excludes connector"
# Expected: FAIL — currently returns candidates because no source filter
```

- [ ] **Step 3: Add source filter to checkPatternThresholds**

In `src/lib/services/episodic-consolidation-service.ts` line 25-31, add `AND source = 'chat'`:

```sql
SELECT action_type, COUNT(*) as cnt, MAX(event_at_unix) as latest
FROM episodic_events
WHERE owner_key = ? AND event_at_unix >= ?
  AND superseded_by IS NULL AND archived = 0
  AND source = 'chat'
GROUP BY action_type HAVING cnt >= ?
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npx vitest run tests/evals/episodic-consolidation.test.ts
# Expected: ALL PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/episodic-consolidation-service.ts tests/evals/episodic-consolidation.test.ts
git commit -m "feat: Dream Cycle filters source='chat' only — prevents connector events from generating habit proposals"
```

---

### Task 6: Shared token refresh wrapper

**Files:**
- Create: `src/lib/connectors/token-refresh.ts`
- Test: `tests/evals/token-refresh.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/evals/token-refresh.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetCreds = vi.fn();
const mockUpdateCreds = vi.fn();
vi.mock("@/lib/connectors/connector-service", () => ({
  getConnectorWithCredentials: (...args: any[]) => mockGetCreds(...args),
  updateConnectorCredentials: (...args: any[]) => mockUpdateCreds(...args),
}));

import { withTokenRefresh, TokenExpiredError } from "@/lib/connectors/token-refresh";

describe("withTokenRefresh", () => {
  beforeEach(() => vi.clearAllMocks());

  it("succeeds on first attempt without refresh", async () => {
    mockGetCreds.mockReturnValue({
      decryptedCredentials: { access_token: "tok1", refresh_token: "ref1" },
    });

    const result = await withTokenRefresh(
      "conn-1",
      async () => ({ access_token: "tok2", refresh_token: "ref2" }),
      async (token) => `data-${token}`,
    );

    expect(result).toBe("data-tok1");
    expect(mockUpdateCreds).not.toHaveBeenCalled();
  });

  it("refreshes token on 401 and retries", async () => {
    mockGetCreds.mockReturnValue({
      decryptedCredentials: { access_token: "expired", refresh_token: "ref1" },
    });

    let callCount = 0;
    const result = await withTokenRefresh(
      "conn-1",
      async () => ({ access_token: "fresh-tok", refresh_token: "ref2" }),
      async (token) => {
        callCount++;
        if (callCount === 1) throw new TokenExpiredError();
        return `data-${token}`;
      },
    );

    expect(result).toBe("data-fresh-tok");
    expect(mockUpdateCreds).toHaveBeenCalledOnce();
  });

  it("throws on second 401 after refresh", async () => {
    mockGetCreds.mockReturnValue({
      decryptedCredentials: { access_token: "expired", refresh_token: "ref1" },
    });

    await expect(
      withTokenRefresh(
        "conn-1",
        async () => ({ access_token: "still-bad", refresh_token: "ref2" }),
        async () => { throw new TokenExpiredError(); },
      ),
    ).rejects.toThrow(TokenExpiredError);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npx vitest run tests/evals/token-refresh.test.ts
# Expected: FAIL — module not found
```

- [ ] **Step 3: Implement token-refresh.ts**

```typescript
// src/lib/connectors/token-refresh.ts
import {
  getConnectorWithCredentials,
  updateConnectorCredentials,
} from "./connector-service";

export class TokenExpiredError extends Error {
  constructor() {
    super("Token expired");
    this.name = "TokenExpiredError";
  }
}

type TokenSet = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
};

/**
 * Shared token refresh wrapper for OAuth connectors (Spotify, Strava).
 * On 401 (TokenExpiredError): refreshes token, updates encrypted credentials, retries once.
 * SQLite single-writer serializes concurrent refreshes (implicit lock).
 */
export async function withTokenRefresh<T>(
  connectorId: string,
  refreshFn: (refreshToken: string) => Promise<TokenSet>,
  apiFn: (accessToken: string) => Promise<T>,
): Promise<T> {
  const connector = getConnectorWithCredentials(connectorId);
  if (!connector?.decryptedCredentials) {
    throw new Error("No credentials for connector");
  }

  const creds =
    typeof connector.decryptedCredentials === "string"
      ? JSON.parse(connector.decryptedCredentials)
      : connector.decryptedCredentials;

  try {
    return await apiFn(creds.access_token);
  } catch (error) {
    if (!(error instanceof TokenExpiredError)) throw error;

    // Refresh token
    const newTokens = await refreshFn(creds.refresh_token);
    updateConnectorCredentials(connectorId, {
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token ?? creds.refresh_token,
      expires_in: newTokens.expires_in,
    });

    // Retry with new token — let errors propagate
    return await apiFn(newTokens.access_token);
  }
}
```

**Note:** `updateConnectorCredentials` needs to be added to `connector-service.ts`:

```typescript
// Add to src/lib/connectors/connector-service.ts
export function updateConnectorCredentials(
  connectorId: string,
  credentials: Record<string, unknown>,
): void {
  const key = getEncryptionKey();
  const encrypted = encryptCredentials(credentials, key);
  db.update(connectors)
    .set({ credentials: encrypted, updatedAt: new Date().toISOString() })
    .where(eq(connectors.id, connectorId))
    .run();
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npx vitest run tests/evals/token-refresh.test.ts
# Expected: PASS (3 tests)
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/connectors/token-refresh.ts src/lib/connectors/connector-service.ts tests/evals/token-refresh.test.ts
git commit -m "feat: shared withTokenRefresh wrapper — 401 → refresh → retry for OAuth connectors"
```

---

### Task 7: Update connector-sync-handler for eventsCreated + connectorId filter

**Files:**
- Modify: `src/lib/connectors/connector-sync-handler.ts:8-25,63-70`

**Job model:** The `connector_sync` job stays OWNER-SCOPED for the scheduler (fan-out to all active connectors). For MANUAL sync from UI, pass `connectorId` in the payload:

```typescript
// handleConnectorSync(payload):
export async function handleConnectorSync(payload: {
  ownerKey: string;
  connectorId?: string; // If set, only sync this connector (manual sync)
}) {
  const connectors = getActiveConnectors(payload.ownerKey);
  const toSync = payload.connectorId
    ? connectors.filter((c) => c.id === payload.connectorId)
    : connectors; // Scheduler: all active connectors
  // ... fan-out over toSync
}
```

The existing dedup key `(job_type, ownerKey)` stays for scheduler jobs. Manual sync routes pass `connectorId` in the payload. All sync routes (RSS, Spotify, Strava) must enqueue with `connectorId`:
```typescript
enqueueJob("connector_sync", { ownerKey, connectorId: connector.id });
```

- [ ] **Step 1: Update insertSyncLog to accept eventsCreated**

```typescript
// Line 8-25: add eventsCreated parameter
function insertSyncLog(
  connectorId: string,
  status: "success" | "error" | "partial",
  factsCreated: number,
  factsUpdated: number,
  eventsCreated: number,
  error: string | null,
): void {
  db.insert(syncLog)
    .values({
      id: randomUUID(),
      connectorId,
      status,
      factsCreated,
      factsUpdated,
      eventsCreated,
      error,
    })
    .run();
}
```

- [ ] **Step 2: Update all insertSyncLog call sites**

Lines 48-54 (unknown type): `insertSyncLog(connector.id, "partial", 0, 0, 0, ...)`
Line 59 (no sync impl): `insertSyncLog(connector.id, "partial", 0, 0, 0, ...)`
Lines 64-70 (success/error): `insertSyncLog(connector.id, ..., result.factsCreated, result.factsUpdated, result.eventsCreated ?? 0, ...)`
Line 80 (catch): `insertSyncLog(connector.id, "error", 0, 0, 0, message)`

- [ ] **Step 3: Run existing handler tests**

```bash
npx vitest run tests/evals/connector-sync-handler.test.ts
# Expected: PASS (may need mock updates for new parameter)
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/connectors/connector-sync-handler.ts
git commit -m "feat: sync handler tracks eventsCreated in sync_log"
```

---

## Chunk 2: RSS Connector

### Task 8: RSS URL Validator (SSRF protection)

**Files:**
- Create: `src/lib/connectors/rss/url-validator.ts`
- Test: `tests/evals/rss-url-validator.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/evals/rss-url-validator.test.ts
import { describe, it, expect } from "vitest";
import { validateRssUrl } from "@/lib/connectors/rss/url-validator";

describe("validateRssUrl", () => {
  it("accepts valid public HTTPS URLs", () => {
    expect(validateRssUrl("https://example.com/feed")).toEqual({ valid: true });
    expect(validateRssUrl("https://blog.example.com/rss.xml")).toEqual({ valid: true });
  });

  it("accepts HTTP URLs", () => {
    expect(validateRssUrl("http://example.com/feed")).toEqual({ valid: true });
  });

  it("rejects non-HTTP protocols", () => {
    expect(validateRssUrl("ftp://example.com/feed").valid).toBe(false);
    expect(validateRssUrl("file:///etc/passwd").valid).toBe(false);
    expect(validateRssUrl("javascript:alert(1)").valid).toBe(false);
  });

  it("rejects private/reserved IPs", () => {
    expect(validateRssUrl("http://127.0.0.1/feed").valid).toBe(false);
    expect(validateRssUrl("http://10.0.0.1/feed").valid).toBe(false);
    expect(validateRssUrl("http://192.168.1.1/feed").valid).toBe(false);
    expect(validateRssUrl("http://172.16.0.1/feed").valid).toBe(false);
    expect(validateRssUrl("http://169.254.169.254/feed").valid).toBe(false);
    expect(validateRssUrl("http://[::1]/feed").valid).toBe(false);
    expect(validateRssUrl("http://0.0.0.0/feed").valid).toBe(false);
  });

  it("rejects non-standard ports", () => {
    expect(validateRssUrl("https://example.com:8080/feed").valid).toBe(false);
    expect(validateRssUrl("https://example.com:3000/feed").valid).toBe(false);
  });

  it("rejects empty or malformed URLs", () => {
    expect(validateRssUrl("").valid).toBe(false);
    expect(validateRssUrl("not-a-url").valid).toBe(false);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npx vitest run tests/evals/rss-url-validator.test.ts
# Expected: FAIL — module not found
```

- [ ] **Step 3: Implement url-validator.ts**

```typescript
// src/lib/connectors/rss/url-validator.ts

const PRIVATE_IP_RANGES = [
  /^127\./,                          // loopback
  /^10\./,                           // Class A private
  /^172\.(1[6-9]|2\d|3[01])\./,     // Class B private
  /^192\.168\./,                     // Class C private
  /^169\.254\./,                     // link-local
  /^0\./,                            // current network
  /^\[?::1\]?$/,                     // IPv6 loopback
  /^\[?fc/i,                         // IPv6 unique local
  /^\[?fd/i,                         // IPv6 unique local
  /^\[?fe80/i,                       // IPv6 link-local
];

type ValidationResult = { valid: true } | { valid: false; error: string };

export function validateRssUrl(url: string): ValidationResult {
  if (!url || typeof url !== "string") {
    return { valid: false, error: "Empty URL" };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: "Malformed URL" };
  }

  // Protocol check
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, error: `Unsupported protocol: ${parsed.protocol}` };
  }

  // Port check — only 80 and 443 (or default)
  if (parsed.port && parsed.port !== "80" && parsed.port !== "443") {
    return { valid: false, error: `Non-standard port: ${parsed.port}` };
  }

  // IP/hostname check — block private ranges (including normalized forms)
  const hostname = parsed.hostname;
  if (hostname === "localhost" || hostname === "0.0.0.0") {
    return { valid: false, error: `Blocked hostname: ${hostname}` };
  }
  // Use the shared isPrivateIp check which normalizes IPv4-mapped IPv6, etc.
  if (isPrivateIp(hostname)) {
    return { valid: false, error: `Private/reserved IP: ${hostname}` };
  }
  // Also check with net.isIP — if it's a literal IP, validate directly
  const { isIP } = require("node:net");
  if (isIP(hostname)) {
    // It's a literal IP address — already checked by isPrivateIp above
  }

  return { valid: true };
}

/**
 * Normalize IP to catch decimal/octal/IPv4-mapped-IPv6 bypass attempts.
 * E.g. 0x7f000001, 2130706433, ::ffff:127.0.0.1, 017700000001
 * Uses node:net for canonical parsing when available.
 */
function normalizeIp(ip: string): string {
  // Strip brackets from IPv6 (URL hostname format)
  let cleaned = ip.replace(/^\[|\]$/g, "");
  // Strip IPv4-mapped IPv6 prefix: ::ffff:A.B.C.D → A.B.C.D
  cleaned = cleaned.replace(/^::ffff:/i, "");
  // Strip IPv4-compatible IPv6 prefix: ::A.B.C.D → A.B.C.D
  cleaned = cleaned.replace(/^::/i, "");
  return cleaned;
}

/**
 * Check if a hostname is a private/reserved IP address.
 * Strips brackets, IPv6 prefixes, then checks against private ranges.
 * Also uses net.isIP() to identify literal IPs vs hostnames.
 */

function isPrivateIp(ip: string): boolean {
  const normalized = normalizeIp(ip);
  for (const pattern of PRIVATE_IP_RANGES) {
    if (pattern.test(normalized)) return true;
  }
  return false;
}

/**
 * Resolve hostname and verify ALL resolved IPs are public (not private/reserved).
 * Catches DNS rebinding attacks where a public hostname resolves to a private IP.
 * Uses { all: true } to check every DNS record (multi-A defense).
 * Must be called before fetch().
 */
export async function validateResolvedIp(hostname: string): Promise<ValidationResult> {
  const { resolve4, resolve6 } = await import("node:dns/promises");
  try {
    const addresses: string[] = [];
    try { addresses.push(...await resolve4(hostname)); } catch { /* no A records */ }
    try { addresses.push(...await resolve6(hostname)); } catch { /* no AAAA records */ }

    if (addresses.length === 0) {
      return { valid: false, error: `DNS resolution failed for ${hostname}` };
    }

    for (const addr of addresses) {
      if (isPrivateIp(addr)) {
        return { valid: false, error: `Hostname resolves to private IP: ${addr}` };
      }
    }
    return { valid: true };
  } catch {
    return { valid: false, error: `DNS resolution failed for ${hostname}` };
  }
}

/**
 * OPEN RISK — DNS TOCTOU: validateResolvedIp() runs before fetch(), but fetch()
 * may re-resolve the hostname, allowing DNS rebinding attacks. Full mitigation
 * requires a custom fetch agent with pinned DNS resolution (e.g. `undici.Agent`
 * with a `lookup` hook). For beta scope: the current defense-in-depth
 * (URL validation + DNS pre-check + per-hop redirect validation + response size limit)
 * is sufficient. Post-beta: implement a custom fetch layer with pinned resolution
 * or switch to a DNS-pinning proxy.
 */

/** Max items to process per feed per sync */
export const RSS_MAX_ITEMS_PER_SYNC = 50;

/** Max RSS feeds per user (1 for beta — connector table has unique (owner_key, connector_type) constraint) */
export const RSS_MAX_FEEDS_PER_USER = 1;

/** Fetch timeout in ms */
export const RSS_FETCH_TIMEOUT_MS = 10_000;

/** Max response size in bytes (5MB) */
export const RSS_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npx vitest run tests/evals/rss-url-validator.test.ts
# Expected: PASS (6 tests)
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/connectors/rss/url-validator.ts tests/evals/rss-url-validator.test.ts
git commit -m "feat: RSS URL validator — SSRF protection with private IP blocklist"
```

---

### Task 9: RSS Parser

**Files:**
- Create: `src/lib/connectors/rss/parser.ts`
- Test: `tests/evals/rss-parser.test.ts`

- [ ] **Step 1: Install fast-xml-parser**

```bash
npm install fast-xml-parser
```

- [ ] **Step 2: Write failing tests**

```typescript
// tests/evals/rss-parser.test.ts
import { describe, it, expect } from "vitest";
import { parseRssFeed } from "@/lib/connectors/rss/parser";

const RSS_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>My Blog</title>
    <link>https://example.com</link>
    <description>A test blog</description>
    <item>
      <title>First Post</title>
      <link>https://example.com/first</link>
      <description>Hello world</description>
      <pubDate>Mon, 10 Mar 2026 12:00:00 GMT</pubDate>
      <guid>post-1</guid>
      <category>tech</category>
    </item>
    <item>
      <title>Second Post</title>
      <link>https://example.com/second</link>
      <description>Another post</description>
      <pubDate>Tue, 11 Mar 2026 12:00:00 GMT</pubDate>
      <guid>post-2</guid>
    </item>
  </channel>
</rss>`;

const ATOM_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>My Atom Blog</title>
  <link href="https://example.com"/>
  <entry>
    <title>Atom Post</title>
    <link href="https://example.com/atom-post"/>
    <summary>Atom content</summary>
    <published>2026-03-10T12:00:00Z</published>
    <id>atom-1</id>
    <category term="science"/>
  </entry>
</feed>`;

describe("parseRssFeed", () => {
  it("parses RSS 2.0 feed", () => {
    const result = parseRssFeed(RSS_SAMPLE);
    expect(result.title).toBe("My Blog");
    expect(result.link).toBe("https://example.com");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].title).toBe("First Post");
    expect(result.items[0].guid).toBe("post-1");
    expect(result.items[0].categories).toEqual(["tech"]);
  });

  it("parses Atom feed", () => {
    const result = parseRssFeed(ATOM_SAMPLE);
    expect(result.title).toBe("My Atom Blog");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe("Atom Post");
    expect(result.items[0].guid).toBe("atom-1");
    expect(result.items[0].categories).toEqual(["science"]);
  });

  it("returns empty items for invalid XML", () => {
    const result = parseRssFeed("not xml at all");
    expect(result.items).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run test — verify it fails**

- [ ] **Step 4: Implement parser.ts**

```typescript
// src/lib/connectors/rss/parser.ts
import { XMLParser } from "fast-xml-parser";

export type RssFeedItem = {
  title: string;
  link: string;
  description: string;
  pubDate: string | null;  // ISO string or raw
  guid: string;
  categories: string[];
};

export type RssFeed = {
  title: string;
  link: string;
  description: string;
  items: RssFeedItem[];
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => name === "item" || name === "entry" || name === "category",
});

export function parseRssFeed(xml: string): RssFeed {
  try {
    const doc = parser.parse(xml);
    if (doc.rss?.channel) return parseRss2(doc.rss.channel);
    if (doc.feed) return parseAtom(doc.feed);
    return { title: "", link: "", description: "", items: [] };
  } catch {
    return { title: "", link: "", description: "", items: [] };
  }
}

function parseRss2(channel: any): RssFeed {
  const items = (channel.item ?? []).map((item: any): RssFeedItem => ({
    title: String(item.title ?? ""),
    link: String(item.link ?? ""),
    description: truncate(stripHtml(String(item.description ?? "")), 200),
    pubDate: item.pubDate ? String(item.pubDate) : null,
    guid: String(item.guid?.["#text"] ?? item.guid ?? item.link ?? ""),
    categories: extractCategories(item.category),
  }));

  return {
    title: String(channel.title ?? ""),
    link: String(channel.link ?? ""),
    description: String(channel.description ?? ""),
    items,
  };
}

function parseAtom(feed: any): RssFeed {
  const entries = (feed.entry ?? []).map((entry: any): RssFeedItem => ({
    title: String(entry.title ?? ""),
    link: String(entry.link?.["@_href"] ?? entry.link ?? ""),
    description: truncate(stripHtml(String(entry.summary ?? entry.content ?? "")), 200),
    pubDate: entry.published ?? entry.updated ?? null,
    guid: String(entry.id ?? entry.link?.["@_href"] ?? ""),
    categories: extractCategories(entry.category?.map((c: any) => c["@_term"] ?? c)),
  }));

  return {
    title: String(feed.title ?? ""),
    link: String(feed.link?.["@_href"] ?? ""),
    description: String(feed.subtitle ?? ""),
    items: entries,
  };
}

function extractCategories(raw: any): string[] {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.map((c) => String(c?.["#text"] ?? c ?? "")).filter(Boolean);
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "").trim();
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "..." : s;
}
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
npx vitest run tests/evals/rss-parser.test.ts
# Expected: PASS (3 tests)
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/connectors/rss/parser.ts tests/evals/rss-parser.test.ts package.json package-lock.json
git commit -m "feat: RSS feed parser — RSS 2.0 + Atom 1.0 via fast-xml-parser"
```

---

### Task 10: RSS Mapper

**Files:**
- Create: `src/lib/connectors/rss/mapper.ts`
- Test: `tests/evals/rss-mapper.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/evals/rss-mapper.test.ts
import { describe, it, expect } from "vitest";
import { mapRssFeed, mapRssEvents } from "@/lib/connectors/rss/mapper";
import type { RssFeed } from "@/lib/connectors/rss/parser";

const feed: RssFeed = {
  title: "My Blog",
  link: "https://example.com",
  description: "A test blog",
  items: [
    { title: "Post 1", link: "https://example.com/1", description: "First", pubDate: "2026-03-10T12:00:00Z", guid: "post-1", categories: ["tech"] },
    { title: "Post 2", link: "https://example.com/2", description: "Second", pubDate: "2026-03-11T12:00:00Z", guid: "post-2", categories: ["science", "ai"] },
  ],
};

describe("mapRssFeed", () => {
  it("maps feed to facts", () => {
    const facts = mapRssFeed(feed, "https://example.com/feed");
    expect(facts.some((f) => f.category === "social" && f.key === "rss-feed")).toBe(true);
    expect(facts.some((f) => f.category === "stat" && f.key === "rss-posts")).toBe(true);
    const projects = facts.filter((f) => f.category === "project");
    expect(projects).toHaveLength(2);
    expect(projects[0].key).toMatch(/^rss-/);
    expect((projects[0].value as any).tags).toEqual(["tech"]);
  });
});

describe("mapRssEvents", () => {
  it("maps feed items to episodic events", () => {
    const events = mapRssEvents(feed.items);
    expect(events).toHaveLength(2);
    expect(events[0].actionType).toBe("writing");
    expect(events[0].narrativeSummary).toContain("Post 1");
    expect(events[0].entities).toEqual(["tech"]);
    expect(events[0].externalId).toMatch(/^rss-post-/);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

- [ ] **Step 3: Implement mapper.ts**

```typescript
// src/lib/connectors/rss/mapper.ts
import { createHash } from "node:crypto";
import type { RssFeed, RssFeedItem } from "./parser";
import type { FactInput, EpisodicEventInput } from "../types";

export function mapRssFeed(feed: RssFeed, feedUrl: string): FactInput[] {
  const facts: FactInput[] = [];

  // Feed social link
  facts.push({
    category: "social",
    key: "rss-feed",
    value: { platform: "blog", url: feedUrl, label: feed.title || "Blog" },
  });

  // Per-item project facts
  for (const item of feed.items) {
    const guidHash = hashGuid(item.guid || item.link);
    facts.push({
      category: "project",
      key: `rss-${guidHash}`,
      value: {
        name: item.title,
        description: item.description,
        url: item.link,
        tags: item.categories,
      },
    });
  }

  // Post count stat
  facts.push({
    category: "stat",
    key: "rss-posts",
    value: { label: "Blog posts", value: String(feed.items.length) },
  });

  return facts;
}

export function mapRssEvents(items: RssFeedItem[]): EpisodicEventInput[] {
  return items.map((item) => {
    const guidHash = hashGuid(item.guid || item.link);
    // Safe date parsing — real RSS feeds frequently have malformed/missing dates
    const now = Date.now();
    let pubUnix = Math.floor(now / 1000);
    let pubHuman = new Date(now).toISOString();
    if (item.pubDate) {
      const parsed = new Date(item.pubDate);
      if (Number.isFinite(parsed.getTime())) {
        pubUnix = Math.floor(parsed.getTime() / 1000);
        pubHuman = parsed.toISOString();
      }
      // else: invalid date → fall back to "now"
    }

    return {
      externalId: `rss-post-${guidHash}`,
      eventAtUnix: pubUnix,
      eventAtHuman: pubHuman,
      actionType: "writing",
      narrativeSummary: `Published: ${item.title}`,
      entities: item.categories.length > 0 ? item.categories : undefined,
    };
  });
}

function hashGuid(guid: string): string {
  return createHash("sha256").update(guid).digest("hex").slice(0, 12);
}
```

- [ ] **Step 4: Run tests — verify they pass**

- [ ] **Step 5: Commit**

```bash
git add src/lib/connectors/rss/mapper.ts tests/evals/rss-mapper.test.ts
git commit -m "feat: RSS mapper — feed → facts + items → episodic events"
```

---

### Task 11: RSS Sync Orchestration + Definition + UI

**Files:**
- Create: `src/lib/connectors/rss/sync.ts`
- Create: `src/lib/connectors/rss/definition.ts`
- Create: `src/lib/connectors/rss/ui.ts`
- Modify: `src/lib/connectors/register-all.ts` (register RSS)
- Modify: `src/lib/connectors/ui-registry.ts` (register RSS UI)
- Test: `tests/evals/rss-sync.test.ts`

- [ ] **Step 1: Write failing test for syncRss**

```typescript
// tests/evals/rss-sync.test.ts — pattern follows github-sync.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetCreds = vi.fn();
const mockUpdateStatus = vi.fn();
vi.mock("@/lib/connectors/connector-service", () => ({
  getConnectorWithCredentials: (...args: any[]) => mockGetCreds(...args),
  updateConnectorStatus: (...args: any[]) => mockUpdateStatus(...args),
}));

const mockBatchCreateFacts = vi.fn().mockResolvedValue({ factsWritten: 3, factsSkipped: 0, errors: [] });
vi.mock("@/lib/connectors/connector-fact-writer", () => ({
  batchCreateFacts: (...args: any[]) => mockBatchCreateFacts(...args),
}));

const mockBatchRecordEvents = vi.fn().mockResolvedValue({ eventsWritten: 2, eventsSkipped: 0, errors: [] });
vi.mock("@/lib/connectors/connector-event-writer", () => ({
  batchRecordEvents: (...args: any[]) => mockBatchRecordEvents(...args),
}));

vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScopeForWorker: () => ({
    cognitiveOwnerKey: "owner1",
    knowledgePrimaryKey: "kpk1",
    knowledgeReadKeys: undefined,
  }),
}));

vi.mock("@/lib/services/page-service", () => ({
  getDraft: () => ({ username: "testuser" }),
}));

vi.mock("@/lib/services/preferences-service", () => ({
  getFactLanguage: () => "en",
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { syncRss } from "@/lib/connectors/rss/sync";

describe("syncRss", () => {
  beforeEach(() => vi.clearAllMocks());

  it("first sync creates facts but no events (baseline)", async () => {
    mockGetCreds.mockReturnValue({
      decryptedCredentials: { feed_url: "https://example.com/feed" },
    });

    // Mock must match streaming implementation: response.body.getReader()
    const feedXml = `<?xml version="1.0"?>
        <rss version="2.0"><channel><title>Blog</title><link>https://example.com</link>
        <item><title>Post</title><link>https://example.com/1</link>
        <pubDate>Mon, 10 Mar 2026 12:00:00 GMT</pubDate><guid>p1</guid></item>
        </channel></rss>`;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(ctrl) { ctrl.enqueue(encoder.encode(feedXml)); ctrl.close(); },
    });
    mockFetch.mockResolvedValue({
      ok: true, status: 200,
      headers: new Map([["content-type", "application/xml"]]),
      body: stream,
    });

    const result = await syncRss("conn1", "owner1");
    expect(result.error).toBeUndefined();
    expect(mockBatchCreateFacts).toHaveBeenCalledOnce();
    // First sync = baseline: events are NOT emitted (seeded in connector_items only)
    expect(result.eventsCreated).toBe(0);
  });

  it("returns error when feed fetch fails", async () => {
    mockGetCreds.mockReturnValue({
      decryptedCredentials: { feed_url: "https://example.com/feed" },
    });
    mockFetch.mockRejectedValue(new Error("Network error"));

    const result = await syncRss("conn1", "owner1");
    expect(result.error).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

- [ ] **Step 3: Implement sync.ts**

```typescript
// src/lib/connectors/rss/sync.ts
import { getConnectorWithCredentials, updateConnectorStatus } from "../connector-service";
import { batchCreateFacts } from "../connector-fact-writer";
import { batchRecordEvents } from "../connector-event-writer";
import { resolveOwnerScopeForWorker } from "@/lib/auth/session";
import { getDraft } from "@/lib/services/page-service";
import { getFactLanguage } from "@/lib/services/preferences-service";
import { parseRssFeed } from "./parser";
import { mapRssFeed, mapRssEvents } from "./mapper";
import { validateRssUrl, validateResolvedIp, RSS_MAX_ITEMS_PER_SYNC, RSS_FETCH_TIMEOUT_MS, RSS_MAX_RESPONSE_BYTES } from "./url-validator";
import type { SyncResult } from "../types";
import { db } from "@/lib/db";
import { connectors } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function syncRss(
  connectorId: string,
  ownerKey: string,
): Promise<SyncResult> {
  const connector = getConnectorWithCredentials(connectorId);
  if (!connector?.decryptedCredentials) {
    return { factsCreated: 0, factsUpdated: 0, eventsCreated: 0, error: "No credentials" };
  }

  const creds =
    typeof connector.decryptedCredentials === "string"
      ? JSON.parse(connector.decryptedCredentials)
      : connector.decryptedCredentials;
  const feedUrl = creds.feed_url as string;

  // SSRF validation
  const validation = validateRssUrl(feedUrl);
  if (!validation.valid) {
    return { factsCreated: 0, factsUpdated: 0, eventsCreated: 0, error: `Invalid feed URL: ${validation.error}` };
  }

  const scope = resolveOwnerScopeForWorker(ownerKey);
  const factLanguage = getFactLanguage(scope.knowledgePrimaryKey) ?? "en";
  const existingDraft = getDraft(scope.knowledgePrimaryKey);
  const username = existingDraft?.username ?? "user";

  try {
    // DNS resolution check — catches DNS rebinding to private IPs
    const dnsCheck = await validateResolvedIp(new URL(feedUrl).hostname);
    if (!dnsCheck.valid) {
      return { factsCreated: 0, factsUpdated: 0, eventsCreated: 0, error: dnsCheck.error };
    }

    // Fetch with timeout + manual redirect following (per-hop SSRF validation)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RSS_FETCH_TIMEOUT_MS);

    let currentUrl = feedUrl;
    let response: Response;
    const MAX_REDIRECTS = 3;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      response = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: "manual",  // Follow redirects manually to validate each hop
        headers: { "User-Agent": "OpenSelf/1.0 RSS Connector" },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || hop === MAX_REDIRECTS) {
          clearTimeout(timeout);
          return { factsCreated: 0, factsUpdated: 0, eventsCreated: 0, error: "Too many redirects" };
        }
        // Validate redirect target for SSRF
        const redirectUrl = new URL(location, currentUrl).toString();
        const redirectValidation = validateRssUrl(redirectUrl);
        if (!redirectValidation.valid) {
          clearTimeout(timeout);
          return { factsCreated: 0, factsUpdated: 0, eventsCreated: 0, error: `Redirect blocked: ${redirectValidation.error}` };
        }
        const redirectDns = await validateResolvedIp(new URL(redirectUrl).hostname);
        if (!redirectDns.valid) {
          clearTimeout(timeout);
          return { factsCreated: 0, factsUpdated: 0, eventsCreated: 0, error: redirectDns.error };
        }
        currentUrl = redirectUrl;
        continue;
      }
      break;
    }
    clearTimeout(timeout);

    if (!response!.ok) {
      return { factsCreated: 0, factsUpdated: 0, eventsCreated: 0, error: `Feed returned ${response!.status}` };
    }

    // Stream body with size enforcement (don't buffer entire response before checking)
    const reader = response!.body?.getReader();
    if (!reader) {
      return { factsCreated: 0, factsUpdated: 0, eventsCreated: 0, error: "No response body" };
    }
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > RSS_MAX_RESPONSE_BYTES) {
        reader.cancel();
        return { factsCreated: 0, factsUpdated: 0, eventsCreated: 0, error: "Feed response too large" };
      }
      chunks.push(value);
    }
    const xml = new TextDecoder().decode(Buffer.concat(chunks));

    const feed = parseRssFeed(xml);

    // Treat empty/unparseable feed as error — don't write bogus facts or mark as healthy
    if (feed.items.length === 0 && !feed.title) {
      return { factsCreated: 0, factsUpdated: 0, eventsCreated: 0, error: "Could not parse feed — not a valid RSS/Atom response" };
    }

    // Limit items
    const limitedItems = feed.items.slice(0, RSS_MAX_ITEMS_PER_SYNC);
    feed.items = limitedItems;

    // Map to facts
    const facts = mapRssFeed(feed, feedUrl);
    const report = await batchCreateFacts(facts, scope, username, factLanguage);

    // Map to episodic events — FIRST-SYNC BASELINE: no events on first sync
    // Check lastSync: if null, this is first sync → seed connector_items for event
    // dedup but don't emit episodic events. Events only on subsequent syncs.
    const connectorRow = db.select({ lastSync: connectors.lastSync })
      .from(connectors).where(eq(connectors.id, connectorId)).get();
    const isFirstSync = !connectorRow?.lastSync;

    const events = mapRssEvents(limitedItems);

    let eventReport;
    if (isFirstSync) {
      // Seed connector_items for event dedup WITHOUT creating episodic events
      // This ensures the second sync correctly skips already-seen items
      for (const event of events) {
        sqlite.prepare(`
          INSERT OR IGNORE INTO connector_items (id, connector_id, external_id, event_id, last_seen_at)
          VALUES (?, ?, ?, 'baseline-seed', datetime('now'))
        `).run(randomUUID(), connectorId, event.externalId);
      }
      eventReport = { eventsWritten: 0, eventsSkipped: events.length, errors: [] };
    } else {
      eventReport = await batchRecordEvents(events, {
      ownerKey,
      connectorId,
      connectorType: "rss",
      sessionId: scope.knowledgePrimaryKey,
    });
    }

    // Update sync cursor
    db.update(connectors)
      .set({
        lastSync: new Date().toISOString(),
        syncCursor: limitedItems[0]?.pubDate ?? null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(connectors.id, connectorId))
      .run();

    return {
      factsCreated: report.factsWritten,
      factsUpdated: 0,
      eventsCreated: eventReport.eventsWritten,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { factsCreated: 0, factsUpdated: 0, eventsCreated: 0, error: message };
  }
}
```

- [ ] **Step 4: Create definition.ts and ui.ts**

```typescript
// src/lib/connectors/rss/definition.ts
import type { ConnectorDefinition } from "../types";
import { syncRss } from "./sync";

export const rssDefinition: ConnectorDefinition = {
  type: "rss",
  displayName: "RSS / Blog",
  supportsSync: true,
  supportsImport: false,
  syncFn: syncRss,
};
```

```typescript
// src/lib/connectors/rss/ui.ts
import type { ConnectorUIDefinition } from "../types";

export const RssUIDefinition: ConnectorUIDefinition = {
  id: "rss",
  displayName: "Blog / RSS",
  description: "Import posts from any RSS or Atom feed",
  authType: "url_input",
  syncUrl: "/api/connectors/rss/sync",
  disconnectUrl: "/api/connectors/{id}/disconnect",  // Uses generic disconnect route
};
```

- [ ] **Step 5: Register in both registries**

In `src/lib/connectors/register-all.ts` (NOT `registry.ts` — `register-all.ts` is the runtime bootstrap), add:
```typescript
import { rssDefinition } from "./rss/definition";
registerConnector(rssDefinition);
```

In `src/lib/connectors/ui-registry.ts`, add:
```typescript
import { RssUIDefinition } from "./rss/ui";
registerConnectorUI(RssUIDefinition);
```

- [ ] **Step 6: Run tests — verify they pass**

```bash
npx vitest run tests/evals/rss-sync.test.ts
# Expected: PASS
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/connectors/rss/ src/lib/connectors/registry.ts src/lib/connectors/ui-registry.ts tests/evals/rss-sync.test.ts
git commit -m "feat: RSS connector — sync, parser, mapper, URL validator, registration"
```

---

### Task 12: RSS API Routes

**Files:**
- Create: `src/app/api/connectors/rss/subscribe/route.ts`
- Create: `src/app/api/connectors/rss/sync/route.ts`
- (Disconnect uses existing generic `src/app/api/connectors/[id]/disconnect/route.ts`)

- [ ] **Step 1: Implement subscribe route**

```typescript
// src/app/api/connectors/rss/subscribe/route.ts
import { NextResponse } from "next/server";
import { resolveAuthenticatedConnectorScope } from "@/lib/connectors/route-auth";
import { createConnector, getActiveConnectors } from "@/lib/connectors/connector-service";
import { validateRssUrl, RSS_MAX_FEEDS_PER_USER } from "@/lib/connectors/rss/url-validator";
import { enqueueJob } from "@/lib/worker/index";

export async function POST(request: Request) {
  const scope = resolveAuthenticatedConnectorScope(request);
  if (!scope) return NextResponse.json({ error: "Auth required" }, { status: 403 });

  const body = await request.json();
  const feedUrl = body.url as string;
  if (!feedUrl) return NextResponse.json({ error: "url is required" }, { status: 400 });

  // SSRF validation
  const validation = validateRssUrl(feedUrl);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  // One RSS feed per user (connector table unique constraint: owner_key + connector_type)
  // createConnector() does upsert — a second subscribe replaces the previous feed URL
  // When URL changes, must reset sync state and connector_items to avoid mixing old/new data

  try {
    // DNS resolution check at subscribe time (not just at sync time)
    const { validateResolvedIp } = await import("@/lib/connectors/rss/url-validator");
    const dnsCheck = await validateResolvedIp(new URL(feedUrl).hostname);
    if (!dnsCheck.valid) {
      return NextResponse.json({ error: dnsCheck.error }, { status: 400 });
    }

    // Check if URL actually changed before resetting state
    // Use getConnectorsByOwner (not getActiveConnectors which excludes disconnected)
    // then getConnectorWithCredentials to decrypt and compare feed_url
    const existingRows = getConnectorsByOwner(scope.cognitiveOwnerKey)
      .filter((c) => c.connectorType === "rss");
    let urlChanged = true;
    if (existingRows.length > 0) {
      const existing = getConnectorWithCredentials(existingRows[0].id);
      const oldCreds = typeof existing?.decryptedCredentials === "string"
        ? JSON.parse(existing.decryptedCredentials) : existing?.decryptedCredentials;
      urlChanged = oldCreds?.feed_url !== feedUrl;
    }

    const connector = await createConnector(scope.cognitiveOwnerKey, "rss", { feed_url: feedUrl }, {});

    if (urlChanged && existingRows.length > 0) {
      // URL changed: reset sync state + delete stale connector_items + old RSS facts
      db.update(connectors)
        .set({ syncCursor: null, lastSync: null, updatedAt: new Date().toISOString() })
        .where(eq(connectors.id, connector.id))
        .run();
      db.delete(connectorItems)
        .where(eq(connectorItems.connectorId, connector.id))
        .run();
      // Delete old RSS facts (facts use profile_id which matches cognitiveOwnerKey for
      // connector-written facts — see connector-fact-writer.ts line 45)
      sqlite.prepare(`
        DELETE FROM facts WHERE profile_id = ? AND key LIKE 'rss-%'
      `).run(scope.cognitiveOwnerKey);
    }

    enqueueJob("connector_sync", { ownerKey: scope.cognitiveOwnerKey });
    return NextResponse.json({ success: true, message: "Feed subscribed" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Subscribe failed" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Implement sync route** (follows pattern of `github/sync/route.ts`)

```typescript
// src/app/api/connectors/rss/sync/route.ts
// Same pattern as github/sync/route.ts — auth check, idempotency, rate limit, enqueue
// IMPORTANT: Unlike GitHub, RSS sync route must accept BOTH 'connected' AND 'error'
// status connectors (to support "Retry Sync" from UI error state).
// Check: connector.status IN ('connected', 'error')
//
// MANUAL SYNC: Pass connectorId in the job payload so handleConnectorSync() only
// runs this specific connector, not all active connectors for the owner.
// enqueueJob("connector_sync", { ownerKey, connectorId: connector.id })
// handleConnectorSync must check: if payload.connectorId exists, only sync that one
// connector; otherwise fan-out to all active connectors (scheduler path).
```

- [ ] **Step 3: Implement disconnect route** (follows pattern of `[id]/disconnect/route.ts`)

Use the existing `src/app/api/connectors/[id]/disconnect/route.ts` — it already works for any connector type. No new file needed.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/connectors/rss/
git commit -m "feat: RSS API routes — subscribe, sync"
```

---

## Chunk 3: GitHub + LinkedIn Retrofit

### Task 13: GitHub episodic events on new repos

**Files:**
- Modify: `src/lib/connectors/github/sync.ts`
- Test: `tests/evals/github-sync.test.ts` (extend)

- [ ] **Step 1: Write failing test**

Add to `tests/evals/github-sync.test.ts`:

```typescript
it("first sync is baseline — no episodic events", async () => {
  // Setup: connector with lastSync = null (first sync)
  mockGetConnectorWithCredentials.mockReturnValue({ decryptedCredentials: { access_token: "tok" } });
  // Mock connector row with no lastSync
  mockDbSelect.mockReturnValue({ lastSync: null });
  // ... setup fetchProfile, fetchRepos mocks with 2 repos

  const result = await syncGitHub("conn1", "owner1");

  // First sync = baseline: no events emitted
  expect(result.eventsCreated).toBe(0);
});

it("subsequent sync creates episodic events for truly new repos", async () => {
  // Setup: connector with lastSync set (not first sync)
  mockGetConnectorWithCredentials.mockReturnValue({ decryptedCredentials: { access_token: "tok" } });
  mockDbSelect.mockReturnValue({ lastSync: "2026-03-10T00:00:00Z" });
  // ... setup fetchProfile, fetchRepos mocks with 2 repos (1 known, 1 new)

  await syncGitHub("conn1", "owner1");

  // Subsequent sync: events emitted for new repos only
  expect(mockBatchRecordEvents).toHaveBeenCalledOnce();
  const events = mockBatchRecordEvents.mock.calls[0][0];
  expect(events.length).toBe(1); // Only the new repo
  expect(events[0].actionType).toBe("work");
  expect(events[0].externalId).toMatch(/^repo-/);
});
```

- [ ] **Step 2: Run test — verify it fails**

- [ ] **Step 3: Add event generation to syncGitHub**

In `src/lib/connectors/github/sync.ts`, after the `batchCreateFacts()` call (line ~76) and before provenance recording:

```typescript
import { batchRecordEvents } from "../connector-event-writer";

// ... after batchCreateFacts, before provenance recording:

// Detect new repos for episodic events
// IMPORTANT: First sync = baseline (no events). Use connector.lastSync to detect,
// NOT connector_items count — partial failure on first sync would leave some
// connector_items rows, causing the next run to emit false "Created" events
// for the remaining repos.
const connectorRow = db.select({ lastSync: connectors.lastSync })
  .from(connectors)
  .where(eq(connectors.id, connectorId))
  .get();
const isFirstSync = !connectorRow?.lastSync;

const existingExternalIds = new Set(
  db.select({ externalId: connectorItems.externalId })
    .from(connectorItems)
    .where(eq(connectorItems.connectorId, connectorId))
    .all()
    .map((r) => r.externalId),
);
const newRepoEvents = isFirstSync
  ? [] // First sync = baseline, no events
  : repos
      .filter((r) => !r.fork && !existingExternalIds.has(r.node_id))
      .map((repo) => ({
        externalId: `repo-${repo.node_id}`,
        eventAtUnix: Math.floor(Date.now() / 1000), // Use current time, not pushed_at
        eventAtHuman: new Date().toISOString(),
        actionType: "work" as const,
        narrativeSummary: `Created new repository: ${repo.name}${repo.description ? ` — ${repo.description}` : ""}`,
        entities: languagesByRepo.get(repo.full_name) ? Object.keys(languagesByRepo.get(repo.full_name)!) : [],
      }));

const eventReport = await batchRecordEvents(newRepoEvents, {
  ownerKey,
  connectorId,
  connectorType: "github",
  sessionId: scope.knowledgePrimaryKey,
});
```

Update the return statement to include `eventsCreated: eventReport.eventsWritten`.

**Also update:** The existing GitHub sync route (`src/app/api/connectors/github/sync/route.ts` line ~33) must pass `connectorId` in the enqueue payload: `enqueueJob("connector_sync", { ownerKey, connectorId: connector.id })`. This aligns with the new connector-scoped manual sync model from Task 7.

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run tests/evals/github-sync.test.ts
# Expected: ALL PASS (existing + new)
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/connectors/github/sync.ts tests/evals/github-sync.test.ts
git commit -m "feat: GitHub retrofit — episodic events for new repos"
```

---

### Task 14: LinkedIn episodic event on import

**Files:**
- Modify: `src/lib/connectors/linkedin-zip/import.ts`
- Test: `tests/evals/linkedin-zip-import.test.ts` (extend)

- [ ] **Step 1: Write failing test**

```typescript
it("creates milestone episodic event on import", async () => {
  // Setup mocks for a ZIP with positions and skills
  // ... (follow existing test pattern)

  const report = await importLinkedInZip(zipBuffer, scope, "testuser", "en");

  // Verify insertEvent was called directly (no connector row needed)
  expect(mockInsertEvent).toHaveBeenCalledOnce();
  expect(mockInsertEvent).toHaveBeenCalledWith(expect.objectContaining({
    actionType: "milestone",
    source: "linkedin_zip",
    narrativeSummary: expect.stringContaining("Imported LinkedIn profile"),
  }));
});
```

- [ ] **Step 2: Run test — verify it fails**

- [ ] **Step 3: Add import event to importLinkedInZip**

At the end of `importLinkedInZip()` in `src/lib/connectors/linkedin-zip/import.ts`, after `batchCreateFacts()` returns. Uses `insertEvent()` directly — no connector row or `batchRecordEvents` needed for a one-shot import:

```typescript
import { insertEvent } from "@/lib/services/episodic-service";

// After batchCreateFacts returns report:

// Single milestone event for the import
const positionCount = allFacts.filter((f) => f.category === "experience").length;
const skillCount = allFacts.filter((f) => f.category === "skill").length;
const certCount = allFacts.filter((f) => f.category === "achievement").length;

if (report.factsWritten > 0) {
  insertEvent({
    ownerKey: scope.cognitiveOwnerKey,
    sessionId: scope.knowledgePrimaryKey,
    eventAtUnix: Math.floor(Date.now() / 1000),
    eventAtHuman: new Date().toISOString(),
    actionType: "milestone",
    narrativeSummary: `Imported LinkedIn profile: ${positionCount} positions, ${skillCount} skills, ${certCount} certifications`,
    entities: [],
    source: "linkedin_zip",
  });
}
```

No `connectorId` parameter needed. No `createConnector()` call needed. No signature change to `importLinkedInZip()`.

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run tests/evals/linkedin-zip-import.test.ts
# Expected: ALL PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/connectors/linkedin-zip/import.ts tests/evals/linkedin-zip-import.test.ts
git commit -m "feat: LinkedIn retrofit — milestone episodic event on ZIP import"
```

---

## Chunk 4: Spotify + Strava Connectors

### Task 15: Spotify API Client

**Files:**
- Create: `src/lib/connectors/spotify/client.ts`
- Test: `tests/evals/spotify-client.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/evals/spotify-client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { fetchSpotifyProfile, fetchTopArtists, fetchTopTracks, SpotifyAuthError } from "@/lib/connectors/spotify/client";

describe("Spotify client", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches profile", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "user1", display_name: "Test", external_urls: { spotify: "https://open.spotify.com/user/user1" } }),
    });
    const profile = await fetchSpotifyProfile("token1");
    expect(profile.id).toBe("user1");
  });

  it("throws SpotifyAuthError on 401", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 });
    await expect(fetchSpotifyProfile("bad-token")).rejects.toThrow(SpotifyAuthError);
  });

  it("fetches top artists", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [{ id: "a1", name: "Artist 1", genres: ["indie"], external_urls: { spotify: "url" } }],
      }),
    });
    const artists = await fetchTopArtists("token1", "medium_term");
    expect(artists).toHaveLength(1);
    expect(artists[0].name).toBe("Artist 1");
  });
});
```

- [ ] **Step 2: Implement client.ts**

```typescript
// src/lib/connectors/spotify/client.ts
const BASE_URL = "https://api.spotify.com/v1";

// Re-use the shared TokenExpiredError so withTokenRefresh() catches it
import { TokenExpiredError } from "../token-refresh";

// Legacy alias for backward compat (tests, etc.)
export const SpotifyAuthError = TokenExpiredError;

export type SpotifyProfile = {
  id: string;
  display_name: string | null;
  external_urls: { spotify: string };
};

export type SpotifyArtist = {
  id: string;
  name: string;
  genres: string[];
  external_urls: { spotify: string };
};

export type SpotifyTrack = {
  id: string;
  name: string;
  artists: Array<{ id: string; name: string }>;
  external_urls: { spotify: string };
};

async function spotifyFetch(url: string, token: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new TokenExpiredError();
  if (!res.ok) throw new Error(`Spotify API ${res.status}: ${url}`);
  return res;
}

export async function fetchSpotifyProfile(token: string): Promise<SpotifyProfile> {
  const res = await spotifyFetch(`${BASE_URL}/me`, token);
  return res.json();
}

export async function fetchTopArtists(token: string, timeRange: string, limit = 10): Promise<SpotifyArtist[]> {
  const res = await spotifyFetch(`${BASE_URL}/me/top/artists?time_range=${timeRange}&limit=${limit}`, token);
  const data = await res.json();
  return data.items ?? [];
}

export async function fetchTopTracks(token: string, timeRange: string, limit = 10): Promise<SpotifyTrack[]> {
  const res = await spotifyFetch(`${BASE_URL}/me/top/tracks?time_range=${timeRange}&limit=${limit}`, token);
  const data = await res.json();
  return data.items ?? [];
}

export async function refreshSpotifyToken(refreshToken: string): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.SPOTIFY_CLIENT_ID!,
      client_secret: process.env.SPOTIFY_CLIENT_SECRET!,
    }),
  });
  // Only throw TokenExpiredError for real auth failures (401, 400 invalid_grant)
  // 429/5xx are transient — let them propagate as generic errors for retry
  if (res.status === 401 || (res.status === 400 && (await res.text()).includes("invalid_grant"))) {
    throw new TokenExpiredError();
  }
  if (!res.ok) throw new Error(`Spotify token refresh failed: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 3: Run tests, commit**

```bash
npx vitest run tests/evals/spotify-client.test.ts
git add src/lib/connectors/spotify/ tests/evals/spotify-client.test.ts
git commit -m "feat: Spotify API client — profile, top artists/tracks, token refresh"
```

---

### Task 16: Spotify Mapper + Sync + Definition + UI + Routes

**Files:**
- Create: `src/lib/connectors/spotify/mapper.ts`
- Create: `src/lib/connectors/spotify/sync.ts`
- Create: `src/lib/connectors/spotify/definition.ts`
- Create: `src/lib/connectors/spotify/ui.ts`
- Create: `src/app/api/connectors/spotify/connect/route.ts`
- Create: `src/app/api/auth/spotify/callback/connector/route.ts`
- Create: `src/app/api/connectors/spotify/sync/route.ts`
- Modify: `src/lib/connectors/register-all.ts`
- Modify: `src/lib/connectors/ui-registry.ts`
- Test: `tests/evals/spotify-mapper.test.ts`
- Test: `tests/evals/spotify-sync.test.ts`

This task follows the same pattern as RSS (Tasks 9-12). Key differences:

- [ ] **Step 1: Mapper** — `mapSpotifyProfile()`, `mapSpotifyTopArtists()`, `mapSpotifyTopTracks()`, `mapSpotifyGenres()` → FactInput[]
  - Keys: `sp-profile`, `sp-artist-{id}`, `sp-track-{id}`, `sp-genre-{slug}`
  - Taste shift event: compare `short_term` top-5 artists with previous (from `syncCursor` JSON)

- [ ] **Step 2: Sync** — `syncSpotify()` uses `withTokenRefresh()` from Task 6. Fetches `medium_term` top artists/tracks. Detects taste shift by comparing `short_term` top-5 with stored `syncCursor`. If ≥3/5 changed → episodic event `action_type: "music"`. **First-sync baseline rule:** when `syncCursor` is null (first sync), store the current top-5 snapshot in `syncCursor` and emit NO taste-shift event. The first comparison only happens on the second sync.

- [ ] **Step 3: OAuth routes** — Follow GitHub OAuth pattern. Spotify OAuth URL: `https://accounts.spotify.com/authorize`. Scopes: `user-top-read user-read-recently-played`. Callback stores `access_token`, `refresh_token`, `expires_in` in encrypted credentials.

- [ ] **Step 4: Definition + UI + Registration**

- [ ] **Step 5: Tests for mapper and sync (following github-sync.test.ts pattern)**

- [ ] **Step 6: Commit**

```bash
git add src/lib/connectors/spotify/ src/app/api/connectors/spotify/ src/app/api/auth/spotify/
git commit -m "feat: Spotify connector — OAuth, top artists/tracks/genres, taste shift events"
```

---

### Task 17: Strava API Client

**Files:**
- Create: `src/lib/connectors/strava/client.ts`
- Test: `tests/evals/strava-client.test.ts`

Same pattern as Spotify client. Key endpoints:
- `GET https://www.strava.com/api/v3/athlete` — profile
- `GET https://www.strava.com/api/v3/athlete/activities?after={cursor}&per_page=50` — activities (paginated)
- `GET https://www.strava.com/api/v3/athletes/{id}/stats` — aggregate stats
- Token refresh: `POST https://www.strava.com/oauth/token` with `grant_type=refresh_token`

**IMPORTANT:** Strava client MUST throw the shared `TokenExpiredError` (from `../token-refresh`) on 401, NOT a custom error class. This ensures `withTokenRefresh()` catches it correctly. Same pattern as Spotify.

**Pagination:** The activities endpoint must paginate until fewer than `per_page` results are returned:

```typescript
export async function fetchAllActivities(
  token: string, after?: number, perPage = 50,
): Promise<StravaActivity[]> {
  const all: StravaActivity[] = [];
  let page = 1;
  while (true) {
    const params = new URLSearchParams({ per_page: String(perPage), page: String(page) });
    if (after) params.set("after", String(after));
    const res = await stravaFetch(`${BASE_URL}/athlete/activities?${params}`, token);
    const batch: StravaActivity[] = await res.json();
    all.push(...batch);
    if (batch.length < perPage) break;
    page++;
  }
  return all;
}
```

- [ ] **Step 1: Implement client with types (StravaProfile, StravaActivity, StravaStats) + pagination**
- [ ] **Step 2: Write tests (including pagination: 2 pages then empty)**
- [ ] **Step 3: Commit**

---

### Task 18: Strava Mapper + Sync + Definition + UI + Routes

**Files:**
- Create: `src/lib/connectors/strava/mapper.ts`
- Create: `src/lib/connectors/strava/sync.ts`
- Create: `src/lib/connectors/strava/definition.ts`
- Create: `src/lib/connectors/strava/ui.ts`
- Create: `src/app/api/connectors/strava/connect/route.ts`
- Create: `src/app/api/auth/strava/callback/connector/route.ts`
- Create: `src/app/api/connectors/strava/sync/route.ts`
- Modify: `src/lib/connectors/register-all.ts`
- Modify: `src/lib/connectors/ui-registry.ts`
- Test: `tests/evals/strava-mapper.test.ts`
- Test: `tests/evals/strava-sync.test.ts`

Key differences from Spotify:

- [ ] **Step 1: Mapper** — `mapStravaProfile()`, `mapStravaActivities()`, `mapStravaStats()` → FactInput[]
  - Keys: `strava-profile`, `strava-{sport-slug}`, `strava-distance`, `strava-activities`, `strava-time`
  - Per-activity event: `action_type: "workout"`, narrative: `"Completed a {distance}km {sport} in {duration}"`
  - PR event: `action_type: "milestone"` when `activity.pr_count > 0`
  - externalId: `activity-{stravaId}` and `pr-{stravaId}`

- [ ] **Step 2: Sync** — `syncStrava()` uses `withTokenRefresh()`. Incremental via `?after={syncCursor}`. Aggregates sport types into activity facts, stats from `/athletes/{id}/stats`. **First-sync baseline rule:** when `syncCursor` is null (first sync), fetch activities but do NOT emit per-activity or PR episodic events — only record facts. Store the max activity timestamp as `syncCursor`. Per-activity/PR events only start on the second and subsequent syncs (same pattern as GitHub baseline).

- [ ] **Step 3: OAuth routes** — Strava OAuth URL: `https://www.strava.com/oauth/authorize`. Scopes: `read,activity:read_all`. Callback stores tokens in encrypted credentials.

- [ ] **Step 4: Definition + UI + Registration**

- [ ] **Step 5: Tests**

- [ ] **Step 6: Commit**

```bash
git add src/lib/connectors/strava/ src/app/api/connectors/strava/ src/app/api/auth/strava/
git commit -m "feat: Strava connector — OAuth, activities, stats, workout/milestone events"
```

---

## Chunk 5: Integration

### Task 19: Scheduler — daily connector sync

**Files:**
- Modify: `src/lib/worker/scheduler.ts:85-128`
- Test: `tests/evals/scheduler.test.ts` (extend)

- [ ] **Step 1: Write failing test**

```typescript
it("enqueues connector_sync for owners with active connectors", async () => {
  mockGetActiveOwnerKeys.mockReturnValue(["owner1"]);
  mockGetHeartbeatConfig.mockReturnValue({ enabled: true, timezone: "UTC" });
  mockGetLocalHour.mockReturnValue(4); // After 3 AM
  mockHasRunToday.mockReturnValue(false);
  mockGetActiveConnectors.mockReturnValue([{ id: "c1", connectorType: "github" }]);
  mockHasPendingJob.mockReturnValue(false);

  await runSchedulerTick();

  expect(mockEnqueueJob).toHaveBeenCalledWith("connector_sync", expect.objectContaining({ ownerKey: "owner1" }));
});
```

- [ ] **Step 2: Extend owner discovery to include connector-only owners**

`getActiveOwnerKeys()` in `scheduler.ts` currently queries profiles/sessions. Owners who ONLY have connectors (no recent chat activity) would be missed. Add a union query:

```typescript
// In scheduler.ts — extend getActiveOwnerKeys() or add after it:
import { getActiveConnectors } from "@/lib/connectors/connector-service";
import { hasPendingJob } from "@/lib/connectors/idempotency";

// After getActiveOwnerKeys(), merge in connector-only owners:
// NOTE: status enum is 'connected' | 'paused' | 'error' | 'disconnected' (NOT 'active')
// Reuse the same predicate as getActiveConnectors(): status IN ('connected','error') AND enabled = 1
const connectorOwnerRows = sqlite
  .prepare(`SELECT DISTINCT owner_key FROM connectors WHERE status IN ('connected','error')`)
  .all() as Array<{ owner_key: string }>;
const allOwnerKeys = [...new Set([
  ...activeOwnerKeys,
  ...connectorOwnerRows.map((r) => r.owner_key),
])];
```

Then iterate `allOwnerKeys` instead of `activeOwnerKeys` in the scheduler loop. Ideally, add this union into the shared helper at `heartbeat-config-service.ts` rather than as bespoke SQL in `scheduler.ts`, so future callers get the same behavior.

- [ ] **Step 3: Add connector sync dispatch after light heartbeat enqueue**

**IMPORTANT:** Connector-only owners must NOT be fed through the heartbeat loop (they'd be implicitly opted into heartbeat_light). Instead, add a SEPARATE loop after the heartbeat loop:

```typescript
// === HEARTBEAT LOOP (existing, unchanged) ===
for (const ownerKey of activeOwnerKeys) {
  // ... existing heartbeat_light/deep logic ...
}

// === CONNECTOR SYNC LOOP (new, separate) ===
// Uses allOwnerKeys (which includes connector-only owners)
for (const ownerKey of allOwnerKeys) {
  const activeConns = getActiveConnectors(ownerKey);
  if (activeConns.length === 0) continue;

  // Connector-specific once-per-day guard: check each connector's lastSync
  // against owner-local day (not UTC) to avoid timezone-boundary double/skip runs
  const tz = getHeartbeatConfig(ownerKey)?.timezone ?? "UTC";
  const ownerToday = computeOwnerDay(tz); // returns YYYY-MM-DD in owner's timezone
  const allSyncedToday = activeConns.every((c) => {
    if (!c.lastSync) return false; // Never synced → needs sync
    const lastSyncDay = computeOwnerDay(tz, new Date(c.lastSync));
    return lastSyncDay === ownerToday;
  });
  if (allSyncedToday) continue; // All connectors already synced today

  // Concurrency guard: don't double-enqueue
  if (hasPendingJob(ownerKey)) continue;

  enqueueJob("connector_sync", { ownerKey, ownerDay: dayKey(tz) });
}
```

This ensures: (a) connector-only owners don't trigger heartbeat, (b) sync runs exactly once per day per owner, (c) `hasPendingJob` only guards concurrency, not daily logic.

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/evals/scheduler.test.ts
# Expected: ALL PASS
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/worker/scheduler.ts tests/evals/scheduler.test.ts
git commit -m "feat: daily connector sync — piggybacks on heartbeat_light scheduler"
```

---

### Task 20: Magic Paste — pattern matchers for new connectors

**Files:**
- Modify: `src/lib/connectors/magic-paste.ts`
- Test: `tests/evals/magic-paste.test.ts` (extend or create)

- [ ] **Step 1: Write failing tests**

```typescript
import { detectConnectorUrls } from "@/lib/connectors/magic-paste";

it("detects Spotify profile URL", () => {
  const result = detectConnectorUrls("Check my music at https://open.spotify.com/user/myuser");
  expect(result).toContainEqual({ connectorId: "spotify", url: expect.stringContaining("spotify.com") });
});

it("detects Strava athlete URL", () => {
  const result = detectConnectorUrls("My runs: https://www.strava.com/athletes/12345");
  expect(result).toContainEqual({ connectorId: "strava", url: expect.stringContaining("strava.com") });
});

it("detects RSS feed URLs", () => {
  const result = detectConnectorUrls("My blog: https://example.com/feed");
  expect(result).toContainEqual({ connectorId: "rss", url: expect.stringContaining("/feed") });
});

it("detects Substack URLs", () => {
  const result = detectConnectorUrls("Read me at https://myname.substack.com");
  expect(result).toContainEqual({ connectorId: "rss", url: expect.stringContaining("substack.com") });
});

it("detects Medium URLs", () => {
  const result = detectConnectorUrls("My articles: https://medium.com/@myuser");
  expect(result).toContainEqual({ connectorId: "rss", url: expect.stringContaining("medium.com") });
});
```

- [ ] **Step 2: Extend detectConnectorUrls**

In `src/lib/connectors/magic-paste.ts`, add pattern-based matching after the exact domain lookup:

```typescript
// After line 7 (DOMAIN_TO_CONNECTOR):
const DOMAIN_TO_CONNECTOR: Record<string, string> = {
  "github.com": "github",
  "www.github.com": "github",
  "linkedin.com": "linkedin_zip",
  "www.linkedin.com": "linkedin_zip",
  "open.spotify.com": "spotify",
  "strava.com": "strava",
  "www.strava.com": "strava",
  "dev.to": "rss",
};

// After domain lookup, add pattern matchers:
const PATTERN_MATCHERS: Array<{ pattern: RegExp; connectorId: string }> = [
  { pattern: /\/(feed|rss|atom\.xml|rss\.xml)$/i, connectorId: "rss" },
  { pattern: /\.substack\.com/i, connectorId: "rss" },
  { pattern: /medium\.com\/@/i, connectorId: "rss" },
];

export function detectConnectorUrls(text: string): DetectedConnector[] {
  const urls = text.match(URL_PATTERN) ?? [];
  const results: DetectedConnector[] = [];
  const seen = new Set<string>();

  for (const url of urls) {
    try {
      const hostname = new URL(url).hostname;
      const connectorId = DOMAIN_TO_CONNECTOR[hostname];
      if (connectorId && !seen.has(connectorId)) {
        results.push({ connectorId, url });
        seen.add(connectorId);
        continue;
      }

      // Pattern-based matching
      for (const { pattern, connectorId: cId } of PATTERN_MATCHERS) {
        if (pattern.test(url) && !seen.has(cId)) {
          results.push({ connectorId: cId, url });
          seen.add(cId);
          break;
        }
      }
    } catch { /* invalid URL, skip */ }
  }
  return results;
}
```

- [ ] **Step 3: Run tests, commit**

```bash
npx vitest run tests/evals/magic-paste.test.ts
git add src/lib/connectors/magic-paste.ts tests/evals/magic-paste.test.ts
git commit -m "feat: magic paste detects Spotify, Strava, RSS/Substack/Medium/dev.to URLs"
```

---

### Task 21: ConnectorCard — url_input authType support

**Files:**
- Modify: `src/components/sources/ConnectorCard.tsx`

- [ ] **Step 1: Add URL input state and handler**

In `ConnectorCard.tsx`, add state for URL input when `authType === "url_input"`:

```typescript
const [feedUrl, setFeedUrl] = useState("");

async function handleSubscribe() {
  if (!feedUrl.trim()) return;
  setLoading(true);
  try {
    const res = await fetch("/api/connectors/rss/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: feedUrl.trim() }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setMessage({ type: "success", text: "Feed subscribed!" });
    setFeedUrl("");
    onRefresh?.();
  } catch (error) {
    setMessage({ type: "error", text: error instanceof Error ? error.message : "Subscribe failed" });
  } finally {
    setLoading(false);
  }
}
```

- [ ] **Step 2: Render URL input in JSX**

In the "not connected" state rendering, add a branch for `url_input`:

```tsx
{def.authType === "url_input" && !isConnected && (
  <div className="flex gap-2">
    <input
      type="url"
      value={feedUrl}
      onChange={(e) => setFeedUrl(e.target.value)}
      placeholder="https://example.com/feed"
      className="flex-1 px-3 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-sm text-white placeholder-zinc-500"
    />
    <button
      type="button"
      onClick={handleSubscribe}
      disabled={loading || !feedUrl.trim()}
      className="px-3 py-1.5 rounded bg-white text-black text-sm font-medium disabled:opacity-50"
    >
      Subscribe
    </button>
  </div>
)}

{/* IMPORTANT: Gate the existing generic error block to exclude url_input connectors.
   The existing `{hasError && ...}` block in ConnectorCard.tsx (~line 184) must be
   wrapped with `def.authType !== "url_input"` to prevent duplicate/contradictory controls.
   RSS error state is handled below instead. */}

{/* url_input error state: Update URL + Retry + Disconnect */}
{def.authType === "url_input" && status?.status === "error" && (
  <div className="space-y-2">
    <p className="text-xs text-red-400">{status.lastError ?? "Sync failed"}</p>
    <div className="flex gap-2">
      <button type="button" onClick={handleSync} disabled={loading}
        className="px-3 py-1.5 rounded bg-zinc-700 text-white text-sm">
        Retry Sync
      </button>
      <button type="button" onClick={handleDisconnect} disabled={disconnecting}
        className="px-3 py-1.5 rounded bg-zinc-800 text-zinc-400 text-sm">
        Disconnect
      </button>
    </div>
    <div className="flex gap-2">
      <input type="url" value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)}
        placeholder="Update feed URL..." className="flex-1 px-3 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-sm text-white placeholder-zinc-500" />
      <button type="button" onClick={handleSubscribe} disabled={loading || !feedUrl.trim()}
        className="px-3 py-1.5 rounded bg-zinc-700 text-white text-sm">
        Update
      </button>
    </div>
  </div>
)}

{/* url_input connected state: Sync + Change URL + Disconnect */}
{def.authType === "url_input" && isConnected && (
  <div className="space-y-2">
    <div className="flex gap-2">
      <button type="button" onClick={handleSync} disabled={loading}
        className="px-3 py-1.5 rounded bg-zinc-700 text-white text-sm">
        Sync Now
      </button>
      <button type="button" onClick={handleDisconnect} disabled={disconnecting}
        className="px-3 py-1.5 rounded bg-zinc-800 text-zinc-400 text-sm">
        Disconnect
      </button>
    </div>
    {/* Change URL: subscribe again overwrites via upsert */}
    <div className="flex gap-2">
      <input type="url" value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)}
        placeholder="Change feed URL..." className="flex-1 px-3 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-sm text-white placeholder-zinc-500" />
      <button type="button" onClick={handleSubscribe} disabled={loading || !feedUrl.trim()}
        className="px-3 py-1.5 rounded bg-zinc-700 text-white text-sm">
        Update
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 3: Test manually in browser**

- [ ] **Step 4: Commit**

```bash
git add src/components/sources/ConnectorCard.tsx
git commit -m "feat: ConnectorCard supports url_input authType for RSS subscription"
```

---

### Task 22: Environment variables + .env.example

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add Spotify and Strava env vars**

After line 73 (Apple OAuth block), add:

```bash
# === Connectors ===

# Spotify (connector — separate from Spotify as auth provider)
# SPOTIFY_CLIENT_ID=...
# SPOTIFY_CLIENT_SECRET=...

# Strava
# STRAVA_CLIENT_ID=...
# STRAVA_CLIENT_SECRET=...
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add Spotify and Strava connector env vars to .env.example"
```

---

### Task 23: Update jobs CHECK constraint for connector_sync per-type

**Files:**
- Check: `db/migrations/0027_episodic_memory.sql` — verify `connector_sync` is already in the CHECK constraint

`connector_sync` is already in the CHECK (line 8 of migration 0027). No change needed — the existing `connector_sync` job type handles all connector types via fan-out in `handleConnectorSync()`.

---

### Task 24: Final integration test

**Files:**
- Create: `tests/evals/connector-episodic-integration.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
// tests/evals/connector-episodic-integration.test.ts
import { describe, it, expect } from "vitest";
import { insertEvent } from "@/lib/services/episodic-service";
import { checkPatternThresholds } from "@/lib/services/episodic-consolidation-service";

describe("connector episodic integration", () => {
  it("connector-sourced events do not trigger Dream Cycle", () => {
    // Insert 5 workout events from strava
    for (let i = 0; i < 5; i++) {
      insertEvent({
        ownerKey: "integration-test",
        sessionId: "sess",
        eventAtUnix: Math.floor(Date.now() / 1000) - i * 86400,
        eventAtHuman: new Date().toISOString(),
        actionType: "workout",
        narrativeSummary: `Ran ${5 + i}km`,
        source: "strava",
      });
    }

    // Insert 1 workout event from chat (below threshold)
    insertEvent({
      ownerKey: "integration-test",
      sessionId: "sess",
      eventAtUnix: Math.floor(Date.now() / 1000),
      eventAtHuman: new Date().toISOString(),
      actionType: "workout",
      narrativeSummary: "Went for a run",
      source: "chat",
    });

    // Dream Cycle should find 0 candidates (only 1 chat event, need 3)
    const candidates = checkPatternThresholds("integration-test");
    expect(candidates.filter((c) => c.actionType === "workout")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run all connector tests**

```bash
npx vitest run tests/evals/connector-event-writer.test.ts tests/evals/rss-*.test.ts tests/evals/spotify-*.test.ts tests/evals/strava-*.test.ts tests/evals/github-sync.test.ts tests/evals/linkedin-zip-import.test.ts tests/evals/connector-episodic-integration.test.ts
# Expected: ALL PASS
```

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
# Expected: ALL PASS (2670+ tests)
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
# Expected: 0 errors
```

- [ ] **Step 5: Commit**

```bash
git add tests/evals/connector-episodic-integration.test.ts
git commit -m "test: connector episodic integration — Dream Cycle source filter verification"
```

---

## Summary

| Chunk | Tasks | New Files | Modified Files |
|-------|-------|-----------|----------------|
| 1: Infrastructure | 1-7 | 4 | 6 |
| 2: RSS | 8-12 | 8 | 2 |
| 3: GitHub + LinkedIn | 13-14 | 0 | 4 |
| 4: Spotify + Strava | 15-18 | ~16 | 2 |
| 5: Integration | 19-24 | 2 | 4 |
| **Total** | **24 tasks** | **~30 files** | **~18 files** |

**Dependency order:** Chunk 1 → (Chunks 2, 3, 4 in parallel) → Chunk 5

**Estimated new tests:** ~25-30 test files, ~60-80 individual tests

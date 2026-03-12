# Connector Disconnect + Purge Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When disconnecting a connector, let the user choose whether to also purge all imported facts and episodic events — cleanly, atomically, using relational joins only (no key prefix heuristics).

**Architecture:** Two-phase approach. Phase 1: fix the data model so every connector-created fact is tracked in `connector_items.factId`. Phase 2: build the purge function that hard-deletes facts + events + connector_items in a single transaction, resets connector state for clean reconnect, and exposes the choice via a confirmation UI in ConnectorCard.

**Tech Stack:** SQLite (better-sqlite3), Drizzle ORM, Next.js App Router, React, Vitest

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `db/migrations/0033_connector_purge.sql` | Backfill `connector_items.factId` from existing data |
| Create | `src/lib/connectors/connector-purge.ts` | `purgeConnectorData()` — atomic purge logic |
| Create | `tests/evals/connector-purge.test.ts` | Integration tests for purge + backfill |
| Modify | `src/lib/connectors/connector-fact-writer.ts` | Return created fact IDs + write `connector_items.factId` |
| Modify | `src/lib/connectors/connector-fact-writer.ts` | Accept `connectorId` param for provenance tracking |
| Modify | `src/lib/connectors/rss/sync.ts` | Pass `connectorId` to `batchCreateFacts`, use returned IDs |
| Modify | `src/lib/connectors/github/sync.ts` | Same |
| Modify | `src/lib/connectors/spotify/sync.ts` | Same |
| Modify | `src/lib/connectors/strava/sync.ts` | Same |
| Modify | `src/lib/connectors/linkedin-zip/import.ts` | Same + write `connector_items` rows (currently missing) |
| Modify | `src/lib/connectors/connector-service.ts` | Add `disconnectConnectorWithPurge()` orchestrator |
| Modify | `src/app/api/connectors/[id]/disconnect/route.ts` | Accept `purge` body param, call purge before disconnect |
| Modify | `src/components/sources/ConnectorCard.tsx` | Confirmation UI: "Keep data" vs "Remove all data" |
| Modify | `src/lib/db/migrate.ts` | Bump `EXPECTED_SCHEMA_VERSION` to 33 |

---

## Chunk 1: Data Model Fix — `batchCreateFacts` returns fact IDs + `connector_items.factId` population

### Task 1: Extend `batchCreateFacts` return type

**Files:**
- Modify: `src/lib/connectors/connector-fact-writer.ts:9-16` (FactInput type), `24-104` (function)
- Modify: `src/lib/connectors/types.ts:54-58` (ImportReport type)

- [ ] **Step 1: Update `ImportReport` type to include created fact mappings**

In `src/lib/connectors/types.ts`, add `createdFacts` to `ImportReport`:

```typescript
export type ImportReport = {
  factsWritten: number;
  factsSkipped: number;
  errors: Array<{ file?: string; key?: string; reason: string }>;
  createdFacts: Array<{ key: string; factId: string }>;
};
```

- [ ] **Step 2: Update `batchCreateFacts` to accept `connectorId` and return fact IDs**

In `src/lib/connectors/connector-fact-writer.ts`:

1. Add `connectorId?: string` parameter after `factLanguage`.
2. Add imports: `import { randomUUID } from "node:crypto"` (if not already present).
3. Add `const createdFacts: Array<{ key: string; factId: string }> = [];` before the write loop.
4. Change the `createFact` call to capture the return value:

```typescript
// Change from:
//   await createFact(...);
//   report.factsWritten++;
// To:
const fact = await createFact(
  { ...input, source: "connector" },
  scope.knowledgePrimaryKey,
  scope.cognitiveOwnerKey,
  { actor: "connector" },
);
createdFacts.push({ key: input.key, factId: fact.id });
report.factsWritten++;
```

Also update the `catch` block to link existing (duplicate-skipped) facts to `connector_items`. When `createFact` throws on duplicate constraint, the fact already exists and should still be linked:

```typescript
} catch (error) {
  report.factsSkipped++;
  // Still link existing fact to connector_items (handles re-sync duplicates)
  if (connectorId) {
    try {
      const existing = getFactByKey(scope.knowledgePrimaryKey, input.category, input.key);
      if (existing) createdFacts.push({ key: input.key, factId: existing.id });
    } catch { /* best-effort */ }
  }
  report.errors.push({
    key: input.key,
    reason: error instanceof Error ? error.message : String(error),
  });
}
```

Import `getFactByKey` from `@/lib/services/kb-service` at the top of the file.

5. After the write loop, if `connectorId` is provided, upsert `connector_items` rows:

```typescript
if (connectorId) {
  for (const cf of createdFacts) {
    sqlite
      .prepare(
        `INSERT INTO connector_items (id, connector_id, external_id, fact_id, last_seen_at)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(connector_id, external_id) DO UPDATE SET
           fact_id = excluded.fact_id, last_seen_at = excluded.last_seen_at`
      )
      .run(randomUUID(), connectorId, `fact:${cf.key}`, cf.factId);
  }
}
```

Note: `external_id` uses `fact:` prefix to distinguish fact-tracking items from event-tracking items (which use connector-specific prefixes like `rss-post-*`, `repo-*`).

6. Return `createdFacts` in the report: `return { ...report, createdFacts }`.

Full signature change:

```typescript
export async function batchCreateFacts(
  inputs: FactInput[],
  scope: OwnerScope,
  username: string,
  factLanguage: string,
  connectorId?: string,
): Promise<ImportReport> {
```

- [ ] **Step 3: Add `randomUUID` import if not already present**

Already imported in scope (`import { randomUUID } from "node:crypto"` is available from types file — verify and add if needed).

- [ ] **Step 4: Run `npx tsc --noEmit` to verify type changes compile**

Run: `npx tsc --noEmit`
Expected: No new errors (existing callers pass fewer args → optional param is fine)

- [ ] **Step 5: Commit**

```bash
git add src/lib/connectors/connector-fact-writer.ts src/lib/connectors/types.ts
git commit -m "feat: batchCreateFacts returns fact IDs and writes connector_items.factId"
```

### Task 2: Wire `connectorId` through all 5 connector sync paths

**Files:**
- Modify: `src/lib/connectors/rss/sync.ts:83`
- Modify: `src/lib/connectors/github/sync.ts:75`
- Modify: `src/lib/connectors/spotify/sync.ts:173`
- Modify: `src/lib/connectors/strava/sync.ts:94`
- Modify: `src/lib/connectors/linkedin-zip/import.ts:68,182`

- [ ] **Step 1: RSS — pass `connectorId` to `batchCreateFacts`**

In `src/lib/connectors/rss/sync.ts:83`, change:
```typescript
const report = await batchCreateFacts(facts, scope, username, factLanguage);
```
to:
```typescript
const report = await batchCreateFacts(facts, scope, username, factLanguage, connectorId);
```

- [ ] **Step 2: GitHub — pass `connectorId` to `batchCreateFacts`**

In `src/lib/connectors/github/sync.ts:75-80`, change the `batchCreateFacts` call to include `connectorId`:
```typescript
const report = await batchCreateFacts(
  allFacts,
  scope,
  username,
  factLanguage,
  connectorId,
);
```

- [ ] **Step 3: Spotify — pass `connectorId` to `batchCreateFacts`**

In `src/lib/connectors/spotify/sync.ts:173`, add `connectorId` as last arg.

- [ ] **Step 4: Strava — pass `connectorId` to `batchCreateFacts`**

In `src/lib/connectors/strava/sync.ts:94`, add `connectorId` as last arg.

- [ ] **Step 5: LinkedIn — pass `connectorId` + wire connector_items**

LinkedIn is different: `importLinkedInZip()` doesn't have `connectorId` in scope, and the import route (`src/app/api/connectors/linkedin-zip/import/route.ts`) doesn't query for it. The fix:

1. In `src/lib/connectors/linkedin-zip/import.ts:68`, add `connectorId?: string` parameter:
```typescript
export async function importLinkedInZip(
  buffer: Buffer,
  scope: OwnerScope,
  username: string,
  factLanguage: string,
  connectorId?: string,
): Promise<ImportReport> {
```

2. Pass it through to `batchCreateFacts` at line 182:
```typescript
const report = await batchCreateFacts(allFacts, scope, username, factLanguage, connectorId);
```

- [ ] **Step 6: Update LinkedIn import route to resolve connectorId**

In `src/app/api/connectors/linkedin-zip/import/route.ts`, ensure a `connectors` row exists (LinkedIn ZIP never had one) and pass its ID to `importLinkedInZip`:

```typescript
import { getConnectorStatus, createConnector } from "@/lib/connectors/connector-service";

// Inside the POST handler, after scope resolution:
const connectorRows = getConnectorStatus(ownerKey);
let linkedinConnector = connectorRows.find(c => c.connectorType === "linkedin_zip");

// Create connector row if first import (LinkedIn ZIP never had one)
if (!linkedinConnector) {
  const created = createConnector(ownerKey, "linkedin_zip", {});
  linkedinConnector = { id: created.id, connectorType: "linkedin_zip", status: "connected", enabled: true, lastSync: null, lastError: null, createdAt: created.createdAt, updatedAt: created.updatedAt };
}
const connectorId = linkedinConnector.id;

// Pass to importLinkedInZip:
const report = await importLinkedInZip(buffer, scope, username, factLanguage, connectorId);
```

This ensures LinkedIn has a `connectors` row just like all other connector types, enabling disconnect + purge via the same UI flow. The `createConnector` call is idempotent (reactivates existing disconnected rows).

- [ ] **Step 7: Run `npx tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: PASS — all callers now pass connectorId

- [ ] **Step 8: Commit**

```bash
git add src/lib/connectors/rss/sync.ts src/lib/connectors/github/sync.ts \
  src/lib/connectors/spotify/sync.ts src/lib/connectors/strava/sync.ts \
  src/lib/connectors/linkedin-zip/import.ts
git commit -m "feat: wire connectorId through all sync/import paths for fact provenance"
```

### Task 3: Backfill migration for existing `connector_items.factId`

**Files:**
- Create: `db/migrations/0033_connector_purge.sql`
- Modify: `src/lib/db/migrate.ts:9` (bump EXPECTED_SCHEMA_VERSION)

- [ ] **Step 1: Write the backfill migration**

This migration creates `connector_items` rows for all connector-created facts and events that don't already have them.

**CRITICAL JOIN NOTE**: `connectors.owner_key` matches `facts.profile_id` (NOT `facts.session_id`). The `batchCreateFacts` flow passes `scope.cognitiveOwnerKey` as `profileId` to `createFact()`, which stores it in `facts.profile_id`. This is the correct join column.

The key prefixes per connector type (verified from codebase):
- **GitHub** (`github`): keys starting with `gh-` OR key = `github-repos`
- **LinkedIn** (`linkedin_zip`): keys starting with `li-`
- **Spotify** (`spotify`): keys starting with `sp-` OR key = `spotify-profile`
- **Strava** (`strava`): keys starting with `strava-`
- **RSS** (`rss`): keys starting with `rss-`

Strategy: INSERT-only approach. Existing `connector_items` rows use connector-native external IDs (e.g., `repo.node_id`, `rss-post-{hash}`) which don't match fact keys — so UPDATE-based backfill won't work. Instead, we create NEW `connector_items` rows for every orphan fact/event using `fact:{key}` / `event:{id}` external IDs.

```sql
-- Migration 0033: Backfill connector_items for purge support
--
-- Creates connector_items rows for all connector-created facts and events
-- that aren't yet tracked. Uses facts.profile_id = connectors.owner_key join.

-- Phase 1: Create connector_items for orphan connector facts (all 5 connectors)
INSERT OR IGNORE INTO connector_items (id, connector_id, external_id, fact_id, last_seen_at)
SELECT
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
  c.id,
  'fact:' || f.key,
  f.id,
  datetime('now')
FROM facts f
JOIN connectors c ON c.owner_key = f.profile_id
WHERE f.source = 'connector'
  AND f.archived_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM connector_items ci
    WHERE ci.connector_id = c.id AND ci.fact_id = f.id
  )
  AND (
    (c.connector_type = 'linkedin_zip' AND f.key LIKE 'li-%')
    OR (c.connector_type = 'github' AND (f.key LIKE 'gh-%' OR f.key = 'github-repos'))
    OR (c.connector_type = 'spotify' AND (f.key LIKE 'sp-%' OR f.key = 'spotify-profile'))
    OR (c.connector_type = 'strava' AND f.key LIKE 'strava-%')
    OR (c.connector_type = 'rss' AND f.key LIKE 'rss-%')
  );

-- Phase 2: Backfill episodic event linkage for LinkedIn events
-- LinkedIn writes events with source='linkedin_zip' but never connector_items
INSERT OR IGNORE INTO connector_items (id, connector_id, external_id, event_id, last_seen_at)
SELECT
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
  c.id,
  'event:' || COALESCE(e.external_id, e.id),
  e.id,
  datetime('now')
FROM episodic_events e
JOIN connectors c ON c.owner_key = e.owner_key AND c.connector_type = 'linkedin_zip'
WHERE e.source = 'linkedin_zip'
  AND NOT EXISTS (
    SELECT 1 FROM connector_items ci
    WHERE ci.connector_id = c.id AND ci.event_id = e.id
  );

-- Phase 3: Backfill GitHub activity events (direct insertEvent, bypass connector_items)
INSERT OR IGNORE INTO connector_items (id, connector_id, external_id, event_id, last_seen_at)
SELECT
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
  c.id,
  'event:' || COALESCE(e.external_id, e.id),
  e.id,
  datetime('now')
FROM episodic_events e
JOIN connectors c ON c.owner_key = e.owner_key AND c.connector_type = 'github'
WHERE e.source = 'github'
  AND NOT EXISTS (
    SELECT 1 FROM connector_items ci
    WHERE ci.connector_id = c.id AND ci.event_id = e.id
  );
```

- [ ] **Step 2: Bump `EXPECTED_SCHEMA_VERSION` to 33**

In `src/lib/db/migrate.ts:9`:
```typescript
export const EXPECTED_SCHEMA_VERSION = 33;
```

- [ ] **Step 3: Run `npm run dev` briefly to verify migration applies cleanly**

Start the dev server, check console for migration success, then stop.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/0033_connector_purge.sql src/lib/db/migrate.ts
git commit -m "feat: migration 0033 — backfill connector_items.factId for purge support"
```

---

## Chunk 2: Purge Logic + Service Layer

### Task 4: Write purge integration tests

**Files:**
- Create: `tests/evals/connector-purge.test.ts`

- [ ] **Step 1: Write the test file with in-memory SQLite setup**

Follow the pattern from `tests/evals/connector-service.test.ts`. Set up an in-memory SQLite with the necessary tables: `connectors`, `connector_items`, `facts`, `episodic_events`, `sync_log`, `jobs`.

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";

const TEST_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const testSqlite = new Database(":memory:");
testSqlite.pragma("journal_mode = WAL");
testSqlite.pragma("foreign_keys = ON");
const testDb = drizzle(testSqlite, { schema });

// Schema setup (minimal tables needed for purge tests)
testSqlite.exec(`
  CREATE TABLE connectors (
    id TEXT PRIMARY KEY,
    connector_type TEXT NOT NULL,
    credentials TEXT,
    config JSON,
    last_sync TEXT,
    enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    owner_key TEXT,
    status TEXT NOT NULL DEFAULT 'connected',
    sync_cursor TEXT,
    last_error TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX idx_connectors_owner_type ON connectors(owner_key, connector_type)
    WHERE owner_key IS NOT NULL;

  CREATE TABLE facts (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    profile_id TEXT,
    category TEXT NOT NULL,
    key TEXT NOT NULL,
    value JSON NOT NULL,
    source TEXT DEFAULT 'chat',
    confidence REAL DEFAULT 1.0,
    visibility TEXT DEFAULT 'public',
    sort_order INTEGER DEFAULT 0,
    parent_fact_id TEXT,
    archived_at TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE connector_items (
    id TEXT PRIMARY KEY,
    connector_id TEXT NOT NULL REFERENCES connectors(id),
    external_id TEXT NOT NULL,
    external_hash TEXT,
    fact_id TEXT,
    event_id TEXT,
    last_seen_at TEXT DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX uniq_connector_item ON connector_items(connector_id, external_id);

  CREATE TABLE episodic_events (
    id TEXT PRIMARY KEY,
    owner_key TEXT NOT NULL,
    session_id TEXT NOT NULL,
    event_at_unix INTEGER NOT NULL,
    event_at_human TEXT NOT NULL,
    action_type TEXT NOT NULL,
    narrative_summary TEXT NOT NULL,
    entities JSON DEFAULT '[]',
    source TEXT NOT NULL DEFAULT 'chat',
    external_id TEXT,
    superseded_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE sync_log (
    id TEXT PRIMARY KEY,
    connector_id TEXT NOT NULL REFERENCES connectors(id),
    status TEXT NOT NULL,
    facts_created INTEGER DEFAULT 0,
    facts_updated INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE jobs (
    id TEXT PRIMARY KEY,
    job_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    payload JSON,
    last_error TEXT,
    heartbeat_at TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

vi.mock("@/lib/db", () => ({
  db: testDb,
  sqlite: testSqlite,
}));

vi.stubEnv("CONNECTOR_ENCRYPTION_KEY", TEST_KEY);

// Import AFTER vi.mock so mocks are applied
import { purgeConnectorData } from "@/lib/connectors/connector-purge";
```

- [ ] **Step 2: Write test — purge deletes facts linked via connector_items**

```typescript
describe("purgeConnectorData", () => {
  const OWNER = "owner-1";
  const CONNECTOR_ID = "conn-rss-1";

  beforeEach(() => {
    testSqlite.exec("DELETE FROM connector_items");
    testSqlite.exec("DELETE FROM facts");
    testSqlite.exec("DELETE FROM episodic_events");
    testSqlite.exec("DELETE FROM sync_log");
    testSqlite.exec("DELETE FROM connectors");
    testSqlite.exec("DELETE FROM jobs");

    // Seed a connected RSS connector
    testSqlite.prepare(`
      INSERT INTO connectors (id, connector_type, owner_key, status, last_sync, sync_cursor)
      VALUES (?, 'rss', ?, 'connected', '2026-03-12T00:00:00Z', '2026-03-11T00:00:00Z')
    `).run(CONNECTOR_ID, OWNER);

    // Seed facts
    testSqlite.prepare(`
      INSERT INTO facts (id, session_id, category, key, value, source)
      VALUES ('f1', ?, 'social', 'rss-feed', '{"url":"https://example.com/feed"}', 'connector')
    `).run(OWNER);
    testSqlite.prepare(`
      INSERT INTO facts (id, session_id, category, key, value, source)
      VALUES ('f2', ?, 'project', 'rss-abc123', '{"name":"Post 1"}', 'connector')
    `).run(OWNER);
    // A user-created fact (must NOT be deleted)
    testSqlite.prepare(`
      INSERT INTO facts (id, session_id, category, key, value, source)
      VALUES ('f3', ?, 'identity', 'name', '{"name":"Tommaso"}', 'chat')
    `).run(OWNER);

    // Seed connector_items linking to facts
    testSqlite.prepare(`
      INSERT INTO connector_items (id, connector_id, external_id, fact_id)
      VALUES ('ci1', ?, 'fact:rss-feed', 'f1')
    `).run(CONNECTOR_ID);
    testSqlite.prepare(`
      INSERT INTO connector_items (id, connector_id, external_id, fact_id)
      VALUES ('ci2', ?, 'fact:rss-abc123', 'f2')
    `).run(CONNECTOR_ID);

    // Seed episodic events
    testSqlite.prepare(`
      INSERT INTO episodic_events (id, owner_key, session_id, event_at_unix, event_at_human, action_type, narrative_summary, source, external_id)
      VALUES ('e1', ?, ?, 1710000000, '2026-03-10T00:00:00Z', 'writing', 'Published: Post 1', 'rss', 'rss-post-abc123')
    `).run(OWNER, OWNER);
    testSqlite.prepare(`
      INSERT INTO connector_items (id, connector_id, external_id, event_id)
      VALUES ('ci3', ?, 'rss-post-abc123', 'e1')
    `).run(CONNECTOR_ID);

    // A user chat event (must NOT be deleted)
    testSqlite.prepare(`
      INSERT INTO episodic_events (id, owner_key, session_id, event_at_unix, event_at_human, action_type, narrative_summary, source)
      VALUES ('e2', ?, ?, 1710000001, '2026-03-10T00:00:01Z', 'milestone', 'User event', 'chat')
    `).run(OWNER, OWNER);

    // Seed sync_log
    testSqlite.prepare(`
      INSERT INTO sync_log (id, connector_id, status, facts_created)
      VALUES ('sl1', ?, 'success', 2)
    `).run(CONNECTOR_ID);
  });

  it("deletes connector facts, events, connector_items, and sync_log", async () => {
    // purgeConnectorData imported at top-level (see import below vi.mock)
    const result = purgeConnectorData(CONNECTOR_ID, OWNER);

    expect(result.factsDeleted).toBe(2);
    expect(result.eventsDeleted).toBe(1);

    // Connector facts gone
    const remainingFacts = testSqlite.prepare("SELECT id FROM facts").all();
    expect(remainingFacts).toHaveLength(1);
    expect((remainingFacts[0] as { id: string }).id).toBe("f3");

    // Connector events gone
    const remainingEvents = testSqlite.prepare("SELECT id FROM episodic_events").all();
    expect(remainingEvents).toHaveLength(1);
    expect((remainingEvents[0] as { id: string }).id).toBe("e2");

    // connector_items gone
    const items = testSqlite.prepare("SELECT id FROM connector_items").all();
    expect(items).toHaveLength(0);

    // sync_log gone
    const logs = testSqlite.prepare("SELECT id FROM sync_log").all();
    expect(logs).toHaveLength(0);
  });

  it("resets lastSync and syncCursor on the connector row", async () => {
    // purgeConnectorData imported at top-level (see import below vi.mock)
    purgeConnectorData(CONNECTOR_ID, OWNER);

    const row = testSqlite.prepare("SELECT last_sync, sync_cursor FROM connectors WHERE id = ?").get(CONNECTOR_ID) as { last_sync: string | null; sync_cursor: string | null };
    expect(row.last_sync).toBeNull();
    expect(row.sync_cursor).toBeNull();
  });

  it("rejects purge when a sync job is pending", async () => {
    testSqlite.prepare(`
      INSERT INTO jobs (id, job_type, status, payload)
      VALUES ('j1', 'connector_sync', 'running', ?)
    `).run(JSON.stringify({ ownerKey: OWNER }));

    // purgeConnectorData imported at top-level (see import below vi.mock)
    expect(() => purgeConnectorData(CONNECTOR_ID, OWNER)).toThrow(/sync.*in progress/i);
  });

  it("returns zero counts when connector has no data", async () => {
    // Create an empty connector
    testSqlite.prepare(`
      INSERT INTO connectors (id, connector_type, owner_key, status)
      VALUES ('conn-empty', 'github', ?, 'connected')
    `).run(OWNER);

    // purgeConnectorData imported at top-level (see import below vi.mock)
    const result = purgeConnectorData("conn-empty", OWNER);

    expect(result.factsDeleted).toBe(0);
    expect(result.eventsDeleted).toBe(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/evals/connector-purge.test.ts`
Expected: FAIL — `connector-purge` module not found

- [ ] **Step 4: Commit**

```bash
git add tests/evals/connector-purge.test.ts
git commit -m "test: add connector purge integration tests (red)"
```

### Task 5: Implement `purgeConnectorData`

**Files:**
- Create: `src/lib/connectors/connector-purge.ts`

- [ ] **Step 1: Write the purge function**

```typescript
/**
 * Atomic purge of all data imported by a connector.
 * Hard-deletes facts, episodic events, connector_items, and sync_log.
 * Resets connector lastSync/syncCursor for clean reconnect.
 *
 * Uses only relational joins via connector_items — no key prefix heuristics.
 */

import { sqlite } from "@/lib/db";
import { hasPendingJob } from "./idempotency";

export type PurgeResult = {
  factsDeleted: number;
  eventsDeleted: number;
  connectorItemsDeleted: number;
  syncLogsDeleted: number;
};

export function purgeConnectorData(
  connectorId: string,
  ownerKey: string,
): PurgeResult {
  // Guard: reject if ANY sync job is in progress for this owner.
  // Scheduler-triggered jobs don't carry connectorId in payload, so we
  // use hasPendingJob(ownerKey) which checks by ownerKey alone.
  // This is the correct granularity because scheduler syncs ALL connectors.
  if (hasPendingJob(ownerKey)) {
    throw new Error(
      "Cannot purge while a sync is in progress. Wait for the sync to complete or cancel it first.",
    );
  }

  return sqlite.transaction(() => {
    // 1. Collect IDs to delete
    const factIds = sqlite
      .prepare(
        `SELECT fact_id FROM connector_items
         WHERE connector_id = ? AND fact_id IS NOT NULL`,
      )
      .all(connectorId)
      .map((r) => (r as { fact_id: string }).fact_id);

    const eventIds = sqlite
      .prepare(
        `SELECT event_id FROM connector_items
         WHERE connector_id = ? AND event_id IS NOT NULL`,
      )
      .all(connectorId)
      .map((r) => (r as { event_id: string }).event_id);

    // 2. Hard-delete facts (chunked for SQLite 999 param limit)
    let factsDeleted = 0;
    for (let i = 0; i < factIds.length; i += 500) {
      const chunk = factIds.slice(i, i + 500);
      const placeholders = chunk.map(() => "?").join(",");

      // Detach children before delete
      sqlite
        .prepare(
          `UPDATE facts SET parent_fact_id = NULL
           WHERE parent_fact_id IN (${placeholders})`,
        )
        .run(...chunk);

      const result = sqlite
        .prepare(
          `DELETE FROM facts WHERE id IN (${placeholders})`,
        )
        .run(...chunk);
      factsDeleted += result.changes;
    }

    // 3. Hard-delete episodic events (chunked)
    let eventsDeleted = 0;
    for (let i = 0; i < eventIds.length; i += 500) {
      const chunk = eventIds.slice(i, i + 500);
      const placeholders = chunk.map(() => "?").join(",");
      const result = sqlite
        .prepare(
          `DELETE FROM episodic_events WHERE id IN (${placeholders})`,
        )
        .run(...chunk);
      eventsDeleted += result.changes;
    }

    // 4. Delete connector_items
    const ciResult = sqlite
      .prepare(`DELETE FROM connector_items WHERE connector_id = ?`)
      .run(connectorId);

    // 5. Delete sync_log entries
    const slResult = sqlite
      .prepare(`DELETE FROM sync_log WHERE connector_id = ?`)
      .run(connectorId);

    // 6. Reset connector state for clean reconnect
    sqlite
      .prepare(
        `UPDATE connectors
         SET last_sync = NULL, sync_cursor = NULL, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(connectorId);

    return {
      factsDeleted,
      eventsDeleted,
      connectorItemsDeleted: ciResult.changes,
      syncLogsDeleted: slResult.changes,
    };
  })();
}
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run tests/evals/connector-purge.test.ts`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/connectors/connector-purge.ts
git commit -m "feat: purgeConnectorData — atomic hard-delete of all connector data"
```

### Task 6: Wire purge into disconnect service

**Files:**
- Modify: `src/lib/connectors/connector-service.ts:99-108`

- [ ] **Step 1: Add `disconnectConnectorWithPurge` function**

Add after `disconnectConnector()`:

```typescript
import { purgeConnectorData, type PurgeResult } from "./connector-purge";

/**
 * Disconnect a connector and optionally purge all imported data.
 * IMPORTANT: disconnect FIRST (sets status="disconnected", clears credentials),
 * THEN purge. This ordering prevents the scheduler from re-enqueuing a sync job
 * between purge and disconnect (getActiveConnectors excludes status="disconnected").
 */
export function disconnectConnectorWithPurge(
  connectorId: string,
  ownerKey: string,
  purge: boolean,
): { purgeResult?: PurgeResult } {
  // Disconnect first — makes connector invisible to scheduler
  disconnectConnector(connectorId);

  let purgeResult: PurgeResult | undefined;
  if (purge) {
    purgeResult = purgeConnectorData(connectorId, ownerKey);
  }

  return { purgeResult };
}
```

- [ ] **Step 2: Run `npx tsc --noEmit`**

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/connectors/connector-service.ts
git commit -m "feat: disconnectConnectorWithPurge orchestrator"
```

---

## Chunk 3: API Route + UI

### Task 7: Update disconnect API route

**Files:**
- Modify: `src/app/api/connectors/[id]/disconnect/route.ts`

- [ ] **Step 1: Add `purge` body parameter handling**

Replace the current route with:

```typescript
import { NextResponse } from "next/server";
import {
  disconnectConnector,
  disconnectConnectorWithPurge,
  getConnectorById,
} from "@/lib/connectors/connector-service";
import { connectorError } from "@/lib/connectors/api-errors";
import { resolveAuthenticatedConnectorScope } from "@/lib/connectors/route-auth";
import { resolveOwnerScopeForWorker } from "@/lib/auth/session";
import { getActiveFacts } from "@/lib/services/kb-service";
import { getDraft, upsertDraft, computeConfigHash } from "@/lib/services/page-service";
import { projectCanonicalConfig, type DraftMeta } from "@/lib/services/page-projection";
import { getFactLanguage } from "@/lib/services/preferences-service";
import { PROFILE_ID_CANONICAL } from "@/lib/flags";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const scope = resolveAuthenticatedConnectorScope(req);
  if (!scope) {
    return connectorError("AUTH_REQUIRED", "Authentication required.", 403, false);
  }

  const { id } = await params;
  const ownerKey = scope.cognitiveOwnerKey;

  // Parse body for purge flag
  let purge = false;
  try {
    const body = await req.json();
    purge = body.purge === true;
  } catch {
    // No body or invalid JSON → default purge=false
  }

  try {
    const connector = getConnectorById(id);
    if (!connector) {
      return connectorError("NOT_FOUND", "Connector not found.", 404, false);
    }
    if (connector.ownerKey !== ownerKey) {
      return connectorError("FORBIDDEN", "Connector does not belong to this user.", 403, false);
    }

    const { purgeResult } = disconnectConnectorWithPurge(id, ownerKey, purge);

    // Recompose draft if purge removed facts (same pattern as connector-fact-writer.ts)
    // NOTE: This duplicates ~25 lines from connector-fact-writer.ts. If it bothers you,
    // extract a shared `recomposeDraft(scope)` helper — but it's not required for correctness.
    if (purgeResult && purgeResult.factsDeleted > 0) {
      try {
        const factsReadId = PROFILE_ID_CANONICAL
          ? scope.cognitiveOwnerKey
          : scope.knowledgePrimaryKey;
        const draftSessionId = scope.knowledgePrimaryKey;
        const readKeys = PROFILE_ID_CANONICAL ? undefined : scope.knowledgeReadKeys;
        const allFacts = getActiveFacts(factsReadId, readKeys);
        const factLang = getFactLanguage(draftSessionId) ?? "en";
        const currentDraft = getDraft(draftSessionId);

        const draftMeta: DraftMeta | undefined = currentDraft
          ? {
              surface: currentDraft.config.surface,
              voice: currentDraft.config.voice,
              light: currentDraft.config.light,
              style: currentDraft.config.style,
              layoutTemplate: currentDraft.config.layoutTemplate,
              sections: currentDraft.config.sections,
            }
          : undefined;

        const composed = projectCanonicalConfig(
          allFacts,
          currentDraft?.username ?? "draft",
          factLang,
          draftMeta,
          scope.cognitiveOwnerKey,
        );

        const composedHash = computeConfigHash(composed);
        if (composedHash !== currentDraft?.configHash) {
          upsertDraft(
            currentDraft?.username ?? "draft",
            composed,
            draftSessionId,
            scope.cognitiveOwnerKey,
          );
        }
      } catch (err) {
        console.warn("[disconnect] recompose after purge failed:", err);
      }
    }

    return NextResponse.json({
      success: true,
      purged: purge,
      ...(purgeResult
        ? {
            factsRemoved: purgeResult.factsDeleted,
            eventsRemoved: purgeResult.eventsDeleted,
          }
        : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Return 409 for sync-in-progress guard
    if (message.includes("sync") && message.includes("in progress")) {
      return connectorError("SYNC_IN_PROGRESS", message, 409, false);
    }
    return connectorError("INTERNAL", message, 500, true);
  }
}
```

- [ ] **Step 2: Run `npx tsc --noEmit`**

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/api/connectors/[id]/disconnect/route.ts
git commit -m "feat: disconnect API accepts purge body param, recomposes after purge"
```

### Task 8: Add confirmation UI to ConnectorCard

**Files:**
- Modify: `src/components/sources/ConnectorCard.tsx`

- [ ] **Step 1: Add `confirmingDisconnect` state and update `handleDisconnect`**

Add a new state variable at the top of the component:
```typescript
const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
```

Replace the existing `handleDisconnect` with two functions:

```typescript
const handleDisconnect = async (purge: boolean) => {
  if (!status?.id || disconnecting) return;
  setDisconnecting(true);
  try {
    const url = definition.disconnectUrl.replace("{id}", String(status.id));
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purge }),
    });
    if (res.ok) {
      const data = await res.json();
      if (purge && data.factsRemoved > 0) {
        showMessage(`Removed ${data.factsRemoved} facts, ${data.eventsRemoved} events`, "success");
      }
      onRefresh();
    } else {
      const data = await res.json().catch(() => ({}));
      showMessage(data.error ?? "Disconnect failed", "error");
    }
  } catch {
    showMessage("Network error", "error");
  } finally {
    setDisconnecting(false);
    setConfirmingDisconnect(false);
  }
};
```

- [ ] **Step 2: Replace all Disconnect buttons with confirmation flow**

There are 4 existing Disconnect buttons (oauth connected, url_input connected, oauth error, url_input error) plus a **missing one**: `zip_upload` in connected state only shows "Re-import ZIP" with no disconnect option. Add a Disconnect button for `zip_upload` connected state too (5 locations total).

Replace every Disconnect `<button>` with a pattern that first shows confirmation:

When `confirmingDisconnect` is false, show the current "Disconnect" button but with `onClick={() => setConfirmingDisconnect(true)}`.

When `confirmingDisconnect` is true, replace the button area with the confirmation UI:

```tsx
{confirmingDisconnect ? (
  <div style={{
    padding: "10px 12px",
    borderRadius: 8,
    background: "rgba(239,68,68,0.08)",
    border: "1px solid rgba(239,68,68,0.2)",
  }}>
    <p style={{ fontSize: 11, color: "#e8e4de", marginBottom: 8 }}>
      Remove imported content too?
      {definition.authType === "zip_upload" && (
        <span style={{ display: "block", color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
          Data will require re-uploading the ZIP to restore.
        </span>
      )}
    </p>
    <div style={{ display: "flex", gap: 8 }}>
      <button
        type="button"
        onClick={() => handleDisconnect(false)}
        disabled={disconnecting}
        style={{ ...btnStyle("rgba(255,255,255,0.08)", "#e8e4de"), flex: 1 }}
      >
        {disconnecting ? "…" : "Keep data"}
      </button>
      <button
        type="button"
        onClick={() => handleDisconnect(true)}
        disabled={disconnecting}
        style={{ ...btnStyle("rgba(239,68,68,0.25)", "#f87171"), flex: 1 }}
      >
        {disconnecting ? "…" : "Remove all"}
      </button>
      <button
        type="button"
        onClick={() => setConfirmingDisconnect(false)}
        disabled={disconnecting}
        style={{ ...btnStyle("transparent", "rgba(255,255,255,0.3)") }}
      >
        ✕
      </button>
    </div>
  </div>
) : (
  <button
    onClick={() => setConfirmingDisconnect(true)}
    disabled={disconnecting || loading}
    style={btnStyle("rgba(239,68,68,0.15)", "#f87171")}
  >
    Disconnect
  </button>
)}
```

Extract this as a local `DisconnectConfirm` component or inline — keep it simple.

The key change: every place that previously had a standalone Disconnect button now conditionally renders the confirmation panel when `confirmingDisconnect` is true.

- [ ] **Step 3: Verify the component compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/sources/ConnectorCard.tsx
git commit -m "feat: ConnectorCard disconnect confirmation — keep data vs remove all"
```

---

## Chunk 4: LinkedIn event tracking + final verification

### Task 9: Wire LinkedIn import to write connector_items for events

**Files:**
- Modify: `src/lib/connectors/linkedin-zip/import.ts:147-166,184-198`

- [ ] **Step 1: Track LinkedIn episodic events in connector_items**

After each `insertEvent()` call in the activity mappers loop (lines 149-158), add a `connector_items` insert. The `insertEvent()` call already returns the event ID.

Wrap the event write section to track event IDs:

```typescript
// Inside the loop at line 147-166:
const eventId = insertEvent({
  ownerKey: scope.cognitiveOwnerKey,
  sessionId: "connector:linkedin_zip",
  eventAtUnix: input.eventAtUnix,
  eventAtHuman: input.eventAtHuman,
  actionType: input.actionType,
  narrativeSummary: input.narrativeSummary,
  source: "linkedin_zip",
  externalId: input.externalId,
});

// Track in connector_items for purge support
if (connectorId) {
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO connector_items (id, connector_id, external_id, event_id, last_seen_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
    )
    .run(randomUUID(), connectorId, `event:${input.externalId}`, eventId);
}
eventsWritten++;
```

Also add the same for the milestone event at lines 189-198.

Add the necessary imports at the top: `import { sqlite } from "@/lib/db"` and `import { randomUUID } from "node:crypto"`.

- [ ] **Step 2: Run `npx tsc --noEmit`**

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/connectors/linkedin-zip/import.ts
git commit -m "feat: LinkedIn import writes connector_items for episodic events"
```

### Task 10: Wire GitHub activity events to connector_items

**Files:**
- Modify: `src/lib/connectors/github/sync.ts:184-205`

- [ ] **Step 1: Track GitHub activity events in connector_items**

In the activity stream section (lines 184-205), after each successful `insertEvent()`, add a `connector_items` insert:

```typescript
const eventId = insertEvent({
  ownerKey,
  sessionId: `connector:github:${connectorId}`,
  // ... existing params
});

// Track in connector_items for purge support
db.insert(connectorItems)
  .values({
    id: randomUUID(),
    connectorId,
    externalId: `event:${input.externalId}`,
    eventId,
  })
  .onConflictDoUpdate({
    target: [connectorItems.connectorId, connectorItems.externalId],
    set: { eventId, lastSeenAt: new Date().toISOString() },
  })
  .run();
eventsWritten++;
```

Note: `connectorItems` is already imported in this file (line 27).

- [ ] **Step 2: Run `npx tsc --noEmit`**

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/connectors/github/sync.ts
git commit -m "feat: GitHub activity events write connector_items for purge support"
```

### Task 11: Full test suite run + tsc

- [ ] **Step 1: Run full type check**

Run: `npx tsc --noEmit`
Expected: PASS with zero errors

- [ ] **Step 2: Run purge tests**

Run: `npx vitest run tests/evals/connector-purge.test.ts`
Expected: ALL PASS

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All 2910+ tests pass, zero regressions

- [ ] **Step 4: Final commit if any fixups needed**

```bash
git add -A
git commit -m "fix: resolve any test regressions from connector purge feature"
```

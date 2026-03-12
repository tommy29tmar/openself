import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";

const TEST_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const testSqlite = new Database(":memory:");
testSqlite.pragma("journal_mode = WAL");
testSqlite.pragma("foreign_keys = ON");

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
  db: {} as unknown,
  sqlite: testSqlite,
}));

vi.stubEnv("CONNECTOR_ENCRYPTION_KEY", TEST_KEY);

// Import AFTER vi.mock so mocks are applied
const { purgeConnectorData } = await import("@/lib/connectors/connector-purge");

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
      INSERT INTO facts (id, session_id, profile_id, category, key, value, source)
      VALUES ('f1', ?, ?, 'social', 'rss-feed', '{"url":"https://example.com/feed"}', 'connector')
    `).run(OWNER, OWNER);
    testSqlite.prepare(`
      INSERT INTO facts (id, session_id, profile_id, category, key, value, source)
      VALUES ('f2', ?, ?, 'project', 'rss-abc123', '{"name":"Post 1"}', 'connector')
    `).run(OWNER, OWNER);
    // A user-created fact (must NOT be deleted)
    testSqlite.prepare(`
      INSERT INTO facts (id, session_id, profile_id, category, key, value, source)
      VALUES ('f3', ?, ?, 'identity', 'name', '{"name":"Tommaso"}', 'chat')
    `).run(OWNER, OWNER);

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

  it("deletes connector facts, events, connector_items, and sync_log", () => {
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

  it("resets lastSync and syncCursor on the connector row", () => {
    purgeConnectorData(CONNECTOR_ID, OWNER);

    const row = testSqlite.prepare("SELECT last_sync, sync_cursor FROM connectors WHERE id = ?").get(CONNECTOR_ID) as { last_sync: string | null; sync_cursor: string | null };
    expect(row.last_sync).toBeNull();
    expect(row.sync_cursor).toBeNull();
  });

  it("rejects purge when a sync job is pending", () => {
    testSqlite.prepare(`
      INSERT INTO jobs (id, job_type, status, payload)
      VALUES ('j1', 'connector_sync', 'running', ?)
    `).run(JSON.stringify({ ownerKey: OWNER }));

    expect(() => purgeConnectorData(CONNECTOR_ID, OWNER)).toThrow(/sync.*in progress/i);
  });

  it("returns zero counts when connector has no data", () => {
    // Create an empty connector
    testSqlite.prepare(`
      INSERT INTO connectors (id, connector_type, owner_key, status)
      VALUES ('conn-empty', 'github', ?, 'connected')
    `).run(OWNER);

    const result = purgeConnectorData("conn-empty", OWNER);

    expect(result.factsDeleted).toBe(0);
    expect(result.eventsDeleted).toBe(0);
    expect(result.connectorItemsDeleted).toBe(0);
    expect(result.syncLogsDeleted).toBe(0);
  });
});

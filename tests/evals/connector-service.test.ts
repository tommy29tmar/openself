import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Integration test for connector-service against a real in-memory SQLite.
 * Tests the full create → disconnect → reconnect lifecycle.
 */

const TEST_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const testSqlite = new Database(":memory:");
testSqlite.pragma("journal_mode = WAL");
testSqlite.pragma("foreign_keys = ON");
const testDb = drizzle(testSqlite, { schema });

// Set up schema
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
    status TEXT NOT NULL DEFAULT 'connected'
      CHECK(status IN ('connected', 'paused', 'error', 'disconnected')),
    sync_cursor TEXT,
    last_error TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX idx_connectors_owner_type ON connectors(owner_key, connector_type)
    WHERE owner_key IS NOT NULL;
`);

// Redirect db import to our test DB
vi.mock("@/lib/db", () => ({
  db: testDb,
  sqlite: testSqlite,
}));

// Set the encryption key env var
vi.stubEnv("CONNECTOR_ENCRYPTION_KEY", TEST_KEY);

const {
  createConnector,
  disconnectConnector,
  getConnectorStatus,
  getActiveConnectors,
  getConnectorWithCredentials,
  updateConnectorStatus,
} = await import("@/lib/connectors/connector-service");

describe("connector-service integration", () => {
  beforeEach(() => {
    // Clear all connector rows between tests
    testSqlite.exec("DELETE FROM connectors");
  });

  it("createConnector inserts a new row with encrypted credentials", () => {
    const row = createConnector("owner-1", "github", { access_token: "ghp_abc" });

    expect(row.id).toBeDefined();
    expect(row.ownerKey).toBe("owner-1");
    expect(row.connectorType).toBe("github");
    expect(row.status).toBe("connected");
    expect(row.enabled).toBe(true);
    // credentials is encrypted (not plaintext)
    expect(row.credentials).toBeDefined();
    expect(row.credentials).not.toContain("ghp_abc");
  });

  it("createConnector reactivates existing row on reconnect (same id preserved)", () => {
    const first = createConnector("owner-1", "github", { token: "v1" });
    const firstId = first.id;

    // Disconnect
    disconnectConnector(firstId);

    // Reconnect
    const reconnected = createConnector("owner-1", "github", { token: "v2" });
    expect(reconnected.id).toBe(firstId); // same row reused
    expect(reconnected.status).toBe("connected");
    expect(reconnected.enabled).toBe(true);
    expect(reconnected.lastError).toBeNull();
  });

  it("createConnector sets enabled=true on reconnect even if previously disabled", () => {
    const row = createConnector("owner-1", "github", { token: "v1" });

    // Manually disable
    testSqlite.prepare("UPDATE connectors SET enabled = 0 WHERE id = ?").run(row.id);

    // Reconnect should re-enable
    const reconnected = createConnector("owner-1", "github", { token: "v2" });
    expect(reconnected.enabled).toBe(true);
  });

  it("disconnectConnector sets status=disconnected and clears credentials", () => {
    const row = createConnector("owner-1", "github", { token: "x" });
    disconnectConnector(row.id);

    const after = testDb.select().from(schema.connectors).where(eq(schema.connectors.id, row.id)).get();
    expect(after!.status).toBe("disconnected");
    expect(after!.credentials).toBeNull();
  });

  it("getConnectorStatus returns list without credentials", () => {
    createConnector("owner-1", "github", { token: "a" });
    createConnector("owner-1", "linkedin_zip", { token: "b" });

    const list = getConnectorStatus("owner-1");
    expect(list).toHaveLength(2);
    // Should not contain credentials field
    for (const c of list) {
      expect(c).not.toHaveProperty("credentials");
      expect(c.connectorType).toBeDefined();
      expect(c.status).toBe("connected");
    }
  });

  it("getActiveConnectors returns only active connectors", () => {
    createConnector("owner-1", "github", { token: "a" });
    const li = createConnector("owner-1", "linkedin_zip", { token: "b" });

    // Disconnect linkedin
    disconnectConnector(li.id);

    const active = getActiveConnectors("owner-1");
    expect(active).toHaveLength(1);
    expect(active[0].connectorType).toBe("github");
  });

  it("getActiveConnectors includes error-status connectors", () => {
    const row = createConnector("owner-1", "github", { token: "a" });
    updateConnectorStatus(row.id, "error", "token expired");

    const active = getActiveConnectors("owner-1");
    expect(active).toHaveLength(1);
    expect(active[0].status).toBe("error");
  });

  it("getActiveConnectors excludes paused connectors", () => {
    const row = createConnector("owner-1", "github", { token: "a" });
    updateConnectorStatus(row.id, "paused");

    const active = getActiveConnectors("owner-1");
    expect(active).toHaveLength(0);
  });

  it("getActiveConnectors excludes disabled connectors", () => {
    const row = createConnector("owner-1", "github", { token: "a" });
    testSqlite.prepare("UPDATE connectors SET enabled = 0 WHERE id = ?").run(row.id);

    const active = getActiveConnectors("owner-1");
    expect(active).toHaveLength(0);
  });

  it("getConnectorWithCredentials decrypts credentials", () => {
    const row = createConnector("owner-1", "github", { access_token: "ghp_secret" });

    const withCreds = getConnectorWithCredentials(row.id);
    expect(withCreds).not.toBeNull();
    expect(withCreds!.decryptedCredentials).toEqual({ access_token: "ghp_secret" });
  });

  it("getConnectorWithCredentials returns null for disconnected (no credentials)", () => {
    const row = createConnector("owner-1", "github", { token: "x" });
    disconnectConnector(row.id);

    const result = getConnectorWithCredentials(row.id);
    expect(result).toBeNull();
  });

  it("updateConnectorStatus updates status and lastError", () => {
    const row = createConnector("owner-1", "github", { token: "x" });
    updateConnectorStatus(row.id, "error", "API rate limited");

    const after = testDb.select().from(schema.connectors).where(eq(schema.connectors.id, row.id)).get();
    expect(after!.status).toBe("error");
    expect(after!.lastError).toBe("API rate limited");
  });

  it("concurrent createConnector calls for same owner+type don't duplicate", () => {
    createConnector("owner-1", "github", { token: "v1" });
    createConnector("owner-1", "github", { token: "v2" });

    const all = testDb.select().from(schema.connectors)
      .where(and(
        eq(schema.connectors.ownerKey, "owner-1"),
        eq(schema.connectors.connectorType, "github"),
      ))
      .all();
    expect(all).toHaveLength(1);
  });
});

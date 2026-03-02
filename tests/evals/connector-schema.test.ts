import { describe, it, expect } from "vitest";
import * as schema from "@/lib/db/schema";

describe("connector schema", () => {
  it("connectors table has ownerKey column", () => {
    expect(schema.connectors.ownerKey).toBeDefined();
  });

  it("connectors table has status column", () => {
    expect(schema.connectors.status).toBeDefined();
  });

  it("connectors table has syncCursor column", () => {
    expect(schema.connectors.syncCursor).toBeDefined();
  });

  it("connectors table has lastError column", () => {
    expect(schema.connectors.lastError).toBeDefined();
  });

  it("connectors table has updatedAt column", () => {
    expect(schema.connectors.updatedAt).toBeDefined();
  });

  it("credentials column is plain text (not json mode)", () => {
    const credCol = schema.connectors.credentials as unknown as { columnType: string };
    const configCol = schema.connectors.config as unknown as { columnType: string };
    // credentials stores AES-256-GCM ciphertext, must NOT be JSON mode
    expect(credCol.columnType).toBe("SQLiteText");
    // config is JSON mode (control comparison)
    expect(configCol.columnType).toBe("SQLiteTextJson");
  });

  it("connectorItems table exists with required columns", () => {
    expect(schema.connectorItems).toBeDefined();
    expect(schema.connectorItems.id).toBeDefined();
    expect(schema.connectorItems.connectorId).toBeDefined();
    expect(schema.connectorItems.externalId).toBeDefined();
    expect(schema.connectorItems.externalHash).toBeDefined();
    expect(schema.connectorItems.factId).toBeDefined();
    expect(schema.connectorItems.lastSeenAt).toBeDefined();
  });
});

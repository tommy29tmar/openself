import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockResolveOwnerScopeForWorker = vi.fn().mockReturnValue({
  cognitiveOwnerKey: "owner-1",
  knowledgeReadKeys: ["sess-1"],
  knowledgePrimaryKey: "sess-1",
  currentSessionId: "sess-1",
});

vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScopeForWorker: (...args: unknown[]) => mockResolveOwnerScopeForWorker(...args),
}));

const mockGetActiveConnectors = vi.fn().mockReturnValue([]);
const mockUpdateConnectorStatus = vi.fn();

vi.mock("@/lib/connectors/connector-service", () => ({
  getActiveConnectors: (...args: unknown[]) => mockGetActiveConnectors(...args),
  updateConnectorStatus: (...args: unknown[]) => mockUpdateConnectorStatus(...args),
}));

const mockGetConnector = vi.fn().mockReturnValue(undefined);

vi.mock("@/lib/connectors/registry", () => ({
  getConnector: (...args: unknown[]) => mockGetConnector(...args),
}));

// Mock sync_log insert
const mockInsertSyncLog = vi.fn().mockReturnValue({
  values: vi.fn().mockReturnValue({ run: vi.fn() }),
});

vi.mock("@/lib/db", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsertSyncLog(...args),
  },
  sqlite: {},
}));

vi.mock("@/lib/db/schema", () => ({
  syncLog: { id: "id", connectorId: "connector_id", status: "status" },
}));

const { handleConnectorSync } = await import("@/lib/connectors/connector-sync-handler");

describe("connector-sync-handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws if ownerKey is missing", async () => {
    await expect(handleConnectorSync({})).rejects.toThrow("missing ownerKey");
  });

  it("resolves owner scope from ownerKey", async () => {
    mockGetActiveConnectors.mockReturnValue([]);
    await handleConnectorSync({ ownerKey: "owner-1" });
    expect(mockResolveOwnerScopeForWorker).toHaveBeenCalledWith("owner-1");
  });

  it("does nothing for owners with no active connectors", async () => {
    mockGetActiveConnectors.mockReturnValue([]);
    await handleConnectorSync({ ownerKey: "owner-1" });
    expect(mockInsertSyncLog).not.toHaveBeenCalled();
  });

  it("writes sync_log entry for each connector", async () => {
    mockGetActiveConnectors.mockReturnValue([
      { id: "c1", connectorType: "github", status: "connected" },
      { id: "c2", connectorType: "linkedin_zip", status: "connected" },
    ]);
    mockGetConnector.mockReturnValue({ type: "github", displayName: "GitHub" });

    await handleConnectorSync({ ownerKey: "owner-1" });

    // sync_log insert called twice (once per connector)
    expect(mockInsertSyncLog).toHaveBeenCalledTimes(2);
  });

  it("logs warning for unknown connector type", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockGetActiveConnectors.mockReturnValue([
      { id: "c1", connectorType: "unknown_type", status: "connected" },
    ]);
    mockGetConnector.mockReturnValue(undefined);

    await handleConnectorSync({ ownerKey: "owner-1" });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Unknown type: unknown_type"),
    );
    warnSpy.mockRestore();
  });

  it("marks connector as error on failure and continues to next", async () => {
    mockGetActiveConnectors.mockReturnValue([
      { id: "c-fail", connectorType: "github", status: "connected" },
      { id: "c-ok", connectorType: "github", status: "connected" },
    ]);

    // First connector throws during processing
    let callCount = 0;
    mockGetConnector.mockImplementation(() => {
      callCount++;
      if (callCount === 1) throw new Error("API down");
      return { type: "github", displayName: "GitHub" };
    });

    await handleConnectorSync({ ownerKey: "owner-1" });

    // First connector marked as error
    expect(mockUpdateConnectorStatus).toHaveBeenCalledWith("c-fail", "error", "API down");
    // Both get sync_log entries (error + partial)
    expect(mockInsertSyncLog).toHaveBeenCalledTimes(2);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockResolveOwnerScopeForWorker = vi.fn().mockReturnValue({
  cognitiveOwnerKey: "owner-1",
  knowledgeReadKeys: ["sess-1"],
  knowledgePrimaryKey: "sess-1",
  currentSessionId: "sess-1",
});

vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScopeForWorker: (...args: any[]) => mockResolveOwnerScopeForWorker(...args),
}));

const mockGetActiveConnectors = vi.fn().mockReturnValue([]);
const mockUpdateConnectorStatus = vi.fn();

vi.mock("@/lib/connectors/connector-service", () => ({
  getActiveConnectors: (...args: any[]) => mockGetActiveConnectors(...args),
  updateConnectorStatus: (...args: any[]) => mockUpdateConnectorStatus(...args),
}));

const mockGetConnector = vi.fn().mockReturnValue(undefined);

vi.mock("@/lib/connectors/registry", () => ({
  getConnector: (...args: any[]) => mockGetConnector(...args),
}));

// Mock sync_log insert — capture values for assertion
const mockSyncLogValues = vi.fn().mockReturnValue({ run: vi.fn() });
const mockInsertSyncLog = vi.fn().mockReturnValue({
  values: (...args: any[]) => mockSyncLogValues(...args),
});

vi.mock("@/lib/db", () => ({
  db: {
    insert: (...args: any[]) => mockInsertSyncLog(...args),
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
    mockGetConnector.mockReturnValue({
      type: "github",
      displayName: "GitHub",
      supportsSync: true,
      supportsImport: false,
      // no syncFn — both get "partial" with "no sync implementation"
    });

    await handleConnectorSync({ ownerKey: "owner-1" });

    // sync_log insert called twice (once per connector)
    expect(mockInsertSyncLog).toHaveBeenCalledTimes(2);
    // Both should have "no sync implementation" error since no syncFn
    expect(mockSyncLogValues).toHaveBeenCalledWith(
      expect.objectContaining({ status: "partial", error: "no sync implementation" }),
    );
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
      return { type: "github", displayName: "GitHub", supportsSync: true, supportsImport: false };
    });

    await handleConnectorSync({ ownerKey: "owner-1" });

    // First connector marked as error
    expect(mockUpdateConnectorStatus).toHaveBeenCalledWith("c-fail", "error", "API down");
    // Both get sync_log entries (error + partial for no syncFn)
    expect(mockInsertSyncLog).toHaveBeenCalledTimes(2);
  });

  it("calls syncFn when connector supports sync", async () => {
    const mockSyncFn = vi.fn().mockResolvedValue({ factsCreated: 3, factsUpdated: 1 });
    mockGetActiveConnectors.mockReturnValue([
      { id: "c1", connectorType: "github", status: "connected" },
    ]);
    mockGetConnector.mockReturnValue({
      type: "github",
      displayName: "GitHub",
      supportsSync: true,
      supportsImport: false,
      syncFn: mockSyncFn,
    });

    await handleConnectorSync({ ownerKey: "owner-1" });

    expect(mockSyncFn).toHaveBeenCalledWith("c1", "owner-1");
    expect(mockInsertSyncLog).toHaveBeenCalledTimes(1);
    expect(mockSyncLogValues).toHaveBeenCalledWith(
      expect.objectContaining({
        connectorId: "c1",
        status: "success",
        factsCreated: 3,
        factsUpdated: 1,
        error: null,
      }),
    );
    expect(mockUpdateConnectorStatus).toHaveBeenCalledWith("c1", "connected");
  });

  it("writes error sync_log when syncFn returns error", async () => {
    const mockSyncFn = vi.fn().mockResolvedValue({
      factsCreated: 0,
      factsUpdated: 0,
      error: "token expired",
    });
    mockGetActiveConnectors.mockReturnValue([
      { id: "c1", connectorType: "github", status: "connected" },
    ]);
    mockGetConnector.mockReturnValue({
      type: "github",
      displayName: "GitHub",
      supportsSync: true,
      supportsImport: false,
      syncFn: mockSyncFn,
    });

    await handleConnectorSync({ ownerKey: "owner-1" });

    expect(mockInsertSyncLog).toHaveBeenCalledTimes(1);
    expect(mockSyncLogValues).toHaveBeenCalledWith(
      expect.objectContaining({
        connectorId: "c1",
        status: "error",
        factsCreated: 0,
        factsUpdated: 0,
        error: "token expired",
      }),
    );
    expect(mockUpdateConnectorStatus).toHaveBeenCalledWith("c1", "error", "token expired");
  });

  it("writes partial sync_log for connector without syncFn", async () => {
    mockGetActiveConnectors.mockReturnValue([
      { id: "c1", connectorType: "github", status: "connected" },
    ]);
    mockGetConnector.mockReturnValue({
      type: "github",
      displayName: "GitHub",
      supportsSync: true,
      supportsImport: false,
      // no syncFn
    });

    await handleConnectorSync({ ownerKey: "owner-1" });

    expect(mockInsertSyncLog).toHaveBeenCalledTimes(1);
    expect(mockSyncLogValues).toHaveBeenCalledWith(
      expect.objectContaining({
        connectorId: "c1",
        status: "partial",
        factsCreated: 0,
        factsUpdated: 0,
        error: "no sync implementation",
      }),
    );
    // Should NOT update connector status for partial
    expect(mockUpdateConnectorStatus).not.toHaveBeenCalled();
  });
});

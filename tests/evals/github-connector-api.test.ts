import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockResolveAuthenticatedConnectorScope = vi.fn();
const mockGetConnectorStatus = vi.fn().mockReturnValue([]);
const mockEnqueueJob = vi.fn();

vi.mock("@/lib/connectors/route-auth", () => ({
  resolveAuthenticatedConnectorScope: (...args: unknown[]) =>
    mockResolveAuthenticatedConnectorScope(...args),
}));

vi.mock("@/lib/connectors/connector-service", () => ({
  getConnectorStatus: (...args: unknown[]) => mockGetConnectorStatus(...args),
}));

vi.mock("@/lib/worker", () => ({
  enqueueJob: (...args: unknown[]) => mockEnqueueJob(...args),
}));

vi.mock("@/lib/db", () => ({
  db: {},
  sqlite: {},
}));

const mockHasPendingJob = vi.fn().mockReturnValue(false);
const mockIsSyncRateLimited = vi.fn().mockReturnValue(false);

vi.mock("@/lib/connectors/idempotency", () => ({
  hasPendingJob: (...args: unknown[]) => mockHasPendingJob(...args),
  isSyncRateLimited: (...args: unknown[]) => mockIsSyncRateLimited(...args),
}));

vi.mock("@/lib/db/schema", () => ({
  connectors: {
    id: "id", ownerKey: "owner_key", connectorType: "connector_type",
    status: "status", enabled: "enabled",
  },
}));

const ownerScope = {
  cognitiveOwnerKey: "owner-1",
  knowledgePrimaryKey: "sess-1",
  knowledgeReadKeys: ["sess-1"],
  currentSessionId: "sess-1",
};

describe("POST /api/connectors/github/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when not authenticated", async () => {
    mockResolveAuthenticatedConnectorScope.mockReturnValue(null);

    const { POST } = await import("@/app/api/connectors/github/sync/route");
    const req = new Request("http://localhost/api/connectors/github/sync", { method: "POST" });
    const res = await POST(req as never);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe("AUTH_REQUIRED");
  });

  it("returns 404 when no connected GitHub connector", async () => {
    mockResolveAuthenticatedConnectorScope.mockReturnValue(ownerScope);
    mockGetConnectorStatus.mockReturnValue([]);

    const { POST } = await import("@/app/api/connectors/github/sync/route");
    const req = new Request("http://localhost/api/connectors/github/sync", { method: "POST" });
    const res = await POST(req as never);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe("NOT_CONNECTED");
  });

  it("returns 200 and enqueues sync job when GitHub is connected", async () => {
    mockResolveAuthenticatedConnectorScope.mockReturnValue(ownerScope);
    mockGetConnectorStatus.mockReturnValue([
      { id: "c1", connectorType: "github", status: "connected", enabled: true },
    ]);

    const { POST } = await import("@/app/api/connectors/github/sync/route");
    const req = new Request("http://localhost/api/connectors/github/sync", { method: "POST" });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe("Sync queued");
    expect(mockEnqueueJob).toHaveBeenCalledWith("connector_sync", { ownerKey: "owner-1" });
  });

  it("only matches 'connected' status — not 'error', 'disconnected', or 'paused'", async () => {
    mockResolveAuthenticatedConnectorScope.mockReturnValue(ownerScope);

    for (const status of ["error", "disconnected", "paused"]) {
      mockGetConnectorStatus.mockReturnValue([
        { id: "c1", connectorType: "github", status, enabled: true },
      ]);

      const { POST } = await import("@/app/api/connectors/github/sync/route");
      const req = new Request("http://localhost/api/connectors/github/sync", { method: "POST" });
      const res = await POST(req as never);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe("NOT_CONNECTED");
    }

    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("returns 409 ALREADY_SYNCING when a sync job is pending", async () => {
    mockResolveAuthenticatedConnectorScope.mockReturnValue(ownerScope);
    mockGetConnectorStatus.mockReturnValue([
      { id: "c1", connectorType: "github", status: "connected", enabled: true },
    ]);
    mockHasPendingJob.mockReturnValue(true);

    const { POST } = await import("@/app/api/connectors/github/sync/route");
    const req = new Request("http://localhost/api/connectors/github/sync", { method: "POST" });
    const res = await POST(req as never);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe("ALREADY_SYNCING");
    expect(body.retryable).toBe(true);
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("returns 429 RATE_LIMITED when synced too recently", async () => {
    mockResolveAuthenticatedConnectorScope.mockReturnValue(ownerScope);
    mockGetConnectorStatus.mockReturnValue([
      { id: "c1", connectorType: "github", status: "connected", enabled: true, lastSync: new Date().toISOString() },
    ]);
    mockHasPendingJob.mockReturnValue(false);
    mockIsSyncRateLimited.mockReturnValue(true);

    const { POST } = await import("@/app/api/connectors/github/sync/route");
    const req = new Request("http://localhost/api/connectors/github/sync", { method: "POST" });
    const res = await POST(req as never);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe("RATE_LIMITED");
    expect(body.retryable).toBe(true);
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });
});

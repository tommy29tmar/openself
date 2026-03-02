import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockResolveOwnerScope = vi.fn();
const mockIsMultiUserEnabled = vi.fn().mockReturnValue(true);
const mockGetConnectorStatus = vi.fn().mockReturnValue([]);
const mockDisconnectConnector = vi.fn();
const mockGetConnectorById = vi.fn().mockReturnValue(null);

vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScope: (...args: unknown[]) => mockResolveOwnerScope(...args),
}));

vi.mock("@/lib/services/session-service", () => ({
  isMultiUserEnabled: () => mockIsMultiUserEnabled(),
}));

vi.mock("@/lib/connectors/connector-service", () => ({
  getConnectorStatus: (...args: unknown[]) => mockGetConnectorStatus(...args),
  disconnectConnector: (...args: unknown[]) => mockDisconnectConnector(...args),
  getConnectorById: (...args: unknown[]) => mockGetConnectorById(...args),
}));

vi.mock("@/lib/db", () => ({
  db: {},
  sqlite: {},
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

describe("GET /api/connectors/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsMultiUserEnabled.mockReturnValue(true);
  });

  it("returns 403 when multi-user and no auth", async () => {
    mockResolveOwnerScope.mockReturnValue(null);

    const { GET } = await import("@/app/api/connectors/status/route");
    const res = await GET(new Request("http://localhost/api/connectors/status"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("AUTH_REQUIRED");
  });

  it("returns connector list for authenticated user", async () => {
    mockResolveOwnerScope.mockReturnValue(ownerScope);
    mockGetConnectorStatus.mockReturnValue([
      { id: "c1", connectorType: "github", status: "connected", enabled: true },
    ]);

    const { GET } = await import("@/app/api/connectors/status/route");
    const res = await GET(new Request("http://localhost/api/connectors/status"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.connectors).toHaveLength(1);
    expect(body.connectors[0].connectorType).toBe("github");
  });

  it("returns empty array in single-user mode", async () => {
    mockIsMultiUserEnabled.mockReturnValue(false);
    mockResolveOwnerScope.mockReturnValue(null);
    mockGetConnectorStatus.mockReturnValue([]);

    const { GET } = await import("@/app/api/connectors/status/route");
    const res = await GET(new Request("http://localhost/api/connectors/status"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.connectors).toHaveLength(0);
  });
});

describe("POST /api/connectors/[id]/disconnect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsMultiUserEnabled.mockReturnValue(true);
  });

  it("returns 403 when multi-user and no auth", async () => {
    mockResolveOwnerScope.mockReturnValue(null);

    const { POST } = await import("@/app/api/connectors/[id]/disconnect/route");
    const res = await POST(
      new Request("http://localhost/api/connectors/c1/disconnect", { method: "POST" }),
      { params: Promise.resolve({ id: "c1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when connector does not exist", async () => {
    mockResolveOwnerScope.mockReturnValue(ownerScope);
    mockGetConnectorById.mockReturnValue(null);

    const { POST } = await import("@/app/api/connectors/[id]/disconnect/route");
    const res = await POST(
      new Request("http://localhost/api/connectors/c-nonexistent/disconnect", { method: "POST" }),
      { params: Promise.resolve({ id: "c-nonexistent" }) },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("NOT_FOUND");
  });

  it("returns 403 when connector belongs to different owner", async () => {
    mockResolveOwnerScope.mockReturnValue(ownerScope);
    mockGetConnectorById.mockReturnValue({
      id: "c-other",
      ownerKey: "other-owner",
      connectorType: "github",
    });

    const { POST } = await import("@/app/api/connectors/[id]/disconnect/route");
    const res = await POST(
      new Request("http://localhost/api/connectors/c-other/disconnect", { method: "POST" }),
      { params: Promise.resolve({ id: "c-other" }) },
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("FORBIDDEN");
    expect(mockDisconnectConnector).not.toHaveBeenCalled();
  });

  it("returns 200 when connector belongs to caller", async () => {
    mockResolveOwnerScope.mockReturnValue(ownerScope);
    mockGetConnectorById.mockReturnValue({
      id: "c1",
      ownerKey: "owner-1",
      connectorType: "github",
    });

    const { POST } = await import("@/app/api/connectors/[id]/disconnect/route");
    const res = await POST(
      new Request("http://localhost/api/connectors/c1/disconnect", { method: "POST" }),
      { params: Promise.resolve({ id: "c1" }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockDisconnectConnector).toHaveBeenCalledWith("c1");
  });
});

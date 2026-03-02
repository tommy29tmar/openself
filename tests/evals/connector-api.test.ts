import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockResolveOwnerScope = vi.fn();
const mockIsMultiUserEnabled = vi.fn().mockReturnValue(true);
const mockGetConnectorStatus = vi.fn().mockReturnValue([]);
const mockDisconnectConnector = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScope: (...args: unknown[]) => mockResolveOwnerScope(...args),
}));

vi.mock("@/lib/services/session-service", () => ({
  isMultiUserEnabled: () => mockIsMultiUserEnabled(),
}));

vi.mock("@/lib/connectors/connector-service", () => ({
  getConnectorStatus: (...args: unknown[]) => mockGetConnectorStatus(...args),
  disconnectConnector: (...args: unknown[]) => mockDisconnectConnector(...args),
}));

// Mock DB for connector ownership check
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          get: vi.fn().mockReturnValue(null),
          all: vi.fn().mockReturnValue([]),
        }),
      }),
    }),
  },
  sqlite: {},
}));

vi.mock("@/lib/db/schema", () => ({
  connectors: {
    id: "id", ownerKey: "owner_key", connectorType: "connector_type",
    status: "status", enabled: "enabled",
  },
}));

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
    mockResolveOwnerScope.mockReturnValue({
      cognitiveOwnerKey: "owner-1",
      knowledgePrimaryKey: "sess-1",
      knowledgeReadKeys: ["sess-1"],
      currentSessionId: "sess-1",
    });
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

  it("returns 200 on successful disconnect", async () => {
    mockResolveOwnerScope.mockReturnValue({
      cognitiveOwnerKey: "owner-1",
      knowledgePrimaryKey: "sess-1",
      knowledgeReadKeys: ["sess-1"],
      currentSessionId: "sess-1",
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

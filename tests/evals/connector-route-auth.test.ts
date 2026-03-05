import { beforeEach, describe, expect, it, vi } from "vitest";

const mockResolveOwnerScope = vi.fn();
const mockGetAuthContext = vi.fn();
const mockIsMultiUserEnabled = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScope: (...args: unknown[]) => mockResolveOwnerScope(...args),
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
}));

vi.mock("@/lib/services/session-service", () => ({
  isMultiUserEnabled: () => mockIsMultiUserEnabled(),
}));

const ownerScope = {
  cognitiveOwnerKey: "owner-1",
  knowledgePrimaryKey: "sess-1",
  knowledgeReadKeys: ["sess-1"],
  currentSessionId: "sess-1",
};

describe("resolveAuthenticatedConnectorScope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no scope is available", async () => {
    mockIsMultiUserEnabled.mockReturnValue(true);
    mockResolveOwnerScope.mockReturnValue(null);

    const { resolveAuthenticatedConnectorScope } = await import("@/lib/connectors/route-auth");
    expect(resolveAuthenticatedConnectorScope(new Request("http://localhost"))).toBeNull();
  });

  it("rejects anonymous multi-user sessions even if owner scope exists", async () => {
    mockIsMultiUserEnabled.mockReturnValue(true);
    mockResolveOwnerScope.mockReturnValue(ownerScope);
    mockGetAuthContext.mockReturnValue({ userId: null, username: null });

    const { resolveAuthenticatedConnectorScope } = await import("@/lib/connectors/route-auth");
    expect(resolveAuthenticatedConnectorScope(new Request("http://localhost"))).toBeNull();
  });

  it("accepts legacy username-only sessions in multi-user mode", async () => {
    mockIsMultiUserEnabled.mockReturnValue(true);
    mockResolveOwnerScope.mockReturnValue(ownerScope);
    mockGetAuthContext.mockReturnValue({ userId: null, username: "alice" });

    const { resolveAuthenticatedConnectorScope } = await import("@/lib/connectors/route-auth");
    expect(resolveAuthenticatedConnectorScope(new Request("http://localhost"))).toEqual(ownerScope);
  });

  it("accepts single-user requests without auth context", async () => {
    mockIsMultiUserEnabled.mockReturnValue(false);
    mockResolveOwnerScope.mockReturnValue(ownerScope);
    mockGetAuthContext.mockReturnValue(null);

    const { resolveAuthenticatedConnectorScope } = await import("@/lib/connectors/route-auth");
    expect(resolveAuthenticatedConnectorScope(new Request("http://localhost"))).toEqual(ownerScope);
  });
});

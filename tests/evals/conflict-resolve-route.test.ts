import { beforeEach, describe, expect, it, vi } from "vitest";

const mockResolveOwnerScope = vi.fn();
const mockIsMultiUserEnabled = vi.fn();
const mockResolveConflict = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScope: (...args: unknown[]) => mockResolveOwnerScope(...args),
}));

vi.mock("@/lib/services/session-service", () => ({
  isMultiUserEnabled: (...args: unknown[]) => mockIsMultiUserEnabled(...args),
}));

vi.mock("@/lib/services/conflict-service", () => ({
  resolveConflict: (...args: unknown[]) => mockResolveConflict(...args),
}));

const { POST } = await import("@/app/api/conflicts/[id]/resolve/route");

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/conflicts/conflict-1/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/conflicts/[id]/resolve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsMultiUserEnabled.mockReturnValue(true);
    mockResolveOwnerScope.mockReturnValue({
      cognitiveOwnerKey: "owner-1",
      knowledgeReadKeys: ["session-1"],
      knowledgePrimaryKey: "session-1",
      currentSessionId: "session-1",
    });
    mockResolveConflict.mockReturnValue({ success: true });
  });

  it("passes the scoped ownerKey to resolveConflict", async () => {
    const res = await POST(
      makeRequest({ resolution: "keep_a" }),
      { params: Promise.resolve({ id: "conflict-1" }) },
    );

    expect(res.status).toBe(200);
    expect(mockResolveConflict).toHaveBeenCalledWith(
      "conflict-1",
      "owner-1",
      "keep_a",
      undefined,
    );
  });

  it("maps conflict-not-found service result to 404", async () => {
    mockResolveConflict.mockReturnValue({
      success: false,
      error: "Conflict not found or already resolved",
    });

    const res = await POST(
      makeRequest({ resolution: "keep_b" }),
      { params: Promise.resolve({ id: "conflict-1" }) },
    );

    expect(res.status).toBe(404);
  });

  it("returns 500 for unexpected service errors", async () => {
    mockResolveConflict.mockImplementation(() => {
      throw new Error("db exploded");
    });

    const res = await POST(
      makeRequest({ resolution: "dismissed" }),
      { params: Promise.resolve({ id: "conflict-1" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Internal server error");
  });
});

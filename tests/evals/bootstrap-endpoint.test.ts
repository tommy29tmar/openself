// tests/evals/bootstrap-endpoint.test.ts

/**
 * Tests for GET /api/chat/bootstrap endpoint.
 * Mocks journey module and auth to verify the endpoint wiring.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock dependencies ---

const mockBootstrapPayload = {
  journeyState: "first_visit" as const,
  situations: [],
  expertiseLevel: "novice" as const,
  userName: null,
  lastSeenDaysAgo: null,
  publishedUsername: null,
  pendingProposalCount: 0,
  thinSections: [],
  staleFacts: [],
  openConflicts: [],
  archivableFacts: [],
  language: "en",
  conversationContext: null,
  archetype: "generalist",
};

vi.mock("@/lib/agent/journey", () => ({
  assembleBootstrapPayload: vi.fn(() => ({ payload: { ...mockBootstrapPayload }, data: { facts: [], soul: null, openConflictRecords: [], publishableFacts: [] } })),
}));

vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScope: vi.fn(() => ({
    cognitiveOwnerKey: "cog-1",
    knowledgeReadKeys: ["sess-a"],
    knowledgePrimaryKey: "sess-a",
    currentSessionId: "sess-a",
  })),
  getAuthContext: vi.fn(() => null),
}));

vi.mock("@/lib/services/session-service", () => ({
  isMultiUserEnabled: vi.fn(() => false),
  DEFAULT_SESSION_ID: "__default__",
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
}));

import { GET } from "@/app/api/chat/bootstrap/route";
import { assembleBootstrapPayload } from "@/lib/agent/journey";
import { resolveOwnerScope } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/chat/bootstrap", () => {
  it("returns 200 with bootstrap payload in single-user mode", async () => {
    const req = new Request("http://localhost:3000/api/chat/bootstrap");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.journeyState).toBe("first_visit");
    expect(body.expertiseLevel).toBe("novice");
    expect(body.language).toBe("en");
  });

  it("passes language query param through to payload", async () => {
    const req = new Request("http://localhost:3000/api/chat/bootstrap?language=it");
    await GET(req);

    expect(vi.mocked(assembleBootstrapPayload)).toHaveBeenCalledWith(
      expect.any(Object),
      "it",
      undefined,
    );
  });

  it("defaults language to en when not provided", async () => {
    const req = new Request("http://localhost:3000/api/chat/bootstrap");
    await GET(req);

    expect(vi.mocked(assembleBootstrapPayload)).toHaveBeenCalledWith(
      expect.any(Object),
      "en",
      undefined,
    );
  });

  it("returns 401 in multi-user mode when scope is null", async () => {
    vi.mocked(isMultiUserEnabled).mockReturnValue(true);
    vi.mocked(resolveOwnerScope).mockReturnValue(null as never);

    const req = new Request("http://localhost:3000/api/chat/bootstrap");
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("uses effectiveScope from resolveOwnerScope in multi-user mode", async () => {
    const { getAuthContext } = await import("@/lib/auth/session");
    vi.mocked(isMultiUserEnabled).mockReturnValue(true);
    vi.mocked(resolveOwnerScope).mockReturnValue({
      cognitiveOwnerKey: "profile-1",
      knowledgeReadKeys: ["sess-x", "sess-y"],
      knowledgePrimaryKey: "sess-x",
      currentSessionId: "sess-y",
    });
    vi.mocked(getAuthContext).mockReturnValue({
      sessionId: "sess-x",
      profileId: "profile-1",
      userId: "user-1",
      username: "marco",
    });

    const req = new Request("http://localhost:3000/api/chat/bootstrap?language=de");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(vi.mocked(assembleBootstrapPayload)).toHaveBeenCalledWith(
      {
        cognitiveOwnerKey: "profile-1",
        knowledgeReadKeys: ["sess-x", "sess-y"],
        knowledgePrimaryKey: "sess-x",
        currentSessionId: "sess-y",
      },
      "de",
      expect.objectContaining({ authenticated: true }), // authInfo
    );
  });

  it("returns correct Content-Type header", async () => {
    const req = new Request("http://localhost:3000/api/chat/bootstrap");
    const res = await GET(req);

    expect(res.headers.get("Content-Type")).toBe("application/json");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetAuthContext, mockMarkStaleProposals, mockGetPendingProposals } = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockMarkStaleProposals: vi.fn(),
  mockGetPendingProposals: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getAuthContext: mockGetAuthContext,
  getSessionIdFromRequest: vi.fn(),
}));

vi.mock("@/lib/services/proposal-service", () => ({
  markStaleProposals: mockMarkStaleProposals,
  getPendingProposals: mockGetPendingProposals,
}));

vi.mock("@/lib/services/event-service", () => ({
  logEvent: vi.fn(),
}));

import { GET } from "@/app/api/proposals/route";

function makeRequest(): Request {
  return new Request("http://localhost:3000/api/proposals", { method: "GET" });
}

describe("GET /api/proposals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no auth", async () => {
    mockGetAuthContext.mockReturnValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 200 with proposals when markStaleProposals succeeds", async () => {
    mockGetAuthContext.mockReturnValue({ sessionId: "s1", profileId: "p1", userId: null, username: null });
    mockMarkStaleProposals.mockReturnValue(0);
    mockGetPendingProposals.mockReturnValue([{ id: "pr1", sectionType: "bio" }]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.proposals).toHaveLength(1);
  });

  it("returns 200 with empty proposals when markStaleProposals throws", async () => {
    mockGetAuthContext.mockReturnValue({ sessionId: "s1", profileId: "p1", userId: null, username: null });
    mockMarkStaleProposals.mockImplementation(() => { throw new Error("resolveOwnerScopeForWorker failed"); });
    mockGetPendingProposals.mockReturnValue([]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.proposals).toEqual([]);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAuthContext = vi.fn();
const mockGetPendingProposals = vi.fn();
const mockAcceptProposal = vi.fn();
const mockRejectProposal = vi.fn();
const mockSqliteExec = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  getAuthContext: (...args: any[]) => mockGetAuthContext(...args),
}));

vi.mock("@/lib/services/proposal-service", () => ({
  getPendingProposals: (...args: any[]) => mockGetPendingProposals(...args),
  acceptProposal: (...args: any[]) => mockAcceptProposal(...args),
  rejectProposal: (...args: any[]) => mockRejectProposal(...args),
}));

vi.mock("@/lib/db", () => ({
  sqlite: {
    exec: (...args: any[]) => mockSqliteExec(...args),
  },
}));

const acceptRoute = await import("@/app/api/proposals/[id]/accept/route");
const rejectRoute = await import("@/app/api/proposals/[id]/reject/route");
const acceptAllRoute = await import("@/app/api/proposals/accept-all/route");

function makeRequest(): Request {
  return new Request("http://localhost/api/proposals", { method: "POST" });
}

describe("proposal mutation routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockReturnValue({
      sessionId: "session-1",
      profileId: "profile-1",
      userId: "user-1",
      username: "alice",
    });
    mockAcceptProposal.mockReturnValue({ ok: true });
    mockRejectProposal.mockReturnValue({ ok: true });
    mockGetPendingProposals.mockReturnValue([
      { id: 10, sectionType: "bio" },
      { id: 11, sectionType: "hero" },
    ]);
  });

  it("accept route scopes the mutation to auth.profileId", async () => {
    const res = await acceptRoute.POST(
      makeRequest(),
      { params: Promise.resolve({ id: "10" }) },
    );

    expect(res.status).toBe(200);
    expect(mockAcceptProposal).toHaveBeenCalledWith(10, "profile-1");
  });

  it("accept route maps missing proposal to 404", async () => {
    mockAcceptProposal.mockReturnValue({ ok: false, error: "PROPOSAL_NOT_FOUND" });

    const res = await acceptRoute.POST(
      makeRequest(),
      { params: Promise.resolve({ id: "10" }) },
    );

    expect(res.status).toBe(404);
  });

  it("reject route scopes the mutation to auth.profileId", async () => {
    const res = await rejectRoute.POST(
      makeRequest(),
      { params: Promise.resolve({ id: "12" }) },
    );

    expect(res.status).toBe(200);
    expect(mockRejectProposal).toHaveBeenCalledWith(12, "profile-1");
  });

  it("reject route maps missing proposal to 404", async () => {
    mockRejectProposal.mockReturnValue({ ok: false, error: "PROPOSAL_NOT_FOUND" });

    const res = await rejectRoute.POST(
      makeRequest(),
      { params: Promise.resolve({ id: "12" }) },
    );

    expect(res.status).toBe(404);
  });

  it("accept-all passes auth.profileId into every acceptProposal call", async () => {
    const res = await acceptAllRoute.POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.accepted).toBe(2);
    expect(mockGetPendingProposals).toHaveBeenCalledWith("profile-1");
    expect(mockAcceptProposal).toHaveBeenNthCalledWith(1, 10, "profile-1");
    expect(mockAcceptProposal).toHaveBeenNthCalledWith(2, 11, "profile-1");
    expect(mockSqliteExec).toHaveBeenCalledWith("BEGIN");
    expect(mockSqliteExec).toHaveBeenCalledWith("COMMIT");
  });
});

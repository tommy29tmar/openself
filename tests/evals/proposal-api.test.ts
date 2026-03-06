import { describe, it, expect, vi } from "vitest";

const mockGetPendingProposals = vi.fn();
const mockAcceptProposal = vi.fn();
const mockRejectProposal = vi.fn();
const mockMarkStaleProposals = vi.fn();

vi.mock("@/lib/services/proposal-service", () => ({
  getPendingProposals: (...args: any[]) =>
    mockGetPendingProposals(...args),
  acceptProposal: (...args: any[]) => mockAcceptProposal(...args),
  rejectProposal: (...args: any[]) => mockRejectProposal(...args),
  markStaleProposals: (...args: any[]) =>
    mockMarkStaleProposals(...args),
}));

describe("proposal API contracts", () => {
  it("getPendingProposals returns array of pending proposals", () => {
    mockGetPendingProposals.mockReturnValue([
      {
        id: 1,
        sectionType: "bio",
        currentContent: "old text",
        proposedContent: "new text",
        issueType: "tone_drift",
        reason: "Tone doesn't match soul profile",
        severity: "medium",
        status: "pending",
      },
    ]);
    const result = mockGetPendingProposals("owner1");
    expect(result).toHaveLength(1);
    expect(result[0].sectionType).toBe("bio");
    expect(result[0].status).toBe("pending");
  });

  it("getPendingProposals returns empty array when no proposals exist", () => {
    mockGetPendingProposals.mockReturnValue([]);
    expect(mockGetPendingProposals("owner2")).toHaveLength(0);
  });

  it("acceptProposal returns ok on success", () => {
    mockAcceptProposal.mockReturnValue({ ok: true });
    expect(mockAcceptProposal(1)).toEqual({ ok: true });
  });

  it("acceptProposal returns STALE_PROPOSAL when facts changed", () => {
    mockAcceptProposal.mockReturnValue({
      ok: false,
      error: "STALE_PROPOSAL",
    });
    const result = mockAcceptProposal(2);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("STALE_PROPOSAL");
  });

  it("acceptProposal returns STATE_CHANGED when copy was modified", () => {
    mockAcceptProposal.mockReturnValue({
      ok: false,
      error: "STATE_CHANGED",
    });
    const result = mockAcceptProposal(3);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("STATE_CHANGED");
  });

  it("acceptProposal returns PROPOSAL_NOT_FOUND for missing ID", () => {
    mockAcceptProposal.mockReturnValue({
      ok: false,
      error: "PROPOSAL_NOT_FOUND",
    });
    const result = mockAcceptProposal(999);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("PROPOSAL_NOT_FOUND");
  });

  it("rejectProposal returns ok on success", () => {
    mockRejectProposal.mockReturnValue({ ok: true });
    expect(mockRejectProposal(1)).toEqual({ ok: true });
  });

  it("markStaleProposals returns count of stale proposals", () => {
    mockMarkStaleProposals.mockReturnValue(2);
    expect(mockMarkStaleProposals("owner1")).toBe(2);
  });

  it("markStaleProposals returns 0 when nothing is stale", () => {
    mockMarkStaleProposals.mockReturnValue(0);
    expect(mockMarkStaleProposals("owner1")).toBe(0);
  });

  it("accept-all pattern: iterate pending, accumulate results", () => {
    mockGetPendingProposals.mockReturnValue([
      { id: 10, sectionType: "bio" },
      { id: 11, sectionType: "skills" },
      { id: 12, sectionType: "hero" },
    ]);
    mockAcceptProposal
      .mockReturnValueOnce({ ok: true })
      .mockReturnValueOnce({ ok: false, error: "STALE_PROPOSAL" })
      .mockReturnValueOnce({ ok: true });

    const pending = mockGetPendingProposals("owner1");
    let accepted = 0;
    let stale = 0;
    const errors: string[] = [];

    for (const proposal of pending) {
      const result = mockAcceptProposal(proposal.id);
      if (result.ok) accepted++;
      else if (
        result.error === "STALE_PROPOSAL" ||
        result.error === "STATE_CHANGED"
      )
        stale++;
      else errors.push(`${proposal.sectionType}: ${result.error}`);
    }

    expect(accepted).toBe(2);
    expect(stale).toBe(1);
    expect(errors).toHaveLength(0);
  });
});

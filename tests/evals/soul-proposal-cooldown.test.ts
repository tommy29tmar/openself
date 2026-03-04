import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGet = vi.fn();
vi.mock("@/lib/db", () => ({
  sqlite: {
    prepare: vi.fn(() => ({
      get: mockGet,
      all: vi.fn(() => []),
      run: vi.fn(),
    })),
  },
  db: {},
}));
vi.mock("@/lib/services/soul-service", () => ({
  getActiveSoul: vi.fn(() => null),
  getPendingProposals: vi.fn(() => []),
  proposeSoulChange: vi.fn(),
}));
vi.mock("@/lib/services/event-service", () => ({ logEvent: vi.fn() }));

import { getSoulProposalCooldownStatus } from "@/lib/agent/journey";

describe("getSoulProposalCooldownStatus", () => {
  beforeEach(() => mockGet.mockReset());

  it("returns { blocked: false } when no rejection on record", () => {
    mockGet.mockReturnValue({ latest: null });
    expect(getSoulProposalCooldownStatus("owner1").blocked).toBe(false);
  });

  it("returns { blocked: true } when rejected within 30 days", () => {
    const recent = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    mockGet.mockReturnValue({ latest: recent });
    expect(getSoulProposalCooldownStatus("owner1").blocked).toBe(true);
  });

  it("returns { blocked: false } when rejected exactly 30 days + 1ms ago", () => {
    const old = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000 + 1)).toISOString();
    mockGet.mockReturnValue({ latest: old });
    expect(getSoulProposalCooldownStatus("owner1").blocked).toBe(false);
  });
});

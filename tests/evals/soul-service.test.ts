/**
 * Tests for Sub-Phase 4: Soul Service — profiles, overlays, proposals, expiry.
 * Uses real DB (SQLite + auto-migrations on import).
 */
import { describe, it, expect, vi } from "vitest";
import {
  getActiveSoul,
  updateSoulOverlay,
  proposeSoulChange,
  getPendingProposals,
  reviewProposal,
  expireStaleProposals,
} from "@/lib/services/soul-service";
import { sqlite } from "@/lib/db";
import { randomUUID } from "crypto";

function ownerKey(): string {
  return `test-owner-${randomUUID()}`;
}

// --- Tests ---

describe("Soul Service", () => {
  // 1. No soul exists
  it("getActiveSoul returns null when no soul exists", () => {
    const result = getActiveSoul(ownerKey());
    expect(result).toBeNull();
  });

  // 2. First overlay creates version 1
  it("updateSoulOverlay creates first soul (version 1, isActive, compiled)", () => {
    const key = ownerKey();
    const overlay = { voice: "warm", tone: "friendly" };
    const soul = updateSoulOverlay(key, overlay);

    expect(soul.version).toBe(1);
    expect(soul.isActive).toBe(1);
    expect(soul.ownerKey).toBe(key);
    expect(soul.overlay).toEqual(overlay);
    expect(soul.compiled).toContain("Voice: warm");
    expect(soul.compiled).toContain("Tone: friendly");
  });

  // 3. Second call creates version 2, deactivates version 1
  it("updateSoulOverlay second call creates version 2 and deactivates v1", () => {
    const key = ownerKey();
    const v1 = updateSoulOverlay(key, { voice: "calm" });
    const v2 = updateSoulOverlay(key, { voice: "bold" });

    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);

    // v1 should be deactivated in DB
    const row = sqlite
      .prepare("SELECT is_active FROM soul_profiles WHERE id = ?")
      .get(v1.id) as { is_active: number };
    expect(row.is_active).toBe(0);
  });

  // 4. getActiveSoul returns only the active version
  it("getActiveSoul returns only the active version", () => {
    const key = ownerKey();
    updateSoulOverlay(key, { voice: "v1" });
    updateSoulOverlay(key, { voice: "v2" });
    const active = getActiveSoul(key);

    expect(active).not.toBeNull();
    expect(active!.version).toBe(2);
    expect(active!.overlay).toEqual({ voice: "v2" });
  });

  // 5. proposeSoulChange creates a pending proposal
  it("proposeSoulChange creates a pending proposal", () => {
    const key = ownerKey();
    updateSoulOverlay(key, { voice: "original" });
    const proposal = proposeSoulChange(key, { tone: "playful" }, "user asked");

    expect(proposal.status).toBe("pending");
    expect(proposal.ownerKey).toBe(key);
    expect(proposal.proposedOverlay).toEqual({ tone: "playful" });
    expect(proposal.reason).toBe("user asked");
    expect(proposal.soulProfileId).not.toBeNull();
  });

  // 6. getPendingProposals returns only pending proposals for owner
  it("getPendingProposals returns only pending proposals for owner", () => {
    const key = ownerKey();
    const otherKey = ownerKey();
    proposeSoulChange(key, { tone: "a" });
    proposeSoulChange(key, { tone: "b" });
    proposeSoulChange(otherKey, { tone: "c" });

    const pending = getPendingProposals(key);
    expect(pending).toHaveLength(2);
    expect(pending.every((p) => p.ownerKey === key)).toBe(true);
  });

  // 7. reviewProposal accept: marks accepted, applies overlay to soul
  it("reviewProposal accept applies overlay and creates new soul version", () => {
    const key = ownerKey();
    updateSoulOverlay(key, { voice: "calm", tone: "warm" });
    const proposal = proposeSoulChange(key, { tone: "energetic" }, "shift tone");

    const result = reviewProposal(proposal.id, key, true);
    expect(result.success).toBe(true);

    const soul = getActiveSoul(key);
    expect(soul).not.toBeNull();
    // Merged: voice kept from existing, tone updated from proposal
    expect(soul!.overlay).toMatchObject({ voice: "calm", tone: "energetic" });

    // Proposal status in DB
    const row = sqlite
      .prepare("SELECT status FROM soul_change_proposals WHERE id = ?")
      .get(proposal.id) as { status: string };
    expect(row.status).toBe("accepted");
  });

  it("reviewProposal accept rolls back proposal status if soul update fails", () => {
    const key = ownerKey();
    const soulBefore = updateSoulOverlay(key, { voice: "calm", tone: "warm" });
    const proposal = proposeSoulChange(key, { tone: "energetic" }, "shift tone");
    const originalPrepare = sqlite.prepare.bind(sqlite);
    const prepareSpy = vi.spyOn(sqlite, "prepare").mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO soul_profiles")) {
        throw new Error("forced soul insert failure");
      }
      return originalPrepare(sql);
    });

    try {
      expect(() => reviewProposal(proposal.id, key, true)).toThrow("forced soul insert failure");
    } finally {
      prepareSpy.mockRestore();
    }

    const proposalRow = sqlite
      .prepare("SELECT status, resolved_at FROM soul_change_proposals WHERE id = ?")
      .get(proposal.id) as { status: string; resolved_at: string | null };
    expect(proposalRow.status).toBe("pending");
    expect(proposalRow.resolved_at).toBeNull();

    const soulAfter = getActiveSoul(key);
    expect(soulAfter).not.toBeNull();
    expect(soulAfter!.id).toBe(soulBefore.id);
    expect(soulAfter!.overlay).toEqual(soulBefore.overlay);
  });

  // 8. reviewProposal reject: marks rejected, no soul change
  it("reviewProposal reject marks rejected without changing soul", () => {
    const key = ownerKey();
    updateSoulOverlay(key, { voice: "calm" });
    const soulBefore = getActiveSoul(key);
    const proposal = proposeSoulChange(key, { voice: "chaotic" });

    const result = reviewProposal(proposal.id, key, false);
    expect(result.success).toBe(true);

    const soulAfter = getActiveSoul(key);
    expect(soulAfter!.id).toBe(soulBefore!.id);
    expect(soulAfter!.overlay).toEqual({ voice: "calm" });

    const row = sqlite
      .prepare("SELECT status FROM soul_change_proposals WHERE id = ?")
      .get(proposal.id) as { status: string };
    expect(row.status).toBe("rejected");
  });

  // 9. reviewProposal idempotent: second call returns error
  it("reviewProposal is idempotent — second call returns error", () => {
    const key = ownerKey();
    updateSoulOverlay(key, { voice: "x" });
    const proposal = proposeSoulChange(key, { voice: "y" });

    const first = reviewProposal(proposal.id, key, true);
    expect(first.success).toBe(true);

    const second = reviewProposal(proposal.id, key, true);
    expect(second.success).toBe(false);
    expect(second.error).toMatch(/already resolved/i);
  });

  // 10. expireStaleProposals expires old proposals
  it("expireStaleProposals expires proposals older than TTL", () => {
    const key = ownerKey();
    const id = randomUUID();
    const oldDate = "2020-01-01T00:00:00Z";

    // Insert a stale proposal directly via SQL
    sqlite
      .prepare(
        `INSERT INTO soul_change_proposals(id, owner_key, proposed_overlay, reason, status, created_at)
         VALUES (?, ?, '{"voice":"old"}', 'stale', 'pending', ?)`,
      )
      .run(id, key, oldDate);

    const expired = expireStaleProposals(48);
    expect(expired).toBeGreaterThanOrEqual(1);

    const row = sqlite
      .prepare("SELECT status FROM soul_change_proposals WHERE id = ?")
      .get(id) as { status: string };
    expect(row.status).toBe("expired");
  });

  // 11. Compiled soul string includes all overlay fields
  it("compiled string includes voice, tone, values, selfDescription, communicationStyle", () => {
    const key = ownerKey();
    const overlay = {
      voice: "warm",
      tone: "reflective",
      values: ["honesty", "curiosity"],
      selfDescription: "A lifelong learner",
      communicationStyle: "concise and direct",
    };
    const soul = updateSoulOverlay(key, overlay);

    expect(soul.compiled).toContain("Voice: warm");
    expect(soul.compiled).toContain("Tone: reflective");
    expect(soul.compiled).toContain("Values: honesty, curiosity");
    expect(soul.compiled).toContain("Self-description: A lifelong learner");
    expect(soul.compiled).toContain("Communication style: concise and direct");
  });

  // 12. Unique active constraint: only one active soul per owner
  it("only one active soul per owner at any time", () => {
    const key = ownerKey();
    updateSoulOverlay(key, { voice: "a" });
    updateSoulOverlay(key, { voice: "b" });
    updateSoulOverlay(key, { voice: "c" });

    const rows = sqlite
      .prepare("SELECT id FROM soul_profiles WHERE owner_key = ? AND is_active = 1")
      .all(key) as { id: string }[];
    expect(rows).toHaveLength(1);

    // Total versions should be 3
    const all = sqlite
      .prepare("SELECT id FROM soul_profiles WHERE owner_key = ?")
      .all(key) as { id: string }[];
    expect(all).toHaveLength(3);
  });
});

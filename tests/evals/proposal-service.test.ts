import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";

let testSqlite: ReturnType<typeof Database>;
let testDb: ReturnType<typeof drizzle>;

function setupDb() {
  testSqlite = new Database(":memory:");
  testSqlite.pragma("journal_mode = WAL");

  testSqlite.exec(`
    CREATE TABLE section_copy_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_key TEXT NOT NULL,
      section_type TEXT NOT NULL,
      language TEXT NOT NULL,
      personalized_content TEXT NOT NULL,
      facts_hash TEXT NOT NULL,
      soul_hash TEXT NOT NULL,
      approved_at TEXT NOT NULL DEFAULT (datetime('now')),
      source TEXT NOT NULL DEFAULT 'live',
      UNIQUE(owner_key, section_type, language)
    );
    CREATE TABLE section_copy_proposals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_key TEXT NOT NULL,
      section_type TEXT NOT NULL,
      language TEXT NOT NULL,
      current_content TEXT NOT NULL,
      proposed_content TEXT NOT NULL,
      issue_type TEXT NOT NULL,
      reason TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'low',
      status TEXT NOT NULL DEFAULT 'pending',
      facts_hash TEXT NOT NULL,
      soul_hash TEXT NOT NULL,
      baseline_state_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      reviewed_at TEXT
    );
  `);

  testDb = drizzle(testSqlite, { schema });
}

// Mock external dependencies
const mockComputeSectionFactsHash = vi.fn().mockReturnValue("facts-hash-1");
const mockGetAllFacts = vi.fn().mockReturnValue([]);
const mockFilterPublishableFacts = vi.fn().mockReturnValue([]);
const mockGetActiveSoul = vi.fn().mockReturnValue({ compiled: "Warm tone" });
const mockResolveOwnerScopeForWorker = vi.fn().mockReturnValue({
  cognitiveOwnerKey: "owner1",
  knowledgeReadKeys: ["s1"],
  knowledgePrimaryKey: "s1",
  currentSessionId: "s1",
});

vi.mock("@/lib/services/personalization-hashing", () => ({
  computeHash: (s: string) =>
    require("crypto").createHash("sha256").update(s).digest("hex"),
  computeSectionFactsHash: (...args: unknown[]) =>
    mockComputeSectionFactsHash(...args),
  SECTION_FACT_CATEGORIES: { bio: ["identity"] },
}));

vi.mock("@/lib/services/kb-service", () => ({
  getAllFacts: (...args: unknown[]) => mockGetAllFacts(...args),
}));

vi.mock("@/lib/services/page-projection", () => ({
  filterPublishableFacts: (...args: unknown[]) =>
    mockFilterPublishableFacts(...args),
}));

vi.mock("@/lib/services/soul-service", () => ({
  getActiveSoul: (...args: unknown[]) => mockGetActiveSoul(...args),
}));

vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScopeForWorker: (...args: unknown[]) =>
    mockResolveOwnerScopeForWorker(...args),
}));

import { createProposalService, type CreateProposalInput } from "@/lib/services/proposal-service";
import { computeHash } from "@/lib/services/personalization-hashing";

function makeProposal(overrides: Partial<CreateProposalInput> = {}): CreateProposalInput {
  return {
    ownerKey: "owner1",
    sectionType: "bio",
    language: "en",
    currentContent: "A developer who loves open source.",
    proposedContent: "A creative developer passionate about open-source tools.",
    issueType: "tone_mismatch",
    reason: "Tone does not match soul voice preferences",
    severity: "low",
    factsHash: "facts-hash-1",
    soulHash: computeHash("Warm tone"),
    baselineStateHash: computeHash("A developer who loves open source."),
    ...overrides,
  };
}

beforeEach(() => {
  setupDb();
  mockComputeSectionFactsHash.mockReturnValue("facts-hash-1");
  mockGetActiveSoul.mockReturnValue({ compiled: "Warm tone" });
});

describe("createProposal", () => {
  it("inserts a pending proposal", () => {
    const svc = createProposalService(testDb as any);
    svc.createProposal(makeProposal());

    const row = testSqlite
      .prepare("SELECT * FROM section_copy_proposals WHERE owner_key = ?")
      .get("owner1") as Record<string, unknown>;

    expect(row).toBeTruthy();
    expect(row.status).toBe("pending");
    expect(row.section_type).toBe("bio");
    expect(row.proposed_content).toBe(
      "A creative developer passionate about open-source tools.",
    );
    expect(row.issue_type).toBe("tone_mismatch");
    expect(row.severity).toBe("low");
    expect(row.created_at).toBeTruthy();
    expect(row.reviewed_at).toBeNull();
  });
});

describe("getPendingProposals", () => {
  it("returns only pending proposals", () => {
    const svc = createProposalService(testDb as any);
    svc.createProposal(makeProposal());
    svc.createProposal(makeProposal({ sectionType: "hero" }));

    // Manually set one to accepted
    testSqlite.exec(
      "UPDATE section_copy_proposals SET status = 'accepted' WHERE section_type = 'hero'",
    );

    const pending = svc.getPendingProposals("owner1");
    expect(pending).toHaveLength(1);
    expect(pending[0].sectionType).toBe("bio");
  });

  it("returns empty array when no pending proposals exist", () => {
    const svc = createProposalService(testDb as any);
    expect(svc.getPendingProposals("owner1")).toEqual([]);
  });
});

describe("getProposal", () => {
  it("returns a proposal by id", () => {
    const svc = createProposalService(testDb as any);
    svc.createProposal(makeProposal());

    const row = testSqlite
      .prepare("SELECT id FROM section_copy_proposals LIMIT 1")
      .get() as { id: number };

    const proposal = svc.getProposal(row.id);
    expect(proposal).not.toBeNull();
    expect(proposal!.sectionType).toBe("bio");
    expect(proposal!.status).toBe("pending");
  });

  it("returns null for non-existent id", () => {
    const svc = createProposalService(testDb as any);
    expect(svc.getProposal(999)).toBeNull();
  });
});

describe("acceptProposal", () => {
  it("copies content to state and marks accepted", () => {
    const svc = createProposalService(testDb as any);
    svc.createProposal(makeProposal());

    const row = testSqlite
      .prepare("SELECT id FROM section_copy_proposals LIMIT 1")
      .get() as { id: number };

    const result = svc.acceptProposal(row.id);
    expect(result).toEqual({ ok: true });

    // Verify proposal is marked accepted
    const proposal = svc.getProposal(row.id);
    expect(proposal!.status).toBe("accepted");
    expect(proposal!.reviewedAt).toBeTruthy();

    // Verify content was written to section_copy_state
    const state = testSqlite
      .prepare(
        "SELECT * FROM section_copy_state WHERE owner_key = ? AND section_type = ? AND language = ?",
      )
      .get("owner1", "bio", "en") as Record<string, unknown>;

    expect(state).toBeTruthy();
    expect(state.personalized_content).toBe(
      "A creative developer passionate about open-source tools.",
    );
    expect(state.facts_hash).toBe("facts-hash-1");
    expect(state.source).toBe("proposal");
  });

  it("rejects STALE_PROPOSAL when facts hash changed", () => {
    const svc = createProposalService(testDb as any);
    svc.createProposal(makeProposal());

    const row = testSqlite
      .prepare("SELECT id FROM section_copy_proposals LIMIT 1")
      .get() as { id: number };

    // Simulate facts changing
    mockComputeSectionFactsHash.mockReturnValue("facts-hash-DIFFERENT");

    const result = svc.acceptProposal(row.id);
    expect(result).toEqual({ ok: false, error: "STALE_PROPOSAL" });

    // Verify proposal marked stale
    const proposal = svc.getProposal(row.id);
    expect(proposal!.status).toBe("stale");
  });

  it("rejects STALE_PROPOSAL when soul hash changed", () => {
    const svc = createProposalService(testDb as any);
    svc.createProposal(makeProposal());

    const row = testSqlite
      .prepare("SELECT id FROM section_copy_proposals LIMIT 1")
      .get() as { id: number };

    // Simulate soul changing
    mockGetActiveSoul.mockReturnValue({ compiled: "Cool professional tone" });

    const result = svc.acceptProposal(row.id);
    expect(result).toEqual({ ok: false, error: "STALE_PROPOSAL" });

    const proposal = svc.getProposal(row.id);
    expect(proposal!.status).toBe("stale");
  });

  it("rejects STATE_CHANGED when active copy modified after proposal", () => {
    const svc = createProposalService(testDb as any);

    // Insert existing state
    testSqlite.exec(`
      INSERT INTO section_copy_state
        (owner_key, section_type, language, personalized_content, facts_hash, soul_hash, source)
      VALUES
        ('owner1', 'bio', 'en', 'A developer who loves open source.', 'facts-hash-1', 'sh1', 'live')
    `);

    svc.createProposal(makeProposal());

    const row = testSqlite
      .prepare("SELECT id FROM section_copy_proposals LIMIT 1")
      .get() as { id: number };

    // Modify state after proposal was created (simulating a concurrent update)
    testSqlite.exec(
      "UPDATE section_copy_state SET personalized_content = 'Something completely different' WHERE owner_key = 'owner1'",
    );

    const result = svc.acceptProposal(row.id);
    expect(result).toEqual({ ok: false, error: "STATE_CHANGED" });

    const proposal = svc.getProposal(row.id);
    expect(proposal!.status).toBe("stale");
  });

  it("returns PROPOSAL_NOT_FOUND for non-existent id", () => {
    const svc = createProposalService(testDb as any);
    const result = svc.acceptProposal(999);
    expect(result).toEqual({ ok: false, error: "PROPOSAL_NOT_FOUND" });
  });

  it("returns PROPOSAL_NOT_FOUND for already accepted proposal", () => {
    const svc = createProposalService(testDb as any);
    svc.createProposal(makeProposal());

    const row = testSqlite
      .prepare("SELECT id FROM section_copy_proposals LIMIT 1")
      .get() as { id: number };

    // Accept once
    svc.acceptProposal(row.id);

    // Try to accept again
    const result = svc.acceptProposal(row.id);
    expect(result).toEqual({ ok: false, error: "PROPOSAL_NOT_FOUND" });
  });
});

describe("rejectProposal", () => {
  it("marks proposal as rejected", () => {
    const svc = createProposalService(testDb as any);
    svc.createProposal(makeProposal());

    const row = testSqlite
      .prepare("SELECT id FROM section_copy_proposals LIMIT 1")
      .get() as { id: number };

    svc.rejectProposal(row.id);

    const proposal = svc.getProposal(row.id);
    expect(proposal!.status).toBe("rejected");
    expect(proposal!.reviewedAt).toBeTruthy();
  });
});

describe("markStaleProposals", () => {
  it("marks stale proposals when facts changed", () => {
    const svc = createProposalService(testDb as any);
    svc.createProposal(makeProposal());
    svc.createProposal(makeProposal({ sectionType: "hero" }));

    // Simulate facts changing for all sections
    mockComputeSectionFactsHash.mockReturnValue("facts-hash-DIFFERENT");

    const staleCount = svc.markStaleProposals("owner1");
    expect(staleCount).toBe(2);

    const pending = svc.getPendingProposals("owner1");
    expect(pending).toHaveLength(0);
  });

  it("marks stale proposals when soul changed", () => {
    const svc = createProposalService(testDb as any);
    svc.createProposal(makeProposal());

    // Simulate soul changing
    mockGetActiveSoul.mockReturnValue({ compiled: "New tone entirely" });

    const staleCount = svc.markStaleProposals("owner1");
    expect(staleCount).toBe(1);
  });

  it("marks stale when active state changed", () => {
    const svc = createProposalService(testDb as any);

    // Insert existing state matching the proposal baseline
    testSqlite.exec(`
      INSERT INTO section_copy_state
        (owner_key, section_type, language, personalized_content, facts_hash, soul_hash, source)
      VALUES
        ('owner1', 'bio', 'en', 'A developer who loves open source.', 'facts-hash-1', 'sh1', 'live')
    `);

    svc.createProposal(makeProposal());

    // Modify state after proposal was created
    testSqlite.exec(
      "UPDATE section_copy_state SET personalized_content = 'Completely new content' WHERE owner_key = 'owner1'",
    );

    const staleCount = svc.markStaleProposals("owner1");
    expect(staleCount).toBe(1);
  });

  it("does not mark non-stale proposals", () => {
    const svc = createProposalService(testDb as any);
    svc.createProposal(makeProposal());

    // No changes to facts or soul — should remain fresh
    const staleCount = svc.markStaleProposals("owner1");
    expect(staleCount).toBe(0);

    const pending = svc.getPendingProposals("owner1");
    expect(pending).toHaveLength(1);
  });

  it("returns 0 when no pending proposals exist", () => {
    const svc = createProposalService(testDb as any);
    const staleCount = svc.markStaleProposals("owner1");
    expect(staleCount).toBe(0);
  });

  it("should work when methods are destructured (singleton export pattern)", () => {
    const svc = createProposalService(testDb as any);
    svc.createProposal(makeProposal());

    // Reproduce the singleton export pattern: destructure then call
    const { markStaleProposals, getPendingProposals } = svc;

    // Before fix: this throws because this.getPendingProposals is undefined
    expect(() => markStaleProposals("owner1")).not.toThrow();

    // Verify it actually ran (no stale proposals since hashes match)
    const pending = getPendingProposals("owner1");
    expect(pending).toHaveLength(1);
  });
});

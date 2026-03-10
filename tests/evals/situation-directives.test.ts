/**
 * Tests for the situation directive generators.
 * Each directive should produce well-formed prompt text with the expected content.
 */
import { describe, it, expect } from "vitest";
import {
  pendingProposalsDirective,
  thinSectionsDirective,
  staleFactsDirective,
  openConflictsDirective,
} from "@/lib/agent/policies/situations";

// ---------------------------------------------------------------------------
// pendingProposalsDirective
// ---------------------------------------------------------------------------
describe("pendingProposalsDirective", () => {
  it("includes the count in the output", () => {
    const result = pendingProposalsDirective(3, ["bio", "skills"]);
    expect(result).toContain("3");
  });

  it("includes section names in the output", () => {
    const result = pendingProposalsDirective(2, ["bio", "skills"]);
    expect(result).toContain("bio");
    expect(result).toContain("skills");
  });

  it("uses singular 'proposal' for count=1", () => {
    const result = pendingProposalsDirective(1, ["bio"]);
    expect(result).toContain("1 content proposal ");
    expect(result).not.toContain("content proposals ");
  });

  it("uses plural 'proposals' for count > 1", () => {
    const result = pendingProposalsDirective(5, []);
    expect(result).toContain("proposals");
  });

  it("works with empty sections list", () => {
    const result = pendingProposalsDirective(2, []);
    expect(result).toContain("PENDING PROPOSALS:");
    expect(result).not.toContain("in sections:");
  });

  it("mentions the proposal banner", () => {
    const result = pendingProposalsDirective(1, []);
    expect(result).toMatch(/proposal\s*banner/i);
  });
});

// ---------------------------------------------------------------------------
// thinSectionsDirective
// ---------------------------------------------------------------------------
describe("thinSectionsDirective", () => {
  it("returns empty string when sections list is empty", () => {
    expect(thinSectionsDirective([])).toBe("");
  });

  it("includes all section names in the output", () => {
    const result = thinSectionsDirective(["skills", "projects", "achievements"]);
    expect(result).toContain("skills");
    expect(result).toContain("projects");
    expect(result).toContain("achievements");
  });

  it("starts with THIN SECTIONS header", () => {
    const result = thinSectionsDirective(["skills"]);
    expect(result).toContain("THIN SECTIONS:");
  });

  it("instructs to pick 1-2 most relevant sections", () => {
    const result = thinSectionsDirective(["skills"]);
    expect(result).toMatch(/1-2\s*most\s*relevant/i);
  });

  it("advises against listing all sections at once", () => {
    const result = thinSectionsDirective(["a", "b", "c"]);
    expect(result).toMatch(/don't\s*list\s*all|not.*all.*at\s*once/i);
  });
});

// ---------------------------------------------------------------------------
// staleFactsDirective
// ---------------------------------------------------------------------------
describe("staleFactsDirective", () => {
  it("returns empty string when facts list is empty", () => {
    expect(staleFactsDirective([])).toBe("");
  });

  it("includes fact keys in the output", () => {
    const result = staleFactsDirective(["skill/typescript", "experience/acme"]);
    expect(result).toContain("skill/typescript");
    expect(result).toContain("experience/acme");
  });

  it("caps displayed facts at 5 and notes extras", () => {
    const facts = Array.from({ length: 8 }, (_, i) => `category/fact-${i}`);
    const result = staleFactsDirective(facts);
    expect(result).toContain("fact-0");
    expect(result).toContain("fact-4");
    // Should NOT include fact-5 through fact-7 inline
    expect(result).not.toContain("fact-5");
    // Should note the overflow count
    expect(result).toContain("3 more");
  });

  it("starts with STALE FACTS header", () => {
    const result = staleFactsDirective(["skill/old"]);
    expect(result).toContain("STALE FACTS:");
  });

  it("mentions delete and create for corrections, and delete_fact for removals", () => {
    const result = staleFactsDirective(["skill/old"]);
    expect(result).toContain("delete");
    expect(result).toContain("create");
  });

  it("does not show overflow note when 5 or fewer facts", () => {
    const facts = ["a", "b", "c", "d", "e"];
    const result = staleFactsDirective(facts);
    expect(result).not.toContain("more");
  });
});

// ---------------------------------------------------------------------------
// openConflictsDirective
// ---------------------------------------------------------------------------
describe("openConflictsDirective", () => {
  it("returns empty string when conflicts list is empty", () => {
    expect(openConflictsDirective([])).toBe("");
  });

  it("includes conflict descriptions in the output", () => {
    const result = openConflictsDirective([
      "identity/name: chat vs github",
      "skill/python: old vs new",
    ]);
    expect(result).toContain("identity/name: chat vs github");
    expect(result).toContain("skill/python: old vs new");
  });

  it("starts with OPEN CONFLICTS header", () => {
    const result = openConflictsDirective(["identity/name: conflict"]);
    expect(result).toContain("OPEN CONFLICTS:");
  });

  it("mentions resolve_conflict tool", () => {
    const result = openConflictsDirective(["x"]);
    expect(result).toContain("resolve_conflict");
  });

  it("advises against framing conflicts as errors", () => {
    const result = openConflictsDirective(["x"]);
    expect(result).toMatch(/not.*error|don't.*present.*error/i);
  });
});

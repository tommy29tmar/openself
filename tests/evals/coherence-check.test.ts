/**
 * Tests for page coherence check (Task 14).
 * quickCoherenceCheck: deterministic layer (timeline_overlap, role_mismatch, completeness_gap).
 * checkPageCoherence: hybrid layer (deterministic + LLM).
 * Coherence → session metadata integration (circuit D1).
 * Coherence situation directive.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock AI provider BEFORE imports ---
vi.mock("ai", async () => {
  const { z } = await import("zod");
  return {
    generateObject: vi.fn(),
    tool: vi.fn((def: any) => def),
    z,
  };
});
vi.mock("@/lib/ai/provider", () => ({
  getModel: vi.fn(() => "mock-model"),
}));

import {
  quickCoherenceCheck,
  checkPageCoherence,
  type CoherenceIssue,
} from "@/lib/services/coherence-check";
import type { Section } from "@/lib/page-config/schema";
import type { FactRow } from "@/lib/services/kb-service";
import { generateObject } from "ai";
import { coherenceIssuesDirective } from "@/lib/agent/policies/situations";

// --- Helpers ---

function makeFact(overrides: Partial<FactRow> & { category: string; key: string }): FactRow {
  return {
    id: overrides.id ?? `f-${overrides.category}-${overrides.key}`,
    category: overrides.category,
    key: overrides.key,
    value: overrides.value ?? {},
    source: overrides.source ?? "chat",
    confidence: overrides.confidence ?? 1,
    visibility: overrides.visibility ?? "public",
    sortOrder: overrides.sortOrder ?? null,
    parentFactId: overrides.parentFactId ?? null,
    archivedAt: overrides.archivedAt ?? null,
    createdAt: overrides.createdAt ?? "2026-01-01",
    updatedAt: overrides.updatedAt ?? "2026-01-01",
  } as FactRow;
}

function makeSection(type: string, content: Record<string, unknown> = {}, id?: string): Section {
  return { id: id ?? type, type: type as any, content };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// quickCoherenceCheck — deterministic
// ---------------------------------------------------------------------------

describe("quickCoherenceCheck — deterministic", () => {
  it("detects timeline_overlap: two current experiences with overlapping dates", () => {
    const facts = [
      makeFact({ category: "experience", key: "exp-a", value: { role: "Engineer", company: "Acme", start: "2022-01", status: "current" } }),
      makeFact({ category: "experience", key: "exp-b", value: { role: "Consultant", company: "Beta", start: "2023-06", status: "current" } }),
    ];
    const sections = [makeSection("experience", { items: [] })];

    const issues = quickCoherenceCheck(sections, facts);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe("timeline_overlap");
    expect(issues[0].severity).toBe("warning");
    expect(issues[0].affectedSections).toContain("experience");
  });

  it("does not flag non-overlapping experiences (past + current)", () => {
    const facts = [
      makeFact({ category: "experience", key: "exp-a", value: { role: "Junior Dev", start: "2020-01", end: "2022-06", status: "past" } }),
      makeFact({ category: "experience", key: "exp-b", value: { role: "Senior Dev", start: "2023-01", status: "current" } }),
    ];
    const sections = [makeSection("experience", { items: [] })];

    const issues = quickCoherenceCheck(sections, facts);
    expect(issues.filter(i => i.type === "timeline_overlap")).toHaveLength(0);
  });

  it("detects role_mismatch: hero title not found among experience titles", () => {
    const facts = [
      makeFact({ category: "experience", key: "exp-a", value: { role: "Junior Dev" } }),
      makeFact({ category: "experience", key: "exp-b", value: { role: "Mid Dev" } }),
    ];
    const sections = [
      makeSection("hero", { tagline: "Senior Architect" }),
      makeSection("experience", { items: [] }),
    ];

    const issues = quickCoherenceCheck(sections, facts);
    expect(issues.some(i => i.type === "role_mismatch")).toBe(true);
    const rm = issues.find(i => i.type === "role_mismatch")!;
    expect(rm.severity).toBe("warning");
    expect(rm.affectedSections).toContain("hero");
    expect(rm.affectedSections).toContain("experience");
  });

  it("does not flag role_mismatch when hero title appears in experience", () => {
    const facts = [
      makeFact({ category: "experience", key: "exp-a", value: { role: "Software Engineer" } }),
    ];
    const sections = [
      makeSection("hero", { tagline: "Software Engineer" }),
      makeSection("experience", { items: [] }),
    ];

    const issues = quickCoherenceCheck(sections, facts);
    expect(issues.filter(i => i.type === "role_mismatch")).toHaveLength(0);
  });

  it("role_mismatch: substring match works (hero includes role)", () => {
    const facts = [
      makeFact({ category: "experience", key: "exp-a", value: { role: "Engineer" } }),
    ];
    const sections = [
      makeSection("hero", { tagline: "Senior Software Engineer" }),
      makeSection("experience", { items: [] }),
    ];

    const issues = quickCoherenceCheck(sections, facts);
    // "engineer" is substring of "senior software engineer" → no mismatch
    expect(issues.filter(i => i.type === "role_mismatch")).toHaveLength(0);
  });

  it("detects completeness_gap: section with 1 item when ≥3 facts exist", () => {
    const facts = [
      makeFact({ category: "skill", key: "js", value: { name: "JS" } }),
      makeFact({ category: "skill", key: "ts", value: { name: "TS" } }),
      makeFact({ category: "skill", key: "py", value: { name: "Python" } }),
    ];
    const sections = [
      makeSection("hero", {}),
      makeSection("skills", { items: [{ name: "JS" }] }), // 1 item but 3 facts
    ];

    const issues = quickCoherenceCheck(sections, facts);
    expect(issues.some(i => i.type === "completeness_gap")).toBe(true);
    const cg = issues.find(i => i.type === "completeness_gap")!;
    expect(cg.severity).toBe("info");
  });

  it("does not flag completeness_gap when section items match fact count", () => {
    const facts = [
      makeFact({ category: "skill", key: "js", value: { name: "JS" } }),
      makeFact({ category: "skill", key: "ts", value: { name: "TS" } }),
    ];
    const sections = [
      makeSection("skills", { items: [{ name: "JS" }, { name: "TS" }] }),
    ];

    const issues = quickCoherenceCheck(sections, facts);
    expect(issues.filter(i => i.type === "completeness_gap")).toHaveLength(0);
  });

  it("returns max 3 issues", () => {
    // Create many overlapping + mismatched facts to trigger 3+ issues
    const facts = [
      makeFact({ category: "experience", key: "exp-a", value: { role: "Engineer", start: "2020-01", status: "current" } }),
      makeFact({ category: "experience", key: "exp-b", value: { role: "Designer", start: "2021-01", status: "current" } }),
      makeFact({ category: "skill", key: "s1", value: { name: "A" } }),
      makeFact({ category: "skill", key: "s2", value: { name: "B" } }),
      makeFact({ category: "skill", key: "s3", value: { name: "C" } }),
      makeFact({ category: "project", key: "p1", value: { name: "X" } }),
      makeFact({ category: "project", key: "p2", value: { name: "Y" } }),
      makeFact({ category: "project", key: "p3", value: { name: "Z" } }),
    ];
    const sections = [
      makeSection("hero", { tagline: "CEO" }),
      makeSection("experience", { items: [] }),
      makeSection("skills", { items: [{ name: "A" }] }), // 1 of 3 → completeness_gap
      makeSection("projects", { items: [{ name: "X" }] }), // 1 of 3 → completeness_gap
    ];

    const issues = quickCoherenceCheck(sections, facts);
    expect(issues.length).toBeLessThanOrEqual(3);
  });

  it("ignores archived facts for timeline_overlap", () => {
    const facts = [
      makeFact({ category: "experience", key: "exp-a", value: { role: "Engineer", start: "2020-01", status: "current" }, archivedAt: "2025-01-01" }),
      makeFact({ category: "experience", key: "exp-b", value: { role: "Designer", start: "2021-01", status: "current" } }),
    ];
    const sections = [makeSection("experience", { items: [] })];

    const issues = quickCoherenceCheck(sections, facts);
    expect(issues.filter(i => i.type === "timeline_overlap")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// checkPageCoherence — hybrid
// ---------------------------------------------------------------------------

describe("checkPageCoherence — hybrid", () => {
  it("returns empty issues for page with <3 content sections", async () => {
    const sections = [
      makeSection("hero", { name: "Alice" }),
      makeSection("footer", { links: [] }),
    ];
    const issues = await checkPageCoherence(sections, []);
    expect(issues).toHaveLength(0);
  });

  it("returns deterministic issues for pages with 3-4 content sections (no LLM)", async () => {
    const facts = [
      makeFact({ category: "experience", key: "exp-a", value: { role: "Engineer", start: "2020-01", status: "current" } }),
      makeFact({ category: "experience", key: "exp-b", value: { role: "Designer", start: "2021-01", status: "current" } }),
    ];
    const sections = [
      makeSection("hero", { tagline: "CEO" }),
      makeSection("experience", { items: ["a", "b"] }),
      makeSection("skills", { items: ["x"] }),
      makeSection("projects", { items: ["y"] }),
    ];

    const issues = await checkPageCoherence(sections, facts);
    // Should have deterministic issues but NOT call LLM
    expect(vi.mocked(generateObject)).not.toHaveBeenCalled();
    expect(issues.length).toBeGreaterThan(0);
  });

  it("skips LLM when deterministic check already found ≥3 issues", async () => {
    const facts = [
      makeFact({ category: "experience", key: "exp-a", value: { role: "Engineer", start: "2020-01", status: "current" } }),
      makeFact({ category: "experience", key: "exp-b", value: { role: "Designer", start: "2021-01", status: "current" } }),
      makeFact({ category: "skill", key: "s1" }),
      makeFact({ category: "skill", key: "s2" }),
      makeFact({ category: "skill", key: "s3" }),
      makeFact({ category: "project", key: "p1" }),
      makeFact({ category: "project", key: "p2" }),
      makeFact({ category: "project", key: "p3" }),
    ];
    const sections = [
      makeSection("hero", { tagline: "CEO" }),
      makeSection("experience", { items: [] }),
      makeSection("skills", { items: [{ name: "A" }] }),
      makeSection("projects", { items: [{ name: "X" }] }),
      makeSection("interests", { items: ["a"] }),
      makeSection("education", { items: ["b"] }),
    ];

    const issues = await checkPageCoherence(sections, facts);
    expect(vi.mocked(generateObject)).not.toHaveBeenCalled();
    expect(issues.length).toBeLessThanOrEqual(3);
  });

  it("calls LLM for pages with ≥5 content sections and <3 deterministic issues", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        issues: [{
          type: "skill_gap",
          severity: "warning", // LLM returns warning but should be forced to info
          description: "Claims React expertise but no React projects",
          suggestion: "Add a React project or clarify skill level.",
          affectedSections: ["skills", "projects"],
        }],
      },
    } as any);

    const facts: FactRow[] = [];
    const sections = [
      makeSection("hero", { tagline: "" }),
      makeSection("skills", { items: ["React"] }),
      makeSection("projects", { items: ["a", "b"] }),
      makeSection("interests", { items: ["coding"] }),
      makeSection("education", { items: ["CS"] }),
      makeSection("experience", { items: ["dev"] }),
    ];

    const issues = await checkPageCoherence(sections, facts);
    expect(vi.mocked(generateObject)).toHaveBeenCalled();
    expect(issues.length).toBeGreaterThanOrEqual(1);
  });

  it("SKILL_GAP is always severity info (forced)", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        issues: [{
          type: "skill_gap",
          severity: "warning", // LLM says warning
          description: "test",
          suggestion: "test",
          affectedSections: ["skills"],
        }],
      },
    } as any);

    const sections = [
      makeSection("hero", { tagline: "" }),
      makeSection("skills", { items: ["React"] }),
      makeSection("projects", { items: ["a", "b"] }),
      makeSection("interests", { items: ["coding"] }),
      makeSection("education", { items: ["CS"] }),
      makeSection("experience", { items: ["dev"] }),
    ];

    const issues = await checkPageCoherence(sections, [], undefined);
    const skillGap = issues.find(i => i.type === "skill_gap");
    expect(skillGap).toBeDefined();
    expect(skillGap!.severity).toBe("info"); // Forced to info
  });

  it("LEVEL_MISMATCH is always severity info (forced)", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        issues: [{
          type: "level_mismatch",
          severity: "warning",
          description: "test",
          suggestion: "test",
          affectedSections: ["experience"],
        }],
      },
    } as any);

    const sections = [
      makeSection("hero", { tagline: "" }),
      makeSection("skills", { items: ["a"] }),
      makeSection("projects", { items: ["b"] }),
      makeSection("interests", { items: ["c"] }),
      makeSection("education", { items: ["d"] }),
      makeSection("experience", { items: ["e"] }),
    ];

    const issues = await checkPageCoherence(sections, []);
    const lm = issues.find(i => i.type === "level_mismatch");
    expect(lm).toBeDefined();
    expect(lm!.severity).toBe("info");
  });

  it("deduplicates issues from deterministic + LLM by type+affectedSections", async () => {
    // Deterministic will find role_mismatch (hero "CEO" vs experience "Engineer")
    const facts = [
      makeFact({ category: "experience", key: "exp-a", value: { role: "Engineer" } }),
    ];
    // LLM also returns role_mismatch for same sections
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        issues: [{
          type: "role_mismatch",
          severity: "warning",
          description: "Hero role doesn't match experience",
          suggestion: "Update hero.",
          affectedSections: ["hero", "experience"],
        }],
      },
    } as any);

    const sections = [
      makeSection("hero", { tagline: "CEO" }),
      makeSection("experience", { items: ["a"] }),
      makeSection("skills", { items: ["b"] }),
      makeSection("projects", { items: ["c"] }),
      makeSection("interests", { items: ["d"] }),
      makeSection("education", { items: ["e"] }),
    ];

    const issues = await checkPageCoherence(sections, facts);
    // Should only have 1 role_mismatch, not 2
    const roleMismatches = issues.filter(i => i.type === "role_mismatch");
    expect(roleMismatches.length).toBe(1);
  });

  it("passes soulCompiled to LLM prompt when provided (circuit I)", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { issues: [] },
    } as any);

    const sections = [
      makeSection("hero", { tagline: "" }),
      makeSection("skills", { items: ["a"] }),
      makeSection("projects", { items: ["b"] }),
      makeSection("interests", { items: ["c"] }),
      makeSection("education", { items: ["d"] }),
      makeSection("experience", { items: ["e"] }),
    ];

    await checkPageCoherence(sections, [], "Tone: professional, formal");
    expect(vi.mocked(generateObject)).toHaveBeenCalled();
    const call = vi.mocked(generateObject).mock.calls[0][0] as any;
    expect(call.prompt).toContain("professional, formal");
  });

  it("works without soulCompiled (backward compat)", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { issues: [] },
    } as any);

    const sections = [
      makeSection("hero", { tagline: "" }),
      makeSection("skills", { items: ["a"] }),
      makeSection("projects", { items: ["b"] }),
      makeSection("interests", { items: ["c"] }),
      makeSection("education", { items: ["d"] }),
      makeSection("experience", { items: ["e"] }),
    ];

    // No soulCompiled arg
    const issues = await checkPageCoherence(sections, []);
    expect(issues).toBeDefined();
  });

  it("returns deterministic issues only when LLM times out", async () => {
    // Make generateObject hang
    vi.mocked(generateObject).mockImplementation(
      () => new Promise(() => {}) as any, // never resolves
    );

    const facts = [
      makeFact({ category: "experience", key: "exp-a", value: { role: "Engineer", start: "2020-01", status: "current" } }),
      makeFact({ category: "experience", key: "exp-b", value: { role: "Designer", start: "2021-01", status: "current" } }),
    ];
    const sections = [
      makeSection("hero", { tagline: "" }),
      makeSection("experience", { items: ["a"] }),
      makeSection("skills", { items: ["b"] }),
      makeSection("projects", { items: ["c"] }),
      makeSection("interests", { items: ["d"] }),
      makeSection("education", { items: ["e"] }),
    ];

    const issues = await checkPageCoherence(sections, facts);
    // Should return deterministic issues (timeline_overlap) even if LLM timed out
    expect(issues.some(i => i.type === "timeline_overlap")).toBe(true);
  }, 10000);

  it("returns max 3 issues total after merge", async () => {
    // 2 deterministic issues + 2 LLM issues = 4, but capped at 3
    const facts = [
      makeFact({ category: "experience", key: "exp-a", value: { role: "Engineer", start: "2020-01", status: "current" } }),
      makeFact({ category: "experience", key: "exp-b", value: { role: "Designer", start: "2021-01", status: "current" } }),
    ];
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        issues: [
          { type: "skill_gap", severity: "info", description: "a", suggestion: "b", affectedSections: ["skills"] },
          { type: "level_mismatch", severity: "info", description: "c", suggestion: "d", affectedSections: ["experience"] },
        ],
      },
    } as any);

    const sections = [
      makeSection("hero", { tagline: "CEO" }),
      makeSection("experience", { items: ["a"] }),
      makeSection("skills", { items: ["b"] }),
      makeSection("projects", { items: ["c"] }),
      makeSection("interests", { items: ["d"] }),
      makeSection("education", { items: ["e"] }),
    ];

    const issues = await checkPageCoherence(sections, facts);
    expect(issues.length).toBeLessThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// Coherence situation directive
// ---------------------------------------------------------------------------

describe("coherenceIssuesDirective", () => {
  it("formats issues for system prompt", () => {
    const issues: CoherenceIssue[] = [
      {
        type: "role_mismatch",
        severity: "warning",
        description: 'Hero title "CEO" doesn\'t match any experience role',
        suggestion: "Update hero tagline to reflect current role.",
        affectedSections: ["hero", "experience"],
      },
      {
        type: "completeness_gap",
        severity: "info",
        description: 'Section "skills" shows 1 item but 5 facts exist',
        suggestion: "Check visibility settings.",
        affectedSections: ["skills"],
      },
    ];

    const result = coherenceIssuesDirective(issues);
    expect(result).toContain("COHERENCE ISSUES");
    expect(result).toContain("warning:");
    expect(result).toContain("info:");
    expect(result).toContain("role_mismatch");
    expect(result).toContain("completeness_gap");
  });

  it("returns empty string for no issues", () => {
    expect(coherenceIssuesDirective([])).toBe("");
  });
});

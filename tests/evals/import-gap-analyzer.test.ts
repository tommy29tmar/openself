import { describe, it, expect } from "vitest";
import { analyzeImportGaps, type ImportGapReport } from "@/lib/connectors/import-gap-analyzer";

function makeFact(overrides: Record<string, unknown>) {
  return {
    id: `f-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: "s1",
    category: "experience",
    key: `k-${Math.random().toString(36).slice(2, 8)}`,
    value: {},
    visibility: "public",
    confidence: 1,
    source: "connector",
    sortOrder: null,
    parentFactId: null,
    archivedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("analyzeImportGaps", () => {
  it("returns summary with current role from identity fact", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Alice" } }),
      makeFact({ category: "identity", key: "role", value: { role: "Engineer", company: "Acme" } }),
      makeFact({ category: "experience", key: "li-acme-2020", value: { role: "Engineer", company: "Acme", status: "current" } }),
      makeFact({ category: "experience", key: "li-prev-2018", value: { role: "Intern", company: "BigCo", status: "past" } }),
    ];
    const report = analyzeImportGaps(facts);
    expect(report.summary.currentRole).toContain("Engineer");
    expect(report.summary.currentRole).toContain("Acme");
    expect(report.summary.pastRoles).toBe(1);
  });

  it("returns summary counts for all categories", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Bob" } }),
      makeFact({ category: "education", key: "edu-1", value: { institution: "MIT" } }),
      makeFact({ category: "education", key: "edu-2", value: { institution: "Stanford" } }),
      makeFact({ category: "language", key: "lang-1", value: { language: "English" } }),
      makeFact({ category: "skill", key: "sk-1", value: { name: "TypeScript" } }),
      makeFact({ category: "skill", key: "sk-2", value: { name: "Python" } }),
      makeFact({ category: "skill", key: "sk-3", value: { name: "Go" } }),
      makeFact({ category: "certification", key: "cert-1", value: { name: "AWS" } }),
    ];
    const report = analyzeImportGaps(facts);
    expect(report.summary.educationCount).toBe(2);
    expect(report.summary.languageCount).toBe(1);
    expect(report.summary.skillCount).toBe(3);
    expect(report.summary.certificationCount).toBe(1);
  });

  it("detects missing interests/hobbies as highest priority gap", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Carol" } }),
      makeFact({ category: "experience", key: "exp-1", value: { role: "Dev", company: "X" } }),
    ];
    const report = analyzeImportGaps(facts);
    const interestGap = report.gaps.find(g => g.type === "no_interests");
    expect(interestGap).toBeDefined();
    expect(interestGap!.priority).toBe(1);
  });

  it("detects missing personal description as gap", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Dave" } }),
    ];
    const report = analyzeImportGaps(facts);
    const descGap = report.gaps.find(g => g.type === "no_personal_description");
    expect(descGap).toBeDefined();
    expect(descGap!.priority).toBe(2);
  });

  it("detects missing social links as gap", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Eve" } }),
    ];
    const report = analyzeImportGaps(facts);
    const socialGap = report.gaps.find(g => g.type === "no_social_links");
    expect(socialGap).toBeDefined();
    expect(socialGap!.priority).toBe(3);
  });

  it("does not flag interests gap if interest/activity facts exist", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Frank" } }),
      makeFact({ category: "interest", key: "int-1", value: { name: "Photography" } }),
    ];
    const report = analyzeImportGaps(facts);
    expect(report.gaps.find(g => g.type === "no_interests")).toBeUndefined();
  });

  it("does not flag description gap if bio/summary identity fact exists", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Grace" } }),
      makeFact({ category: "identity", key: "summary", value: { summary: "I love building things." } }),
    ];
    const report = analyzeImportGaps(facts);
    expect(report.gaps.find(g => g.type === "no_personal_description")).toBeUndefined();
  });

  it("does not flag social gap if contact facts with URLs exist", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Hank" } }),
      makeFact({ category: "contact", key: "website", value: { type: "website", value: "https://hank.dev" } }),
    ];
    const report = analyzeImportGaps(facts);
    expect(report.gaps.find(g => g.type === "no_social_links")).toBeUndefined();
  });

  it("derives current role from experience with status=current when no identity role", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Ivy" } }),
      makeFact({ category: "experience", key: "exp-1", value: { role: "CTO", company: "StartupCo", status: "current" } }),
    ];
    const report = analyzeImportGaps(facts);
    expect(report.summary.currentRole).toContain("CTO");
    expect(report.summary.currentRole).toContain("StartupCo");
  });

  it("returns empty gaps array when all gaps are filled", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Jack" } }),
      makeFact({ category: "identity", key: "summary", value: { summary: "Builder." } }),
      makeFact({ category: "interest", key: "int-1", value: { name: "Cooking" } }),
      makeFact({ category: "contact", key: "github", value: { type: "website", value: "https://github.com/jack" } }),
    ];
    const report = analyzeImportGaps(facts);
    expect(report.gaps).toHaveLength(0);
  });
});

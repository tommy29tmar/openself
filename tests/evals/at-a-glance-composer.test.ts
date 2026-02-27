import { describe, it, expect } from "vitest";
import { composeOptimisticPage } from "@/lib/services/page-composer";

function makeFact(overrides: Record<string, unknown>) {
  return {
    id: overrides.id ?? `fact-${Math.random().toString(36).slice(2, 8)}`,
    category: overrides.category as string,
    key: overrides.key as string,
    value: overrides.value ?? {},
    source: "chat",
    confidence: 1.0,
    visibility: "public",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("At a Glance section composition", () => {
  it("should produce at-a-glance section with stats, skillGroups, and interests", () => {
    const facts = [
      makeFact({ category: "identity", key: "full-name", value: { full: "Alice" } }),
      makeFact({ category: "stat", key: "repos", value: { label: "repos", value: "47" } }),
      makeFact({ category: "stat", key: "contributions", value: { label: "contributions", value: "1284" } }),
      makeFact({ category: "skill", key: "react", value: { name: "React" } }),
      makeFact({ category: "skill", key: "typescript", value: { name: "TypeScript" } }),
      makeFact({ category: "skill", key: "nodejs", value: { name: "Node.js" } }),
      makeFact({ category: "skill", key: "docker", value: { name: "Docker" } }),
      makeFact({ category: "interest", key: "open-source", value: { name: "open source" } }),
      makeFact({ category: "interest", key: "coffee", value: { name: "specialty coffee" } }),
    ];

    process.env.EXTENDED_SECTIONS = "true";
    const config = composeOptimisticPage(facts as any, "alice", "en");
    delete process.env.EXTENDED_SECTIONS;

    const aag = config.sections.find((s) => s.type === "at-a-glance");
    expect(aag).toBeDefined();
    const content = aag!.content as Record<string, unknown>;
    expect(content.stats).toHaveLength(2);
    expect((content.skillGroups as any[]).length).toBeGreaterThanOrEqual(2);
    expect(content.interests).toHaveLength(2);
  });

  it("should group skills by SKILL_DOMAINS", () => {
    const facts = [
      makeFact({ category: "identity", key: "full-name", value: { full: "Alice" } }),
      makeFact({ category: "skill", key: "react", value: { name: "React" } }),
      makeFact({ category: "skill", key: "nextjs", value: { name: "Next.js" } }),
      makeFact({ category: "skill", key: "docker", value: { name: "Docker" } }),
      makeFact({ category: "skill", key: "unknowntool", value: { name: "UnknownTool" } }),
    ];

    process.env.EXTENDED_SECTIONS = "true";
    const config = composeOptimisticPage(facts as any, "alice", "en");
    delete process.env.EXTENDED_SECTIONS;

    const aag = config.sections.find((s) => s.type === "at-a-glance");
    const content = aag!.content as Record<string, unknown>;
    const groups = content.skillGroups as { domain: string; skills: string[] }[];

    const frontend = groups.find((g) => g.domain === "Frontend");
    expect(frontend?.skills).toContain("React");
    expect(frontend?.skills).toContain("Next.js");

    const infra = groups.find((g) => g.domain === "Infra");
    expect(infra?.skills).toContain("Docker");

    const other = groups.find((g) => g.domain === "Other");
    expect(other?.skills).toContain("UnknownTool");
  });

  it("should NOT produce standalone skills, stats, interests when EXTENDED_SECTIONS=true", () => {
    const facts = [
      makeFact({ category: "identity", key: "full-name", value: { full: "Alice" } }),
      makeFact({ category: "skill", key: "react", value: { name: "React" } }),
      makeFact({ category: "stat", key: "repos", value: { label: "repos", value: "47" } }),
      makeFact({ category: "interest", key: "coffee", value: { name: "coffee" } }),
    ];

    process.env.EXTENDED_SECTIONS = "true";
    const config = composeOptimisticPage(facts as any, "alice", "en");
    delete process.env.EXTENDED_SECTIONS;

    const types = config.sections.map((s) => s.type);
    expect(types).not.toContain("skills");
    expect(types).not.toContain("stats");
    expect(types).not.toContain("interests");
    expect(types).toContain("at-a-glance");
  });

  it("should hide domain labels when only 1-2 groups", () => {
    const facts = [
      makeFact({ category: "identity", key: "full-name", value: { full: "Alice" } }),
      makeFact({ category: "skill", key: "react", value: { name: "React" } }),
    ];

    process.env.EXTENDED_SECTIONS = "true";
    const config = composeOptimisticPage(facts as any, "alice", "en");
    delete process.env.EXTENDED_SECTIONS;

    const aag = config.sections.find((s) => s.type === "at-a-glance");
    if (aag) {
      const content = aag!.content as Record<string, unknown>;
      const groups = content.skillGroups as { domain: string; skills: string[]; showLabel?: boolean }[];
      if (groups && groups.length <= 2) {
        for (const g of groups) {
          expect(g.showLabel).toBe(false);
        }
      }
    }
  });
});

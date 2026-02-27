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

describe("Section order in extended mode", () => {
  it("should follow design D5 default order", () => {
    const facts = [
      makeFact({ category: "identity", key: "full-name", value: { full: "Alice" } }),
      makeFact({ category: "identity", key: "bio", value: { text: "Software dev." } }),
      makeFact({ category: "skill", key: "react", value: { name: "React" } }),
      makeFact({ category: "stat", key: "repos", value: { label: "repos", value: "10" } }),
      makeFact({ category: "interest", key: "oss", value: { name: "open source" } }),
      makeFact({ category: "experience", key: "job1", value: { role: "Dev", company: "Acme", current: true } }),
      makeFact({ category: "project", key: "p1", value: { title: "Tool", description: "A tool" } }),
      makeFact({ category: "education", key: "uni", value: { institution: "MIT", degree: "BSc", field: "CS" } }),
      makeFact({ category: "achievement", key: "a1", value: { title: "Award", description: "Won it" } }),
    ];

    process.env.EXTENDED_SECTIONS = "true";
    const config = composeOptimisticPage(facts as any, "alice", "en");
    delete process.env.EXTENDED_SECTIONS;

    const types = config.sections.map((s) => s.type);

    const expectedOrder = [
      "hero",
      "bio",
      "at-a-glance",
      "experience",
      "projects",
      "education",
      "achievements",
      "footer",
    ];

    for (let i = 1; i < expectedOrder.length; i++) {
      const prev = types.indexOf(expectedOrder[i - 1]);
      const curr = types.indexOf(expectedOrder[i]);
      if (prev !== -1 && curr !== -1) {
        expect(curr).toBeGreaterThan(prev);
      }
    }
  });
});

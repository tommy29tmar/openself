import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => { process.env.EXTENDED_SECTIONS = "true"; });

import { composeOptimisticPage } from "@/lib/services/page-composer";

function makeFact(overrides: Record<string, unknown>) {
  return {
    id: `f-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: "s1",
    category: "experience",
    key: "job1",
    value: {},
    visibility: "public" as const,
    confidence: 1,
    source: "agent" as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sortOrder: 0,
    parentFactId: null,
    archivedAt: null,
    ...overrides,
  };
}

describe("experience type field", () => {
  const baseFacts = [
    makeFact({ category: "identity", key: "name", value: { name: "Elena Rossi" } }),
  ];

  it("treats undefined type as employment (backward compat)", () => {
    const facts = [
      ...baseFacts,
      makeFact({ key: "job1", value: { role: "Designer", company: "Acme", status: "current" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "en");
    const exp = page.sections.find((s) => s.type === "experience");
    expect(exp).toBeDefined();
    const items = (exp!.content as { items: unknown[] }).items;
    expect(items.length).toBe(1);
  });

  it("puts client-type experience into projects section with company in title", () => {
    const facts = [
      ...baseFacts,
      makeFact({ key: "barilla", value: { role: "Branding", company: "Barilla", type: "client" } }),
      makeFact({ key: "eataly", value: { role: "Visual Identity", company: "Eataly", type: "client" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "en");
    const projects = page.sections.find((s) => s.type === "projects");
    expect(projects).toBeDefined();
    const items = (projects!.content as { items: { title: string }[] }).items;
    expect(items.length).toBe(2);
    const titles = items.map((i) => i.title);
    expect(titles.some((t) => t.includes("Barilla"))).toBe(true);
    expect(titles.some((t) => t.includes("Eataly"))).toBe(true);
    // No experience section since all are client-type
    const exp = page.sections.find((s) => s.type === "experience");
    expect(exp).toBeUndefined();
  });

  it("splits employment and client into separate sections", () => {
    const facts = [
      ...baseFacts,
      makeFact({ key: "job1", value: { role: "Designer", company: "Agency X", status: "current" } }),
      makeFact({ key: "barilla", value: { role: "Branding", company: "Barilla", type: "client" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "en");
    const exp = page.sections.find((s) => s.type === "experience");
    const projects = page.sections.find((s) => s.type === "projects");
    expect(exp).toBeDefined();
    expect(projects).toBeDefined();
  });

  it("handles freelance-type in experience section", () => {
    const facts = [
      ...baseFacts,
      makeFact({ key: "freelance", value: { role: "Graphic Designer", type: "freelance", status: "current" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "en");
    const exp = page.sections.find((s) => s.type === "experience");
    expect(exp).toBeDefined();
  });
});

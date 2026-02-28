import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => { process.env.EXTENDED_SECTIONS = "true"; });

import { composeOptimisticPage } from "@/lib/services/page-composer";

function makeFact(overrides: Record<string, unknown>) {
  return {
    id: `f-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: "s1",
    category: "identity",
    key: "name",
    value: { name: "Elena" },
    visibility: "public" as const,
    confidence: 1,
    source: "agent" as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("bio template — freelance", () => {
  it("uses freelance template when company is 'Freelance' (it)", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Elena Rossi" } }),
      makeFact({ category: "identity", key: "role", value: { role: "Graphic Designer" } }),
      makeFact({ category: "experience", key: "current", value: { role: "Graphic Designer", company: "Freelance", status: "current" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "it");
    const bio = page.sections.find((s) => s.type === "bio");
    expect(bio).toBeDefined();
    const text = (bio!.content as { text: string }).text;
    expect(text).not.toContain("presso Freelance");
    expect(text).not.toContain("presso freelance");
    expect(text.toLowerCase()).toContain("freelance");
  });

  it("uses freelance template for English 'Self-employed'", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Elena Rossi" } }),
      makeFact({ category: "identity", key: "role", value: { role: "Graphic Designer" } }),
      makeFact({ category: "experience", key: "current", value: { role: "Graphic Designer", company: "Self-employed", status: "current" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "en");
    const bio = page.sections.find((s) => s.type === "bio");
    const text = (bio!.content as { text: string }).text;
    expect(text).not.toContain("at Self-employed");
    expect(text.toLowerCase()).toMatch(/freelance/);
  });

  it("uses standard template for real companies", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Elena Rossi" } }),
      makeFact({ category: "identity", key: "role", value: { role: "Graphic Designer" } }),
      makeFact({ category: "experience", key: "current", value: { role: "Graphic Designer", company: "Acme Corp", status: "current" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "it");
    const bio = page.sections.find((s) => s.type === "bio");
    const text = (bio!.content as { text: string }).text;
    expect(text).toContain("Acme Corp");
  });
});

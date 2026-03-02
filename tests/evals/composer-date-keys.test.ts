import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => { process.env.EXTENDED_SECTIONS = "true"; });

import { composeOptimisticPage } from "@/lib/services/page-composer";

function makeFact(overrides: Record<string, unknown>) {
  return {
    id: `f-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: "s1",
    category: "experience",
    key: `k-${Math.random().toString(36).slice(2, 8)}`,
    value: {},
    visibility: "public" as const,
    confidence: 1,
    source: "connector" as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const baseFacts = [
  makeFact({ category: "identity", key: "name", value: { name: "Test User" } }),
];

describe("experience dates from LinkedIn-style startDate/endDate keys", () => {
  it("renders period from startDate + endDate", () => {
    const facts = [
      ...baseFacts,
      makeFact({
        key: "li-kpmg-2016",
        value: { role: "Consultant", company: "KPMG", startDate: "2016-02", endDate: "2018-04", status: "past" },
      }),
    ];
    const page = composeOptimisticPage(facts, "draft", "en");
    const exp = page.sections.find((s) => s.type === "experience");
    expect(exp).toBeDefined();
    const items = (exp!.content as { items: { period?: string }[] }).items;
    expect(items[0].period).toContain("2016");
    expect(items[0].period).toContain("2018");
    expect(items[0].period).toContain("–");
  });

  it("renders 'current' label when startDate present but no endDate and status=current", () => {
    const facts = [
      ...baseFacts,
      makeFact({
        key: "li-cdp-2018",
        value: { role: "Financial Analytics", company: "CDP", startDate: "2018-04", status: "current" },
      }),
    ];
    const page = composeOptimisticPage(facts, "draft", "en");
    const exp = page.sections.find((s) => s.type === "experience");
    const items = (exp!.content as { items: { period?: string; current?: boolean }[] }).items;
    expect(items[0].period).toContain("2018");
    expect(items[0].current).toBe(true);
  });

  it("falls back to legacy start/end keys", () => {
    const facts = [
      ...baseFacts,
      makeFact({
        key: "manual-job",
        value: { role: "Dev", company: "Acme", start: "2020-01", end: "2022-06", status: "past" },
      }),
    ];
    const page = composeOptimisticPage(facts, "draft", "en");
    const exp = page.sections.find((s) => s.type === "experience");
    const items = (exp!.content as { items: { period?: string }[] }).items;
    expect(items[0].period).toContain("2020");
    expect(items[0].period).toContain("2022");
  });

  it("falls back to raw period field", () => {
    const facts = [
      ...baseFacts,
      makeFact({
        key: "old-job",
        value: { role: "Intern", company: "BigCo", period: "Summer 2019", status: "past" },
      }),
    ];
    const page = composeOptimisticPage(facts, "draft", "en");
    const exp = page.sections.find((s) => s.type === "experience");
    const items = (exp!.content as { items: { period?: string }[] }).items;
    expect(items[0].period).toBe("Summer 2019");
  });
});

describe("education dates from LinkedIn-style startDate/endDate keys", () => {
  it("renders period from startDate + endDate (year-only)", () => {
    const facts = [
      ...baseFacts,
      makeFact({
        category: "education",
        key: "li-edu-luiss-0",
        value: { institution: "LUISS", degree: "MSc", startDate: "2013", endDate: "2015" },
      }),
    ];
    const page = composeOptimisticPage(facts, "draft", "en");
    const edu = page.sections.find((s) => s.type === "education");
    expect(edu).toBeDefined();
    const items = (edu!.content as { items: { period?: string }[] }).items;
    expect(items[0].period).toContain("2013");
    expect(items[0].period).toContain("2015");
    expect(items[0].period).toContain("–");
  });

  it("renders single date when only endDate present", () => {
    const facts = [
      ...baseFacts,
      makeFact({
        category: "education",
        key: "li-edu-hk-0",
        value: { institution: "Hong Kong Baptist", degree: "Exchange", endDate: "2012" },
      }),
    ];
    const page = composeOptimisticPage(facts, "draft", "en");
    const edu = page.sections.find((s) => s.type === "education");
    const items = (edu!.content as { items: { period?: string }[] }).items;
    expect(items[0].period).toBe("2012");
  });

  it("falls back to raw period field for education", () => {
    const facts = [
      ...baseFacts,
      makeFact({
        category: "education",
        key: "manual-edu",
        value: { institution: "MIT", degree: "BSc", period: "2014 – 2018" },
      }),
    ];
    const page = composeOptimisticPage(facts, "draft", "en");
    const edu = page.sections.find((s) => s.type === "education");
    const items = (edu!.content as { items: { period?: string }[] }).items;
    expect(items[0].period).toBe("2014 – 2018");
  });
});

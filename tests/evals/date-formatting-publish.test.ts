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
    sortOrder: 0,
    parentFactId: null,
    archivedAt: null,
    ...overrides,
  };
}

/**
 * BUG-5: Date formatting in experience/education sections.
 *
 * formatFactDate() is called in buildExperienceSection() and buildEducationSection()
 * during composition. This test verifies ISO dates are human-formatted in the
 * composed output (the same output that feeds projectCanonicalConfig and ultimately
 * the publish pipeline).
 */
describe("experience section date formatting through composition", () => {
  const baseFacts = [
    makeFact({ category: "identity", key: "name", value: { name: "Elena Rossi" } }),
  ];

  it("formats start/end dates as 'Month Year' in English", () => {
    const facts = [
      ...baseFacts,
      makeFact({
        category: "experience",
        key: "job1",
        value: { role: "Designer", company: "Acme", startDate: "2020-06", endDate: "2023-09" },
      }),
    ];
    const page = composeOptimisticPage(facts, "draft", "en");
    const exp = page.sections.find((s) => s.type === "experience");
    expect(exp).toBeDefined();
    const items = (exp!.content as { items: { title: string; period?: string }[] }).items;
    expect(items[0].period).toBe("June 2020 \u2013 September 2023");
  });

  it("formats dates in Italian locale", () => {
    const facts = [
      ...baseFacts,
      makeFact({
        category: "experience",
        key: "job1",
        value: { role: "Designer", company: "Acme", startDate: "2020-03", endDate: "2022-11" },
      }),
    ];
    const page = composeOptimisticPage(facts, "draft", "it");
    const exp = page.sections.find((s) => s.type === "experience");
    expect(exp).toBeDefined();
    const items = (exp!.content as { items: { period?: string }[] }).items;
    expect(items[0].period).toBe("marzo 2020 \u2013 novembre 2022");
  });

  it("shows 'Current' label for ongoing experience", () => {
    const facts = [
      ...baseFacts,
      makeFact({
        category: "experience",
        key: "job1",
        value: { role: "Lead Designer", company: "Studio X", startDate: "2023-01", status: "current" },
      }),
    ];
    const page = composeOptimisticPage(facts, "draft", "en");
    const exp = page.sections.find((s) => s.type === "experience");
    const items = (exp!.content as { items: { period?: string }[] }).items;
    expect(items[0].period).toBe("January 2023 \u2013 Current");
  });

  it("shows year only for YYYY-01-01 start date (Jan 1 rule)", () => {
    const facts = [
      ...baseFacts,
      makeFact({
        category: "experience",
        key: "job1",
        value: { role: "Engineer", company: "Co", startDate: "2021-01-01" },
      }),
    ];
    const page = composeOptimisticPage(facts, "draft", "en");
    const exp = page.sections.find((s) => s.type === "experience");
    const items = (exp!.content as { items: { period?: string }[] }).items;
    // formatFactDate returns just the year for YYYY-01-01
    expect(items[0].period).toBe("2021");
  });

  it("passes raw period through when no startDate/endDate", () => {
    const facts = [
      ...baseFacts,
      makeFact({
        category: "experience",
        key: "job1",
        value: { role: "Intern", company: "Lab", period: "Summer 2019" },
      }),
    ];
    const page = composeOptimisticPage(facts, "draft", "en");
    const exp = page.sections.find((s) => s.type === "experience");
    const items = (exp!.content as { items: { period?: string }[] }).items;
    expect(items[0].period).toBe("Summer 2019");
  });
});

describe("education section date formatting through composition", () => {
  const baseFacts = [
    makeFact({ category: "identity", key: "name", value: { name: "Elena Rossi" } }),
  ];

  it("formats education start/end dates as 'Month Year'", () => {
    const facts = [
      ...baseFacts,
      makeFact({
        category: "education",
        key: "uni1",
        value: { institution: "MIT", degree: "MSc", startDate: "2018-09", endDate: "2020-06" },
      }),
    ];
    const page = composeOptimisticPage(facts, "draft", "en");
    const edu = page.sections.find((s) => s.type === "education");
    expect(edu).toBeDefined();
    const items = (edu!.content as { items: { period?: string }[] }).items;
    expect(items[0].period).toBe("September 2018 \u2013 June 2020");
  });

  it("formats education dates in German locale", () => {
    const facts = [
      ...baseFacts,
      makeFact({
        category: "education",
        key: "uni1",
        value: { institution: "TU Berlin", degree: "BSc", startDate: "2015-10", endDate: "2019-07" },
      }),
    ];
    const page = composeOptimisticPage(facts, "draft", "de");
    const edu = page.sections.find((s) => s.type === "education");
    expect(edu).toBeDefined();
    const items = (edu!.content as { items: { period?: string }[] }).items;
    expect(items[0].period).toBe("Oktober 2015 \u2013 Juli 2019");
  });

  it("handles end-date-only education fact", () => {
    const facts = [
      ...baseFacts,
      makeFact({
        category: "education",
        key: "uni1",
        value: { institution: "Oxford", endDate: "2022-06" },
      }),
    ];
    const page = composeOptimisticPage(facts, "draft", "en");
    const edu = page.sections.find((s) => s.type === "education");
    expect(edu).toBeDefined();
    const items = (edu!.content as { items: { period?: string }[] }).items;
    expect(items[0].period).toBe("June 2022");
  });
});

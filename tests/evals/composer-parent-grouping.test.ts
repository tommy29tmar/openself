/**
 * Tests for parentFactId grouping in page composition.
 *
 * Child project facts (parentFactId → experience) are excluded from the
 * standalone projects section. Orphaned children are treated as top-level.
 */
import { describe, it, expect } from "vitest";
import { composeOptimisticPage } from "@/lib/services/page-composer";
import type { FactRow } from "@/lib/services/kb-service";

function makeFact(overrides: Partial<FactRow> & { id: string; category: string; key: string; value: Record<string, unknown> }): FactRow {
  return {
    sessionId: "test",
    profileId: "test",
    source: "chat",
    confidence: 1,
    visibility: "public",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sortOrder: 0,
    parentFactId: null,
    archivedAt: null,
    ...overrides,
  } as FactRow;
}

const identityFact = makeFact({
  id: "id1", category: "identity", key: "name",
  value: { full: "Test User" },
});

describe("parentFactId grouping", () => {
  it("projects with parentFactId pointing to existing experience are excluded from projects section", () => {
    const facts = [
      identityFact,
      makeFact({
        id: "exp1", category: "experience", key: "acme",
        value: { role: "Dev", company: "Acme", status: "current" },
      }),
      makeFact({
        id: "proj1", category: "project", key: "alpha",
        value: { name: "Alpha" },
        parentFactId: "exp1",
      }),
      makeFact({
        id: "proj2", category: "project", key: "beta",
        value: { name: "Beta" },
      }),
    ];
    const page = composeOptimisticPage(facts, "test", "en");
    const projects = page.sections.find(s => s.type === "projects");
    expect(projects).toBeDefined();
    const items = (projects!.content as Record<string, unknown>).items as Array<{ title: string }>;
    // Only proj2 (top-level) should appear, not proj1 (child of exp1)
    const titles = items.map(i => i.title);
    expect(titles).toContain("Beta");
    expect(titles).not.toContain("Alpha");
  });

  it("orphaned children (parentFactId points to non-existent fact) are treated as top-level", () => {
    const facts = [
      identityFact,
      makeFact({
        id: "proj1", category: "project", key: "gamma",
        value: { name: "Gamma" },
        parentFactId: "deleted-fact-id",
      }),
      makeFact({
        id: "proj2", category: "project", key: "delta",
        value: { name: "Delta" },
      }),
    ];
    const page = composeOptimisticPage(facts, "test", "en");
    const projects = page.sections.find(s => s.type === "projects");
    expect(projects).toBeDefined();
    const items = (projects!.content as Record<string, unknown>).items as Array<{ title: string }>;
    const titles = items.map(i => i.title);
    expect(titles).toContain("Gamma");
    expect(titles).toContain("Delta");
  });

  it("project with no parentFactId remains in projects section", () => {
    const facts = [
      identityFact,
      makeFact({
        id: "proj1", category: "project", key: "epsilon",
        value: { name: "Epsilon" },
      }),
    ];
    const page = composeOptimisticPage(facts, "test", "en");
    const projects = page.sections.find(s => s.type === "projects");
    expect(projects).toBeDefined();
    const items = (projects!.content as Record<string, unknown>).items as Array<{ title: string }>;
    expect(items.map(i => i.title)).toContain("Epsilon");
  });

  it("all project facts with parentFactId → experience are excluded, none shown standalone", () => {
    const facts = [
      identityFact,
      makeFact({
        id: "exp1", category: "experience", key: "co1",
        value: { role: "Lead", company: "Co1", status: "past" },
      }),
      makeFact({
        id: "proj1", category: "project", key: "p1",
        value: { name: "P1" },
        parentFactId: "exp1",
      }),
      makeFact({
        id: "proj2", category: "project", key: "p2",
        value: { name: "P2" },
        parentFactId: "exp1",
      }),
    ];
    const page = composeOptimisticPage(facts, "test", "en");
    const projects = page.sections.find(s => s.type === "projects");
    // No top-level projects → projects section should not exist
    expect(projects).toBeUndefined();
  });
});

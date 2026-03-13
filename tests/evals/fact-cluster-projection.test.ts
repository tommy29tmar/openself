import { describe, it, expect } from "vitest";
import { projectClusteredFacts } from "@/lib/services/fact-cluster-service";

const makeFact = (overrides: Record<string, unknown>) => ({
  id: "f1",
  category: "skill",
  key: "typescript",
  value: { name: "TypeScript" },
  source: "chat",
  confidence: 1.0,
  visibility: "public",
  sortOrder: 0,
  parentFactId: null,
  archivedAt: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  clusterId: null,
  ...overrides,
});

describe("projectClusteredFacts", () => {
  it("passes unclustered facts through unchanged", () => {
    const facts = [
      makeFact({ id: "f1", key: "typescript" }),
      makeFact({ id: "f2", key: "python", value: { name: "Python" } }),
    ];
    const result = projectClusteredFacts(facts as any, []);
    expect(result).toHaveLength(2);
    expect(result[0].key).toBe("typescript");
    expect(result[0].memberIds).toEqual(["f1"]);
    expect(result[1].key).toBe("python");
    expect(result[1].memberIds).toEqual(["f2"]);
  });

  it("projects cluster into single fact with merged fields", () => {
    const cluster = { id: "c1", ownerKey: "prof-1", category: "education", canonicalKey: "politecnico-milano" };
    const facts = [
      makeFact({
        id: "f1", category: "education", key: "politecnico-milano",
        value: { institution: "Politecnico di Milano", degree: "Laurea", field: "Informatica" },
        source: "chat", clusterId: "c1", sortOrder: 0,
      }),
      makeFact({
        id: "f2", category: "education", key: "li-edu-politecnico-0",
        value: { institution: "Politecnico di Milano", degree: "Laurea", startDate: "2015", endDate: "2018" },
        source: "connector", clusterId: "c1", sortOrder: 1,
      }),
    ];
    const result = projectClusteredFacts(facts as any, [cluster] as any);

    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("politecnico-milano");
    expect(result[0].value).toEqual({
      institution: "Politecnico di Milano",
      degree: "Laurea",
      field: "Informatica",
      startDate: "2015",
      endDate: "2018",
    });
    expect(result[0].sources).toEqual(["chat", "connector"]);
    expect(result[0].clusterSize).toBe(2);
    expect(result[0].memberIds).toEqual(["f1", "f2"]);
  });

  it("source priority: chat > connector", () => {
    const cluster = { id: "c1", ownerKey: "prof-1", category: "skill", canonicalKey: "ts" };
    const facts = [
      makeFact({
        id: "f1", category: "skill", key: "ts",
        value: { name: "TypeScript", level: "advanced" },
        source: "chat", clusterId: "c1",
      }),
      makeFact({
        id: "f2", category: "skill", key: "gh-typescript",
        value: { name: "TypeScript", evidence: "45 repos", level: "intermediate" },
        source: "connector", clusterId: "c1",
      }),
    ];
    const result = projectClusteredFacts(facts as any, [cluster] as any);

    expect(result[0].value).toEqual({
      name: "TypeScript",
      level: "advanced",
      evidence: "45 repos",
    });
  });

  it("visibility: private in any member → private", () => {
    const cluster = { id: "c1", ownerKey: "prof-1", category: "skill", canonicalKey: "ts" };
    const facts = [
      makeFact({ id: "f1", clusterId: "c1", visibility: "private", source: "chat" }),
      makeFact({ id: "f2", clusterId: "c1", visibility: "public", source: "connector" }),
    ];
    const result = projectClusteredFacts(facts as any, [cluster] as any);
    expect(result[0].visibility).toBe("private");
  });

  it("visibility: public when any member is public and none private", () => {
    const cluster = { id: "c1", ownerKey: "prof-1", category: "skill", canonicalKey: "ts" };
    const facts = [
      makeFact({ id: "f1", clusterId: "c1", visibility: "proposed", source: "chat" }),
      makeFact({ id: "f2", clusterId: "c1", visibility: "public", source: "connector" }),
    ];
    const result = projectClusteredFacts(facts as any, [cluster] as any);
    expect(result[0].visibility).toBe("public");
  });

  it("mixes clustered and unclustered facts", () => {
    const cluster = { id: "c1", ownerKey: "prof-1", category: "skill", canonicalKey: "ts" };
    const facts = [
      makeFact({ id: "f1", key: "ts", clusterId: "c1", source: "chat" }),
      makeFact({ id: "f2", key: "gh-typescript", clusterId: "c1", source: "connector" }),
      makeFact({ id: "f3", key: "python", clusterId: null }),
    ];
    const result = projectClusteredFacts(facts as any, [cluster] as any);
    expect(result).toHaveLength(2);
  });

  it("preserves sortOrder from highest-priority fact", () => {
    const cluster = { id: "c1", ownerKey: "prof-1", category: "skill", canonicalKey: "ts" };
    const facts = [
      makeFact({ id: "f1", clusterId: "c1", source: "chat", sortOrder: 3 }),
      makeFact({ id: "f2", clusterId: "c1", source: "connector", sortOrder: 7 }),
    ];
    const result = projectClusteredFacts(facts as any, [cluster] as any);
    expect(result[0].sortOrder).toBe(3);
  });
});

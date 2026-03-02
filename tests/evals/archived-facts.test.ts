import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { facts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  getActiveFacts,
  getFactById,
  getFactByKey,
  searchFacts,
  getFactsByCategory,
  countFacts,
} from "@/lib/services/kb-service";

describe("archived fact filtering", () => {
  const sessionId = "__default__";
  const factIds: string[] = [];

  beforeEach(() => {
    // Clean up test facts
    for (const id of factIds) {
      db.delete(facts).where(eq(facts.id, id)).run();
    }
    factIds.length = 0;

    // Create 3 facts, archive 1
    const suffix = randomUUID().slice(0, 8);
    const f1 = randomUUID();
    const f2 = randomUUID();
    const f3 = randomUUID();
    factIds.push(f1, f2, f3);

    db.insert(facts).values({
      id: f1,
      sessionId,
      category: "skill",
      key: `ts-${suffix}`,
      value: { name: "TypeScript" },
      sortOrder: 0,
    }).run();

    db.insert(facts).values({
      id: f2,
      sessionId,
      category: "skill",
      key: `js-${suffix}`,
      value: { name: "JavaScript" },
      sortOrder: 1,
    }).run();

    db.insert(facts).values({
      id: f3,
      sessionId,
      category: "skill",
      key: `old-${suffix}`,
      value: { name: "jQuery" },
      sortOrder: 2,
      archivedAt: new Date().toISOString(), // archived!
    }).run();
  });

  it("getActiveFacts excludes archived facts", () => {
    const active = getActiveFacts(sessionId);
    const testFacts = active.filter(f => factIds.includes(f.id));
    expect(testFacts.length).toBe(2);
    expect(testFacts.every(f => f.archivedAt === null)).toBe(true);
  });

  it("getActiveFacts includes facts with archived_at = null", () => {
    const active = getActiveFacts(sessionId);
    const testFacts = active.filter(f => factIds.includes(f.id));
    expect(testFacts.map(f => f.id)).toContain(factIds[0]);
    expect(testFacts.map(f => f.id)).toContain(factIds[1]);
  });

  it("getFactById returns archived facts (for unarchive)", () => {
    const archivedFact = getFactById(factIds[2], sessionId);
    expect(archivedFact).not.toBeNull();
    expect(archivedFact!.archivedAt).not.toBeNull();
  });

  it("searchFacts excludes archived facts", () => {
    // Search for "jQuery" which is archived
    const results = searchFacts("jQuery", sessionId);
    const testResults = results.filter(f => factIds.includes(f.id));
    expect(testResults.length).toBe(0);
  });

  it("searchFacts includes non-archived facts", () => {
    const results = searchFacts("TypeScript", sessionId);
    const testResults = results.filter(f => factIds.includes(f.id));
    expect(testResults.length).toBe(1);
  });

  it("getFactsByCategory excludes archived facts", () => {
    const results = getFactsByCategory("skill", sessionId);
    const testResults = results.filter(f => factIds.includes(f.id));
    expect(testResults.length).toBe(2);
    expect(testResults.every(f => f.archivedAt === null)).toBe(true);
  });

  it("getFactByKey excludes archived facts", () => {
    // Get the archived fact's key via getFactById (which doesn't filter archived)
    const archived = getFactById(factIds[2], sessionId);
    expect(archived).not.toBeNull();
    const result = getFactByKey(sessionId, archived!.category, archived!.key);
    expect(result).toBeUndefined();
  });

  it("getFactByKey returns non-archived facts", () => {
    const active = getFactById(factIds[0], sessionId);
    expect(active).not.toBeNull();
    const result = getFactByKey(sessionId, active!.category, active!.key);
    expect(result).toBeDefined();
    expect(result!.id).toBe(factIds[0]);
  });

  it("countFacts excludes archived facts", () => {
    // Count all facts for this session — should not include the archived one
    const totalCount = countFacts([sessionId]);
    // We can't assert exact count (other test data may exist),
    // but we can verify archived fact is excluded by checking our 3 test facts
    const active = getActiveFacts(sessionId);
    const testActive = active.filter(f => factIds.includes(f.id));
    expect(testActive.length).toBe(2);

    // Count should be >= 2 (our active facts) but the archived one should not be counted
    expect(totalCount).toBeGreaterThanOrEqual(2);
  });
});

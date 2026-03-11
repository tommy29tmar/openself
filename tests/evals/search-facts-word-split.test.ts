import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import { facts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { searchFacts } from "@/lib/services/kb-service";

/**
 * BUG-3: searchFacts word-split regression test.
 *
 * Tests the real searchFacts function against real seeded data.
 * Follows the archived-facts.test.ts pattern (no mocking).
 *
 * Before fix: multi-word queries like "contact email" return 0 results
 * because the old LIKE '%contact email%' requires the entire query as
 * a contiguous substring in ONE field.
 *
 * After fix: each term is matched independently (AND between terms,
 * OR between fields), so "contact email" matches the fact where
 * "contact" is in category and "email" is in value.
 */

describe("searchFacts word-split", () => {
  const sessionId = "__default__";
  const factIds: string[] = [];
  let suffix: string;

  beforeEach(() => {
    // Clean up any previous test facts
    for (const id of factIds) {
      db.delete(facts).where(eq(facts.id, id)).run();
    }
    factIds.length = 0;

    // Unique suffix to avoid collision with other tests
    suffix = randomUUID().slice(0, 8);

    const f1 = randomUUID();
    const f2 = randomUUID();
    const f3 = randomUUID();
    const f4 = randomUUID();
    factIds.push(f1, f2, f3, f4);

    db.insert(facts).values({
      id: f1,
      sessionId,
      category: "contact",
      key: `email-professional-${suffix}`,
      value: { type: "email", value: "contact@photographer.com" },
      sortOrder: 0,
    }).run();

    db.insert(facts).values({
      id: f2,
      sessionId,
      category: "achievement",
      key: `workshop-garcia-rodero-${suffix}`,
      value: { title: "Workshop intensivo con Cristina García Rodero", location: "Barcellona" },
      sortOrder: 0,
    }).run();

    db.insert(facts).values({
      id: f3,
      sessionId,
      category: "experience",
      key: `ansa-fotoreporter-${suffix}`,
      value: { role: "Fotoreporter", company: "ANSA", start: "2020-09" },
      sortOrder: 0,
    }).run();

    db.insert(facts).values({
      id: f4,
      sessionId,
      category: "identity",
      key: `name-${suffix}`,
      value: { full: "Elena Rossi" },
      sortOrder: 0,
    }).run();
  });

  afterEach(() => {
    for (const id of factIds) {
      db.delete(facts).where(eq(facts.id, id)).run();
    }
  });

  it("single-word query matches category", () => {
    const results = searchFacts("contact", sessionId);
    const testResults = results.filter(f => factIds.includes(f.id));
    expect(testResults.length).toBe(1);
    expect(testResults[0].category).toBe("contact");
  });

  it("multi-word query matches across fields: 'contact email'", () => {
    // BUG-3 root cause: old LIKE '%contact email%' returns 0 because
    // no single field contains "contact email" as a contiguous substring.
    // "contact" is in category, "email" is in key/value.
    const results = searchFacts("contact email", sessionId);
    const testResults = results.filter(f => factIds.includes(f.id));
    expect(testResults.length).toBe(1);
    expect(testResults[0].category).toBe("contact");
  });

  it("multi-word query matches key + value: 'workshop Rodero'", () => {
    const results = searchFacts("workshop Rodero", sessionId);
    const testResults = results.filter(f => factIds.includes(f.id));
    expect(testResults.length).toBe(1);
    expect(testResults[0].category).toBe("achievement");
  });

  it("multi-word query with no match returns empty: 'contact music'", () => {
    const results = searchFacts("contact music", sessionId);
    const testResults = results.filter(f => factIds.includes(f.id));
    expect(testResults.length).toBe(0);
  });

  it("single-word query matches value content: 'ANSA'", () => {
    const results = searchFacts("ANSA", sessionId);
    const testResults = results.filter(f => factIds.includes(f.id));
    expect(testResults.length).toBe(1);
    expect(testResults[0].category).toBe("experience");
  });

  it("empty query returns empty", () => {
    const results = searchFacts("", sessionId);
    expect(results.length).toBe(0);
  });

  it("multi-word query matches category + value: 'achievement workshop'", () => {
    const results = searchFacts("achievement workshop", sessionId);
    const testResults = results.filter(f => factIds.includes(f.id));
    expect(testResults.length).toBe(1);
    expect(testResults[0].category).toBe("achievement");
  });

  it("query with value-only match: 'Elena Rossi'", () => {
    const results = searchFacts("Elena Rossi", sessionId);
    const testResults = results.filter(f => factIds.includes(f.id));
    expect(testResults.length).toBe(1);
    expect(testResults[0].category).toBe("identity");
  });
});

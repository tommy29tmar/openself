import { describe, it, expect, vi } from "vitest";

/**
 * Skill deduplication at composition time (defense-in-depth).
 * BUG-2: Python appears twice when pre-clustering legacy data exists.
 */

vi.mock("@/lib/services/event-service", () => ({ logEvent: vi.fn() }));
vi.mock("@/lib/services/media-service", () => ({ getProfileAvatar: vi.fn() }));

import { buildSkillsSection } from "@/lib/services/page-composer";

function makeFact(key: string, name: string) {
  return {
    id: `fact-${key}`,
    sessionId: "s1",
    category: "skill",
    key,
    value: { name },
    visibility: "public",
    source: "chat",
    sortOrder: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archivedAt: null,
    profileId: null,
  };
}

describe("buildSkillsSection deduplication", () => {
  it("deduplicates skills with identical names (case-insensitive)", () => {
    const facts = [
      makeFact("python-1", "Python"),
      makeFact("python-2", "python"),
      makeFact("typescript", "TypeScript"),
    ];
    const section = buildSkillsSection(facts as any, "en");
    expect(section).not.toBeNull();
    const content = section!.content as { groups: { skills: string[] }[] };
    expect(content.groups[0].skills).toEqual(["Python", "TypeScript"]);
  });

  it("deduplicates skills with whitespace variations", () => {
    const facts = [
      makeFact("next-1", "Next.js"),
      makeFact("next-2", " Next.js "),
      makeFact("react", "React"),
    ];
    const section = buildSkillsSection(facts as any, "en");
    const content = section!.content as { groups: { skills: string[] }[] };
    expect(content.groups[0].skills).toHaveLength(2);
  });

  it("returns null when all skills are duplicates except zero unique", () => {
    const facts = [
      makeFact("python-1", "Python"),
      makeFact("python-2", "Python"),
    ];
    const section = buildSkillsSection(facts as any, "en");
    expect(section).not.toBeNull();
    const content = section!.content as { groups: { skills: string[] }[] };
    // Should have exactly 1 unique Python
    expect(content.groups[0].skills).toEqual(["Python"]);
  });

  it("preserves order of first occurrence", () => {
    const facts = [
      makeFact("ts", "TypeScript"),
      makeFact("py", "Python"),
      makeFact("ts-dup", "typescript"),
      makeFact("go", "Go"),
    ];
    const section = buildSkillsSection(facts as any, "en");
    const content = section!.content as { groups: { skills: string[] }[] };
    expect(content.groups[0].skills).toEqual(["TypeScript", "Python", "Go"]);
  });
});

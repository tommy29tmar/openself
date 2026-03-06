import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist the mock function for getActiveCopy
const { mockGetActiveCopy } = vi.hoisted(() => ({
  mockGetActiveCopy: vi.fn(),
}));

// Mock the section-copy-state-service (DB dependency)
vi.mock("@/lib/services/section-copy-state-service", () => ({
  getActiveCopy: mockGetActiveCopy,
}));

import { detectImpactedSections } from "@/lib/services/personalization-impact";
import {
  computeSectionFactsHash,
  computeHash,
} from "@/lib/services/personalization-hashing";
import type { FactRow } from "@/lib/services/kb-service";

function makeFact(
  overrides: Partial<FactRow> & Pick<FactRow, "category" | "key">,
): FactRow {
  return {
    id: overrides.id ?? "fact-" + Math.random().toString(36).slice(2, 8),
    category: overrides.category,
    key: overrides.key,
    value: overrides.value ?? {},
    source: overrides.source ?? "chat",
    confidence: overrides.confidence ?? 1.0,
    visibility: overrides.visibility ?? "public",
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00Z",
    sortOrder: overrides.sortOrder ?? 0,
    parentFactId: overrides.parentFactId ?? null,
    archivedAt: overrides.archivedAt ?? null,
  };
}

const OWNER = "test-owner";
const LANG = "en";
const SOUL_HASH = computeHash("warm and friendly voice");

beforeEach(() => {
  mockGetActiveCopy.mockReset();
});

describe("detectImpactedSections", () => {
  it("returns all types with relevant facts when no state exists", () => {
    // No existing copy state — every section with relevant facts is impacted
    mockGetActiveCopy.mockReturnValue(null);

    const facts: FactRow[] = [
      makeFact({ category: "identity", key: "full-name" }),
      makeFact({ category: "skill", key: "typescript" }),
      makeFact({ category: "interest", key: "music" }),
    ];

    const impacted = detectImpactedSections(facts, OWNER, LANG, SOUL_HASH);

    // identity → hero, bio; skill → skills; interest → bio, interests
    expect(impacted).toContain("hero");
    expect(impacted).toContain("bio");
    expect(impacted).toContain("skills");
    expect(impacted).toContain("interests");
  });

  it("skips sections where hashes match", () => {
    const facts: FactRow[] = [
      makeFact({ id: "f1", category: "skill", key: "typescript" }),
    ];

    const factsHash = computeSectionFactsHash(facts, "skills");

    // Return a state with matching hashes
    mockGetActiveCopy.mockImplementation(
      (_owner: string, sectionType: string) => {
        if (sectionType === "skills") {
          return {
            id: 1,
            ownerKey: OWNER,
            sectionType: "skills",
            language: LANG,
            personalizedContent: '{"description":"Skilled in TS"}',
            factsHash,
            soulHash: SOUL_HASH,
            approvedAt: null,
            source: "live",
          };
        }
        return null;
      },
    );

    const impacted = detectImpactedSections(facts, OWNER, LANG, SOUL_HASH);

    expect(impacted).not.toContain("skills");
  });

  it("includes sections where facts hash changed", () => {
    const facts: FactRow[] = [
      makeFact({ id: "f1", category: "skill", key: "typescript" }),
    ];

    // Return a state with a stale facts hash
    mockGetActiveCopy.mockImplementation(
      (_owner: string, sectionType: string) => {
        if (sectionType === "skills") {
          return {
            id: 1,
            ownerKey: OWNER,
            sectionType: "skills",
            language: LANG,
            personalizedContent: '{"description":"Old copy"}',
            factsHash: "stale-hash-that-wont-match",
            soulHash: SOUL_HASH,
            approvedAt: null,
            source: "live",
          };
        }
        return null;
      },
    );

    const impacted = detectImpactedSections(facts, OWNER, LANG, SOUL_HASH);

    expect(impacted).toContain("skills");
  });

  it("includes sections where soul hash changed", () => {
    const facts: FactRow[] = [
      makeFact({ id: "f1", category: "skill", key: "typescript" }),
    ];

    const factsHash = computeSectionFactsHash(facts, "skills");

    // Return a state with matching facts hash but stale soul hash
    mockGetActiveCopy.mockImplementation(
      (_owner: string, sectionType: string) => {
        if (sectionType === "skills") {
          return {
            id: 1,
            ownerKey: OWNER,
            sectionType: "skills",
            language: LANG,
            personalizedContent: '{"description":"Old copy"}',
            factsHash,
            soulHash: "old-soul-hash-that-wont-match",
            approvedAt: null,
            source: "live",
          };
        }
        return null;
      },
    );

    const impacted = detectImpactedSections(
      facts,
      OWNER,
      LANG,
      SOUL_HASH,
    );

    expect(impacted).toContain("skills");
  });

  it("skips types with no relevant facts", () => {
    mockGetActiveCopy.mockReturnValue(null);

    // Only identity facts — should not trigger skills, projects, etc.
    const facts: FactRow[] = [
      makeFact({ category: "identity", key: "full-name" }),
    ];

    const impacted = detectImpactedSections(facts, OWNER, LANG, SOUL_HASH);

    // identity maps to hero and bio only
    expect(impacted).toContain("hero");
    expect(impacted).toContain("bio");
    expect(impacted).not.toContain("skills");
    expect(impacted).not.toContain("projects");
    expect(impacted).not.toContain("achievements");
    expect(impacted).not.toContain("experience");
    expect(impacted).not.toContain("education");
    expect(impacted).not.toContain("languages");
    expect(impacted).not.toContain("reading");
    expect(impacted).not.toContain("music");
    expect(impacted).not.toContain("stats");
  });

  it("returns empty array when no facts provided", () => {
    mockGetActiveCopy.mockReturnValue(null);

    const impacted = detectImpactedSections([], OWNER, LANG, SOUL_HASH);

    expect(impacted).toEqual([]);
  });

  it("handles multiple section types impacted at once", () => {
    mockGetActiveCopy.mockReturnValue(null);

    const facts: FactRow[] = [
      makeFact({ category: "identity", key: "full-name" }),
      makeFact({ category: "skill", key: "ts" }),
      makeFact({ category: "project", key: "openself" }),
      makeFact({ category: "achievement", key: "award" }),
      makeFact({ category: "experience", key: "dev-job" }),
      makeFact({ category: "education", key: "degree" }),
    ];

    const impacted = detectImpactedSections(facts, OWNER, LANG, SOUL_HASH);

    expect(impacted).toContain("hero");
    expect(impacted).toContain("bio");
    expect(impacted).toContain("skills");
    expect(impacted).toContain("projects");
    expect(impacted).toContain("achievements");
    expect(impacted).toContain("experience");
    expect(impacted).toContain("education");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isSectionComplete,
  filterCompleteSections,
} from "@/lib/page-config/section-completeness";
import {
  filterPublishableFacts,
  projectPublishableConfig,
} from "@/lib/services/page-projection";
import { computeConfigHash } from "@/lib/services/page-service";
import type { Section, PageConfig } from "@/lib/page-config/schema";
import type { FactRow } from "@/lib/services/kb-service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSection(
  type: string,
  content: Record<string, unknown>,
  id?: string,
): Section {
  return { id: id ?? `s-${type}`, type: type as Section["type"], content };
}

function makeFact(overrides: Partial<FactRow> & { category: string; key: string }): FactRow {
  return {
    id: `f-${overrides.key}`,
    sessionId: "sess1",
    profileId: "sess1",
    category: overrides.category,
    key: overrides.key,
    value: overrides.value ?? { name: "test" },
    visibility: overrides.visibility ?? "proposed",
    confidence: 1.0,
    source: "chat",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  } as FactRow;
}

// ---------------------------------------------------------------------------
// 1. Section Completeness
// ---------------------------------------------------------------------------

describe("isSectionComplete", () => {
  describe("exempt types", () => {
    it("hero is always complete", () => {
      expect(isSectionComplete(makeSection("hero", {}))).toBe(true);
    });

    it("hero is complete even with empty content", () => {
      expect(isSectionComplete(makeSection("hero", { name: "" }))).toBe(true);
    });

    it("footer is always complete", () => {
      expect(isSectionComplete(makeSection("footer", {}))).toBe(true);
    });
  });

  describe("items-based sections", () => {
    it("skills with groups is complete", () => {
      expect(
        isSectionComplete(
          makeSection("skills", { groups: [{ label: "Web", skills: ["JS"] }] }),
        ),
      ).toBe(true);
    });

    it("skills with empty groups is incomplete", () => {
      expect(isSectionComplete(makeSection("skills", { groups: [] }))).toBe(
        false,
      );
    });

    it("projects with items is complete", () => {
      expect(
        isSectionComplete(
          makeSection("projects", { items: [{ title: "App" }] }),
        ),
      ).toBe(true);
    });

    it("projects with empty items is incomplete", () => {
      expect(isSectionComplete(makeSection("projects", { items: [] }))).toBe(
        false,
      );
    });

    it("social with links is complete", () => {
      expect(
        isSectionComplete(
          makeSection("social", {
            links: [{ platform: "github", url: "https://github.com/test" }],
          }),
        ),
      ).toBe(true);
    });

    it("social with empty links is incomplete", () => {
      expect(isSectionComplete(makeSection("social", { links: [] }))).toBe(
        false,
      );
    });

    it("contact with methods is complete", () => {
      expect(
        isSectionComplete(
          makeSection("contact", {
            methods: [{ type: "email", value: "x@y.com" }],
          }),
        ),
      ).toBe(true);
    });

    it("contact with empty methods is incomplete", () => {
      expect(
        isSectionComplete(makeSection("contact", { methods: [] })),
      ).toBe(false);
    });

    for (const type of ["experience", "education", "achievements", "stats", "reading", "music", "languages", "activities", "interests"]) {
      it(`${type} with items is complete`, () => {
        expect(
          isSectionComplete(makeSection(type, { items: [{ label: "x" }] })),
        ).toBe(true);
      });

      it(`${type} with empty items is incomplete`, () => {
        expect(isSectionComplete(makeSection(type, { items: [] }))).toBe(
          false,
        );
      });
    }
  });

  describe("bio section", () => {
    it("bio with text is complete", () => {
      expect(
        isSectionComplete(makeSection("bio", { text: "Hello world" })),
      ).toBe(true);
    });

    it("bio with empty text is incomplete", () => {
      expect(isSectionComplete(makeSection("bio", { text: "" }))).toBe(false);
    });

    it("bio with whitespace-only text is incomplete", () => {
      expect(isSectionComplete(makeSection("bio", { text: "   " }))).toBe(
        false,
      );
    });
  });

  describe("custom section", () => {
    it("custom with body is complete", () => {
      expect(
        isSectionComplete(makeSection("custom", { body: "Some content" })),
      ).toBe(true);
    });

    it("custom with items is complete", () => {
      expect(
        isSectionComplete(
          makeSection("custom", { items: [{ text: "item" }] }),
        ),
      ).toBe(true);
    });

    it("custom with empty body and no items is incomplete", () => {
      expect(isSectionComplete(makeSection("custom", { body: "" }))).toBe(
        false,
      );
    });
  });

  describe("edge cases", () => {
    it("null content is incomplete", () => {
      expect(
        isSectionComplete({ id: "s1", type: "skills", content: null as any }),
      ).toBe(false);
    });

    it("non-object content is incomplete", () => {
      expect(
        isSectionComplete({
          id: "s1",
          type: "skills",
          content: "string" as any,
        }),
      ).toBe(false);
    });
  });
});

describe("filterCompleteSections", () => {
  it("filters out incomplete sections", () => {
    const sections = [
      makeSection("hero", { name: "Test" }),
      makeSection("skills", { groups: [] }), // incomplete
      makeSection("projects", { items: [{ title: "App" }] }),
      makeSection("bio", { text: "" }), // incomplete
      makeSection("footer", {}),
    ];
    const result = filterCompleteSections(sections);
    expect(result).toHaveLength(3);
    expect(result.map((s) => s.type)).toEqual(["hero", "projects", "footer"]);
  });

  it("returns all sections when all are complete", () => {
    const sections = [
      makeSection("hero", { name: "Test" }),
      makeSection("skills", { groups: [{ label: "G", skills: [] }] }),
      makeSection("footer", {}),
    ];
    expect(filterCompleteSections(sections)).toHaveLength(3);
  });

  it("returns hero+footer for empty page", () => {
    const sections = [
      makeSection("hero", {}),
      makeSection("skills", { groups: [] }),
      makeSection("footer", {}),
    ];
    const result = filterCompleteSections(sections);
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.type)).toEqual(["hero", "footer"]);
  });
});

// ---------------------------------------------------------------------------
// 2. filterPublishableFacts
// ---------------------------------------------------------------------------

describe("filterPublishableFacts", () => {
  it("includes public facts", () => {
    const facts = [makeFact({ category: "skill", key: "js", visibility: "public" })];
    expect(filterPublishableFacts(facts)).toHaveLength(1);
  });

  it("includes proposed facts", () => {
    const facts = [makeFact({ category: "skill", key: "js", visibility: "proposed" })];
    expect(filterPublishableFacts(facts)).toHaveLength(1);
  });

  it("excludes private facts", () => {
    const facts = [makeFact({ category: "skill", key: "js", visibility: "private" })];
    expect(filterPublishableFacts(facts)).toHaveLength(0);
  });

  it("excludes sensitive categories even if public", () => {
    const facts = [
      makeFact({ category: "health", key: "condition", visibility: "public" }),
    ];
    expect(filterPublishableFacts(facts)).toHaveLength(0);
  });

  it("excludes sensitive categories even if proposed", () => {
    const facts = [
      makeFact({ category: "compensation", key: "salary", visibility: "proposed" }),
    ];
    expect(filterPublishableFacts(facts)).toHaveLength(0);
  });

  it("mixed: filters correctly", () => {
    const facts = [
      makeFact({ category: "skill", key: "js", visibility: "public" }),
      makeFact({ category: "skill", key: "ts", visibility: "private" }),
      makeFact({ category: "contact", key: "email", visibility: "proposed" }), // contact is user-controlled, passes through
      makeFact({ category: "project", key: "app", visibility: "proposed" }),
    ];
    const result = filterPublishableFacts(facts);
    expect(result).toHaveLength(3);
    expect(result.map((f) => f.key)).toEqual(["js", "email", "app"]);
  });

  it("legacy sensitive+proposed fact excluded (regression guard)", () => {
    // A legacy fact that is both sensitive AND proposed should be excluded
    // from both the projection AND the promote loop
    const facts = [
      makeFact({ category: "health", key: "condition", visibility: "proposed" }),
    ];
    expect(filterPublishableFacts(facts)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3. projectPublishableConfig (needs mocking of composeOptimisticPage)
// ---------------------------------------------------------------------------

// Mock the composer to return a predictable config
vi.mock("@/lib/services/page-composer", () => ({
  composeOptimisticPage: vi.fn(
    (facts: FactRow[], username: string, _lang: string) => ({
      version: 1,
      username,
      surface: "canvas",
      voice: "signal",
      light: "day",
      style: {
        primaryColor: "#000",
        layout: "centered",
      },
      sections: facts.map((f, i) => ({
        id: `s-${i}`,
        type: "skills" as const,
        content: { groups: [{ label: f.category, skills: [f.key] }] },
      })),
    }),
  ),
}));

describe("projectPublishableConfig", () => {
  it("filters private facts before composing", () => {
    const facts = [
      makeFact({ category: "skill", key: "js", visibility: "public" }),
      makeFact({ category: "skill", key: "secret", visibility: "private" }),
    ];
    const config = projectPublishableConfig(facts, "alice", "en");
    // Only 1 fact passes the filter → 1 section
    expect(config.sections).toHaveLength(1);
  });

  it("filters sensitive facts before composing", () => {
    const facts = [
      makeFact({ category: "skill", key: "js", visibility: "proposed" }),
      makeFact({ category: "compensation", key: "salary", visibility: "proposed" }), // truly sensitive
    ];
    const config = projectPublishableConfig(facts, "alice", "en");
    expect(config.sections).toHaveLength(1);
  });

  it("preserves surface/voice/light from draftMeta", () => {
    const facts = [makeFact({ category: "skill", key: "js", visibility: "public" })];
    const config = projectPublishableConfig(facts, "alice", "en", {
      surface: "clay",
      voice: "narrative",
      light: "night",
      style: {
        primaryColor: "#f00",
        layout: "centered",
      },
      sections: [],
    });
    expect(config.surface).toBe("clay");
    expect(config.voice).toBe("narrative");
    expect(config.light).toBe("night");
  });

  it("preserves section order from draftMeta", () => {
    const facts = [
      makeFact({ category: "a", key: "a1", visibility: "public", id: "f-a" }),
      makeFact({ category: "b", key: "b1", visibility: "public", id: "f-b" }),
    ];
    // Compose will produce sections s-0, s-1
    // Draft has them in reverse order
    const config = projectPublishableConfig(facts, "alice", "en", {
      surface: "canvas",
      voice: "signal",
      light: "day",
      style: {
        primaryColor: "#000",
        layout: "centered",
      },
      sections: [
        makeSection("skills", { groups: [{ label: "b" }] }, "s-1"),
        makeSection("skills", { groups: [{ label: "a" }] }, "s-0"),
      ],
    });
    expect(config.sections[0].id).toBe("s-1");
    expect(config.sections[1].id).toBe("s-0");
  });

  it("merges locks from draftMeta (metadata only)", () => {
    const facts = [makeFact({ category: "skill", key: "js", visibility: "public" })];
    const lock = {
      position: true,
      lockedBy: "user" as const,
      lockedAt: "2026-01-01",
    };
    const config = projectPublishableConfig(facts, "alice", "en", {
      surface: "canvas",
      voice: "signal",
      light: "day",
      style: {
        primaryColor: "#000",
        layout: "centered",
      },
      sections: [{ ...makeSection("skills", { groups: [] }, "s-0"), lock }],
    });
    expect(config.sections[0].lock).toEqual(lock);
  });

  it("applies completeness filter", () => {
    // Composer returns sections, but empty ones should be filtered out
    const facts = [
      makeFact({ category: "skill", key: "js", visibility: "public" }),
    ];
    const config = projectPublishableConfig(facts, "alice", "en");
    // Each section from our mock has groups with at least 1 item, so it's complete
    expect(config.sections.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Hash consistency — preview and publish use the same projection
// ---------------------------------------------------------------------------

describe("hash consistency", () => {
  it("same facts produce same hash", () => {
    const facts = [
      makeFact({ category: "skill", key: "js", visibility: "public" }),
    ];
    const config1 = projectPublishableConfig(facts, "alice", "en");
    const config2 = projectPublishableConfig(facts, "alice", "en");
    expect(computeConfigHash(config1)).toBe(computeConfigHash(config2));
  });

  it("different facts produce different hash", () => {
    const facts1 = [
      makeFact({ category: "skill", key: "js", visibility: "public" }),
    ];
    const facts2 = [
      makeFact({ category: "skill", key: "ts", visibility: "public" }),
    ];
    const config1 = projectPublishableConfig(facts1, "alice", "en");
    const config2 = projectPublishableConfig(facts2, "alice", "en");
    expect(computeConfigHash(config1)).not.toBe(computeConfigHash(config2));
  });

  it("adding a private fact does not change hash", () => {
    const base = [
      makeFact({ category: "skill", key: "js", visibility: "public" }),
    ];
    const withPrivate = [
      ...base,
      makeFact({ category: "skill", key: "secret", visibility: "private" }),
    ];
    const hash1 = computeConfigHash(projectPublishableConfig(base, "alice", "en"));
    const hash2 = computeConfigHash(
      projectPublishableConfig(withPrivate, "alice", "en"),
    );
    expect(hash1).toBe(hash2);
  });

  it("changing visibility from private to proposed changes hash", () => {
    const factsPrivate = [
      makeFact({ category: "skill", key: "js", visibility: "private" }),
    ];
    const factsProposed = [
      makeFact({ category: "skill", key: "js", visibility: "proposed" }),
    ];
    const config1 = projectPublishableConfig(factsPrivate, "alice", "en");
    const config2 = projectPublishableConfig(factsProposed, "alice", "en");
    // Private → 0 publishable sections; Proposed → 1 section
    expect(computeConfigHash(config1)).not.toBe(computeConfigHash(config2));
  });
});

// ---------------------------------------------------------------------------
// 5. Publish pipeline logic (tested via imports, no DB needed for these)
// ---------------------------------------------------------------------------

describe("PublishError codes", () => {
  it("NO_FACTS error has correct code", async () => {
    const { PublishError } = await import("@/lib/services/errors");
    const err = new PublishError("No facts", "NO_FACTS", 400);
    expect(err.code).toBe("NO_FACTS");
    expect(err.httpStatus).toBe(400);
  });

  it("NO_PUBLISHABLE_FACTS error has correct code", async () => {
    const { PublishError } = await import("@/lib/services/errors");
    const err = new PublishError("No publishable", "NO_PUBLISHABLE_FACTS", 400);
    expect(err.code).toBe("NO_PUBLISHABLE_FACTS");
    expect(err.httpStatus).toBe(400);
  });

  it("STALE_PREVIEW_HASH error has correct code", async () => {
    const { PublishError } = await import("@/lib/services/errors");
    const err = new PublishError("Stale", "STALE_PREVIEW_HASH", 409);
    expect(err.code).toBe("STALE_PREVIEW_HASH");
    expect(err.httpStatus).toBe(409);
  });

  it("USERNAME_MISMATCH error has correct code", async () => {
    const { PublishError } = await import("@/lib/services/errors");
    const err = new PublishError("Mismatch", "USERNAME_MISMATCH", 409);
    expect(err.code).toBe("USERNAME_MISMATCH");
    expect(err.httpStatus).toBe(409);
  });
});

# Phase 1c: Hybrid Page Compiler — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Evolve page composition from deterministic templates to a hybrid model where the LLM personalizes text content per-section, with cache, drill-down conversation, and conformity checks.

**Architecture:** Fire-and-forget inline personalizer. `generate_page` saves optimistic (deterministic) config immediately, then launches background synthesis that overwrites the draft when ready. Section copy cache avoids redundant LLM calls. SSE preview shows shimmer during synthesis. Conformity checks run in the weekly deep heartbeat.

**Tech Stack:** TypeScript, Vercel AI SDK (`generateObject`), Zod schemas, Drizzle ORM (SQLite), SSE, CSS animations.

**Design doc:** `docs/plans/2026-02-27-phase-1c-hybrid-page-compiler-design.md`

---

## Task 1: DB Migration — section_copy_cache table + synthesis_status column

**Files:**
- Create: `db/migrations/0018_section_copy_cache.sql`

**Step 1: Write the migration**

```sql
-- Section copy cache (content-addressed, per-section personalized text)
CREATE TABLE section_copy_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL,
  section_type TEXT NOT NULL,
  facts_hash TEXT NOT NULL,
  soul_hash TEXT NOT NULL,
  language TEXT NOT NULL,
  personalized_content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(owner_key, section_type, facts_hash, soul_hash, language)
);

CREATE INDEX idx_section_cache_lookup
  ON section_copy_cache(owner_key, section_type, facts_hash, soul_hash, language);

-- Synthesis status on draft row
ALTER TABLE page ADD COLUMN synthesis_status TEXT DEFAULT NULL;
```

**Step 2: Add Drizzle schema for the new table and column**

Modify: `src/lib/db/schema.ts`

After the existing `page` table definition (~line 141), add the `synthesis_status` column to the `page` table:

```typescript
// Add to existing page table definition:
synthesisStatus: text("synthesis_status"),  // NULL | "pending" | "ready" | "failed"
```

Then add a new table definition after the existing tables:

```typescript
export const sectionCopyCache = sqliteTable("section_copy_cache", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerKey: text("owner_key").notNull(),
  sectionType: text("section_type").notNull(),
  factsHash: text("facts_hash").notNull(),
  soulHash: text("soul_hash").notNull(),
  language: text("language").notNull(),
  personalizedContent: text("personalized_content", { mode: "json" }).notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  lookupIdx: uniqueIndex("idx_section_cache_lookup").on(
    table.ownerKey, table.sectionType, table.factsHash, table.soulHash, table.language
  ),
}));
```

**Step 3: Verify migration runs**

Run: `npm run dev` (which triggers auto-migration on load via DB_BOOTSTRAP_MODE=leader)
Expected: Server starts without migration errors, `section_copy_cache` table exists.

**Step 4: Commit**

```bash
git add db/migrations/0018_section_copy_cache.sql src/lib/db/schema.ts
git commit -m "feat(1c): add section_copy_cache table and synthesis_status column"
```

---

## Task 2: Personalizer Zod Schemas + PERSONALIZABLE_FIELDS map

**Files:**
- Create: `src/lib/services/personalizer-schemas.ts`
- Test: `tests/evals/personalizer-schemas.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import {
  PERSONALIZABLE_FIELDS,
  PERSONALIZABLE_SECTION_TYPES,
  SECTION_FACT_CATEGORIES,
  personalizerSchemas,
  MAX_WORDS,
} from "@/lib/services/personalizer-schemas";

describe("personalizer-schemas", () => {
  describe("PERSONALIZABLE_SECTION_TYPES", () => {
    it("includes bio, hero, experience, education, skills, projects, interests, achievements, activities", () => {
      expect(PERSONALIZABLE_SECTION_TYPES).toContain("bio");
      expect(PERSONALIZABLE_SECTION_TYPES).toContain("hero");
      expect(PERSONALIZABLE_SECTION_TYPES).toContain("experience");
      expect(PERSONALIZABLE_SECTION_TYPES).toContain("education");
      expect(PERSONALIZABLE_SECTION_TYPES).toContain("skills");
      expect(PERSONALIZABLE_SECTION_TYPES).toContain("projects");
      expect(PERSONALIZABLE_SECTION_TYPES).toContain("interests");
      expect(PERSONALIZABLE_SECTION_TYPES).toContain("achievements");
      expect(PERSONALIZABLE_SECTION_TYPES).toContain("activities");
    });

    it("excludes non-personalizable types", () => {
      expect(PERSONALIZABLE_SECTION_TYPES).not.toContain("contact");
      expect(PERSONALIZABLE_SECTION_TYPES).not.toContain("stats");
      expect(PERSONALIZABLE_SECTION_TYPES).not.toContain("social");
      expect(PERSONALIZABLE_SECTION_TYPES).not.toContain("footer");
      expect(PERSONALIZABLE_SECTION_TYPES).not.toContain("reading");
      expect(PERSONALIZABLE_SECTION_TYPES).not.toContain("music");
      expect(PERSONALIZABLE_SECTION_TYPES).not.toContain("languages");
    });
  });

  describe("PERSONALIZABLE_FIELDS", () => {
    it("bio has text", () => {
      expect(PERSONALIZABLE_FIELDS.bio).toEqual(["text"]);
    });
    it("hero has tagline", () => {
      expect(PERSONALIZABLE_FIELDS.hero).toEqual(["tagline"]);
    });
    it("experience has items[].description", () => {
      expect(PERSONALIZABLE_FIELDS.experience).toEqual(["items[].description"]);
    });
  });

  describe("SECTION_FACT_CATEGORIES", () => {
    it("maps bio to identity, experience, skill, interest", () => {
      expect(SECTION_FACT_CATEGORIES.bio).toEqual(["identity", "experience", "skill", "interest"]);
    });
    it("maps hero to identity", () => {
      expect(SECTION_FACT_CATEGORIES.hero).toEqual(["identity"]);
    });
  });

  describe("personalizerSchemas", () => {
    it("bio schema validates { text: string }", () => {
      const result = personalizerSchemas.bio.safeParse({ text: "Hello world" });
      expect(result.success).toBe(true);
    });
    it("bio schema rejects missing text", () => {
      const result = personalizerSchemas.bio.safeParse({});
      expect(result.success).toBe(false);
    });
    it("experience schema validates items array with description", () => {
      const result = personalizerSchemas.experience.safeParse({
        items: [{ title: "PM", company: "Spotify", description: "Led product strategy." }],
        title: "Experience",
      });
      expect(result.success).toBe(true);
    });
    it("has schema for every personalizable type", () => {
      for (const type of PERSONALIZABLE_SECTION_TYPES) {
        expect(personalizerSchemas[type]).toBeDefined();
      }
    });
  });

  describe("MAX_WORDS", () => {
    it("bio.text is 120", () => {
      expect(MAX_WORDS.bio.text).toBe(120);
    });
    it("hero.tagline is 15", () => {
      expect(MAX_WORDS.hero.tagline).toBe(15);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/personalizer-schemas.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement the module**

Create `src/lib/services/personalizer-schemas.ts`:

```typescript
import { z } from "zod";
import type { ComponentType } from "@/lib/page-config/schema";

// Section types that have personalizable text fields
export const PERSONALIZABLE_SECTION_TYPES: ComponentType[] = [
  "bio", "hero", "experience", "education", "skills",
  "projects", "interests", "achievements", "activities",
];

// Which text fields the LLM may rewrite per section type
export const PERSONALIZABLE_FIELDS: Record<string, string[]> = {
  bio: ["text"],
  hero: ["tagline"],
  experience: ["items[].description"],
  education: ["items[].description"],
  skills: ["groups[].label"],
  projects: ["items[].description"],
  interests: ["title"],
  achievements: ["items[].description"],
  activities: ["items[].description"],
};

// Which fact categories are relevant to each personalizable section
export const SECTION_FACT_CATEGORIES: Record<string, string[]> = {
  hero: ["identity"],
  bio: ["identity", "experience", "skill", "interest"],
  skills: ["skill"],
  experience: ["experience"],
  education: ["education"],
  projects: ["project"],
  interests: ["interest", "hobby", "activity"],
  achievements: ["achievement"],
  activities: ["activity", "hobby"],
};

// Max words per personalizable field (conciseness guardrail)
export const MAX_WORDS: Record<string, Record<string, number>> = {
  bio: { text: 120 },
  hero: { tagline: 15 },
  experience: { "items[].description": 40 },
  education: { "items[].description": 40 },
  skills: { "groups[].label": 5 },
  projects: { "items[].description": 50 },
  interests: { title: 8 },
  achievements: { "items[].description": 40 },
  activities: { "items[].description": 40 },
};

// Zod schemas for generateObject output (one per personalizable section type)
export const personalizerSchemas: Record<string, z.ZodType> = {
  bio: z.object({ text: z.string() }),

  hero: z.object({ name: z.string(), tagline: z.string() }),

  experience: z.object({
    items: z.array(z.object({
      title: z.string(),
      company: z.string().optional(),
      period: z.string().optional(),
      description: z.string().optional(),
      current: z.boolean().optional(),
    })),
    title: z.string().optional(),
  }),

  education: z.object({
    items: z.array(z.object({
      institution: z.string(),
      degree: z.string().optional(),
      field: z.string().optional(),
      period: z.string().optional(),
      description: z.string().optional(),
    })),
    title: z.string().optional(),
  }),

  skills: z.object({
    groups: z.array(z.object({
      label: z.string(),
      skills: z.array(z.string()),
    })),
  }),

  projects: z.object({
    items: z.array(z.object({
      name: z.string(),
      description: z.string().optional(),
      url: z.string().optional(),
      tech: z.array(z.string()).optional(),
    })),
  }),

  interests: z.object({
    title: z.string().optional(),
    items: z.array(z.string()),
  }),

  achievements: z.object({
    items: z.array(z.object({
      title: z.string(),
      description: z.string().optional(),
      year: z.string().optional(),
    })),
    title: z.string().optional(),
  }),

  activities: z.object({
    items: z.array(z.object({
      name: z.string(),
      description: z.string().optional(),
    })),
    title: z.string().optional(),
  }),
};

export function isPersonalizable(sectionType: string): boolean {
  return PERSONALIZABLE_SECTION_TYPES.includes(sectionType as ComponentType);
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/personalizer-schemas.test.ts`
Expected: All PASS.

**Step 5: Commit**

```bash
git add src/lib/services/personalizer-schemas.ts tests/evals/personalizer-schemas.test.ts
git commit -m "feat(1c): add personalizer Zod schemas and field maps"
```

---

## Task 3: Section Copy Cache Service

**Files:**
- Create: `src/lib/services/section-cache.ts`
- Test: `tests/evals/section-cache.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import {
  computeSectionCacheKey,
  getCachedContent,
  setCachedContent,
  cleanupSectionCache,
} from "@/lib/services/section-cache";
// Import test DB setup used by other test files in the project

describe("section-cache", () => {
  // Use in-memory SQLite setup from project test helpers

  describe("computeSectionCacheKey", () => {
    it("returns deterministic hashes for same facts and soul", () => {
      const facts = [makeFact({ category: "identity", key: "name", value: { name: "Marco" } })];
      const soul = { compiled: "Third person, casual" };
      const key1 = computeSectionCacheKey("bio", facts, soul, "en");
      const key2 = computeSectionCacheKey("bio", facts, soul, "en");
      expect(key1.factsHash).toBe(key2.factsHash);
      expect(key1.soulHash).toBe(key2.soulHash);
    });

    it("returns different factsHash when facts change", () => {
      const facts1 = [makeFact({ category: "identity", key: "name", value: { name: "Marco" } })];
      const facts2 = [makeFact({ category: "identity", key: "name", value: { name: "Luca" } })];
      const soul = { compiled: "Third person" };
      const key1 = computeSectionCacheKey("bio", facts1, soul, "en");
      const key2 = computeSectionCacheKey("bio", facts2, soul, "en");
      expect(key1.factsHash).not.toBe(key2.factsHash);
    });

    it("returns different soulHash when soul changes", () => {
      const facts = [makeFact({ category: "identity", key: "name", value: { name: "Marco" } })];
      const key1 = computeSectionCacheKey("bio", facts, { compiled: "Casual" }, "en");
      const key2 = computeSectionCacheKey("bio", facts, { compiled: "Professional" }, "en");
      expect(key1.soulHash).not.toBe(key2.soulHash);
    });

    it("handles null soul with stable hash", () => {
      const facts = [makeFact({ category: "identity", key: "name", value: { name: "Marco" } })];
      const key = computeSectionCacheKey("bio", facts, null, "en");
      expect(key.soulHash).toBe(computeSectionCacheKey("bio", facts, null, "en").soulHash);
    });
  });

  describe("getCachedContent / setCachedContent", () => {
    it("returns null on cache miss", async () => {
      const result = await getCachedContent("owner1", "bio", "abc", "def", "en");
      expect(result).toBeNull();
    });

    it("returns cached content on cache hit", async () => {
      const content = { text: "Marco is a passionate engineer." };
      await setCachedContent("owner1", "bio", "abc", "def", "en", content);
      const result = await getCachedContent("owner1", "bio", "abc", "def", "en");
      expect(result).toEqual(content);
    });

    it("different language = cache miss", async () => {
      await setCachedContent("owner1", "bio", "abc", "def", "en", { text: "English" });
      const result = await getCachedContent("owner1", "bio", "abc", "def", "it");
      expect(result).toBeNull();
    });
  });

  describe("cleanupSectionCache", () => {
    it("removes entries older than N days", async () => {
      // Insert with old created_at, then cleanup, verify gone
      await setCachedContent("owner1", "bio", "old", "old", "en", { text: "Old" });
      // Manually update created_at to 31 days ago for test
      // ... (use raw SQL in test setup)
      await cleanupSectionCache("owner1", 30);
      const result = await getCachedContent("owner1", "bio", "old", "old", "en");
      expect(result).toBeNull();
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/section-cache.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement section-cache.ts**

Create `src/lib/services/section-cache.ts`:

- `computeSectionCacheKey(sectionType, relevantFacts, soul, language)` — SHA-256 of sorted JSON (facts values + soul compiled text)
- `getCachedContent(ownerKey, sectionType, factsHash, soulHash, language)` — SELECT from section_copy_cache
- `setCachedContent(ownerKey, sectionType, factsHash, soulHash, language, content)` — INSERT OR REPLACE
- `cleanupSectionCache(ownerKey, maxAgeDays)` — DELETE WHERE created_at < datetime('now', '-N days')

Use `crypto.createHash("sha256")` for hashing (same pattern as `computeConfigHash` in `page-service.ts`).

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/section-cache.test.ts`
Expected: All PASS.

**Step 5: Commit**

```bash
git add src/lib/services/section-cache.ts tests/evals/section-cache.test.ts
git commit -m "feat(1c): add content-addressed section copy cache"
```

---

## Task 4: Impact Detector

**Files:**
- Create: `src/lib/services/impact-detector.ts`
- Test: `tests/evals/impact-detector.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { detectImpactedSections } from "@/lib/services/impact-detector";

describe("impact-detector", () => {
  it("returns full_regen when no previous hashes exist", () => {
    const facts = [makeFact({ category: "identity", key: "name" })];
    const result = detectImpactedSections(null, facts, null, null);
    expect(result.reason).toBe("full_regen");
    expect(result.impactedTypes).toContain("bio");
    expect(result.impactedTypes).toContain("hero");
  });

  it("returns soul_changed when soul hash differs", () => {
    const facts = [makeFact({ category: "identity", key: "name" })];
    const result = detectImpactedSections("abc", facts, "old-soul", { compiled: "New voice" });
    expect(result.reason).toBe("soul_changed");
    // All personalizable types should be impacted
    expect(result.impactedTypes.length).toBeGreaterThan(5);
  });

  it("returns only impacted sections when specific categories change", () => {
    const previousFacts = [makeFact({ category: "identity", key: "name", value: { name: "Marco" } })];
    const currentFacts = [
      ...previousFacts,
      makeFact({ category: "experience", key: "job1", value: { title: "PM" } }),
    ];
    const result = detectImpactedSections(
      computeFactsHash(previousFacts), currentFacts,
      "soul-hash", { compiled: "Same" },
    );
    expect(result.reason).toBe("new_facts");
    expect(result.impactedTypes).toContain("experience");
    expect(result.impactedTypes).toContain("bio"); // bio depends on experience category
    expect(result.impactedTypes).not.toContain("education");
  });

  it("returns empty when nothing changed", () => {
    const facts = [makeFact({ category: "identity", key: "name" })];
    const hash = computeFactsHash(facts);
    const result = detectImpactedSections(hash, facts, "soul", { compiled: "Same" });
    expect(result.impactedTypes).toEqual([]);
  });

  it("excludes non-personalizable types from output", () => {
    const facts = [makeFact({ category: "social", key: "twitter" })];
    const result = detectImpactedSections(null, facts, null, null);
    expect(result.impactedTypes).not.toContain("social");
    expect(result.impactedTypes).not.toContain("contact");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/impact-detector.test.ts`
Expected: FAIL.

**Step 3: Implement impact-detector.ts**

Create `src/lib/services/impact-detector.ts`:

```typescript
import { SECTION_FACT_CATEGORIES, PERSONALIZABLE_SECTION_TYPES } from "./personalizer-schemas";
import { computeSectionCacheKey } from "./section-cache";
import type { ComponentType } from "@/lib/page-config/schema";

export type ImpactResult = {
  impactedTypes: ComponentType[];
  reason: "new_facts" | "updated_facts" | "soul_changed" | "full_regen" | "none";
};

export function detectImpactedSections(
  previousFactsHash: string | null,
  currentFacts: FactRow[],
  previousSoulHash: string | null,
  currentSoul: { compiled: string } | null,
): ImpactResult { ... }
```

Logic:
1. If `previousFactsHash === null` → `full_regen`, all `PERSONALIZABLE_SECTION_TYPES`
2. Compute current soul hash; if differs from `previousSoulHash` → `soul_changed`, all personalizable
3. Group `currentFacts` by category, compute per-category hash, compare against previous
4. Map changed categories → impacted section types via `SECTION_FACT_CATEGORIES` (reverse lookup)
5. Filter to `PERSONALIZABLE_SECTION_TYPES` only

Also export `computeFactsHashByCategory(facts)` for per-category hash computation.

**Step 4: Run tests, verify pass**

Run: `npx vitest run tests/evals/impact-detector.test.ts`
Expected: All PASS.

**Step 5: Commit**

```bash
git add src/lib/services/impact-detector.ts tests/evals/impact-detector.test.ts
git commit -m "feat(1c): add impact detector for section-level change tracking"
```

---

## Task 5: Section Personalizer Core

**Files:**
- Create: `src/lib/services/section-personalizer.ts`
- Test: `tests/evals/section-personalizer.test.ts`

**Step 1: Write the failing tests**

Key tests to write:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock AI SDK generateObject
vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

// Mock provider
vi.mock("@/lib/ai/provider", () => ({
  getModel: vi.fn(() => "mock-model"),
}));

import { generateObject } from "ai";
import {
  personalizeSections,
  mergePersonalized,
  buildPersonalizerPrompt,
} from "@/lib/services/section-personalizer";

describe("section-personalizer", () => {
  describe("mergePersonalized", () => {
    it("replaces text field in bio, keeps structure", () => {
      const original = { text: "Marco is an engineer." };
      const personalized = { text: "Marco brings 5 years of creative engineering." };
      const result = mergePersonalized(original, personalized, "bio");
      expect(result.text).toBe(personalized.text);
    });

    it("replaces tagline in hero, keeps name from original", () => {
      const original = { name: "Marco", tagline: "Engineer" };
      const personalized = { name: "WRONG NAME", tagline: "Creative technologist" };
      const result = mergePersonalized(original, personalized, "hero");
      expect(result.name).toBe("Marco");  // Iron rule: structural field unchanged
      expect(result.tagline).toBe("Creative technologist");
    });

    it("replaces only description in experience items", () => {
      const original = {
        items: [{ title: "PM", company: "Spotify", period: "2020-now", description: "Product management." }],
        title: "Experience",
      };
      const personalized = {
        items: [{ title: "WRONG", company: "WRONG", period: "WRONG", description: "Led product strategy for music recommendations." }],
        title: "WRONG",
      };
      const result = mergePersonalized(original, personalized, "experience");
      expect(result.items[0].title).toBe("PM");
      expect(result.items[0].company).toBe("Spotify");
      expect(result.items[0].description).toBe("Led product strategy for music recommendations.");
      expect(result.title).toBe("Experience");
    });
  });

  describe("personalizeSections", () => {
    it("calls generateObject for each impacted section", async () => {
      (generateObject as any).mockResolvedValue({
        object: { text: "Personalized bio text." },
      });

      const sections = [
        makeSection("bio", { text: "Deterministic bio." }),
        makeSection("skills", { groups: [{ label: "Tech", skills: ["JS"] }] }),
      ];

      const result = await personalizeSections(sections, ["bio"], mockContext);
      expect(generateObject).toHaveBeenCalledTimes(1);
      expect(result.personalizedIds).toEqual(["bio"]);
      expect(result.sections.find(s => s.type === "bio")!.content.text).toBe("Personalized bio text.");
    });

    it("falls back to deterministic on LLM error", async () => {
      (generateObject as any).mockRejectedValue(new Error("LLM timeout"));

      const sections = [makeSection("bio", { text: "Original." })];
      const result = await personalizeSections(sections, ["bio"], mockContext);
      expect(result.failedIds).toEqual(["bio"]);
      expect(result.sections[0].content.text).toBe("Original.");
    });

    it("uses cached content when available", async () => {
      // Pre-populate cache, then call personalizeSections
      // generateObject should NOT be called
    });

    it("skips non-personalizable sections even if in impactedTypes", async () => {
      const sections = [makeSection("social", { links: [] })];
      const result = await personalizeSections(sections, ["social"], mockContext);
      expect(generateObject).not.toHaveBeenCalled();
    });
  });

  describe("buildPersonalizerPrompt", () => {
    it("includes soul voice when available", () => {
      const prompt = buildPersonalizerPrompt(
        makeSection("bio", { text: "Test" }),
        { ...mockContext, soul: { compiled: "Third-person, casual, warm" } },
      );
      expect(prompt).toContain("Third-person, casual, warm");
    });

    it("includes relevant facts only", () => {
      const prompt = buildPersonalizerPrompt(
        makeSection("bio", { text: "Test" }),
        { ...mockContext, facts: [
          makeFact({ category: "identity", key: "name" }),
          makeFact({ category: "social", key: "twitter" }),  // irrelevant to bio
        ]},
      );
      expect(prompt).toContain("identity");
      expect(prompt).not.toContain("twitter");
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/section-personalizer.test.ts`
Expected: FAIL.

**Step 3: Implement section-personalizer.ts**

Create `src/lib/services/section-personalizer.ts`:

```typescript
import { generateObject } from "ai";
import { getModel } from "@/lib/ai/provider";
import {
  PERSONALIZABLE_SECTION_TYPES,
  PERSONALIZABLE_FIELDS,
  SECTION_FACT_CATEGORIES,
  MAX_WORDS,
  personalizerSchemas,
  isPersonalizable,
} from "./personalizer-schemas";
import { computeSectionCacheKey, getCachedContent, setCachedContent } from "./section-cache";
import type { Section } from "@/lib/page-config/schema";
import type { FactRow } from "@/lib/db/schema";

export type PersonalizerContext = {
  facts: FactRow[];
  soul: { compiled: string } | null;
  memories: Array<{ content: string }>;
  summary: string | null;
  language: string;
  username: string;
  ownerKey: string;
};

export type PersonalizeResult = {
  sections: Section[];
  personalizedIds: string[];
  failedIds: string[];
};

export function buildPersonalizerPrompt(section: Section, ctx: PersonalizerContext): string { ... }

export function mergePersonalized(
  original: Record<string, unknown>,
  personalized: Record<string, unknown>,
  sectionType: string,
): Record<string, unknown> { ... }

export async function personalizeSections(
  sections: Section[],
  impactedTypes: string[],
  ctx: PersonalizerContext,
): Promise<PersonalizeResult> { ... }
```

Key implementation details:
- `buildPersonalizerPrompt`: filter facts by `SECTION_FACT_CATEGORIES[sectionType]`, inject soul compiled, max words, current content, schema hint
- `mergePersonalized`: for simple types (bio, interests) replace text fields only. For array types (experience, education, etc.) iterate items and replace only description, keeping structural fields from original. **Always keep structural fields from original.**
- `personalizeSections`: for each impacted type, check cache first via `computeSectionCacheKey` + `getCachedContent`. On miss, call `generateObject` with Zod schema. On success, merge + cache. On error, keep original.

**Step 4: Run tests, verify pass**

Run: `npx vitest run tests/evals/section-personalizer.test.ts`
Expected: All PASS.

**Step 5: Commit**

```bash
git add src/lib/services/section-personalizer.ts tests/evals/section-personalizer.test.ts
git commit -m "feat(1c): add per-section LLM personalizer with merge and cache"
```

---

## Task 6: Section Richness Helper (for drill-down)

**Files:**
- Create: `src/lib/agent/section-richness.ts`
- Test: `tests/evals/section-richness.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { getSectionRichness, formatRichnessBlock } from "@/lib/agent/section-richness";

describe("section-richness", () => {
  describe("getSectionRichness", () => {
    it("returns empty for section with no facts", () => {
      const result = getSectionRichness([], "education");
      expect(result.richness).toBe("empty");
      expect(result.factCount).toBe(0);
    });

    it("returns thin for 1-2 facts without description", () => {
      const facts = [makeFact({ category: "education", key: "uni", value: { institution: "Bologna" } })];
      const result = getSectionRichness(facts, "education");
      expect(result.richness).toBe("thin");
    });

    it("returns rich for 3+ facts with description", () => {
      const facts = [
        makeFact({ category: "experience", key: "j1", value: { title: "PM", description: "Led team" } }),
        makeFact({ category: "experience", key: "j2", value: { title: "Dev", description: "Built APIs" } }),
        makeFact({ category: "experience", key: "j3", value: { title: "Lead", company: "Acme" } }),
      ];
      const result = getSectionRichness(facts, "experience");
      expect(result.richness).toBe("rich");
    });

    it("returns thin for 3+ facts but none with description", () => {
      const facts = [
        makeFact({ category: "skill", key: "js", value: { name: "JavaScript" } }),
        makeFact({ category: "skill", key: "ts", value: { name: "TypeScript" } }),
        makeFact({ category: "skill", key: "py", value: { name: "Python" } }),
      ];
      // skills don't have "description" field, but 3+ facts = rich
      const result = getSectionRichness(facts, "skills");
      expect(result.richness).toBe("rich");
    });
  });

  describe("formatRichnessBlock", () => {
    it("formats as markdown list", () => {
      const facts = [
        makeFact({ category: "education", key: "uni", value: { institution: "Bologna" } }),
        makeFact({ category: "experience", key: "j1", value: { title: "PM", description: "Led" } }),
        makeFact({ category: "experience", key: "j2", value: { title: "Dev", description: "Built" } }),
        makeFact({ category: "experience", key: "j3", value: { title: "Lead" } }),
      ];
      const block = formatRichnessBlock(facts);
      expect(block).toContain("education: thin");
      expect(block).toContain("experience: rich");
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/section-richness.test.ts`

**Step 3: Implement**

Create `src/lib/agent/section-richness.ts`:

```typescript
import { SECTION_FACT_CATEGORIES, PERSONALIZABLE_SECTION_TYPES } from "@/lib/services/personalizer-schemas";

export type SectionRichness = {
  sectionType: string;
  factCount: number;
  hasDescription: boolean;
  richness: "empty" | "thin" | "rich";
};

export function getSectionRichness(facts: FactRow[], sectionType: string): SectionRichness { ... }
export function formatRichnessBlock(facts: FactRow[]): string { ... }
```

Thresholds:
- `empty`: 0 facts in relevant categories
- `thin`: 1-2 facts, OR facts exist but none have descriptive fields (description, text)
- `rich`: 3+ facts (for simple types like skills where items = facts) OR any fact has description field

`formatRichnessBlock` iterates all personalizable section types, computes richness, returns markdown list. Only includes non-empty sections.

**Step 4: Run tests, verify pass**

Run: `npx vitest run tests/evals/section-richness.test.ts`

**Step 5: Commit**

```bash
git add src/lib/agent/section-richness.ts tests/evals/section-richness.test.ts
git commit -m "feat(1c): add section richness helper for drill-down behavior"
```

---

## Task 7: Agent Context + Prompts Integration

**Files:**
- Modify: `src/lib/agent/context.ts` (~lines 20-28 BUDGET, ~lines 97-131 block assembly)
- Modify: `src/lib/agent/prompts.ts` (~lines 142-162 steadyStatePolicy)
- Test: `tests/evals/context-assembler.test.ts` (add tests for richness block)

**Step 1: Write failing test for richness block in context**

Add to existing `tests/evals/context-assembler.test.ts`:

```typescript
describe("section richness block", () => {
  it("includes Section Richness header in steady_state prompt", () => {
    // Setup: scope with 3+ experience facts (rich) and 0 education facts (empty)
    const result = assembleContext(scope, "en", messages);
    expect(result.systemPrompt).toContain("## Section Richness");
    expect(result.systemPrompt).toContain("experience: rich");
  });

  it("does not include richness block in onboarding mode", () => {
    // Setup: scope with < 5 facts (onboarding mode)
    const result = assembleContext(onboardingScope, "en", messages);
    expect(result.systemPrompt).not.toContain("## Section Richness");
  });
});
```

**Step 2: Run test, verify fail**

Run: `npx vitest run tests/evals/context-assembler.test.ts`

**Step 3: Modify context.ts**

In `src/lib/agent/context.ts`:

1. Import `formatRichnessBlock` from `@/lib/agent/section-richness`
2. Add `richness: 200` to BUDGET (take from existing margin — total stays 7500, reduce `recentTurns` to 2400)
3. After the memories block (~line 107), add:

```typescript
// Section richness (steady_state only, for drill-down behavior)
if (mode === "steady_state") {
  const richnessText = formatRichnessBlock(facts);
  if (richnessText) {
    blocks.push({ label: "richness", text: `## Section Richness\n${richnessText}`, budget: BUDGET.richness });
  }
}
```

**Step 4: Modify prompts.ts**

In `src/lib/agent/prompts.ts`, inside `steadyStatePolicy()` (~line 142), append drill-down instructions:

```typescript
const DRILL_DOWN_POLICY = `
## Drill-down behavior

When the user mentions a topic that maps to a THIN or EMPTY section (see Section Richness above):
- Ask 1-2 follow-up questions to enrich the facts before updating the page
- Examples: "Where did you study? What was your focus area?" or "What period was that?"
- Do NOT ask more than 2 questions per topic — avoid feeling like an interrogation
- After collecting answers, create the facts AND call generate_page

When the topic maps to a RICH section:
- Create/update facts immediately and call generate_page
- No need to ask follow-ups unless the user explicitly wants to elaborate
`;
```

Append this to the `steadyStatePolicy()` return value.

**Step 5: Run tests, verify pass**

Run: `npx vitest run tests/evals/context-assembler.test.ts`

**Step 6: Commit**

```bash
git add src/lib/agent/context.ts src/lib/agent/prompts.ts src/lib/agent/section-richness.ts tests/evals/context-assembler.test.ts
git commit -m "feat(1c): integrate section richness into agent context + drill-down prompt"
```

---

## Task 8: Page Service — synthesis_status support

**Files:**
- Modify: `src/lib/services/page-service.ts` (~lines 139-173 upsertDraft, ~lines 33-54 getDraft)

**Step 1: Write failing test**

Add to existing page-service tests or create a focused test:

```typescript
describe("synthesis_status", () => {
  it("upsertDraft stores synthesis_status", () => {
    upsertDraft("marco", config, sessionId, undefined, { synthesisStatus: "pending" });
    const draft = getDraft(sessionId);
    expect(draft?.synthesisStatus).toBe("pending");
  });

  it("setSynthesisStatus updates only the status column", () => {
    upsertDraft("marco", config, sessionId);
    setSynthesisStatus(sessionId, "ready");
    const draft = getDraft(sessionId);
    expect(draft?.synthesisStatus).toBe("ready");
  });

  it("upsertDraft without synthesisStatus leaves it null", () => {
    upsertDraft("marco", config, sessionId);
    const draft = getDraft(sessionId);
    expect(draft?.synthesisStatus).toBeNull();
  });
});
```

**Step 2: Run test, verify fail**

**Step 3: Modify page-service.ts**

1. Add `synthesisStatus` to `DraftResult` type
2. Modify `getDraft()` to include `synthesis_status` column in SELECT
3. Add optional `opts?: { synthesisStatus?: string }` parameter to `upsertDraft`
4. Add new function:

```typescript
export function setSynthesisStatus(sessionId: string, status: "pending" | "ready" | "failed" | null): void {
  db.update(page).set({ synthesisStatus: status }).where(eq(page.id, sessionId)).run();
}
```

5. Add new function for saving synthesis result with race guard:

```typescript
export function saveSynthesisResult(
  sessionId: string,
  config: PageConfig,
  expectedOptimisticHash: string,
): boolean {
  const current = getDraft(sessionId);
  if (!current || current.configHash !== expectedOptimisticHash) {
    return false; // stale, discard
  }
  const normalized = normalizeConfigForWrite(config);
  const hash = computeConfigHash(normalized);
  db.update(page)
    .set({ config: normalized, configHash: hash, synthesisStatus: "ready" })
    .where(eq(page.id, sessionId))
    .run();
  return true;
}
```

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git add src/lib/services/page-service.ts tests/evals/page-service-synthesis.test.ts
git commit -m "feat(1c): add synthesis_status support to page service"
```

---

## Task 9: generate_page Tool — Fire-and-Forget Synthesis

**Files:**
- Modify: `src/lib/agent/tools.ts` (~lines 292-367, generate_page tool)
- Create: `src/lib/services/synthesize-background.ts` (thin orchestrator)

**Step 1: Create synthesize-background.ts**

This is the glue that orchestrates the fire-and-forget flow:

```typescript
import { personalizeSections, type PersonalizerContext } from "./section-personalizer";
import { detectImpactedSections } from "./impact-detector";
import { saveSynthesisResult, setSynthesisStatus } from "./page-service";
import { getActiveSoul } from "./soul-service";
import { getActiveMemories } from "./memory-service";
import { getSummary } from "./summary-service";
import { getAllFacts } from "./kb-service";
import { computeConfigHash } from "@/lib/page-config/normalize";
import { PERSONALIZABLE_SECTION_TYPES } from "./personalizer-schemas";
import type { PageConfig, Section } from "@/lib/page-config/schema";

export async function synthesizeInBackground(
  sessionId: string,
  ownerKey: string,
  username: string,
  optimisticConfig: PageConfig,
  facts: FactRow[],
  language: string,
): Promise<void> {
  const optimisticHash = computeConfigHash(optimisticConfig);
  const soul = getActiveSoul(ownerKey);
  const memories = getActiveMemories(ownerKey, 10);
  const summary = getSummary(ownerKey);

  const impact = detectImpactedSections(
    /* previousFactsHash */ null, // TODO: get from last cache entry
    facts,
    /* previousSoulHash */ null,
    soul,
  );

  if (impact.impactedTypes.length === 0) {
    setSynthesisStatus(sessionId, null); // nothing to synthesize
    return;
  }

  const ctx: PersonalizerContext = {
    facts, soul, memories, summary,
    language, username, ownerKey,
  };

  const result = await personalizeSections(
    optimisticConfig.sections,
    impact.impactedTypes,
    ctx,
  );

  const mergedConfig = { ...optimisticConfig, sections: result.sections };
  const saved = saveSynthesisResult(sessionId, mergedConfig, optimisticHash);

  if (!saved) {
    // Stale — a newer optimistic was saved while we were synthesizing
    return;
  }
}
```

**Step 2: Modify generate_page tool in tools.ts**

After the existing `upsertDraft` call (~line 342), add:

```typescript
// Set synthesis_status to pending
setSynthesisStatus(sessionId, "pending");

// Fire-and-forget synthesis (only in steady_state mode)
if (mode === "steady_state") {
  synthesizeInBackground(sessionId, ownerKey, username, config, facts, factLang)
    .catch(err => {
      console.error("[synthesis] Background synthesis failed:", err);
      setSynthesisStatus(sessionId, "failed");
    });
}
```

Import `synthesizeInBackground` from `@/lib/services/synthesize-background` and `setSynthesisStatus` from page-service.

**Step 3: Write integration test**

```typescript
describe("generate_page with synthesis", () => {
  it("saves optimistic immediately, then synthesis updates draft", async () => {
    // Mock LLM to return personalized content
    // Call generate_page tool
    // Verify draft has synthesis_status="pending" immediately
    // Wait for synthesis promise
    // Verify draft updated with personalized content + synthesis_status="ready"
  });

  it("skips synthesis in onboarding mode", async () => {
    // Setup: < 5 facts (onboarding)
    // Call generate_page
    // Verify synthesis NOT triggered
  });
});
```

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git add src/lib/services/synthesize-background.ts src/lib/agent/tools.ts tests/evals/personalizer-pipeline.test.ts
git commit -m "feat(1c): integrate fire-and-forget synthesis into generate_page"
```

---

## Task 10: SSE Preview — synthesisStatus in Payload

**Files:**
- Modify: `src/app/api/preview/stream/route.ts` (~lines 51-114)
- Modify: `src/app/api/preview/route.ts` (polling fallback)

**Step 1: Modify SSE stream route**

In `src/app/api/preview/stream/route.ts`:

1. Read `synthesis_status` from draft in the poll loop (~line 55):

```typescript
const draft = getDraft(writeSessionId);
const synthesisStatus = draft?.synthesisStatus ?? null;
```

2. Add `synthesisStatus` to the SSE payload (~lines 89-94):

```typescript
const payload = {
  status: synthesisStatus === "ready" ? "synthesis_ready" : "optimistic_ready",
  synthesisStatus,
  publishStatus: draft?.status ?? "draft",
  config: previewConfig,
  configHash: publishableHash,
};
```

3. Also detect synthesis_status change (not just config hash change) to trigger SSE events:

```typescript
// Send event when config hash changes OR synthesis status changes
if (previewHash !== lastHash || synthesisStatus !== lastSynthesisStatus) {
  // send event
  lastSynthesisStatus = synthesisStatus;
}
```

**Step 2: Modify polling endpoint similarly**

Same `synthesisStatus` field in `/api/preview` response.

**Step 3: Write test**

```typescript
describe("preview-two-lane", () => {
  it("SSE sends synthesisStatus: pending when draft has pending status", () => { ... });
  it("SSE sends synthesis_ready when status changes to ready", () => { ... });
  it("SSE sends synthesisStatus: failed on failure", () => { ... });
});
```

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git add src/app/api/preview/stream/route.ts src/app/api/preview/route.ts tests/evals/preview-two-lane.test.ts
git commit -m "feat(1c): add synthesisStatus to SSE preview payload"
```

---

## Task 11: Client UI — Shimmer Indicator

**Files:**
- Modify: `src/components/layout/SplitView.tsx` (~lines 256-288 SSE handler)
- Modify: `src/app/globals.css` (add shimmer animation)
- Modify: `src/components/page/PageRenderer.tsx` (apply shimmer class to sections)

**Step 1: Add shimmer CSS to globals.css**

```css
/* Synthesis shimmer for personalizer */
@keyframes shimmer-sweep {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.section-synthesizing {
  position: relative;
  overflow: hidden;
}

.section-synthesizing::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent,
    var(--theme-accent, rgba(255, 255, 255, 0.12)),
    transparent
  );
  animation: shimmer-sweep 1.5s ease-in-out infinite;
  pointer-events: none;
  border-radius: inherit;
}

.section-just-synthesized {
  animation: fade-in 0.3s ease-in;
}

@keyframes fade-in {
  from { opacity: 0.85; }
  to { opacity: 1; }
}
```

**Step 2: Modify SplitView.tsx SSE handler**

Add state for synthesis tracking:

```typescript
const [synthesisStatus, setSynthesisStatus] = useState<string | null>(null);
const [synthesizingSections, setSynthesizingSections] = useState<string[]>([]);
```

In the SSE `onmessage` handler:

```typescript
if (data.synthesisStatus !== undefined) {
  setSynthesisStatus(data.synthesisStatus);
}
if (data.synthesizingSections) {
  setSynthesizingSections(data.synthesizingSections);
}
```

Pass these as props to the PageRenderer/preview component.

**Step 3: Modify PageRenderer to apply shimmer class**

In the component that renders each section, add conditional class:

```typescript
const sectionClass = synthesizingSections.includes(section.id)
  ? "section-synthesizing"
  : justSynthesized.includes(section.id)
  ? "section-just-synthesized"
  : "";
```

Use a `useEffect` to track `justSynthesized` state (remove after 2s timeout).

**Step 4: Manual test**

Start dev server, open builder, trigger a `generate_page`. Verify shimmer appears on personalizable sections and disappears when synthesis completes.

**Step 5: Commit**

```bash
git add src/components/layout/SplitView.tsx src/app/globals.css src/components/page/PageRenderer.tsx
git commit -m "feat(1c): add shimmer indicator for sections in synthesis"
```

---

## Task 12: Conformity Check Handler

**Files:**
- Create: `src/lib/worker/conformity.ts`
- Test: `tests/evals/conformity.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi } from "vitest";

vi.mock("ai", () => ({ generateObject: vi.fn() }));
vi.mock("@/lib/ai/provider", () => ({ getModel: vi.fn(() => "mock") }));

import { generateObject } from "ai";
import { handleConformityCheck } from "@/lib/worker/conformity";

describe("conformity", () => {
  it("skips when draft has no synthesis_status=ready", async () => {
    // Setup: draft with synthesis_status=null
    const result = await handleConformityCheck("owner1");
    expect(result.issues).toEqual([]);
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("calls LLM with all personalizable section texts", async () => {
    // Setup: draft with synthesis_status=ready and personalized sections
    (generateObject as any).mockResolvedValue({ object: { issues: [] } });
    await handleConformityCheck("owner1");
    expect(generateObject).toHaveBeenCalledTimes(1);
    const prompt = (generateObject as any).mock.calls[0][0].prompt;
    expect(prompt).toContain("bio");
    expect(prompt).toContain("experience");
  });

  it("regenerates max 3 sections when issues found", async () => {
    (generateObject as any).mockResolvedValue({
      object: {
        issues: [
          { sectionId: "bio", issueType: "tone_drift", severity: "medium", description: "Too formal" },
          { sectionId: "exp-0", issueType: "tone_drift", severity: "medium", description: "Inconsistent" },
          { sectionId: "edu-0", issueType: "tone_drift", severity: "low", description: "Slightly off" },
          { sectionId: "skills", issueType: "tone_drift", severity: "low", description: "Minor" },
        ],
      },
    });
    const result = await handleConformityCheck("owner1");
    expect(result.sectionsToRegenerate.length).toBeLessThanOrEqual(3);
  });

  it("respects budget limits", async () => {
    // Setup: budget exhausted
    const result = await handleConformityCheck("owner1");
    expect(result.issues).toEqual([]);
    expect(generateObject).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run tests, verify fail**

**Step 3: Implement conformity.ts**

Create `src/lib/worker/conformity.ts`:

```typescript
import { generateObject } from "ai";
import { getModel } from "@/lib/ai/provider";
import { z } from "zod";
import { getDraftByOwnerKey } from "@/lib/services/page-service";
import { getActiveSoul } from "@/lib/services/soul-service";
import { isPersonalizable } from "@/lib/services/personalizer-schemas";
import { personalizeSections } from "@/lib/services/section-personalizer";

const conformityIssueSchema = z.object({
  issues: z.array(z.object({
    sectionId: z.string(),
    issueType: z.enum(["tone_drift", "contradiction", "stale_content"]),
    description: z.string(),
    severity: z.enum(["low", "medium"]),
  })),
});

export type ConformityIssue = z.infer<typeof conformityIssueSchema>["issues"][number];

export type ConformityResult = {
  issues: ConformityIssue[];
  sectionsToRegenerate: string[];
  cost: number;
};

export async function handleConformityCheck(ownerKey: string): Promise<ConformityResult> { ... }
```

Logic:
1. Get draft. Skip if `synthesis_status !== "ready"`.
2. Check budget. Skip if exhausted.
3. Get soul compiled text.
4. Extract personalizable section texts from draft config.
5. Build prompt: all section texts + soul voice + "analyze for tone drift, contradictions, stale content".
6. Call `generateObject` with `conformityIssueSchema`.
7. Sort issues by severity (medium first), take top 3 `sectionsToRegenerate`.
8. If any sections to regenerate, call `personalizeSections` for those.
9. Return result.

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git add src/lib/worker/conformity.ts tests/evals/conformity.test.ts
git commit -m "feat(1c): add conformity check handler for cross-section coherence"
```

---

## Task 13: Deep Heartbeat Integration

**Files:**
- Modify: `src/lib/worker/heartbeat.ts` (~lines 59-88 handleHeartbeatDeep)

**Step 1: Modify handleHeartbeatDeep**

After `dismissOldConflicts(ownerKey, 7)` (~line 84), add:

```typescript
// Phase 1c: conformity check + cache cleanup
try {
  const conformity = await handleConformityCheck(ownerKey);
  if (conformity.issues.length > 0) {
    logEvent("conformity_check", { ownerKey, issues: conformity.issues.length, regen: conformity.sectionsToRegenerate.length });
  }
} catch (err) {
  console.error("[heartbeat] Conformity check failed:", err);
}

try {
  cleanupSectionCache(ownerKey, 30);
} catch (err) {
  console.error("[heartbeat] Cache cleanup failed:", err);
}
```

Import `handleConformityCheck` from `@/lib/worker/conformity` and `cleanupSectionCache` from `@/lib/services/section-cache`.

**Step 2: Add test**

In existing heartbeat tests, add:

```typescript
it("deep heartbeat calls conformity check", async () => {
  // Mock handleConformityCheck, verify it's called
});

it("deep heartbeat calls cache cleanup", async () => {
  // Mock cleanupSectionCache, verify called with ownerKey and 30
});

it("deep heartbeat continues if conformity check throws", async () => {
  // Mock handleConformityCheck to throw
  // Verify heartbeat completes without error
});
```

**Step 3: Run tests, verify pass**

**Step 4: Commit**

```bash
git add src/lib/worker/heartbeat.ts tests/evals/heartbeat-conformity.test.ts
git commit -m "feat(1c): integrate conformity check and cache cleanup into deep heartbeat"
```

---

## Task 14: Integration Test — Full Pipeline

**Files:**
- Create: `tests/evals/personalizer-pipeline.test.ts`

**Step 1: Write integration tests**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("ai", () => ({ generateObject: vi.fn() }));
vi.mock("@/lib/ai/provider", () => ({ getModel: vi.fn(() => "mock") }));

import { generateObject } from "ai";

describe("personalizer pipeline (integration)", () => {
  // Setup: in-memory SQLite, seed facts, create draft

  it("full flow: facts → optimistic → synthesis → draft updated", async () => {
    // 1. Create facts (identity, experience)
    // 2. Call composeOptimisticPage → get deterministic sections
    // 3. Save as draft with synthesis_status=pending
    // 4. Mock generateObject to return personalized bio text
    // 5. Call synthesizeInBackground
    // 6. Verify draft.config.sections[bio].content.text is personalized
    // 7. Verify draft.synthesis_status is "ready"
  });

  it("cache hit skips LLM call on second synthesis with same facts", async () => {
    // 1. Run full synthesis (populates cache)
    // 2. Reset generateObject mock
    // 3. Run synthesis again with same facts
    // 4. Verify generateObject NOT called
    // 5. Verify result still has personalized content (from cache)
  });

  it("race condition: stale synthesis discarded", async () => {
    // 1. Save optimistic A, start synthesis A (slow mock)
    // 2. Save optimistic B (overwrites A)
    // 3. Synthesis A completes → hash mismatch → discarded
    // 4. Verify draft still has optimistic B config
  });

  it("synthesis failure keeps deterministic content", async () => {
    // 1. Mock generateObject to throw
    // 2. Run synthesizeInBackground
    // 3. Verify draft.synthesis_status is "failed"
    // 4. Verify draft.config is still deterministic
  });
});
```

**Step 2: Run tests, verify pass**

Run: `npx vitest run tests/evals/personalizer-pipeline.test.ts`

**Step 3: Commit**

```bash
git add tests/evals/personalizer-pipeline.test.ts
git commit -m "test(1c): add integration tests for personalizer pipeline"
```

---

## Task 15: Final Verification + Build Check

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All existing tests still pass + all new tests pass.

**Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: No type errors.

**Step 3: Build check**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Commit any fixes**

If any issues found, fix and commit.

**Step 5: Final commit summarizing Phase 1c**

```bash
git add -A
git commit -m "feat(1c): Phase 1c Hybrid Page Compiler — complete

Per-section LLM personalizer with fire-and-forget synthesis,
content-addressed section copy cache, drill-down conversation
pattern, two-lane SSE preview with shimmer indicators, and
conformity checks via deep heartbeat.

New modules: section-personalizer, section-cache, impact-detector,
personalizer-schemas, section-richness, conformity, synthesize-background.
Migration 0018: section_copy_cache table + synthesis_status column."
```

---

## Task Dependency Graph

```
Task 1 (Migration)
  └── Task 2 (Schemas + Fields) ──┐
  └── Task 3 (Cache Service) ─────┤
                                   ├── Task 5 (Personalizer Core)
  Task 4 (Impact Detector) ────────┘       │
                                           ├── Task 9 (generate_page Integration)
  Task 6 (Section Richness) ───┐           │         │
                               ├── Task 7  │   Task 10 (SSE Preview)
  (Agent Context + Prompts) ───┘           │         │
                                           │   Task 11 (Client Shimmer)
  Task 8 (Page Service synth) ─────────────┘

  Task 12 (Conformity) ──── Task 13 (Heartbeat Integration)

  Task 14 (Integration Tests)
  Task 15 (Final Verification)
```

Parallelizable pairs:
- Tasks 2 + 3 + 4 (schemas, cache, impact detector — independent)
- Tasks 6 + 8 (richness helper + page service — independent)
- Tasks 10 + 12 (SSE preview + conformity — independent)

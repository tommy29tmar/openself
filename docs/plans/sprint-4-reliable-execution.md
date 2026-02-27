# Sprint 4: Reliable Execution — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** LLM operations work reliably on any provider. Translation uses structured output. Agent has tools to inspect page state and validate before publish.

**Architecture:** Migrate fragile generateText+JSON.parse to generateObject+Zod. Add `capable` model tier for complex reasoning. Two new agent tools for pre-action intelligence (inspect_page_state, publish_preflight).

**Tech Stack:** TypeScript, Vercel AI SDK (generateObject), Zod, vitest

**Dependencies:** Sprints 1-3 (journey infrastructure). Independent of Sprint 5.

---

### Task 1: Add `capable` tier to provider.ts

**Files:**
- Modify: `src/lib/ai/provider.ts`
- Create: `tests/evals/provider-tiers.test.ts`

**Context:** The provider module currently supports two tiers: `cheap` (default chat, translations) and `medium` (summaries, soul proposals). A `capable` tier is needed for complex reasoning tasks (conformity analysis, advanced personalization). The new tier maps to higher-cost models: `gemini-2.5-pro`, `gpt-4o`, `claude-sonnet-4-6`, `llama3.3`. Override via `AI_MODEL_CAPABLE` env var.

**Step 1: Write the failing tests**

Create `tests/evals/provider-tiers.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock SDK providers before importing
vi.mock("@ai-sdk/google", () => {
  const mockModel = { modelId: "mock-google-model" };
  return {
    createGoogleGenerativeAI: vi.fn(() => vi.fn(() => mockModel)),
  };
});

vi.mock("@ai-sdk/openai", () => {
  const mockModel = { modelId: "mock-openai-model" };
  return {
    openai: vi.fn(() => mockModel),
    createOpenAI: vi.fn(() => vi.fn(() => mockModel)),
  };
});

vi.mock("@ai-sdk/anthropic", () => {
  const mockModel = { modelId: "mock-anthropic-model" };
  return {
    anthropic: vi.fn(() => mockModel),
  };
});

import {
  getModelForTier,
  getModelIdForTier,
  getProviderName,
  type ModelTier,
} from "@/lib/ai/provider";

describe("provider tiers", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.AI_PROVIDER = "google";
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("ModelTier type includes capable", () => {
    it("accepts 'capable' as a valid tier", () => {
      // This test validates that the type system accepts "capable"
      const tier: ModelTier = "capable";
      expect(tier).toBe("capable");
    });
  });

  describe("getModelIdForTier", () => {
    it("returns cheap model for 'cheap' tier", () => {
      process.env.AI_PROVIDER = "google";
      const modelId = getModelIdForTier("cheap");
      expect(modelId).toBe("gemini-2.0-flash");
    });

    it("returns medium model for 'medium' tier", () => {
      process.env.AI_PROVIDER = "google";
      const modelId = getModelIdForTier("medium");
      expect(modelId).toBe("gemini-2.5-flash");
    });

    it("returns capable model for 'capable' tier — google", () => {
      process.env.AI_PROVIDER = "google";
      const modelId = getModelIdForTier("capable");
      expect(modelId).toBe("gemini-2.5-pro");
    });

    it("returns capable model for 'capable' tier — openai", () => {
      process.env.AI_PROVIDER = "openai";
      const modelId = getModelIdForTier("capable");
      expect(modelId).toBe("gpt-4o");
    });

    it("returns capable model for 'capable' tier — anthropic", () => {
      process.env.AI_PROVIDER = "anthropic";
      const modelId = getModelIdForTier("capable");
      expect(modelId).toBe("claude-sonnet-4-6");
    });

    it("returns capable model for 'capable' tier — ollama", () => {
      process.env.AI_PROVIDER = "ollama";
      const modelId = getModelIdForTier("capable");
      expect(modelId).toBe("llama3.3");
    });

    it("respects AI_MODEL_CAPABLE env var override", () => {
      process.env.AI_PROVIDER = "google";
      process.env.AI_MODEL_CAPABLE = "gemini-2.5-pro-preview";
      const modelId = getModelIdForTier("capable");
      expect(modelId).toBe("gemini-2.5-pro-preview");
    });

    it("respects AI_MODEL_MEDIUM env var override", () => {
      process.env.AI_PROVIDER = "google";
      process.env.AI_MODEL_MEDIUM = "gemini-2.0-flash-lite";
      const modelId = getModelIdForTier("medium");
      expect(modelId).toBe("gemini-2.0-flash-lite");
    });
  });

  describe("getModelForTier", () => {
    it("returns a LanguageModel for 'capable' tier", () => {
      process.env.AI_PROVIDER = "google";
      const model = getModelForTier("capable");
      expect(model).toBeDefined();
    });

    it("returns a LanguageModel for all 3 tiers", () => {
      process.env.AI_PROVIDER = "google";
      expect(getModelForTier("cheap")).toBeDefined();
      expect(getModelForTier("medium")).toBeDefined();
      expect(getModelForTier("capable")).toBeDefined();
    });
  });

  describe("getProviderName", () => {
    it("returns the configured provider", () => {
      process.env.AI_PROVIDER = "anthropic";
      expect(getProviderName()).toBe("anthropic");
    });

    it("defaults to google", () => {
      delete process.env.AI_PROVIDER;
      expect(getProviderName()).toBe("google");
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run tests/evals/provider-tiers.test.ts --reporter=verbose
```

Expected: FAIL — `getModelIdForTier("capable")` falls through (only `cheap` and `medium` are handled).

**Step 3: Implement the capable tier**

In `src/lib/ai/provider.ts`:

1. Extend the `ModelTier` type:

```typescript
export type ModelTier = "cheap" | "medium" | "capable";
```

2. Add the `CAPABLE_MODELS` map after `MEDIUM_MODELS`:

```typescript
const CAPABLE_MODELS: Record<Provider, string> = {
  google: "gemini-2.5-pro",
  openai: "gpt-4o",
  anthropic: "claude-sonnet-4-6",
  ollama: "llama3.3",
};
```

3. Update `getModelForTier()` to handle all three tiers. Replace the current function body:

```typescript
export function getModelForTier(tier: ModelTier): LanguageModel {
  if (tier === "cheap") return getModel();

  const provider = getProvider();

  const tierMap: Record<Exclude<ModelTier, "cheap">, Record<Provider, string>> = {
    medium: MEDIUM_MODELS,
    capable: CAPABLE_MODELS,
  };
  const envKey: Record<Exclude<ModelTier, "cheap">, string> = {
    medium: "AI_MODEL_MEDIUM",
    capable: "AI_MODEL_CAPABLE",
  };

  const modelId = process.env[envKey[tier]] ?? tierMap[tier][provider];

  switch (provider) {
    case "google": {
      const apiKey =
        process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
        process.env.GOOGLE_API_KEY;
      const google = createGoogleGenerativeAI({ apiKey });
      return google(modelId);
    }
    case "openai":
      return openai(modelId);
    case "anthropic":
      return anthropic(modelId);
    case "ollama": {
      const baseURL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1";
      const ollama = createOpenAI({ baseURL, apiKey: "ollama" });
      return ollama(modelId);
    }
  }
}
```

4. Update `getModelIdForTier()`:

```typescript
export function getModelIdForTier(tier: ModelTier): string {
  if (tier === "cheap") return getModelId();
  const provider = getProvider();
  const tierMap: Record<Exclude<ModelTier, "cheap">, Record<Provider, string>> = {
    medium: MEDIUM_MODELS,
    capable: CAPABLE_MODELS,
  };
  const envKey: Record<Exclude<ModelTier, "cheap">, string> = {
    medium: "AI_MODEL_MEDIUM",
    capable: "AI_MODEL_CAPABLE",
  };
  return process.env[envKey[tier]] ?? tierMap[tier][provider];
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run tests/evals/provider-tiers.test.ts --reporter=verbose
```

Expected: ALL PASS.

**Step 5: Commit**

```bash
git add src/lib/ai/provider.ts tests/evals/provider-tiers.test.ts
git commit -m "feat: add 'capable' model tier to provider with env override"
```

---

### Task 2: Fix hardcoded provider in summary-service

**Files:**
- Modify: `src/lib/services/summary-service.ts` (line 212)

**Context:** At line 212, `recordUsage("anthropic", ...)` hardcodes the provider name. It should use `getProviderName()` to be model-agnostic. The function `getProviderName` is already exported from `@/lib/ai/provider`. The import of `getModelForTier` and `getModelIdForTier` from `@/lib/ai/provider` already exists at line 7, so just add `getProviderName` to that import.

**Step 1: Verify the existing code**

Confirm line 212 in `src/lib/services/summary-service.ts`:
```typescript
recordUsage("anthropic", modelId, tokensIn, tokensOut);
```

**Step 2: Fix the import**

Change line 7 from:
```typescript
import { getModelForTier, getModelIdForTier } from "@/lib/ai/provider";
```
to:
```typescript
import { getModelForTier, getModelIdForTier, getProviderName } from "@/lib/ai/provider";
```

**Step 3: Fix the hardcoded provider**

Change line 212 from:
```typescript
      recordUsage("anthropic", modelId, tokensIn, tokensOut);
```
to:
```typescript
      recordUsage(getProviderName(), modelId, tokensIn, tokensOut);
```

**Step 4: Run existing tests to verify no regression**

```bash
npx vitest run tests/evals/summary-service.test.ts --reporter=verbose 2>/dev/null || echo "No dedicated summary test file — checking for import-level errors"
npx vitest run tests/evals/ --reporter=verbose --passWithNoTests 2>&1 | tail -20
```

**Step 5: Commit**

```bash
git add src/lib/services/summary-service.ts
git commit -m "fix: use getProviderName() instead of hardcoded 'anthropic' in summary-service"
```

---

### Task 3: Migrate translatePageContent to generateObject

**Files:**
- Modify: `src/lib/ai/translate.ts`
- Modify: `tests/evals/translate.test.ts` (update mocks from `generateText` to `generateObject`)
- Create: `tests/evals/translate-structured.test.ts` (new tests for structured output behavior)

**Context:** `translatePageContent` currently uses `generateText()` + `stripCodeFences()` + `JSON.parse()` — a fragile pipeline that fails when LLMs wrap output in markdown fences or add commentary. Migrating to `generateObject()` with a Zod schema lets the AI SDK handle JSON extraction reliably. The `stripCodeFences` function becomes dead code and should be removed. Cache logic, error handling, and graceful fallback remain unchanged.

**Step 1: Write the new structured output tests**

Create `tests/evals/translate-structured.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist mock functions for DB
const {
  mockGet,
  mockRun,
  mockOnConflictDoUpdate,
  mockValues,
  mockInsert,
  mockDbWhere,
  mockFrom,
} = vi.hoisted(() => {
  const mockGet = vi.fn();
  const mockRun = vi.fn();
  const mockOnConflictDoUpdate = vi.fn(() => ({ run: mockRun }));
  const mockValues = vi.fn(() => ({ onConflictDoUpdate: mockOnConflictDoUpdate }));
  const mockInsert = vi.fn(() => ({ values: mockValues }));
  const mockDbWhere = vi.fn(() => ({ get: mockGet }));
  const mockFrom = vi.fn(() => ({ where: mockDbWhere }));
  return { mockGet, mockRun, mockOnConflictDoUpdate, mockValues, mockInsert, mockDbWhere, mockFrom };
});

vi.mock("@/lib/ai/provider", () => ({
  getModel: vi.fn(() => "mock-model"),
  getModelId: vi.fn(() => "mock-model-id"),
}));

// Mock generateObject (NOT generateText) from the ai package
vi.mock("ai", () => ({
  generateObject: vi.fn(),
  generateText: vi.fn(),
  tool: vi.fn((config) => config),
}));

vi.mock("@/lib/services/event-service", () => ({
  logEvent: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({ from: mockFrom }),
    insert: mockInsert,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  translationCache: {
    contentHash: "content_hash",
    targetLanguage: "target_language",
    translatedSections: "translated_sections",
    model: "model",
    createdAt: "created_at",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ col, val, op: "eq" })),
  and: vi.fn((...args: unknown[]) => ({ args, op: "and" })),
  sql: {},
}));

import { translatePageContent } from "@/lib/ai/translate";
import { generateObject, generateText } from "ai";
import type { PageConfig } from "@/lib/page-config/schema";

const mockGenerateObject = vi.mocked(generateObject);
const mockGenerateText = vi.mocked(generateText);

function makeConfig(overrides?: Partial<PageConfig>): PageConfig {
  return {
    version: 1,
    username: "draft",
    theme: "minimal",
    style: {
      colorScheme: "light",
      primaryColor: "#6366f1",
      fontFamily: "inter",
      layout: "centered",
    },
    sections: [
      {
        id: "hero-1",
        type: "hero",
        variant: "large",
        content: {
          name: "Marco Rossi",
          tagline: "Benvenuto nella pagina di Marco Rossi",
        },
      },
      {
        id: "bio-1",
        type: "bio",
        variant: "full",
        content: {
          text: "Marco Rossi è ingegnere di software.",
        },
      },
      {
        id: "footer-1",
        type: "footer",
        content: {},
      },
    ],
    ...overrides,
  };
}

describe("translatePageContent — structured output (generateObject)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockReturnValue(undefined); // no cache hit
  });

  it("uses generateObject instead of generateText", async () => {
    const translatedPayload = [
      {
        sectionId: "hero-1",
        type: "hero",
        content: { name: "Marco Rossi", tagline: "Welcome to Marco Rossi's page" },
      },
      {
        sectionId: "bio-1",
        type: "bio",
        content: { text: "Marco Rossi is a software engineer." },
      },
    ];

    mockGenerateObject.mockResolvedValue({
      object: translatedPayload,
      usage: { promptTokens: 100, completionTokens: 50 },
    } as any);

    const config = makeConfig();
    await translatePageContent(config, "en", "it");

    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("passes a Zod schema to generateObject", async () => {
    mockGenerateObject.mockResolvedValue({
      object: [],
      usage: { promptTokens: 10, completionTokens: 5 },
    } as any);

    const config = makeConfig();
    await translatePageContent(config, "en", "it");

    const call = mockGenerateObject.mock.calls[0][0];
    expect(call).toHaveProperty("schema");
    // The schema should be a Zod schema (has _def property)
    expect(call.schema).toBeDefined();
    expect(call.schema._def).toBeDefined();
  });

  it("merges structured output back into config", async () => {
    const translatedPayload = [
      {
        sectionId: "hero-1",
        type: "hero",
        content: { name: "Marco Rossi", tagline: "Welcome to Marco Rossi's page" },
      },
      {
        sectionId: "bio-1",
        type: "bio",
        content: { text: "Marco Rossi is a software engineer." },
      },
    ];

    mockGenerateObject.mockResolvedValue({
      object: translatedPayload,
      usage: { promptTokens: 100, completionTokens: 50 },
    } as any);

    const config = makeConfig();
    const result = await translatePageContent(config, "en", "it");

    const hero = result.sections.find((s) => s.id === "hero-1")!;
    expect((hero.content as any).tagline).toBe("Welcome to Marco Rossi's page");

    const bio = result.sections.find((s) => s.id === "bio-1")!;
    expect((bio.content as any).text).toBe("Marco Rossi is a software engineer.");

    // Footer should be unchanged (skipped)
    const footer = result.sections.find((s) => s.id === "footer-1")!;
    expect(footer.content).toEqual({});
  });

  it("returns original config on generateObject error (graceful fallback)", async () => {
    mockGenerateObject.mockRejectedValue(new Error("API rate limit"));

    const config = makeConfig();
    const result = await translatePageContent(config, "en", "it");

    // Should return original config unchanged
    const hero = result.sections.find((s) => s.id === "hero-1")!;
    expect((hero.content as any).tagline).toBe("Benvenuto nella pagina di Marco Rossi");
  });

  it("does not use stripCodeFences (function should be removed)", async () => {
    // Verify stripCodeFences is not exported — import would fail
    // We indirectly test this by confirming generateObject is used (no text parsing needed)
    mockGenerateObject.mockResolvedValue({
      object: [
        {
          sectionId: "hero-1",
          type: "hero",
          content: { name: "Marco Rossi", tagline: "Welcome" },
        },
      ],
    } as any);

    const config = makeConfig();
    const result = await translatePageContent(config, "en", "it");

    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
    expect(mockGenerateText).not.toHaveBeenCalled();
    const hero = result.sections.find((s) => s.id === "hero-1")!;
    expect((hero.content as any).tagline).toBe("Welcome");
  });

  it("caches the structured output result", async () => {
    const translatedPayload = [
      {
        sectionId: "hero-1",
        type: "hero",
        content: { name: "Marco Rossi", tagline: "Welcome" },
      },
    ];

    mockGenerateObject.mockResolvedValue({
      object: translatedPayload,
    } as any);

    const config = makeConfig();
    await translatePageContent(config, "en", "it");

    // Cache insert should have been called with the structured output
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        targetLanguage: "en",
        translatedSections: translatedPayload,
        model: "mock-model-id",
      }),
    );
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/evals/translate-structured.test.ts --reporter=verbose
```

Expected: FAIL — `translatePageContent` still calls `generateText`, not `generateObject`.

**Step 3: Implement the migration**

In `src/lib/ai/translate.ts`:

1. **Update imports** — change line 2:

From:
```typescript
import { generateText } from "ai";
```
To:
```typescript
import { generateObject } from "ai";
import { z } from "zod";
```

2. **Add the Zod schema** after the `SectionPayload` type (after line 19):

```typescript
/** Zod schema for structured translation output. */
const TranslationResultSchema = z.array(
  z.object({
    sectionId: z.string(),
    type: z.string(),
    content: z.record(z.unknown()),
  }),
);
```

3. **Remove the `stripCodeFences` function** (lines 24-35). Delete the entire function.

4. **Replace the `generateText` + parse block** (lines 168-174). Change from:

```typescript
    const result = await generateText({
      model: getModel(),
      prompt,
    });

    const cleaned = stripCodeFences(result.text);
    const translated: SectionPayload[] = JSON.parse(cleaned);
```

To:

```typescript
    const result = await generateObject({
      model: getModel(),
      schema: TranslationResultSchema,
      prompt,
    });

    const translated: SectionPayload[] = result.object;
```

5. **Update the prompt** — remove the "Return ONLY the JSON array" instruction (lines 161-163) since `generateObject` handles the output format. Replace:

```
## Output format
- Return ONLY the JSON array — no markdown fences, no commentary, no explanation.
- Preserve the exact JSON structure: same keys, same nesting, same array order.
```

With:

```
## Output format
- Preserve the exact JSON structure: same keys, same nesting, same array order.
```

**Step 4: Update existing translate.test.ts**

The existing `tests/evals/translate.test.ts` mocks `generateText` from `"ai"`. It needs to mock `generateObject` instead. Key changes:

1. Update the mock at line 31:

From:
```typescript
vi.mock("ai", () => ({
  generateText: vi.fn(),
  tool: vi.fn((config) => config),
}));
```
To:
```typescript
vi.mock("ai", () => ({
  generateObject: vi.fn(),
  tool: vi.fn((config) => config),
}));
```

2. Update the import at line 66:

From:
```typescript
import { generateText } from "ai";
```
To:
```typescript
import { generateObject } from "ai";
```

3. Update the mock variable at line 70:

From:
```typescript
const mockGenerateText = vi.mocked(generateText);
```
To:
```typescript
const mockGenerateObject = vi.mocked(generateObject);
```

4. **Replace all `mockGenerateText` references** with `mockGenerateObject` throughout the file.

5. **Change response shape** from `{ text: JSON.stringify(payload) }` to `{ object: payload }` in all mock return values. For example, line 164-166:

From:
```typescript
mockGenerateText.mockResolvedValue({
  text: JSON.stringify(translatedPayload),
} as any);
```
To:
```typescript
mockGenerateObject.mockResolvedValue({
  object: translatedPayload,
} as any);
```

6. **Update the code fences test** (line 240-258, "handles markdown code fences in LLM response"). This test is no longer relevant — `generateObject` never returns code fences. Replace with a test that verifies structured output works:

```typescript
it("handles structured output directly without text parsing", async () => {
  const translatedPayload = [
    {
      sectionId: "hero-1",
      type: "hero",
      content: { name: "Marco", tagline: "Welcome to Marco's page" },
    },
  ];

  mockGenerateObject.mockResolvedValue({
    object: translatedPayload,
  } as any);

  const config = makeConfig();
  const result = await translatePageContent(config, "en", "it");

  const hero = result.sections.find((s) => s.id === "hero-1")!;
  expect((hero.content as any).tagline).toBe("Welcome to Marco's page");
});
```

7. **Update the "returns original config on invalid JSON" test** (line 271-282). With `generateObject`, invalid JSON manifests as a thrown error, not bad text. The existing "returns original config on LLM error" test already covers this. Remove or update the invalid JSON test:

```typescript
it("returns original config when generateObject throws validation error", async () => {
  mockGenerateObject.mockRejectedValue(
    new Error("Failed to parse structured output"),
  );

  const config = makeConfig();
  const result = await translatePageContent(config, "en", "it");

  const bio = result.sections.find((s) => s.id === "bio-1")!;
  expect((bio.content as any).text).toContain("ingegnere di software");
});
```

8. **Update prompt assertion tests** (line 227, 295, 306). The prompt is now passed via `generateObject`, so update from:
```typescript
const prompt = mockGenerateText.mock.calls[0][0].prompt as string;
```
To:
```typescript
const prompt = mockGenerateObject.mock.calls[0][0].prompt as string;
```

9. **Update cache tests** that check `mockGenerateText` — change all references to `mockGenerateObject`, and change response shapes from `{ text: ... }` to `{ object: ... }`. For empty responses, change `{ text: "[]" }` to `{ object: [] }`.

**Step 5: Run all translate tests to verify they pass**

```bash
npx vitest run tests/evals/translate.test.ts tests/evals/translate-structured.test.ts --reporter=verbose
```

Expected: ALL PASS.

**Step 6: Commit**

```bash
git add src/lib/ai/translate.ts tests/evals/translate.test.ts tests/evals/translate-structured.test.ts
git commit -m "feat: migrate translatePageContent to generateObject with Zod schema

Replaces fragile generateText+stripCodeFences+JSON.parse with structured
output via generateObject. Removes stripCodeFences (dead code). Cache,
error handling, and graceful fallback unchanged."
```

---

### Task 4: Create `publish_preflight` agent tool

**Files:**
- Modify: `src/lib/agent/tools.ts` (add tool + imports)
- Create: `tests/evals/publish-preflight.test.ts`

**Context:** The agent currently calls `request_publish` without any pre-validation. The `publish_preflight` tool gives the agent structured feedback about whether the page is ready: draft existence, auth status, username validity, section completeness, fact richness, and contact availability. The agent can then communicate issues to the user before attempting to publish.

**Step 1: Write the failing tests**

Create `tests/evals/publish-preflight.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── hoisted mocks ──────────────────────────────────────────
const { mockGetDraft, mockGetAllFacts, mockIsMultiUserEnabled } = vi.hoisted(() => ({
  mockGetDraft: vi.fn(),
  mockGetAllFacts: vi.fn(),
  mockIsMultiUserEnabled: vi.fn(() => false),
}));

vi.mock("@/lib/services/page-service", () => ({
  getDraft: mockGetDraft,
  upsertDraft: vi.fn(),
  requestPublish: vi.fn(),
}));

vi.mock("@/lib/services/kb-service", () => ({
  createFact: vi.fn(),
  updateFact: vi.fn(),
  deleteFact: vi.fn(),
  searchFacts: vi.fn(),
  getAllFacts: mockGetAllFacts,
  setFactVisibility: vi.fn(),
  VisibilityTransitionError: class extends Error {},
}));

vi.mock("@/lib/services/session-service", () => ({
  isMultiUserEnabled: mockIsMultiUserEnabled,
}));

vi.mock("@/lib/services/event-service", () => ({
  logEvent: vi.fn(),
}));

vi.mock("@/lib/services/page-composer", () => ({
  composeOptimisticPage: vi.fn(),
}));

vi.mock("@/lib/services/preferences-service", () => ({
  getFactLanguage: vi.fn(() => "en"),
}));

vi.mock("@/lib/ai/translate", () => ({
  translatePageContent: vi.fn((config: any) => config),
}));

vi.mock("@/lib/services/memory-service", () => ({
  saveMemory: vi.fn(),
}));

vi.mock("@/lib/services/soul-service", () => ({
  proposeSoulChange: vi.fn(),
  getActiveSoul: vi.fn(),
}));

vi.mock("@/lib/services/conflict-service", () => ({
  resolveConflict: vi.fn(),
}));

vi.mock("@/lib/services/fact-validation", () => ({
  FactValidationError: class extends Error {},
}));

vi.mock("@/lib/layout/contracts", () => ({
  LAYOUT_TEMPLATES: ["vertical", "sidebar-left", "bento-standard"] as const,
}));

vi.mock("@/lib/layout/registry", () => ({
  getLayoutTemplate: vi.fn(),
  resolveLayoutTemplate: vi.fn(() => ({
    id: "vertical",
    slots: [{ id: "hero" }, { id: "main" }, { id: "footer" }],
  })),
}));

vi.mock("@/lib/layout/assign-slots", () => ({
  assignSlotsFromFacts: vi.fn((_t: any, sections: any) => ({ sections, issues: [] })),
}));

vi.mock("@/lib/layout/lock-policy", () => ({
  extractLocks: vi.fn(() => ({})),
}));

vi.mock("@/lib/layout/group-slots", () => ({
  groupSectionsBySlot: vi.fn(() => ({})),
}));

vi.mock("@/lib/page-config/section-completeness", () => ({
  isSectionComplete: vi.fn((s: any) => s.type === "hero" || s.type === "footer"),
}));

vi.mock("@/lib/services/section-richness", () => ({
  classifySectionRichness: vi.fn(() => "rich"),
}));

vi.mock("@/lib/services/page-projection", () => ({
  filterPublishableFacts: vi.fn((facts: any[]) => facts.filter((f: any) => f.visibility !== "private")),
}));

vi.mock("@/lib/services/personalization-hashing", () => ({
  SECTION_FACT_CATEGORIES: {
    hero: ["identity"],
    bio: ["identity", "interest"],
    skills: ["skill"],
  },
  computeHash: vi.fn(),
}));

vi.mock("@/lib/services/personalization-impact", () => ({
  detectImpactedSections: vi.fn(() => []),
}));

vi.mock("@/lib/services/section-personalizer", () => ({
  personalizeSection: vi.fn(),
}));

vi.mock("@/lib/page-config/schema", () => ({
  AVAILABLE_THEMES: ["minimal", "warm", "editorial-360"],
  validatePageConfig: vi.fn(),
}));

vi.mock("@/lib/page-config/usernames", () => ({
  validateUsernameFormat: vi.fn(() => ({ ok: true })),
}));

vi.mock("ai", () => ({
  tool: vi.fn((config: any) => config),
}));

import { createAgentTools } from "@/lib/agent/tools";
import { isSectionComplete } from "@/lib/page-config/section-completeness";
import { classifySectionRichness } from "@/lib/services/section-richness";

function makeDraft(overrides?: any) {
  return {
    config: {
      version: 1,
      username: "testuser",
      theme: "minimal",
      style: { colorScheme: "light", primaryColor: "#000", fontFamily: "inter", layout: "centered" },
      sections: [
        { id: "hero-1", type: "hero", content: { name: "Test" } },
        { id: "bio-1", type: "bio", content: { text: "Hello world" } },
        { id: "skills-1", type: "skills", content: { groups: [{ label: "Skills", skills: ["TS"] }] } },
        { id: "footer-1", type: "footer", content: {} },
      ],
      ...overrides?.config,
    },
    username: "testuser",
    status: "draft",
    configHash: "abc123",
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeFact(overrides?: any) {
  return {
    id: "fact-1",
    category: "identity",
    key: "name",
    value: { full: "Test User" },
    visibility: "proposed",
    confidence: 1,
    ...overrides,
  };
}

describe("publish_preflight tool", () => {
  let tools: ReturnType<typeof createAgentTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = createAgentTools("en", "session-1", "owner-1", "req-1", ["session-1"]);
  });

  it("exists in the tools object", () => {
    expect(tools.publish_preflight).toBeDefined();
    expect(tools.publish_preflight.execute).toBeDefined();
  });

  it("returns readyToPublish=false when no draft exists", async () => {
    mockGetDraft.mockReturnValue(null);
    mockGetAllFacts.mockReturnValue([]);

    const result = await tools.publish_preflight.execute(
      { username: "testuser" },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    expect(result.readyToPublish).toBe(false);
    expect(result.gates.hasDraft).toBe(false);
    expect(result.summary).toContain("No draft");
  });

  it("returns readyToPublish=true with valid draft and username (single-user mode)", async () => {
    mockGetDraft.mockReturnValue(makeDraft());
    mockGetAllFacts.mockReturnValue([
      makeFact(),
      makeFact({ id: "fact-2", category: "skill", key: "ts", value: { name: "TS" } }),
      makeFact({ id: "fact-3", category: "contact", key: "email", value: { type: "email", value: "a@b.com" } }),
    ]);
    mockIsMultiUserEnabled.mockReturnValue(false);

    const result = await tools.publish_preflight.execute(
      { username: "testuser" },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    expect(result.readyToPublish).toBe(true);
    expect(result.gates.hasDraft).toBe(true);
    expect(result.gates.hasUsername).toBe(true);
  });

  it("returns readyToPublish=false when username is empty", async () => {
    mockGetDraft.mockReturnValue(makeDraft());
    mockGetAllFacts.mockReturnValue([makeFact()]);
    mockIsMultiUserEnabled.mockReturnValue(false);

    const result = await tools.publish_preflight.execute(
      { username: "" },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    expect(result.readyToPublish).toBe(false);
    expect(result.gates.hasUsername).toBe(false);
  });

  it("reports incomplete sections in quality.incompleteSections", async () => {
    mockGetDraft.mockReturnValue(makeDraft());
    mockGetAllFacts.mockReturnValue([makeFact()]);
    mockIsMultiUserEnabled.mockReturnValue(false);
    vi.mocked(isSectionComplete).mockImplementation(
      (s: any) => s.type === "hero" || s.type === "footer",
    );

    const result = await tools.publish_preflight.execute(
      { username: "testuser" },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    expect(result.quality.incompleteSections).toContain("bio");
    expect(result.quality.incompleteSections).toContain("skills");
    expect(result.quality.incompleteSections).not.toContain("hero");
  });

  it("reports thin sections in quality.thinSections", async () => {
    mockGetDraft.mockReturnValue(makeDraft());
    mockGetAllFacts.mockReturnValue([makeFact()]);
    mockIsMultiUserEnabled.mockReturnValue(false);
    vi.mocked(classifySectionRichness).mockImplementation(
      (_facts: any, type: string) => (type === "skills" ? "thin" : "rich"),
    );

    const result = await tools.publish_preflight.execute(
      { username: "testuser" },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    expect(result.quality.thinSections).toContain("skills");
    expect(result.quality.thinSections).not.toContain("hero");
  });

  it("reports proposed fact count in quality.proposedFacts", async () => {
    mockGetDraft.mockReturnValue(makeDraft());
    mockGetAllFacts.mockReturnValue([
      makeFact({ visibility: "proposed" }),
      makeFact({ id: "f2", visibility: "proposed" }),
      makeFact({ id: "f3", visibility: "public" }),
    ]);
    mockIsMultiUserEnabled.mockReturnValue(false);

    const result = await tools.publish_preflight.execute(
      { username: "testuser" },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    expect(result.quality.proposedFacts).toBe(2);
  });

  it("reports missing contact in quality.missingContact", async () => {
    mockGetDraft.mockReturnValue(makeDraft());
    mockGetAllFacts.mockReturnValue([
      makeFact({ category: "identity" }),
      // No contact facts
    ]);
    mockIsMultiUserEnabled.mockReturnValue(false);

    const result = await tools.publish_preflight.execute(
      { username: "testuser" },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    expect(result.quality.missingContact).toBe(true);
  });

  it("reports contact present when public contact fact exists", async () => {
    mockGetDraft.mockReturnValue(makeDraft());
    mockGetAllFacts.mockReturnValue([
      makeFact({ category: "contact", key: "email", visibility: "proposed" }),
    ]);
    mockIsMultiUserEnabled.mockReturnValue(false);

    const result = await tools.publish_preflight.execute(
      { username: "testuser" },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    expect(result.quality.missingContact).toBe(false);
  });

  it("returns section and fact counts in info", async () => {
    mockGetDraft.mockReturnValue(makeDraft());
    mockGetAllFacts.mockReturnValue([
      makeFact(),
      makeFact({ id: "f2" }),
      makeFact({ id: "f3" }),
    ]);
    mockIsMultiUserEnabled.mockReturnValue(false);

    const result = await tools.publish_preflight.execute(
      { username: "testuser" },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    expect(result.info.sectionCount).toBe(4);
    expect(result.info.factCount).toBe(3);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/evals/publish-preflight.test.ts --reporter=verbose
```

Expected: FAIL — `tools.publish_preflight` is undefined.

**Step 3: Implement the publish_preflight tool**

In `src/lib/agent/tools.ts`:

1. **Add imports** near the top of the file (after existing imports):

```typescript
import { resolveLayoutTemplate } from "@/lib/layout/registry";
import { groupSectionsBySlot } from "@/lib/layout/group-slots";
import { isSectionComplete } from "@/lib/page-config/section-completeness";
import { classifySectionRichness } from "@/lib/services/section-richness";
import { SECTION_FACT_CATEGORIES } from "@/lib/services/personalization-hashing";
import { isMultiUserEnabled } from "@/lib/services/session-service";
```

Note: `filterPublishableFacts` is already imported. `getAllFacts` is already imported from `kb-service`. `getDraft` is already imported from `page-service`.

2. **Add the tool** inside `createAgentTools`, before the closing `};` of the return object (before line 711):

```typescript
  publish_preflight: tool({
    description:
      "Check if the page is ready to publish. Returns gate checks (blocking) and quality checks (advisory). Call this before request_publish to give the user useful feedback.",
    parameters: z.object({
      username: z
        .string()
        .describe("The username to check publish readiness for"),
    }),
    execute: async ({ username }) => {
      try {
        // 1. Draft check
        const draft = getDraft(sessionId);
        if (!draft) {
          return {
            readyToPublish: false,
            summary: "No draft found. Generate a page first.",
            gates: { hasDraft: false, hasAuth: false, hasUsername: false },
            quality: { incompleteSections: [], proposedFacts: 0, thinSections: [], missingContact: true },
            info: { sectionCount: 0, factCount: 0 },
          };
        }

        // 2. Gate checks
        const multiUser = isMultiUserEnabled();
        // In single-user mode, auth is not required
        // In multi-user mode, we can't fully check auth from here,
        // but the agent context has the ownerKey which implies a session
        const hasAuth = !multiUser || !!ownerKey;
        const hasUsername = username.length > 0;

        // 3. Quality checks
        const allFacts = getAllFacts(sessionId, readKeys);
        const publishableFacts = filterPublishableFacts(allFacts);
        const proposedCount = allFacts.filter((f: any) => f.visibility === "proposed").length;

        // Section completeness
        const config = draft.config;
        const incompleteSections = config.sections
          .filter((s: any) => !isSectionComplete(s))
          .map((s: any) => s.type);

        // Thin sections from richness
        const thinSections = Object.keys(SECTION_FACT_CATEGORIES)
          .filter((type) => classifySectionRichness(publishableFacts, type) === "thin");

        // Missing contact
        const hasContact = allFacts.some(
          (f: any) => f.category === "contact" && f.visibility !== "private",
        );

        const gates = { hasDraft: true, hasAuth, hasUsername };
        const readyToPublish = Object.values(gates).every(Boolean);

        return {
          readyToPublish,
          gates,
          quality: {
            incompleteSections,
            proposedFacts: proposedCount,
            thinSections,
            missingContact: !hasContact,
          },
          info: {
            sectionCount: config.sections.length,
            factCount: allFacts.length,
          },
          summary: readyToPublish
            ? `Page ready to publish with ${config.sections.length} sections.`
            : `Cannot publish: ${Object.entries(gates).filter(([, v]) => !v).map(([k]) => k).join(", ")}.`,
        };
      } catch (error) {
        logEvent({
          eventType: "tool_call_error",
          actor: "assistant",
          payload: { requestId, tool: "publish_preflight", error: String(error) },
        });
        return {
          readyToPublish: false,
          summary: `Preflight error: ${String(error)}`,
          gates: { hasDraft: false, hasAuth: false, hasUsername: false },
          quality: { incompleteSections: [], proposedFacts: 0, thinSections: [], missingContact: true },
          info: { sectionCount: 0, factCount: 0 },
        };
      }
    },
  }),
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/evals/publish-preflight.test.ts --reporter=verbose
```

Expected: ALL PASS.

**Step 5: Commit**

```bash
git add src/lib/agent/tools.ts tests/evals/publish-preflight.test.ts
git commit -m "feat: add publish_preflight agent tool for pre-publish validation"
```

---

### Task 5: Create `inspect_page_state` agent tool

**Files:**
- Modify: `src/lib/agent/tools.ts` (add tool, imports already added in Task 4)
- Create: `tests/evals/inspect-page-state.test.ts`

**Context:** The agent has no structured way to understand the current page layout. `inspect_page_state` returns the full page structure: layout template, theme, per-section details (slot, widget, lock status, completeness, richness), available slots, and warnings. This enables the agent to make informed decisions about section placement, content gaps, and layout optimization.

**Step 1: Write the failing tests**

Create `tests/evals/inspect-page-state.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── hoisted mocks ──────────────────────────────────────────
const {
  mockGetDraft,
  mockGetAllFacts,
  mockResolveLayoutTemplate,
  mockGroupSectionsBySlot,
  mockIsSectionComplete,
  mockClassifySectionRichness,
} = vi.hoisted(() => ({
  mockGetDraft: vi.fn(),
  mockGetAllFacts: vi.fn(),
  mockResolveLayoutTemplate: vi.fn(),
  mockGroupSectionsBySlot: vi.fn(),
  mockIsSectionComplete: vi.fn(),
  mockClassifySectionRichness: vi.fn(),
}));

vi.mock("@/lib/services/page-service", () => ({
  getDraft: mockGetDraft,
  upsertDraft: vi.fn(),
  requestPublish: vi.fn(),
}));

vi.mock("@/lib/services/kb-service", () => ({
  createFact: vi.fn(),
  updateFact: vi.fn(),
  deleteFact: vi.fn(),
  searchFacts: vi.fn(),
  getAllFacts: mockGetAllFacts,
  setFactVisibility: vi.fn(),
  VisibilityTransitionError: class extends Error {},
}));

vi.mock("@/lib/services/session-service", () => ({
  isMultiUserEnabled: vi.fn(() => false),
}));

vi.mock("@/lib/services/event-service", () => ({
  logEvent: vi.fn(),
}));

vi.mock("@/lib/services/page-composer", () => ({
  composeOptimisticPage: vi.fn(),
}));

vi.mock("@/lib/services/preferences-service", () => ({
  getFactLanguage: vi.fn(() => "en"),
}));

vi.mock("@/lib/ai/translate", () => ({
  translatePageContent: vi.fn((config: any) => config),
}));

vi.mock("@/lib/services/memory-service", () => ({
  saveMemory: vi.fn(),
}));

vi.mock("@/lib/services/soul-service", () => ({
  proposeSoulChange: vi.fn(),
  getActiveSoul: vi.fn(),
}));

vi.mock("@/lib/services/conflict-service", () => ({
  resolveConflict: vi.fn(),
}));

vi.mock("@/lib/services/fact-validation", () => ({
  FactValidationError: class extends Error {},
}));

vi.mock("@/lib/layout/contracts", () => ({
  LAYOUT_TEMPLATES: ["vertical", "sidebar-left", "bento-standard"] as const,
}));

vi.mock("@/lib/layout/registry", () => ({
  getLayoutTemplate: vi.fn(),
  resolveLayoutTemplate: mockResolveLayoutTemplate,
}));

vi.mock("@/lib/layout/assign-slots", () => ({
  assignSlotsFromFacts: vi.fn((_t: any, sections: any) => ({ sections, issues: [] })),
}));

vi.mock("@/lib/layout/lock-policy", () => ({
  extractLocks: vi.fn(() => ({})),
}));

vi.mock("@/lib/layout/group-slots", () => ({
  groupSectionsBySlot: mockGroupSectionsBySlot,
}));

vi.mock("@/lib/page-config/section-completeness", () => ({
  isSectionComplete: mockIsSectionComplete,
}));

vi.mock("@/lib/services/section-richness", () => ({
  classifySectionRichness: mockClassifySectionRichness,
}));

vi.mock("@/lib/services/page-projection", () => ({
  filterPublishableFacts: vi.fn((facts: any[]) => facts),
}));

vi.mock("@/lib/services/personalization-hashing", () => ({
  SECTION_FACT_CATEGORIES: {
    hero: ["identity"],
    bio: ["identity", "interest"],
    skills: ["skill"],
  },
  computeHash: vi.fn(),
}));

vi.mock("@/lib/services/personalization-impact", () => ({
  detectImpactedSections: vi.fn(() => []),
}));

vi.mock("@/lib/services/section-personalizer", () => ({
  personalizeSection: vi.fn(),
}));

vi.mock("@/lib/page-config/schema", () => ({
  AVAILABLE_THEMES: ["minimal", "warm", "editorial-360"],
  validatePageConfig: vi.fn(),
}));

vi.mock("@/lib/page-config/usernames", () => ({
  validateUsernameFormat: vi.fn(() => ({ ok: true })),
}));

vi.mock("ai", () => ({
  tool: vi.fn((config: any) => config),
}));

import { createAgentTools } from "@/lib/agent/tools";

const verticalTemplate = {
  id: "vertical",
  name: "Vertical",
  heroSlot: "hero",
  footerSlot: "footer",
  slots: [
    { id: "hero", size: "wide", accepts: ["hero"] },
    { id: "main", size: "wide", accepts: ["bio", "skills", "projects"] },
    { id: "footer", size: "wide", accepts: ["footer"] },
  ],
};

function makeDraft(overrides?: any) {
  return {
    config: {
      version: 1,
      username: "testuser",
      theme: "minimal",
      layoutTemplate: "vertical",
      style: { colorScheme: "light", primaryColor: "#000", fontFamily: "inter", layout: "centered" },
      sections: [
        { id: "hero-1", type: "hero", content: { name: "Test" } },
        { id: "bio-1", type: "bio", content: { text: "Hello" } },
        { id: "skills-1", type: "skills", widget: "skills-chips", content: { groups: [] } },
        { id: "footer-1", type: "footer", content: {} },
      ],
      ...overrides?.config,
    },
    username: "testuser",
    status: "draft",
    ...overrides,
  };
}

describe("inspect_page_state tool", () => {
  let tools: ReturnType<typeof createAgentTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = createAgentTools("en", "session-1", "owner-1", "req-1", ["session-1"]);
    mockResolveLayoutTemplate.mockReturnValue(verticalTemplate);
    mockGroupSectionsBySlot.mockReturnValue({
      hero: [{ id: "hero-1", type: "hero" }],
      main: [
        { id: "bio-1", type: "bio" },
        { id: "skills-1", type: "skills" },
      ],
      footer: [{ id: "footer-1", type: "footer" }],
    });
    mockIsSectionComplete.mockReturnValue(true);
    mockClassifySectionRichness.mockReturnValue("rich");
    mockGetAllFacts.mockReturnValue([]);
  });

  it("exists in the tools object", () => {
    expect(tools.inspect_page_state).toBeDefined();
    expect(tools.inspect_page_state.execute).toBeDefined();
  });

  it("returns error when no draft exists", async () => {
    mockGetDraft.mockReturnValue(null);

    const result = await tools.inspect_page_state.execute(
      { username: "testuser" },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    expect(result.error).toBe("No draft found");
  });

  it("returns layout information", async () => {
    mockGetDraft.mockReturnValue(makeDraft());

    const result = await tools.inspect_page_state.execute(
      { username: "testuser" },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    expect(result.layout).toBeDefined();
    expect(result.layout.template).toBe("vertical");
    expect(result.layout.theme).toBe("minimal");
  });

  it("returns per-section details with slot assignment", async () => {
    mockGetDraft.mockReturnValue(makeDraft());

    const result = await tools.inspect_page_state.execute(
      { username: "testuser" },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    expect(result.sections).toHaveLength(4);

    const heroSection = result.sections.find((s: any) => s.type === "hero");
    expect(heroSection.slot).toBe("hero");
    expect(heroSection.complete).toBe(true);

    const bioSection = result.sections.find((s: any) => s.type === "bio");
    expect(bioSection.slot).toBe("main");

    const skillsSection = result.sections.find((s: any) => s.type === "skills");
    expect(skillsSection.widget).toBe("skills-chips");
  });

  it("reports locked sections", async () => {
    const draftWithLock = makeDraft();
    draftWithLock.config.sections[1].lock = { position: true, widget: true, content: false, lockedBy: "user" };
    mockGetDraft.mockReturnValue(draftWithLock);

    const result = await tools.inspect_page_state.execute(
      { username: "testuser" },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    const bioSection = result.sections.find((s: any) => s.type === "bio");
    expect(bioSection.locked).toBe(true);
  });

  it("reports completeness and richness per section", async () => {
    mockGetDraft.mockReturnValue(makeDraft());
    mockIsSectionComplete.mockImplementation(
      (s: any) => s.type !== "skills",
    );
    mockClassifySectionRichness.mockImplementation(
      (_f: any, type: string) => (type === "skills" ? "thin" : "rich"),
    );

    const result = await tools.inspect_page_state.execute(
      { username: "testuser" },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    const skillsSection = result.sections.find((s: any) => s.type === "skills");
    expect(skillsSection.complete).toBe(false);
    expect(skillsSection.richness).toBe("thin");
  });

  it("returns available slots from the template", async () => {
    mockGetDraft.mockReturnValue(makeDraft());

    const result = await tools.inspect_page_state.execute(
      { username: "testuser" },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    expect(result.availableSlots).toEqual(["hero", "main", "footer"]);
  });

  it("generates warnings for thin and incomplete sections", async () => {
    mockGetDraft.mockReturnValue(makeDraft());
    mockIsSectionComplete.mockImplementation(
      (s: any) => s.type !== "skills",
    );
    mockClassifySectionRichness.mockImplementation(
      (_f: any, type: string) => (type === "skills" ? "thin" : "rich"),
    );
    mockGetAllFacts.mockReturnValue([]);

    const result = await tools.inspect_page_state.execute(
      { username: "testuser" },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    expect(result.warnings).toContain("skills section is thin");
    expect(result.warnings).toContain("skills section is incomplete");
  });

  it("warns about missing public contact information", async () => {
    mockGetDraft.mockReturnValue(makeDraft());
    mockGetAllFacts.mockReturnValue([
      { id: "f1", category: "identity", visibility: "public" },
      // No contact facts
    ]);

    const result = await tools.inspect_page_state.execute(
      { username: "testuser" },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    expect(result.warnings).toContain("No public contact information");
  });

  it("does not warn about contact when public contact exists", async () => {
    mockGetDraft.mockReturnValue(makeDraft());
    mockGetAllFacts.mockReturnValue([
      { id: "f1", category: "contact", visibility: "proposed" },
    ]);

    const result = await tools.inspect_page_state.execute(
      { username: "testuser" },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    expect(result.warnings).not.toContain("No public contact information");
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/evals/inspect-page-state.test.ts --reporter=verbose
```

Expected: FAIL — `tools.inspect_page_state` is undefined.

**Step 3: Implement the inspect_page_state tool**

In `src/lib/agent/tools.ts`, add the tool inside `createAgentTools` return object (after `publish_preflight`, before the closing `};`):

```typescript
  inspect_page_state: tool({
    description:
      "Get a structured view of the current page state including layout, sections, slot assignments, and warnings. Use this to understand what the page looks like before making changes.",
    parameters: z.object({
      username: z
        .string()
        .describe("The username for the page to inspect"),
    }),
    execute: async ({ username }) => {
      try {
        const draft = getDraft(sessionId);
        if (!draft) return { error: "No draft found" };

        const config = draft.config;
        const template = resolveLayoutTemplate(config);
        const slotGroups = groupSectionsBySlot(config.sections, template);
        const allFacts = getAllFacts(sessionId, readKeys);
        const publishable = filterPublishableFacts(allFacts);

        const sections = config.sections.map((s: any) => {
          // Find which slot this section landed in
          let slot = "unknown";
          for (const [slotId, slotSections] of Object.entries(slotGroups)) {
            if ((slotSections as any[]).some((ss: any) => ss.id === s.id)) {
              slot = slotId;
              break;
            }
          }
          return {
            id: s.id,
            type: s.type,
            slot,
            widget: s.widget ?? "default",
            locked: !!s.lock,
            complete: isSectionComplete(s),
            richness: classifySectionRichness(publishable, s.type),
          };
        });

        const warnings: string[] = [];
        sections
          .filter((s: any) => s.richness === "thin")
          .forEach((s: any) => warnings.push(`${s.type} section is thin`));
        sections
          .filter((s: any) => !s.complete)
          .forEach((s: any) => warnings.push(`${s.type} section is incomplete`));
        if (
          !allFacts.some(
            (f: any) => f.category === "contact" && f.visibility !== "private",
          )
        ) {
          warnings.push("No public contact information");
        }

        return {
          layout: {
            template: config.layoutTemplate ?? "vertical",
            theme: config.theme ?? "minimal",
            style: config.style ?? {},
          },
          sections,
          availableSlots: template.slots.map((s: any) => s.id),
          warnings,
        };
      } catch (error) {
        logEvent({
          eventType: "tool_call_error",
          actor: "assistant",
          payload: { requestId, tool: "inspect_page_state", error: String(error) },
        });
        return { error: String(error) };
      }
    },
  }),
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/evals/inspect-page-state.test.ts --reporter=verbose
```

Expected: ALL PASS.

**Step 5: Commit**

```bash
git add src/lib/agent/tools.ts tests/evals/inspect-page-state.test.ts
git commit -m "feat: add inspect_page_state agent tool for structured page introspection"
```

---

### Task 6: Add username validation gate to request_publish (belt-and-suspenders)

**Files:**
- Modify: `src/lib/agent/tools.ts` (modify existing `request_publish` tool)

**Context:** Belt-and-suspenders: the agent should call `publish_preflight` before `request_publish`, but if it skips the preflight, `request_publish` should still catch hard-gate issues. This task adds a lightweight **username format check** — not the full preflight (which includes quality metrics like thin sections). The full preflight is the `publish_preflight` tool's responsibility.

Hard gates added here: hasDraft (already exists at line 415) + hasValidUsername (new).
Quality gates (thin sections, missing facts, etc.) remain in `publish_preflight` only.

**Step 1: Understand what request_publish already checks**

Current checks in `request_publish`:
- Line 415: `const draft = getDraft(sessionId); if (!draft) return error`
- That's it. No username validation.

**Step 2: Add username format validation**

Add an import for `validateUsernameFormat` at the top of `src/lib/agent/tools.ts` (near the other imports):

```typescript
import { validateUsernameFormat } from "@/lib/page-config/usernames";
```

**Step 3: Add validation inside request_publish.execute**

After the existing draft check (line 418), add username validation:

```typescript
      // Username format validation (belt-and-suspenders with publish_preflight)
      if (!username || username.length === 0) {
        return { success: false, error: "Username is required for publishing." };
      }
      const usernameCheck = validateUsernameFormat(username);
      if (!usernameCheck.ok) {
        return { success: false, error: usernameCheck.message };
      }
```

**Step 4: Run existing publish tests to verify no regression**

```bash
npx vitest run tests/evals/publish-pipeline.test.ts tests/evals/publish-flow.test.ts --reporter=verbose 2>/dev/null || true
npx vitest run tests/evals/publish-preflight.test.ts --reporter=verbose
```

Expected: ALL PASS.

**Step 5: Commit**

```bash
git add src/lib/agent/tools.ts
git commit -m "feat: add username validation guard to request_publish tool"
```

---

### Task 7: Full test suite verification

**Files:**
- All test files from Tasks 1-6

**Context:** Final verification that all new tests pass and no existing tests regress.

**Step 1: Run all new tests**

```bash
npx vitest run tests/evals/provider-tiers.test.ts tests/evals/translate-structured.test.ts tests/evals/publish-preflight.test.ts tests/evals/inspect-page-state.test.ts --reporter=verbose
```

Expected: ALL PASS.

**Step 2: Run the existing translate tests (updated in Task 3)**

```bash
npx vitest run tests/evals/translate.test.ts --reporter=verbose
```

Expected: ALL PASS.

**Step 3: Run the full test suite**

```bash
npx vitest run tests/evals/ --reporter=verbose 2>&1 | tail -30
```

Expected: No regressions. If any existing tests break due to the new imports in `tools.ts`, add the necessary mocks (the new imports are `resolveLayoutTemplate`, `groupSectionsBySlot`, `isSectionComplete`, `classifySectionRichness`, `SECTION_FACT_CATEGORIES`, `isMultiUserEnabled`, `validateUsernameFormat`).

**Step 4: Fix any broken tests**

Common fix pattern: if an existing test file imports from `tools.ts` and fails because the new imports can't be resolved, add mocks for the new dependencies:

```typescript
vi.mock("@/lib/layout/registry", () => ({
  getLayoutTemplate: vi.fn(),
  resolveLayoutTemplate: vi.fn(),
}));
vi.mock("@/lib/layout/group-slots", () => ({
  groupSectionsBySlot: vi.fn(),
}));
vi.mock("@/lib/page-config/section-completeness", () => ({
  isSectionComplete: vi.fn(() => true),
}));
vi.mock("@/lib/services/section-richness", () => ({
  classifySectionRichness: vi.fn(() => "rich"),
}));
vi.mock("@/lib/services/session-service", () => ({
  isMultiUserEnabled: vi.fn(() => false),
}));
vi.mock("@/lib/page-config/usernames", () => ({
  validateUsernameFormat: vi.fn(() => ({ ok: true })),
}));
```

**Step 5: Final commit**

```bash
git add -A
git commit -m "test: fix any mock additions needed for new tool imports"
```

---

## Summary

| Task | File(s) | What Changes |
|------|---------|-------------|
| 1 | `src/lib/ai/provider.ts` | Add `capable` tier, `CAPABLE_MODELS`, `AI_MODEL_CAPABLE` env |
| 2 | `src/lib/services/summary-service.ts` | Fix hardcoded `"anthropic"` → `getProviderName()` |
| 3 | `src/lib/ai/translate.ts` | Replace `generateText`+`stripCodeFences`+`JSON.parse` with `generateObject`+Zod |
| 4 | `src/lib/agent/tools.ts` | Add `publish_preflight` tool (16th tool) |
| 5 | `src/lib/agent/tools.ts` | Add `inspect_page_state` tool (17th tool) |
| 6 | `src/lib/agent/tools.ts` | Add username validation guard to `request_publish` |
| 7 | `tests/evals/*.test.ts` | Full suite verification + mock fixes |

**New test files:**
- `tests/evals/provider-tiers.test.ts`
- `tests/evals/translate-structured.test.ts`
- `tests/evals/publish-preflight.test.ts`
- `tests/evals/inspect-page-state.test.ts`

**Modified test files:**
- `tests/evals/translate.test.ts` (updated mocks: generateText → generateObject)

**Total new agent tools:** 2 (publish_preflight, inspect_page_state) → 17 total tools

**Net code removed:** `stripCodeFences()` function (~12 lines)

**Environment variables added:** `AI_MODEL_CAPABLE` (optional override for capable tier)

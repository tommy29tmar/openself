# UAT Round 4 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all 21 UAT findings from round 4 (5 critical, 6 high, 6 medium, 4 low)

**Architecture:** Three sprints in dependency order. Sprint 1 fixes data integrity (agent brain + data model). Sprint 2 fixes UX breakage (scroll-reveal, L10N keys, auth flow, date format). Sprint 3 centralizes UI L10N and polishes components.

**Tech Stack:** TypeScript, Next.js App Router, Vitest, Zod, SQLite/Drizzle

**Design doc:** `docs/plans/2026-02-28-uat-round4-fixes-design.md`

**Environment:** `EXTENDED_SECTIONS=true` in `.env` — all composition goes through extended mode.

---

## Sprint 1: Critical Fixes (C1–C5)

### Task 1: C2 — Auto-recompose after fact mutations

After `create_fact`, `update_fact`, `delete_fact`, the draft goes stale. Add auto-recompose to keep the draft in sync. This also resolves C4 (section removal after fact deletion).

**Key design decisions:**
- Use `projectCanonicalConfig()` from `page-projection.ts` as the single recompose function — it already handles section order preservation and lock metadata merging (lines 66-90).
- Pass `DraftMeta` from existing draft to preserve theme/style/layout/order/locks.
- Idempotency: compare `computeConfigHash(composed)` from `page-service.ts` (SHA-256 of full config JSON) against `draft.configHash` (also SHA-256 of full config JSON, written by `upsertDraft`). Same function, same input → correct comparison.
- Anti-loop: `_recomposing` flag as defense-in-depth.

**Files:**
- Modify: `src/lib/agent/tools.ts`
- Test: `tests/evals/agent-auto-recompose.test.ts` (create)

**Step 1: Write the failing test**

Create `tests/evals/agent-auto-recompose.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist all mocks before imports
const mockGetAllFacts = vi.fn();
const mockGetDraft = vi.fn();
const mockUpsertDraft = vi.fn();
const mockCreateFact = vi.fn();
const mockUpdateFact = vi.fn();
const mockDeleteFact = vi.fn();
const mockSearchFacts = vi.fn();
const mockSetFactVisibility = vi.fn();
const mockLogEvent = vi.fn();
const mockGetFactLanguage = vi.fn();
const mockTranslatePageContent = vi.fn();
const mockSaveMemory = vi.fn();
const mockProposeSoulChange = vi.fn();
const mockGetActiveSoul = vi.fn();
const mockResolveConflict = vi.fn();
const mockPersonalizeSection = vi.fn();
const mockFilterPublishableFacts = vi.fn((facts) => facts);
const mockDetectImpactedSections = vi.fn();
const mockComputeHash = vi.fn();
const mockRequestPublish = vi.fn();

vi.mock("@/lib/services/kb-service", () => ({
  createFact: mockCreateFact,
  updateFact: mockUpdateFact,
  deleteFact: mockDeleteFact,
  searchFacts: mockSearchFacts,
  getAllFacts: mockGetAllFacts,
  setFactVisibility: mockSetFactVisibility,
  VisibilityTransitionError: class extends Error {},
}));
vi.mock("@/lib/services/page-service", () => ({
  getDraft: mockGetDraft,
  upsertDraft: mockUpsertDraft,
  requestPublish: mockRequestPublish,
  computeConfigHash: vi.fn((config) => JSON.stringify(config)),
}));
vi.mock("@/lib/services/page-composer", () => ({
  composeOptimisticPage: vi.fn(() => ({
    username: "draft",
    theme: "minimal",
    style: {},
    sections: [{ id: "hero-1", type: "hero", variant: "large", content: { name: "Test" } }],
  })),
}));
vi.mock("@/lib/services/page-projection", () => ({
  projectCanonicalConfig: vi.fn(() => ({
    username: "draft",
    theme: "minimal",
    style: {},
    sections: [{ id: "hero-1", type: "hero", variant: "large", content: { name: "Test" } }],
  })),
  filterPublishableFacts: mockFilterPublishableFacts,
}));
vi.mock("@/lib/services/event-service", () => ({ logEvent: mockLogEvent }));
vi.mock("@/lib/services/preferences-service", () => ({ getFactLanguage: mockGetFactLanguage }));
vi.mock("@/lib/ai/translate", () => ({ translatePageContent: mockTranslatePageContent }));
vi.mock("@/lib/services/memory-service", () => ({ saveMemory: mockSaveMemory }));
vi.mock("@/lib/services/soul-service", () => ({
  proposeSoulChange: mockProposeSoulChange,
  getActiveSoul: mockGetActiveSoul,
}));
vi.mock("@/lib/services/conflict-service", () => ({ resolveConflict: mockResolveConflict }));
vi.mock("@/lib/services/fact-validation", () => ({
  FactValidationError: class extends Error {
    code = "FACT_VALIDATION_FAILED";
    constructor(m: string) { super(m); }
  },
}));
vi.mock("@/lib/layout/contracts", () => ({
  LAYOUT_TEMPLATES: ["vertical", "sidebar-left", "bento-standard"],
}));
vi.mock("@/lib/layout/registry", () => ({
  getLayoutTemplate: vi.fn(() => ({ id: "vertical", slots: [] })),
}));
vi.mock("@/lib/layout/assign-slots", () => ({
  assignSlotsFromFacts: vi.fn(() => ({ sections: [], issues: [] })),
}));
vi.mock("@/lib/layout/lock-policy", () => ({ extractLocks: vi.fn(() => ({})) }));
vi.mock("@/lib/services/section-personalizer", () => ({ personalizeSection: mockPersonalizeSection }));
vi.mock("@/lib/services/personalization-impact", () => ({ detectImpactedSections: mockDetectImpactedSections }));
vi.mock("@/lib/services/personalization-hashing", () => ({ computeHash: mockComputeHash }));

import { createAgentTools } from "@/lib/agent/tools";
import { projectCanonicalConfig } from "@/lib/services/page-projection";
import { computeConfigHash } from "@/lib/services/page-service";

describe("auto-recompose after fact mutations", () => {
  const draftConfig = {
    username: "draft",
    theme: "editorial-360",
    style: { colorScheme: "dark" },
    layoutTemplate: "sidebar-left",
    sections: [
      { id: "hero-1", type: "hero", variant: "large", content: { name: "Elena" } },
      { id: "bio-1", type: "bio", variant: "full", content: { text: "Bio" }, lock: { content: "user" } },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFactLanguage.mockReturnValue("it");
    mockGetAllFacts.mockReturnValue([
      { id: "f1", category: "identity", key: "name", value: { name: "Elena" }, visibility: "public" },
    ]);
    mockGetDraft.mockReturnValue({
      config: draftConfig,
      configHash: "old-hash",
    });
    // projectCanonicalConfig returns a NEW config (different hash)
    vi.mocked(projectCanonicalConfig).mockReturnValue({
      username: "draft",
      theme: "editorial-360",
      style: { colorScheme: "dark" },
      layoutTemplate: "sidebar-left",
      sections: [
        { id: "hero-1", type: "hero", variant: "large", content: { name: "Elena" } },
        { id: "bio-1", type: "bio", variant: "full", content: { text: "Updated bio" }, lock: { content: "user" } },
      ],
    });
    vi.mocked(computeConfigHash).mockReturnValue("new-hash");
  });

  it("recomposes draft after create_fact using projectCanonicalConfig", async () => {
    mockCreateFact.mockReturnValue({ id: "f2", category: "skill", key: "figma" });
    const tools = createAgentTools("it", "sess1");
    const result = await tools.create_fact.execute(
      { category: "skill", key: "figma", value: { name: "Figma" } },
      { toolCallId: "tc1", messages: [], abortSignal: new AbortController().signal },
    );
    expect(result.success).toBe(true);
    // Must use projectCanonicalConfig (preserves order + locks), NOT raw composeOptimisticPage
    expect(projectCanonicalConfig).toHaveBeenCalled();
    expect(mockUpsertDraft).toHaveBeenCalled();
  });

  it("passes DraftMeta to projectCanonicalConfig for order/lock preservation", async () => {
    mockCreateFact.mockReturnValue({ id: "f2", category: "skill", key: "figma" });
    const tools = createAgentTools("it", "sess1");
    await tools.create_fact.execute(
      { category: "skill", key: "figma", value: { name: "Figma" } },
      { toolCallId: "tc1", messages: [], abortSignal: new AbortController().signal },
    );
    // Verify DraftMeta was passed with theme, style, layoutTemplate, AND sections
    const call = vi.mocked(projectCanonicalConfig).mock.calls[0];
    const draftMeta = call[3]; // 4th arg
    expect(draftMeta).toBeDefined();
    expect(draftMeta!.theme).toBe("editorial-360");
    expect(draftMeta!.style).toEqual({ colorScheme: "dark" });
    expect(draftMeta!.layoutTemplate).toBe("sidebar-left");
    expect(draftMeta!.sections).toHaveLength(2); // preserves section array for order/lock merge
  });

  it("recomposes draft after update_fact", async () => {
    mockUpdateFact.mockReturnValue(true);
    const tools = createAgentTools("it", "sess1");
    const result = await tools.update_fact.execute(
      { factId: "f1", value: { name: "Elena Rossi" } },
      { toolCallId: "tc2", messages: [], abortSignal: new AbortController().signal },
    );
    expect(result.success).toBe(true);
    expect(projectCanonicalConfig).toHaveBeenCalled();
    expect(mockUpsertDraft).toHaveBeenCalled();
  });

  it("recomposes draft after delete_fact", async () => {
    mockDeleteFact.mockReturnValue(true);
    const tools = createAgentTools("it", "sess1");
    const result = await tools.delete_fact.execute(
      { factId: "f1" },
      { toolCallId: "tc3", messages: [], abortSignal: new AbortController().signal },
    );
    expect(result.success).toBe(true);
    expect(projectCanonicalConfig).toHaveBeenCalled();
    expect(mockUpsertDraft).toHaveBeenCalled();
  });

  it("skips recompose when no facts remain after delete", async () => {
    mockDeleteFact.mockReturnValue(true);
    mockGetAllFacts.mockReturnValue([]); // no facts left
    const tools = createAgentTools("it", "sess1");
    await tools.delete_fact.execute(
      { factId: "f1" },
      { toolCallId: "tc4", messages: [], abortSignal: new AbortController().signal },
    );
    expect(projectCanonicalConfig).not.toHaveBeenCalled();
  });

  it("skips upsertDraft when computeConfigHash matches draft.configHash", async () => {
    // Make computeConfigHash return the SAME hash as the existing draft
    vi.mocked(computeConfigHash).mockReturnValue("old-hash");
    mockCreateFact.mockReturnValue({ id: "f2", category: "skill", key: "figma" });
    const tools = createAgentTools("it", "sess1");
    await tools.create_fact.execute(
      { category: "skill", key: "figma", value: { name: "Figma" } },
      { toolCallId: "tc5", messages: [], abortSignal: new AbortController().signal },
    );
    expect(projectCanonicalConfig).toHaveBeenCalled();
    // upsertDraft skipped because computeConfigHash(composed) === draft.configHash
    expect(mockUpsertDraft).not.toHaveBeenCalled();
  });

  it("does not recompose on create_fact failure", async () => {
    mockCreateFact.mockImplementation(() => { throw new Error("DB error"); });
    const tools = createAgentTools("it", "sess1");
    const result = await tools.create_fact.execute(
      { category: "skill", key: "figma", value: { name: "Figma" } },
      { toolCallId: "tc6", messages: [], abortSignal: new AbortController().signal },
    );
    expect(result.success).toBe(false);
    expect(projectCanonicalConfig).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/agent-auto-recompose.test.ts`
Expected: FAIL — tests expect `projectCanonicalConfig` and `upsertDraft` to be called after fact mutations, but current code doesn't do that.

**Step 3: Implement auto-recompose in `tools.ts`**

3a. Add import at top of `tools.ts`:

```typescript
import { projectCanonicalConfig, type DraftMeta } from "@/lib/services/page-projection";
import { computeConfigHash } from "@/lib/services/page-service";
```

Note: `projectCanonicalConfig` is already importable — `filterPublishableFacts` is already imported from the same module. `computeConfigHash` is already exported from `page-service.ts` (line 15).

3b. Add `recomposeAfterMutation()` inside `createAgentTools()`, right after `ensureDraft()` (line 44):

```typescript
/**
 * Recompose draft after fact mutations to keep preview in sync.
 *
 * Uses projectCanonicalConfig() — the same function used by preview/stream —
 * which handles: section order preservation, lock metadata merging,
 * theme/style/layoutTemplate carry-over from existing draft.
 *
 * Anti-loop: _recomposing flag prevents re-entry.
 * Idempotency: computeConfigHash(composed) compared to draft.configHash
 * (both are SHA-256 of full config JSON). Skip upsertDraft on match.
 */
let _recomposing = false;
function recomposeAfterMutation(): void {
  if (_recomposing) return;
  _recomposing = true;
  try {
    const allFacts = getAllFacts(sessionId, readKeys);
    if (allFacts.length === 0) return;
    const factLang = getFactLanguage(sessionId) ?? sessionLanguage;
    const currentDraft = getDraft(sessionId);

    // Build DraftMeta for order/lock/style preservation
    const draftMeta: DraftMeta | undefined = currentDraft
      ? {
          theme: currentDraft.config.theme,
          style: currentDraft.config.style,
          layoutTemplate: currentDraft.config.layoutTemplate,
          sections: currentDraft.config.sections,
        }
      : undefined;

    const composed = projectCanonicalConfig(
      allFacts,
      currentDraft?.username ?? "draft",
      factLang,
      draftMeta,
    );

    // Idempotency: skip write if hash matches
    const composedHash = computeConfigHash(composed);
    if (composedHash === currentDraft?.configHash) return;

    upsertDraft(currentDraft?.username ?? "draft", composed, sessionId);
  } finally {
    _recomposing = false;
  }
}
```

3c. Call `recomposeAfterMutation()` in each fact mutation tool:

- In `create_fact` execute: after the `logEvent` call, before `return { success: true, ... }`:
  ```typescript
  recomposeAfterMutation();
  ```

- In `update_fact` execute: after `const updated = updateFact(...)` succeeds, before return:
  ```typescript
  recomposeAfterMutation();
  ```

- In `delete_fact` execute: after `const deleted = deleteFact(...)` when `deleted` is `true`, before return:
  ```typescript
  if (deleted) recomposeAfterMutation();
  ```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/agent-auto-recompose.test.ts`
Expected: PASS

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (no regressions)

**Step 6: Commit**

```bash
git add src/lib/agent/tools.ts tests/evals/agent-auto-recompose.test.ts
git commit -m "fix(C2+C4): auto-recompose draft after fact mutations

Uses projectCanonicalConfig() — same as preview/stream — to preserve
section order, locks, theme, style, layoutTemplate. Anti-loop guard
(_recomposing flag). Idempotency via computeConfigHash comparison
(SHA-256 of full config JSON, same function used by upsertDraft).

Resolves C4: deleting facts removes stale sections via recompose."
```

---

### Task 2: C1 — Bio template for freelance

The bio template produces "Sono graphic designer presso Freelance" — treating "Freelance" as a company name.

**Files:**
- Modify: `src/lib/services/page-composer.ts` (L10nStrings type + L10N object + buildBioSection)
- Test: `tests/evals/bio-freelance.test.ts` (create)

**Step 1: Write the failing test**

Create `tests/evals/bio-freelance.test.ts`:

```typescript
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
    ...overrides,
  };
}

describe("bio template — freelance", () => {
  it("uses freelance template when company is 'Freelance' (it)", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Elena Rossi" } }),
      makeFact({ category: "identity", key: "role", value: { role: "Graphic Designer" } }),
      makeFact({ category: "experience", key: "current", value: { role: "Graphic Designer", company: "Freelance", status: "current" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "it");
    const bio = page.sections.find((s) => s.type === "bio");
    expect(bio).toBeDefined();
    const text = (bio!.content as { text: string }).text;
    expect(text).not.toContain("presso Freelance");
    expect(text).not.toContain("presso freelance");
    expect(text.toLowerCase()).toContain("freelance");
  });

  it("uses freelance template for English 'Self-employed'", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Elena Rossi" } }),
      makeFact({ category: "identity", key: "role", value: { role: "Graphic Designer" } }),
      makeFact({ category: "experience", key: "current", value: { role: "Graphic Designer", company: "Self-employed", status: "current" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "en");
    const bio = page.sections.find((s) => s.type === "bio");
    const text = (bio!.content as { text: string }).text;
    expect(text).not.toContain("at Self-employed");
    expect(text.toLowerCase()).toMatch(/freelance/);
  });

  it("uses standard template for real companies", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Elena Rossi" } }),
      makeFact({ category: "identity", key: "role", value: { role: "Graphic Designer" } }),
      makeFact({ category: "experience", key: "current", value: { role: "Graphic Designer", company: "Acme Corp", status: "current" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "it");
    const bio = page.sections.find((s) => s.type === "bio");
    const text = (bio!.content as { text: string }).text;
    expect(text).toContain("Acme Corp");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/bio-freelance.test.ts`
Expected: FAIL — "presso Freelance" in bio text.

**Step 3: Implement in `page-composer.ts`**

3a. Add to `L10nStrings` type (after `bioRoleFirstPerson`, ~line 54):

```typescript
bioRoleFreelanceFirstPerson: (role: string) => string;
```

3b. Add values to all 8 language objects in `L10N`:

- en: `(role) => \`I am a freelance ${role}.\``
- it: `(role) => \`Sono ${role} freelance.\``
- de: `(role) => \`Ich bin freiberufliche/r ${role}.\``
- fr: `(role) => \`Je suis ${role} freelance.\``
- es: `(role) => \`Soy ${role} freelance.\``
- pt: `(role) => \`Sou ${role} freelancer.\``
- ja: `(role) => \`フリーランスの${role}です。\``
- zh: `(role) => \`我是自由职业${role}。\``

3c. Add freelance detection constant (before `buildHeroSection`, ~line 332):

```typescript
const FREELANCE_MARKERS = new Set([
  "freelance", "self-employed", "independent", "freelancer",
  "indépendant", "selbstständig", "autónomo", "libero professionista",
  "autonomo", "indipendente",
]);
```

3d. In `buildBioSection()`, in the template selection logic where it decides between `bioRoleAtFirstPerson` and `bioRoleFirstPerson`, add freelance branch:

```typescript
const isFreelance = company ? FREELANCE_MARKERS.has(company.toLowerCase()) : false;

if (isFreelance) {
  parts.push(l.bioRoleFreelanceFirstPerson(lowerRole(role, language)));
} else if (company) {
  parts.push(l.bioRoleAtFirstPerson(lowerRole(role, language), company));
} else {
  parts.push(l.bioRoleFirstPerson(lowerRole(role, language)));
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/bio-freelance.test.ts`
Expected: PASS

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 6: Commit**

```bash
git add src/lib/services/page-composer.ts tests/evals/bio-freelance.test.ts
git commit -m "fix(C1): freelance bio template — no more 'presso Freelance'

Add bioRoleFreelanceFirstPerson L10N key (8 langs). Detect freelance via
FREELANCE_MARKERS set. Natural phrasing: 'Sono graphic designer freelance.'"
```

---

### Task 3: C3 — Client vs employer in experience data model

No distinction between employer and client. Barilla/Eataly/MAXXI are clients, not employers.

**Files:**
- Modify: `src/lib/services/page-composer.ts` (buildExperienceSection + new buildProjectsFromExperience)
- Modify: `src/lib/agent/prompts.ts` (FACT_SCHEMA_REFERENCE)
- Test: `tests/evals/experience-types.test.ts` (create)

**Step 1: Write the failing test**

Create `tests/evals/experience-types.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => { process.env.EXTENDED_SECTIONS = "true"; });

import { composeOptimisticPage } from "@/lib/services/page-composer";

function makeFact(overrides: Record<string, unknown>) {
  return {
    id: `f-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: "s1",
    category: "experience",
    key: "job1",
    value: {},
    visibility: "public" as const,
    confidence: 1,
    source: "agent" as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("experience type field", () => {
  const baseFacts = [
    makeFact({ category: "identity", key: "name", value: { name: "Elena Rossi" } }),
  ];

  it("treats undefined type as employment (backward compat)", () => {
    const facts = [
      ...baseFacts,
      makeFact({ key: "job1", value: { role: "Designer", company: "Acme", status: "current" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "en");
    const exp = page.sections.find((s) => s.type === "experience");
    expect(exp).toBeDefined();
    const items = (exp!.content as { items: unknown[] }).items;
    expect(items.length).toBe(1);
  });

  it("puts client-type experience into projects section with company in title", () => {
    const facts = [
      ...baseFacts,
      makeFact({ key: "barilla", value: { role: "Branding", company: "Barilla", type: "client" } }),
      makeFact({ key: "eataly", value: { role: "Visual Identity", company: "Eataly", type: "client" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "en");
    const projects = page.sections.find((s) => s.type === "projects");
    expect(projects).toBeDefined();
    const items = (projects!.content as { items: { title: string }[] }).items;
    expect(items.length).toBe(2);
    // Verify company name is visible in the title (rendered as "Branding — Barilla" style)
    // This is critical: Projects.tsx renders item.title but NOT item.company,
    // so the company MUST be included in the title string itself.
    const titles = items.map((i) => i.title);
    expect(titles.some((t) => t.includes("Barilla"))).toBe(true);
    expect(titles.some((t) => t.includes("Eataly"))).toBe(true);
    // No experience section since all are client-type
    const exp = page.sections.find((s) => s.type === "experience");
    expect(exp).toBeUndefined();
  });

  it("splits employment and client into separate sections", () => {
    const facts = [
      ...baseFacts,
      makeFact({ key: "job1", value: { role: "Designer", company: "Agency X", status: "current" } }),
      makeFact({ key: "barilla", value: { role: "Branding", company: "Barilla", type: "client" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "en");
    const exp = page.sections.find((s) => s.type === "experience");
    const projects = page.sections.find((s) => s.type === "projects");
    expect(exp).toBeDefined();
    expect(projects).toBeDefined();
  });

  it("handles freelance-type in experience section", () => {
    const facts = [
      ...baseFacts,
      makeFact({ key: "freelance", value: { role: "Graphic Designer", type: "freelance", status: "current" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "en");
    const exp = page.sections.find((s) => s.type === "experience");
    expect(exp).toBeDefined();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/experience-types.test.ts`
Expected: FAIL — client-type experiences are not routed to projects.

**Step 3: Implement**

3a. In `buildExperienceSection()` (line 702), filter to employment + freelance only:

```typescript
function buildExperienceSection(experienceFacts: FactRow[], language: string): Section | null {
  // Filter: employment (undefined) + freelance → experience; client → projects (handled separately)
  const employmentFacts = experienceFacts.filter((f) => {
    const t = str(val(f).type);
    return !t || t === "employment" || t === "freelance";
  });
  if (employmentFacts.length === 0) return null;
  // ... rest uses employmentFacts instead of experienceFacts
```

3b. Add `buildProjectsFromExperience()` near `buildProjectsSection()`:

**Important**: `Projects.tsx` renders `item.title` but does NOT render `item.company` or `item.period`. So the company name MUST be included in the `title` string itself. Format: `"Role — Company"` (em dash separator).

```typescript
function buildProjectsFromExperience(experienceFacts: FactRow[], language: string): ProjectItem[] {
  return experienceFacts
    .filter((f) => str(val(f).type) === "client")
    .map((f) => {
      const v = val(f);
      const role = str(v.role) ?? str(v.title) ?? "";
      const company = str(v.company);
      if (!role && !company) return null;
      // Merge company into title — Projects.tsx only renders item.title
      const title = role && company ? `${role} — ${company}` : role || company || "";
      if (!title) return null;
      return {
        title,
        description: str(v.description),
      };
    })
    .filter((item): item is ProjectItem => item !== null);
}
```

3c. In `composeOptimisticPage()` extended branch (~line 1117-1121), merge client-derived projects with `project`-category projects:

```typescript
// After building experience section:
const experience = buildExperienceSection(experienceFacts, language);
if (experience) sections.push(experience);

// Projects: merge project-category facts with client-type experience facts
const projectFacts = grouped.get("project") ?? [];
const clientProjectItems = buildProjectsFromExperience(experienceFacts, language);
const projects = buildProjectsSection(projectFacts, language, clientProjectItems);
if (projects) sections.push(projects);
```

Modify `buildProjectsSection()` to accept optional extra items and merge them.

3d. In `prompts.ts`, update `FACT_SCHEMA_REFERENCE` for experience row:

```
experience | { role, company?, status?, period?, description?, type? } | type: "employment" (default if omitted), "freelance", or "client". Use "client" for project clients (e.g. Barilla branding). Clients appear in Projects section.
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/experience-types.test.ts`
Expected: PASS

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 6: Commit**

```bash
git add src/lib/services/page-composer.ts src/lib/agent/prompts.ts tests/evals/experience-types.test.ts
git commit -m "fix(C3): client vs employer in experience data model

Add optional type field: employment (default) | freelance | client.
Client-type routes to Projects section. undefined → employment for
backward compat. Agent prompt updated with examples."
```

---

### Task 4: C5 — Layout alias mapping

Agent says `set_layout("bento")` but valid enum is `"bento-standard"`. Zod rejects it.

**Files:**
- Modify: `src/lib/layout/contracts.ts` (add resolveLayoutAlias)
- Modify: `src/lib/agent/tools.ts` (set_layout tool — relax Zod, resolve alias)
- Modify: `src/app/api/draft/style/route.ts` (server-side alias before LAYOUT_TEMPLATES check at line 70)
- Modify: `src/lib/agent/prompts.ts` (DATA_MODEL_REFERENCE)
- Test: `tests/evals/layout-alias.test.ts` (create)

**Step 1: Write the failing test**

Create `tests/evals/layout-alias.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { resolveLayoutAlias } from "@/lib/layout/contracts";

describe("resolveLayoutAlias", () => {
  it("maps 'bento' to 'bento-standard'", () => {
    expect(resolveLayoutAlias("bento")).toBe("bento-standard");
  });

  it("maps 'sidebar' to 'sidebar-left'", () => {
    expect(resolveLayoutAlias("sidebar")).toBe("sidebar-left");
  });

  it("passes through valid template IDs unchanged", () => {
    expect(resolveLayoutAlias("vertical")).toBe("vertical");
    expect(resolveLayoutAlias("sidebar-left")).toBe("sidebar-left");
    expect(resolveLayoutAlias("bento-standard")).toBe("bento-standard");
  });

  it("returns input unchanged for unknown values", () => {
    expect(resolveLayoutAlias("unknown")).toBe("unknown");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/layout-alias.test.ts`
Expected: FAIL — `resolveLayoutAlias` does not exist.

**Step 3: Implement**

3a. In `src/lib/layout/contracts.ts`, add:

```typescript
const LAYOUT_ALIASES: Record<string, LayoutTemplateId> = {
  bento: "bento-standard",
  sidebar: "sidebar-left",
};

export function resolveLayoutAlias(value: string): string {
  return LAYOUT_ALIASES[value] ?? value;
}
```

3b. In `src/lib/agent/tools.ts`, in the `set_layout` tool:

Change parameter from `z.enum(LAYOUT_TEMPLATES)` to `z.string()`:
```typescript
layoutTemplate: z.string().describe("Layout: vertical, sidebar-left (or 'sidebar'), bento-standard (or 'bento')"),
```

In execute, resolve alias and validate:
```typescript
import { resolveLayoutAlias } from "@/lib/layout/contracts";

// In execute:
const resolved = resolveLayoutAlias(layoutTemplate);
if (!(LAYOUT_TEMPLATES as readonly string[]).includes(resolved)) {
  return { success: false, error: `Invalid layout '${layoutTemplate}'. Valid: ${LAYOUT_TEMPLATES.join(", ")}` };
}
// Use resolved (LayoutTemplateId) for all downstream calls
```

3c. In `src/app/api/draft/style/route.ts` (line 68-70), resolve alias before the LAYOUT_TEMPLATES check:

```typescript
// Before:
if (typeof body.layoutTemplate === "string" && (LAYOUT_TEMPLATES as readonly string[]).includes(body.layoutTemplate)) {

// After:
import { resolveLayoutAlias } from "@/lib/layout/contracts";
const resolvedLayout = typeof body.layoutTemplate === "string" ? resolveLayoutAlias(body.layoutTemplate) : undefined;
if (resolvedLayout && (LAYOUT_TEMPLATES as readonly string[]).includes(resolvedLayout)) {
  config.layoutTemplate = resolvedLayout as LayoutTemplateId;
```

3d. In `prompts.ts` DATA_MODEL_REFERENCE, add to the layouts line:

```
Valid layouts: vertical, sidebar-left (or "sidebar"), bento-standard (or "bento")
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/layout-alias.test.ts`
Expected: PASS

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 6: Commit**

```bash
git add src/lib/layout/contracts.ts src/lib/agent/tools.ts src/app/api/draft/style/route.ts src/lib/agent/prompts.ts tests/evals/layout-alias.test.ts
git commit -m "fix(C5): layout alias — 'bento' → 'bento-standard'

resolveLayoutAlias() in contracts.ts. Applied in: set_layout tool
(relaxed to z.string + manual validation), draft/style API route
(server-side alias before LAYOUT_TEMPLATES check). Prompt updated."
```

---

### Task 5: Sprint 1 integration test + review

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 2: Manual smoke test**

Start dev server, open builder, send a message to create a fact, verify the preview updates without explicit `generate_page`. Try `set_layout("bento")` — should work. Delete a music fact — music section should disappear.

**Step 3: Commit any fixups**

---

## Sprint 2: High Priority Fixes (H1–H6)

### Task 6: H1 — Scroll-reveal on published page

Sections in viewport on page load stay invisible until scroll.

**Files:**
- Modify: `src/themes/editorial-360/Layout.tsx` (initial reveal check)
- Modify: `src/app/globals.css` (CSS fallback animation)

**Step 1: No unit test** — DOM/visual fix tested manually with Playwright screenshots.

**Step 2: Implement initial reveal in `Layout.tsx`**

In `EditorialLayout`, after `reveals.forEach(el => observer.observe(el))` (line 40), add:

```typescript
// Reveal sections already in viewport on initial load
requestAnimationFrame(() => {
  reveals.forEach(el => {
    const rect = el.getBoundingClientRect();
    const rootRect = scrollParent
      ? scrollParent.getBoundingClientRect()
      : { top: 0, bottom: window.innerHeight };
    if (rect.top < rootRect.bottom && rect.bottom > rootRect.top) {
      el.classList.add('revealed');
      observer.unobserve(el);
    }
  });
});
```

**Step 3: Add CSS fallback in `globals.css`**

After the `.preview-mode .theme-reveal` block (line 431), add:

```css
/* Fallback: if JS scroll-reveal hasn't fired after 1.5s, reveal everything */
@keyframes reveal-fallback {
  to { opacity: 1; transform: none; }
}
.theme-reveal:not(.revealed) {
  animation: reveal-fallback 0.6s ease 1.5s forwards;
}
```

Note: The existing `@media (prefers-reduced-motion: reduce)` (line 492) already sets `.theme-reveal { opacity: 1; transform: none; animation: none; }` which overrides this fallback.

**Step 4: Manual test with Playwright**

Navigate to a published page. Take screenshot. Verify hero and above-fold sections are visible without scrolling.

**Step 5: Commit**

```bash
git add src/themes/editorial-360/Layout.tsx src/app/globals.css
git commit -m "fix(H1): reveal sections already in viewport on page load

requestAnimationFrame after IO setup checks initial visibility.
CSS fallback animation (1.5s delay) as safety net if JS fails."
```

---

### Task 7: H2 — Proficiency L10N on hero

Hero `languages[]` uses raw English proficiency ("fluent") while `buildLanguagesSection()` correctly localizes.

**Files:**
- Modify: `src/lib/services/page-composer.ts` (extract localizeProficiency, apply in buildHeroSection)
- Test: `tests/evals/hero-proficiency-l10n.test.ts` (create)

**Step 1: Write the failing test**

Create `tests/evals/hero-proficiency-l10n.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => { process.env.EXTENDED_SECTIONS = "true"; });

import { composeOptimisticPage } from "@/lib/services/page-composer";

function makeFact(overrides: Record<string, unknown>) {
  return {
    id: `f-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: "s1", category: "identity", key: "name",
    value: { name: "Elena" }, visibility: "public" as const,
    confidence: 1, source: "agent" as const,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("hero proficiency L10N", () => {
  it("localizes proficiency in hero languages for Italian", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Elena Rossi" } }),
      makeFact({ category: "language", key: "english", value: { language: "English", proficiency: "fluent" } }),
      makeFact({ category: "language", key: "italian", value: { language: "Italiano", proficiency: "native" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "it");
    const hero = page.sections.find((s) => s.type === "hero");
    const languages = (hero!.content as { languages: { language: string; proficiency?: string }[] }).languages;
    const eng = languages.find((l) => l.language === "English");
    expect(eng?.proficiency).toBe("Fluente");
    const ita = languages.find((l) => l.language === "Italiano");
    expect(ita?.proficiency).toBe("Madrelingua");
  });

  it("passes through unknown proficiency values unchanged", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Elena Rossi" } }),
      makeFact({ category: "language", key: "eng", value: { language: "English", proficiency: "conversational" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "it");
    const hero = page.sections.find((s) => s.type === "hero");
    const languages = (hero!.content as { languages: { language: string; proficiency?: string }[] }).languages;
    expect(languages[0].proficiency).toBe("conversational");
  });
});
```

**Step 2: Run test — expect FAIL**

Run: `npx vitest run tests/evals/hero-proficiency-l10n.test.ts`

**Step 3: Implement**

3a. Extract `localizeProficiency()` near `PROF_KEYS` (line 886):

```typescript
function localizeProficiency(rawProf: string | undefined, language: string): string | undefined {
  if (!rawProf) return undefined;
  const key = PROF_KEYS[rawProf.toLowerCase()];
  if (!key) return rawProf;
  return getL10n(language)[key] as string;
}
```

3b. In `buildHeroSection()` (line 451), change:

```typescript
// Before:
proficiency: str(v.proficiency) ?? str(v.level),

// After:
proficiency: localizeProficiency(str(v.proficiency) ?? str(v.level), language),
```

3c. In `buildLanguagesSection()`, replace the inline PROF_KEYS lookup with `localizeProficiency()` (DRY).

**Step 4: Run test — expect PASS**

**Step 5: Run full suite, commit**

```bash
git add src/lib/services/page-composer.ts tests/evals/hero-proficiency-l10n.test.ts
git commit -m "fix(H2): localize proficiency in hero languages

Extract localizeProficiency() helper used in both buildHeroSection
and buildLanguagesSection (single source of truth)."
```

---

### Task 8: H3 + H4 — Section header L10N (aboutLabel + interestsInto)

Bio shows "About" and AtAGlance shows "Into" hardcoded in English.

**Files:**
- Modify: `src/lib/services/page-composer.ts` (L10nStrings + L10N + buildBioSection + buildAtAGlanceSection)
- Modify: `src/themes/editorial-360/components/AtAGlance.tsx` (read interestsInto from content)
- Test: `tests/evals/section-headers-l10n.test.ts` (create)

**Step 1: Write the failing test**

Create `tests/evals/section-headers-l10n.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => { process.env.EXTENDED_SECTIONS = "true"; });

import { composeOptimisticPage } from "@/lib/services/page-composer";

function makeFact(overrides: Record<string, unknown>) {
  return {
    id: `f-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: "s1", category: "identity", key: "name",
    value: { name: "Elena" }, visibility: "public" as const,
    confidence: 1, source: "agent" as const,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("section headers L10N", () => {
  const baseFacts = [
    makeFact({ category: "identity", key: "name", value: { name: "Elena Rossi" } }),
    makeFact({ category: "identity", key: "role", value: { role: "Designer" } }),
  ];

  it("bio title is 'Chi Sono' in Italian", () => {
    const page = composeOptimisticPage(baseFacts, "draft", "it");
    const bio = page.sections.find((s) => s.type === "bio");
    expect((bio!.content as { title: string }).title).toBe("Chi Sono");
  });

  it("bio title is 'About' in English", () => {
    const page = composeOptimisticPage(baseFacts, "draft", "en");
    const bio = page.sections.find((s) => s.type === "bio");
    expect((bio!.content as { title: string }).title).toBe("About");
  });

  it("bio title is 'Über Mich' in German", () => {
    const page = composeOptimisticPage(baseFacts, "draft", "de");
    const bio = page.sections.find((s) => s.type === "bio");
    expect((bio!.content as { title: string }).title).toBe("Über Mich");
  });

  it("at-a-glance has localized interestsInto", () => {
    const facts = [
      ...baseFacts,
      makeFact({ category: "interest", key: "i1", value: { name: "Typography" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "it");
    const aag = page.sections.find((s) => s.type === "at-a-glance");
    expect(aag).toBeDefined();
    const content = aag!.content as { interestsInto?: string };
    expect(content.interestsInto).toBeDefined();
    expect(content.interestsInto).not.toBe("Into");
  });
});
```

**Step 2: Run test — expect FAIL**

**Step 3: Implement**

3a. Add to `L10nStrings`:
```typescript
aboutLabel: string;
interestsInto: string;
```

3b. Add to all 8 lang objects (en: "About"/"Into", it: "Chi Sono"/"Appassionata di", de: "Über Mich"/"Begeistert von", fr: "À Propos"/"Passionné(e) de", es: "Sobre Mí"/"Apasionado/a de", pt: "Sobre Mim"/"Apaixonado/a por", ja: "自己紹介"/"興味", zh: "关于我"/"热爱").

3c. In `buildBioSection()`, set `title: l.aboutLabel` in returned content.

3d. In `buildAtAGlanceSection()`, add `interestsInto: l.interestsInto` to returned content.

3e. In `AtAGlance.tsx` line 86, change:
```typescript
// Before:
<span className="text-[var(--page-accent)] font-medium">Into</span>

// After:
<span className="text-[var(--page-accent)] font-medium">{content.interestsInto ?? "Into"}</span>
```

Note: `Bio.tsx` already has `{title || "About"}` — the composer now provides `title`, so the fallback is only for legacy data.

**Step 4: Run test — expect PASS**

**Step 5: Full suite, commit**

```bash
git add src/lib/services/page-composer.ts src/themes/editorial-360/components/AtAGlance.tsx tests/evals/section-headers-l10n.test.ts
git commit -m "fix(H3+H4): localize bio/at-a-glance section headers

Add aboutLabel and interestsInto to L10nStrings (8 langs). Composer
sets title in bio and interestsInto in at-a-glance content."
```

---

### Task 9: H5 — "Sign up to publish" after login (root-cause investigation)

After signup modal → redirect → back to builder → shows "Sign up to publish" instead of "Publish".

**Root-cause analysis (from code trace):**

The flow: `SignupModal` calls `fetch("/api/register")` → server creates `SESSION_B` via `createAuthSession()` → response has `Set-Cookie: os_session=SESSION_B` → SignupModal does `window.location.href = \`/${data.username}\`` → user sees published page → clicks "Edit your page" → `/builder` loads → `refreshAuth()` calls `GET /api/preferences` with cookie `SESSION_B` → `getAuthContext()` should resolve `userId` → `authenticated: true`.

The `fetch()` call to `/api/register` is same-origin with default credentials mode, so the browser WILL store the `Set-Cookie`. The `window.location.href` navigation happens AFTER fetch completes, so the cookie is set before the redirect.

**Possible failure modes to verify:**
1. `createAuthSession()` doesn't insert into `sessions` table correctly (SESSION_B not found by `getSession`)
2. `SESSION_B` has `userId` set but `getAuthContext` resolves it differently
3. `resolveOwnerScope` returns `null` for `SESSION_B` → preferences returns 401 → builder redirects to invite

**Files:**
- Modify: `src/app/builder/page.tsx` (add diagnostic logging for auth investigation)

**Step 1: Reproduce**

Clean DB, start dev server, full flow: invite → builder → chat → signup → redirect → "Edit your page" → builder. Check:
- Browser DevTools → Application → Cookies: is `os_session` cookie set?
- Network tab: `GET /api/preferences` response — what does `authenticated` field show?
- Server logs: does `/api/preferences` return 200 or 401?

**Step 2: Fix based on root cause**

If the issue is that `SESSION_B` is not found (race condition between WAL write and read): the WAL checkpoint already runs after registration (`sqlite.pragma("wal_checkpoint(PASSIVE)")`). Verify it runs BEFORE `createAuthSession`.

If the issue is that `resolveOwnerScope` works but `getAuthContext` doesn't find `userId`: check `createAuthSession` implementation — does it set `userId` on the session row?

If the issue is cookie not being sent: check if `createSessionCookie` matches the domain/path expectations.

**Step 3: Implement verified fix**

Based on the reproduction, implement the specific fix. Do NOT add speculative delays or retries.

**Step 4: Verify fix**

Re-run the same E2E flow. Verify "Publish" button appears (not "Sign up to publish").

**Step 5: Commit**

```bash
git commit -m "fix(H5): auth state after signup — [specific root cause]"
```

**Acceptance criteria:** After signup + redirect + "Edit your page", builder shows "Publish as {username}" button. Verified via manual E2E test.

---

### Task 10: H6 — Raw ISO date in achievements

Dates like "2023-01-01" shown raw. Need formatted display.

**Files:**
- Create: `src/lib/i18n/format-date.ts`
- Modify: `src/lib/services/page-composer.ts` (format dates in buildAchievementsSection)
- Test: `tests/evals/format-date.test.ts` (create — unit test for utility)
- Test: `tests/evals/achievements-date-format.test.ts` (create — integration test through composer)

**Step 1: Write failing unit test for utility**

Create `tests/evals/format-date.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { formatFactDate } from "@/lib/i18n/format-date";

describe("formatFactDate", () => {
  it("shows year only for YYYY-01-01 dates", () => {
    expect(formatFactDate("2023-01-01", "en")).toBe("2023");
    expect(formatFactDate("2023-01-01", "it")).toBe("2023");
  });

  it("shows month + year in English", () => {
    expect(formatFactDate("2023-03-15", "en")).toBe("March 2023");
  });

  it("shows month + year in Italian", () => {
    expect(formatFactDate("2023-03-15", "it")).toBe("marzo 2023");
  });

  it("handles YYYY-MM format", () => {
    expect(formatFactDate("2023-03", "it")).toBe("marzo 2023");
  });

  it("handles plain year", () => {
    expect(formatFactDate("2023", "en")).toBe("2023");
  });

  it("passes through non-date strings", () => {
    expect(formatFactDate("Ongoing", "en")).toBe("Ongoing");
    expect(formatFactDate("", "en")).toBe("");
  });

  it("handles German month names", () => {
    expect(formatFactDate("2023-03-15", "de")).toBe("März 2023");
  });
});
```

**Step 2: Write failing integration test through composer**

Create `tests/evals/achievements-date-format.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => { process.env.EXTENDED_SECTIONS = "true"; });

import { composeOptimisticPage } from "@/lib/services/page-composer";

function makeFact(overrides: Record<string, unknown>) {
  return {
    id: `f-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: "s1", category: "identity", key: "name",
    value: { name: "Elena" }, visibility: "public" as const,
    confidence: 1, source: "agent" as const,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("achievements date formatting in composer", () => {
  it("formats ISO date in achievement content for Italian", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Elena" } }),
      makeFact({ category: "achievement", key: "a1", value: { title: "Premio Design", date: "2023-03-15" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "it");
    const ach = page.sections.find((s) => s.type === "achievements");
    expect(ach).toBeDefined();
    const items = (ach!.content as { items: { title: string; date?: string }[] }).items;
    expect(items[0].date).toBe("marzo 2023");
    // Must NOT be raw ISO
    expect(items[0].date).not.toBe("2023-03-15");
  });

  it("shows year only for YYYY-01-01 dates", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Elena" } }),
      makeFact({ category: "achievement", key: "a1", value: { title: "Award", date: "2023-01-01" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "en");
    const ach = page.sections.find((s) => s.type === "achievements");
    const items = (ach!.content as { items: { date?: string }[] }).items;
    expect(items[0].date).toBe("2023");
  });
});
```

**Step 3: Run both tests — expect FAIL**

Run: `npx vitest run tests/evals/format-date.test.ts tests/evals/achievements-date-format.test.ts`

**Step 4: Implement**

4a. Create `src/lib/i18n/format-date.ts`:

```typescript
const MONTH_NAMES: Record<string, string[]> = {
  en: ["January","February","March","April","May","June","July","August","September","October","November","December"],
  it: ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"],
  de: ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"],
  fr: ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"],
  es: ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"],
  pt: ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"],
  ja: ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"],
  zh: ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"],
};

export function formatFactDate(isoDate: string, language: string): string {
  if (!isoDate) return "";
  if (/^\d{4}$/.test(isoDate)) return isoDate;
  const match = isoDate.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (!match) return isoDate;
  const year = match[1];
  const month = parseInt(match[2], 10);
  const day = match[3] ? parseInt(match[3], 10) : undefined;
  if (month === 1 && day === 1) return year;
  const months = MONTH_NAMES[language] ?? MONTH_NAMES.en;
  return `${months[month - 1] ?? String(month)} ${year}`;
}
```

4b. In `buildAchievementsSection()` (page-composer.ts, line 779-780), format the date:

```typescript
import { formatFactDate } from "@/lib/i18n/format-date";

// In buildAchievementsSection, where date is extracted:
const date = str(v.date);
if (date) item.date = formatFactDate(date, language);
```

**Step 5: Run both tests — expect PASS**

**Step 6: Full suite, commit**

```bash
git add src/lib/i18n/format-date.ts src/lib/services/page-composer.ts tests/evals/format-date.test.ts tests/evals/achievements-date-format.test.ts
git commit -m "fix(H6): format ISO dates in achievements

formatFactDate() utility: YYYY-01-01 → year, YYYY-MM-DD → 'marzo 2023'.
Applied in buildAchievementsSection so components receive formatted strings.
Unit test (utility) + integration test (through composer)."
```

---

## Sprint 3: Medium + Low Priority Fixes (M1–M6, L1–L4)

### Task 11: M1+M2+M3 — UI L10N centralization

Create central UI strings file and localize all builder components.

**Files:**
- Create: `src/lib/i18n/ui-strings.ts`
- Modify: 8 components (ChatInput, SplitView, BuilderNavBar, SettingsPanel, SignupModal, OwnerBanner, VisitorBanner, ProposalBanner)
- Test: `tests/evals/ui-strings.test.ts` (create)

**Step 1: Write the failing test**

Create `tests/evals/ui-strings.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { getUiL10n, type UiStrings } from "@/lib/i18n/ui-strings";

describe("UI L10N strings", () => {
  const REQUIRED_KEYS: (keyof UiStrings)[] = [
    "chat", "typeMessage", "send", "pageWillAppear", "startChatting",
    "openSettings", "closeSettings",
    "settings", "language", "theme", "color", "light", "dark", "font", "layout",
    "signUpToPublish", "publish", "publishAs", "publishing", "livePage",
    "editYourPage", "share", "logOut", "loggingOut", "logIn",
    "createYourAccount", "signUpToPublishPage", "username", "email",
    "password", "atLeast8Chars", "signUpAndPublish", "alreadyHaveAccount",
    "usernameRequired", "emailRequired", "passwordTooShort",
    "registrationFailed", "networkError",
    "improvementsReady", "review", "pageImprovements",
    "current", "proposed", "accept", "reject", "acceptAll",
  ];

  for (const lang of ["en", "it", "de"] as const) {
    it(`${lang}: all required keys present and non-empty`, () => {
      const strings = getUiL10n(lang);
      for (const key of REQUIRED_KEYS) {
        expect(strings[key], `${lang}: missing or empty '${key}'`).toBeTruthy();
      }
    });
  }

  it("falls back to English for unknown language", () => {
    const strings = getUiL10n("xx" as never);
    expect(strings.send).toBe("Send");
  });

  it("Italian strings are in Italian", () => {
    const strings = getUiL10n("it");
    expect(strings.send).toBe("Invia");
    expect(strings.settings).toBe("Impostazioni");
  });
});
```

**Step 2: Run test — expect FAIL**

**Step 3: Create `src/lib/i18n/ui-strings.ts`**

Define `UiStrings` type with ~40 keys, then `UI_L10N: Record<string, UiStrings>` for 8 languages. Export `getUiL10n(lang: string): UiStrings`.

```typescript
export type UiStrings = {
  chat: string;
  typeMessage: string;
  send: string;
  pageWillAppear: string;
  startChatting: string;
  openSettings: string;
  closeSettings: string;
  settings: string;
  language: string;
  theme: string;
  color: string;
  light: string;
  dark: string;
  font: string;
  layout: string;
  signUpToPublish: string;
  publish: string;
  publishAs: string; // template: "Publish as {0}"
  publishing: string;
  livePage: string;
  editYourPage: string;
  share: string;
  logOut: string;
  loggingOut: string;
  logIn: string;
  createYourAccount: string;
  signUpToPublishPage: string;
  username: string;
  email: string;
  password: string;
  atLeast8Chars: string;
  signUpAndPublish: string;
  alreadyHaveAccount: string;
  usernameRequired: string;
  emailRequired: string;
  passwordTooShort: string;
  registrationFailed: string;
  networkError: string;
  improvementsReady: string;
  review: string;
  pageImprovements: string;
  current: string;
  proposed: string;
  accept: string;
  reject: string;
  acceptAll: string;
};

const en: UiStrings = { typeMessage: "Type a message...", send: "Send", /* ... */ };
const it: UiStrings = { typeMessage: "Scrivi un messaggio...", send: "Invia", /* ... */ };
// ... de, fr, es, pt, ja, zh

const UI_L10N: Record<string, UiStrings> = { en, it, de, fr, es, pt, ja, zh };

export function getUiL10n(lang: string): UiStrings {
  return UI_L10N[lang] ?? UI_L10N.en;
}
```

**Step 4: Update each component**

Each component: accept `language` prop → call `getUiL10n(language)` → replace hardcoded strings.

Thread `language` prop: `SplitView` already has it, pass to `ChatInput`, `BuilderNavBar`, `SettingsPanel`, `SignupModal`, `ProposalBanner`. For `OwnerBanner` and `VisitorBanner`, thread via `[username]/page.tsx` (published page — these banners are rendered by `PageRenderer`, not by `builder/page.tsx`).

**Step 5: Run test — expect PASS**

**Step 6: Full suite, commit**

```bash
git add src/lib/i18n/ui-strings.ts src/components/chat/ChatInput.tsx src/components/layout/SplitView.tsx src/components/layout/BuilderNavBar.tsx src/components/settings/SettingsPanel.tsx src/components/auth/SignupModal.tsx src/components/page/OwnerBanner.tsx src/components/page/VisitorBanner.tsx src/components/builder/ProposalBanner.tsx tests/evals/ui-strings.test.ts
git commit -m "fix(M1+M2+M3): centralize UI L10N — 45+ keys × 8 langs

getUiL10n() accessor with English fallback. Localize ChatInput, SplitView,
BuilderNavBar, SettingsPanel, SignupModal, OwnerBanner, VisitorBanner,
ProposalBanner."
```

---

### Task 12: M4 — Music artist deduplication

Agent stores `title: "Norah Jones"` and `artist: "Norah Jones"`. Component shows both.

**Files:**
- Modify: `src/lib/services/page-composer.ts` (buildMusicSection)
- Test: `tests/evals/music-dedup.test.ts` (create)

**Step 1: Write the failing test**

Create `tests/evals/music-dedup.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => { process.env.EXTENDED_SECTIONS = "true"; });

import { composeOptimisticPage } from "@/lib/services/page-composer";

function makeFact(overrides: Record<string, unknown>) {
  return {
    id: `f-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: "s1", category: "music", key: "m1", value: {},
    visibility: "public" as const, confidence: 1, source: "agent" as const,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("music section dedup", () => {
  const baseFacts = [
    { ...makeFact({}), category: "identity", key: "name", value: { name: "Elena" } },
  ];

  it("removes artist when same as title", () => {
    const facts = [
      ...baseFacts,
      makeFact({ key: "m1", value: { title: "Norah Jones", artist: "Norah Jones" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "en");
    const music = page.sections.find((s) => s.type === "music");
    const items = (music!.content as { items: { title: string; artist?: string }[] }).items;
    expect(items[0].title).toBe("Norah Jones");
    expect(items[0].artist).toBeUndefined();
  });

  it("keeps artist when different from title", () => {
    const facts = [
      ...baseFacts,
      makeFact({ key: "m2", value: { title: "Kind of Blue", artist: "Miles Davis" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "en");
    const music = page.sections.find((s) => s.type === "music");
    const items = (music!.content as { items: { title: string; artist?: string }[] }).items;
    expect(items[0].artist).toBe("Miles Davis");
  });
});
```

**Step 2: Run test — expect FAIL**

Run: `npx vitest run tests/evals/music-dedup.test.ts`

**Step 3: Implement**

In `buildMusicSection()` (line 864-865), dedup:

```typescript
const artist = str(v.artist);
// Dedup: suppress artist if same as title
if (artist && artist.toLowerCase() !== title?.toLowerCase()) item.artist = artist;
```

**Step 4: Run test — expect PASS**

**Step 5: Full suite, commit**

```bash
git add src/lib/services/page-composer.ts tests/evals/music-dedup.test.ts
git commit -m "fix(M4): deduplicate artist in music section

Suppress artist when same as title (case-insensitive)."
```

---

### Task 13: M5 — Activity type localization

Raw `activityType` like "volunteering" shown in Italian page.

**Files:**
- Modify: `src/lib/i18n/ui-strings.ts` (add activity type keys)
- Modify: `src/lib/services/page-composer.ts` (localize in buildActivitiesSection)
- Test: `tests/evals/activity-type-l10n.test.ts` (create)

**Step 1: Write the failing test**

Create `tests/evals/activity-type-l10n.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => { process.env.EXTENDED_SECTIONS = "true"; });

import { composeOptimisticPage } from "@/lib/services/page-composer";

function makeFact(overrides: Record<string, unknown>) {
  return {
    id: `f-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: "s1", category: "activity", key: "a1", value: {},
    visibility: "public" as const, confidence: 1, source: "agent" as const,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("activity type L10N", () => {
  const baseFacts = [
    { ...makeFact({}), category: "identity", key: "name", value: { name: "Elena" } },
  ];

  it("localizes 'volunteering' to Italian", () => {
    const facts = [
      ...baseFacts,
      makeFact({ key: "a1", value: { name: "Croce Rossa", activityType: "volunteering" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "it");
    const act = page.sections.find((s) => s.type === "activities");
    const items = (act!.content as { items: { name: string; activityType?: string }[] }).items;
    expect(items[0].activityType).not.toBe("volunteering");
    expect(items[0].activityType).toBe("volontariato");
  });

  it("passes through unknown activity types unchanged", () => {
    const facts = [
      ...baseFacts,
      makeFact({ key: "a2", value: { name: "Climbing", activityType: "sport" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "it");
    const act = page.sections.find((s) => s.type === "activities");
    const items = (act!.content as { items: { name: string; activityType?: string }[] }).items;
    expect(items[0].activityType).toBe("sport");
  });
});
```

**Step 2: Run test — expect FAIL**

Run: `npx vitest run tests/evals/activity-type-l10n.test.ts`

**Step 3: Implement**

3a. Add activity type keys to `UiStrings` in `ui-strings.ts`:

```typescript
activityVolunteering: string;
activityMentoring: string;
activityHobby: string;
```

Add values per language (en: "volunteering"/"mentoring"/"hobby", it: "volontariato"/"mentoring"/"hobby", de: "Ehrenamt"/"Mentoring"/"Hobby", etc.).

3b. In `buildActivitiesSection()` in `page-composer.ts` (~line 962):

```typescript
import { getUiL10n } from "@/lib/i18n/ui-strings";

// Inside buildActivitiesSection, after extracting activityType:
const t = getUiL10n(language);
const ACTIVITY_TYPE_L10N: Record<string, string> = {
  volunteering: t.activityVolunteering,
  mentoring: t.activityMentoring,
  hobby: t.activityHobby,
};
if (activityType) item.activityType = (ACTIVITY_TYPE_L10N[activityType] ?? activityType) as ActivityItem["activityType"];
```

**Step 4: Run test — expect PASS**

**Step 5: Full suite, commit**

```bash
git add src/lib/i18n/ui-strings.ts src/lib/services/page-composer.ts tests/evals/activity-type-l10n.test.ts
git commit -m "fix(M5): localize activity types in composer

Map volunteering/mentoring/hobby to localized strings via ui-strings.
Unknown types pass through unchanged."
```

---

### Task 14: M6 — Role casing fix

`lowerRole("Graphic Designer", "it")` → "graphic Designer". Should be "graphic designer".

**Files:**
- Modify: `src/lib/services/page-composer.ts` (lowerRole function)
- Test: `tests/evals/lower-role.test.ts` (create)

**Step 1: Write the failing test**

Create `tests/evals/lower-role.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => { process.env.EXTENDED_SECTIONS = "true"; });

import { composeOptimisticPage } from "@/lib/services/page-composer";

function makeFact(overrides: Record<string, unknown>) {
  return {
    id: `f-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: "s1", category: "identity", key: "name",
    value: { name: "Elena" }, visibility: "public" as const,
    confidence: 1, source: "agent" as const,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("role casing in bio", () => {
  it("lowercases entire role in Italian bio", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Elena Rossi" } }),
      makeFact({ category: "identity", key: "role", value: { role: "Graphic Designer" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "it");
    const bio = page.sections.find((s) => s.type === "bio");
    const text = (bio!.content as { text: string }).text;
    expect(text).toContain("graphic designer");
    expect(text).not.toContain("graphic Designer");
  });

  it("preserves capitalization in German", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Elena Rossi" } }),
      makeFact({ category: "identity", key: "role", value: { role: "Grafikdesignerin" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "de");
    const bio = page.sections.find((s) => s.type === "bio");
    const text = (bio!.content as { text: string }).text;
    expect(text).toContain("Grafikdesignerin");
  });
});
```

**Step 2: Run test — expect FAIL**

Run: `npx vitest run tests/evals/lower-role.test.ts`

**Step 3: Fix `lowerRole()` (line 329)**

```typescript
// Before:
return role[0].toLowerCase() + role.slice(1);

// After:
return role.toLowerCase();
```

**Step 4: Run test — expect PASS**

**Step 5: Full suite, commit**

```bash
git add src/lib/services/page-composer.ts tests/evals/lower-role.test.ts
git commit -m "fix(M6): lowercase entire role, not just first letter

lowerRole() now uses role.toLowerCase() for non-German languages.
'Graphic Designer' → 'graphic designer'."
```

---

### Task 15: L1 — `/api/proposals` 500 on first load

**Root cause analysis:**
- `getAuthContext(req)` ALWAYS sets `profileId` when `auth` is non-null (falls back to `sessionId` at line 80 of `session.ts`). So `!auth?.profileId` is dead code — it can never be true.
- The actual 500 path: `markStaleProposals(auth.profileId)` calls `resolveOwnerScopeForWorker(ownerKey)` → `allSessionIdsForProfile(ownerKey)` → then reads facts, soul, etc. On a fresh session, the `getActiveSoul(ownerKey)` call or `filterPublishableFacts()` may throw (e.g., schema not ready, edge case in owner scope resolution).
- **Fix**: Wrap `markStaleProposals` in a try/catch in the route handler. If it throws, log the error and continue — stale marking is an optimization, not critical. Return proposals (possibly empty) regardless.

**Files:**
- Modify: `src/app/api/proposals/route.ts`
- Test: `tests/evals/proposals-route-500.test.ts` (create — existing `proposal-api.test.ts` only has service-level mocks, no route-level test infrastructure)

**Step 1: Write failing test**

Create `tests/evals/proposals-route-500.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist mocks before imports
const mockGetAuthContext = vi.fn();
const mockGetSessionIdFromRequest = vi.fn();
const mockMarkStaleProposals = vi.fn();
const mockGetPendingProposals = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  getAuthContext: mockGetAuthContext,
  getSessionIdFromRequest: mockGetSessionIdFromRequest,
}));

vi.mock("@/lib/services/proposal-service", () => ({
  markStaleProposals: mockMarkStaleProposals,
  getPendingProposals: mockGetPendingProposals,
}));

vi.mock("@/lib/services/event-service", () => ({
  logEvent: vi.fn(),
}));

import { GET } from "@/app/api/proposals/route";

function makeRequest(): Request {
  return new Request("http://localhost:3000/api/proposals", { method: "GET" });
}

describe("GET /api/proposals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no auth", async () => {
    mockGetAuthContext.mockReturnValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 200 with proposals when markStaleProposals succeeds", async () => {
    mockGetAuthContext.mockReturnValue({ sessionId: "s1", profileId: "p1", userId: null, username: null });
    mockMarkStaleProposals.mockReturnValue(0);
    mockGetPendingProposals.mockReturnValue([{ id: "pr1", sectionType: "bio" }]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.proposals).toHaveLength(1);
  });

  it("returns 200 with empty proposals when markStaleProposals throws", async () => {
    mockGetAuthContext.mockReturnValue({ sessionId: "s1", profileId: "p1", userId: null, username: null });
    mockMarkStaleProposals.mockImplementation(() => { throw new Error("resolveOwnerScopeForWorker failed"); });
    mockGetPendingProposals.mockReturnValue([]);
    const res = await GET(makeRequest());
    // Should NOT be 500 — the try/catch should absorb the error
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.proposals).toEqual([]);
  });
});
```

**Step 2: Run test — expect FAIL**

Run: `npx vitest run tests/evals/proposals-route-500.test.ts`
Expected: FAIL on 3rd test — `markStaleProposals` throwing causes unhandled 500.

**Step 3: Fix**

In `src/app/api/proposals/route.ts`, wrap `markStaleProposals` in try/catch:

```typescript
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { markStaleProposals, getPendingProposals } from "@/lib/services/proposal-service";

export async function GET(req: Request) {
  const auth = getAuthContext(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // markStaleProposals is an optimization — if it fails (e.g., fresh session,
  // schema not ready), continue and return proposals (possibly empty).
  try {
    markStaleProposals(auth.profileId);
  } catch (err) {
    console.warn("[proposals] markStaleProposals failed (best-effort):", err);
  }

  const proposals = getPendingProposals(auth.profileId);
  return NextResponse.json({ proposals });
}
```

**Step 4: Run test — expect PASS**

Run: `npx vitest run tests/evals/proposals-route-500.test.ts`
Expected: PASS — all 3 tests green.

**Step 5: Full suite**

Run: `npx vitest run`
Expected: All tests pass.

**Step 6: Commit**

```bash
git add src/app/api/proposals/route.ts tests/evals/proposals-route-500.test.ts
git commit -m "fix(L1): proposals API catches markStaleProposals error on first load

markStaleProposals → resolveOwnerScopeForWorker can throw on fresh sessions.
Wrap in try/catch — stale marking is best-effort. Returns 200 + empty array
instead of 500."
```

---

### Task 16: L2 — `prompts.ts` module not found (HMR) — root-cause investigation

**Root cause from server log:** `Module not found: Can't resolve '@/lib/agent/policies/index'` at `prompts.ts:3:1`. The directory `src/lib/agent/policies/` exists with `index.ts`.

**Step 1: Reproduce minimally**

1. Stop dev server
2. Delete `.next` cache: `rm -rf .next`
3. Start dev server: `npm run dev`
4. Open browser to `http://localhost:3000/builder`
5. Send a chat message (triggers `POST /api/chat` → imports `prompts.ts`)
6. Check server console for the error

**Step 2: Diagnose**

Check `src/lib/agent/prompts.ts` line 3:
```typescript
import { getJourneyPolicy, getSituationDirectives, getExpertiseCalibration } from "@/lib/agent/policies/index";
```

If the import uses explicit `/index` suffix — this can confuse Next.js HMR module resolver. Try:
```typescript
import { getJourneyPolicy, getSituationDirectives, getExpertiseCalibration } from "@/lib/agent/policies";
```

**Step 3: If explicit `/index` is the cause**

Fix: remove `/index` suffix. Run repro steps again, verify error is gone.

**Step 4: If explicit `/index` is NOT the cause**

Check for circular imports in the chain: `chat/route.ts → context.ts → prompts.ts → policies/index.ts → ...`. Use `madge --circular src/lib/agent/` or manual trace. Fix the circular dependency.

**Step 5: Commit**

```bash
git commit -m "fix(L2): resolve HMR module-not-found for policies import

[specific fix description based on root cause]"
```

**Acceptance criteria:** After fix, fresh dev server start → navigate to builder → send chat message → NO "Module not found" error in server console. Verify 3 times (dev server restart between each).

---

### Task 17: L3 — Website not shown in any section

**Root cause:** Website fact stored in `contact` category with `type: "website"`. `buildHeroSection()` only processes `social`-category facts for `socialLinks`. `buildContactSection()` processes contact facts but shows as `type: "other"`.

**Files:**
- Modify: `src/lib/services/page-composer.ts` (buildHeroSection — include website contacts)
- Test: `tests/evals/website-in-hero.test.ts` (create)

**Step 1: Write failing test**

Create `tests/evals/website-in-hero.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => { process.env.EXTENDED_SECTIONS = "true"; });

import { composeOptimisticPage } from "@/lib/services/page-composer";

function makeFact(overrides: Record<string, unknown>) {
  return {
    id: `f-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: "s1", category: "identity", key: "name",
    value: { name: "Elena" }, visibility: "public" as const,
    confidence: 1, source: "agent" as const,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("website in hero socialLinks", () => {
  it("includes website-type contact fact in hero socialLinks", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Elena Rossi" } }),
      makeFact({ category: "contact", key: "web", value: { type: "website", value: "elenarossi.design" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "en");
    const hero = page.sections.find((s) => s.type === "hero");
    const socialLinks = (hero!.content as { socialLinks?: { platform: string; url: string }[] }).socialLinks;
    expect(socialLinks).toBeDefined();
    expect(socialLinks!.some((l) => l.platform === "website")).toBe(true);
    expect(socialLinks!.find((l) => l.platform === "website")!.url).toContain("elenarossi.design");
  });

  it("prepends https:// if missing", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Elena" } }),
      makeFact({ category: "contact", key: "web", value: { type: "website", value: "example.com" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "en");
    const hero = page.sections.find((s) => s.type === "hero");
    const socialLinks = (hero!.content as { socialLinks?: { platform: string; url: string }[] }).socialLinks;
    expect(socialLinks![0].url).toBe("https://example.com");
  });
});
```

**Step 2: Run test — expect FAIL**

**Step 3: Implement**

In `buildHeroSection()`, after the social links loop (~line 423), add:

```typescript
// Include website-type contact facts in hero social links
for (const f of contactFacts ?? []) {
  const v = val(f);
  if (str(v.type) === "website") {
    const url = str(v.value) ?? str(v.url);
    if (url) {
      socialLinks.push({ platform: "website", url: url.startsWith("http") ? url : `https://${url}` });
    }
  }
}
```

**Step 4: Run test — expect PASS**

**Step 5: Full suite, commit**

```bash
git add src/lib/services/page-composer.ts tests/evals/website-in-hero.test.ts
git commit -m "fix(L3): include website contact facts in hero socialLinks

Contact facts with type='website' are added to hero socialLinks.
Prepends https:// if missing."
```

---

### Task 18: L4 — Homepage loads stale preview API — root-cause investigation

**Observation:** Dev server log shows `GET /api/preview?username=draft&language=it 401` immediately after `GET / 200`. But `src/app/page.tsx` has zero API calls — it's a static marketing page.

**Step 1: Reproduce with clean state**

1. Stop dev server, delete DB, clear `.next`
2. Start dev server
3. Open browser in **incognito mode** (no stale tabs/cookies/service workers)
4. Navigate to `http://localhost:3000/`
5. Check server logs: does `/api/preview` appear?
6. Check browser DevTools Network tab: who initiates the `/api/preview` request?

**Step 2: Classify result**

- **If NO `/api/preview` call in incognito:** The call was from a stale browser tab/session from previous UAT. Mark as "not a code bug — stale browser state". Close finding.
- **If `/api/preview` IS called in incognito:** Check the Network tab's Initiator column to find which script triggers it. Likely candidates:
  - `src/app/layout.tsx` (root layout with a preview useEffect)
  - Service Worker
  - A prefetch in Next.js Link component

**Step 3: Fix (only if code bug confirmed)**

If root layout or similar has a preview call, remove it. If prefetch, add `prefetch={false}`.

**Step 4: Commit (only if fix applied)**

```bash
git commit -m "fix(L4): remove stale preview API call from [location]"
```

**Acceptance criteria:** In incognito browser, navigating to `http://localhost:3000/` produces ZERO `/api/preview` requests in the Network tab.

---

### Task 19: Sprint 3 integration test + final UAT

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 2: Full UAT re-run**

Clean DB, restart server, repeat the original UAT scenario: invite → builder → 5-6 Italian messages → publish → post-publish editing. Verify all 21 findings are resolved.

**Step 3: Commit any final fixups**

---

## Summary

| Sprint | Tasks | Findings | Key Files |
|--------|-------|----------|-----------|
| 1 | 1–5 | C1, C2, C3, C4, C5 | tools.ts, page-composer.ts, contracts.ts, draft/style/route.ts, prompts.ts |
| 2 | 6–10 | H1, H2, H3, H4, H5, H6 | Layout.tsx, globals.css, page-composer.ts, AtAGlance.tsx, format-date.ts, builder/page.tsx |
| 3 | 11–18 | M1–M6, L1–L4 | ui-strings.ts, 8 components, page-composer.ts, proposals/route.ts, prompts.ts |

Total: 19 tasks, ~30 files, ~14 new test files.

### Blocker Resolution Log

| # | Blocker | Resolution |
|---|---------|------------|
| P0-1 | C2 idempotency: wrong hash comparison | Use `computeConfigHash()` from `page-service.ts` (SHA-256 of full config JSON) vs `draft.configHash` (same function) |
| P0-2 | C2 regression: lost order/locks | Use `projectCanonicalConfig()` with `DraftMeta` (includes `sections` array for order + lock merge) instead of raw `composeOptimisticPage()` |
| P1-3 | C5 wrong API file | Changed from `preferences/route.ts` to `src/app/api/draft/style/route.ts` (line 70) |
| P1-4 | H5 hypothetical | Changed to root-cause investigation task with explicit repro steps and acceptance criteria |
| P1-5 | L2 speculative | Changed to root-cause investigation task with 3× reproduction verification |
| P2-6 | H6 no integration test | Added `achievements-date-format.test.ts` that verifies through `composeOptimisticPage()` |
| P2-7 | M5 incomplete TDD | Added full test (fail→fix→pass), git add, complete commit command |
| P2-8 | L4 no acceptance criteria | Added objective criterion: zero `/api/preview` requests in incognito browser Network tab |

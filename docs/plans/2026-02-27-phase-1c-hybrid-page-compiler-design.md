# Phase 1c: Hybrid Page Compiler — Design Document

**Date**: 2026-02-27
**Status**: Approved
**Approach**: Inline personalizer with fire-and-forget synthesis (Approach A hybrid)

## Overview

Phase 1c evolves page composition from purely deterministic templates to a hybrid model.
Structure remains governed by schema and layout contracts. Content (copy, descriptions, tone)
is generated per-section by the LLM, grounded in facts and informed by the agent's accumulated
understanding of the user (soul profile, memories, conversation summaries).

**Four pillars:**

1. **Per-section LLM Personalizer** — rewrites text fields using facts + memory + soul voice
2. **Drill-down conversation** — agent deepens thin topics before updating sections
3. **Section copy cache** — content-addressed cache avoids redundant LLM calls
4. **Conformity checks** — weekly heartbeat job ensures cross-section coherence

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | All four pillars together | Complete feature, no partial states |
| LLM creativity | Moderate | Text fields personalized, structured fields from facts |
| Drill-down trigger | New/thin sections only | Rich sections update immediately |
| Preview UX | Visual shimmer indicator | Transparent synthesis state |
| Conformity schedule | Deep heartbeat (weekly) | Low cost, non-blocking |
| Synthesis architecture | Fire-and-forget in web process | Simpler than worker job, context already in memory |
| Onboarding | Deterministic only | Too many rapid changes for synthesis |

---

## 1. Personalizer Core

### New module: `src/lib/services/section-personalizer.ts`

**Main function:**

```typescript
personalizeSections(
  sections: Section[],
  impactedTypes: ComponentType[],
  context: PersonalizerContext
): Promise<PersonalizeResult>
```

**Types:**

```typescript
type PersonalizerContext = {
  facts: FactRow[];
  soul: CompiledSoul | null;
  memories: MemoryRow[];
  summary: string | null;
  language: string;
  username: string;
};

type PersonalizeResult = {
  sections: Section[];        // merged: personalized where successful, original elsewhere
  personalizedIds: string[];  // section ids rewritten successfully
  failedIds: string[];        // section ids where LLM failed -> kept deterministic
};
```

### Per-section logic

For each impacted section:

1. Build section-specific prompt (relevant facts + soul voice + type-specific instructions)
2. Call LLM (Haiku) via `generateObject` (Vercel AI SDK) for structured output
3. Validate output against section content Zod schema
4. Merge: text fields from LLM, structured fields from original facts
5. Fallback: if validation fails, keep deterministic version

### Personalizable fields by section type

| Type | Personalizable fields | Invariant fields (from facts) |
|------|----------------------|-------------------------------|
| bio | `text` | — |
| hero | `tagline` | `name` |
| experience | `items[].description` | `title`, `company`, `period`, `current` |
| education | `items[].description` | `institution`, `degree`, `field`, `period` |
| skills | `groups[].label` | `groups[].skills` |
| projects | `items[].description` | `name`, `url`, `tech` |
| interests | `title` | `items` |
| achievements | `items[].description` | `items[].title`, `items[].year` |
| activities | `items[].description` | `items[].name` |

Sections with no personalizable fields (reading, music, contact, languages, stats, social, footer)
are **never sent to the personalizer**.

### Cost estimate

- ~8-10 personalizable sections per typical page
- Haiku: ~$0.001/section (~500 token prompt, ~200 token output)
- Full-page synthesis: ~$0.01
- With cache: most regens are 1-3 sections -> ~$0.003

---

## 2. Section Copy Cache

### New module: `src/lib/services/section-cache.ts`

Content-addressed cache: if relevant facts + soul voice haven't changed, reuse personalized text.

### Schema (migration `0018_section_copy_cache.sql`)

```sql
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

ALTER TABLE page ADD COLUMN synthesis_status TEXT DEFAULT NULL;
```

### Functions

```typescript
computeSectionCacheKey(
  sectionType: ComponentType,
  relevantFacts: FactRow[],
  soul: CompiledSoul | null,
  language: string
): { factsHash: string; soulHash: string }

getCachedContent(
  ownerKey: string, sectionType: ComponentType,
  factsHash: string, soulHash: string, language: string
): Promise<Record<string, unknown> | null>

setCachedContent(
  ownerKey: string, sectionType: ComponentType,
  factsHash: string, soulHash: string, language: string,
  content: Record<string, unknown>
): Promise<void>
```

### Section-to-category mapping

```typescript
const SECTION_FACT_CATEGORIES: Record<ComponentType, string[]> = {
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
```

Only facts in relevant categories contribute to the hash. A new "music" fact does not
invalidate the bio cache.

### Invalidation

No explicit invalidation. Content-addressed: changed facts/soul = new hash = new entry.
Orphaned entries cleaned up by deep heartbeat (30-day TTL).

---

## 3. Two-Lane Preview + Visual Indicators

### Draft model

Single config in draft (no dual storage). The flow:

1. `generate_page` saves deterministic config + `synthesis_status = "pending"`
2. Personalizer finishes -> overwrites config with merged version + `synthesis_status = "ready"`
3. On failure -> `synthesis_status = "failed"`, config stays deterministic

### SSE payload changes

```typescript
type PreviewEvent = {
  status: "optimistic_ready" | "synthesis_ready" | "keepalive";
  synthesisStatus: "pending" | "ready" | "failed" | null;
  synthesizingSections?: string[];  // section ids currently being synthesized
  config: PageConfig;
  configHash: string;
  publishableHash: string;
};
```

### Client behavior (SplitView / PageRenderer)

```typescript
type SectionSynthesisState = "stable" | "synthesizing" | "just_synthesized";
```

- `synthesisStatus: "pending"` -> mark impacted sections as `"synthesizing"`
- `"synthesizing"` state: CSS shimmer overlay on section (content remains visible)
- `synthesisStatus: "ready"` -> brief fade transition -> `"just_synthesized"` for 2s -> `"stable"`
- `synthesisStatus: "failed"` -> shimmer disappears silently

### CSS shimmer

```css
.section-synthesizing {
  position: relative;
}
.section-synthesizing::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, var(--theme-accent, rgba(255,255,255,0.15)), transparent);
  animation: shimmer 1.5s infinite;
  pointer-events: none;
  border-radius: inherit;
}
```

Only personalizable sections show shimmer. Structural sections (contact, stats, social, footer)
never shimmer.

---

## 4. Drill-Down Conversation Pattern

### Prompt-driven, not code-driven

The drill-down is an agent behavior controlled via system prompt + a context helper.

### New helper: `src/lib/agent/section-richness.ts`

```typescript
type SectionRichness = {
  sectionType: ComponentType;
  factCount: number;
  hasDescription: boolean;
  richness: "empty" | "thin" | "rich";
};

getSectionRichness(facts: FactRow[], sectionType: ComponentType): SectionRichness
```

**Thresholds:**
- `"empty"`: 0 facts in category
- `"thin"`: 1-2 facts, or facts without descriptive fields
- `"rich"`: 3+ facts with at least one descriptive field populated

### Context integration

Added to `assembleContext()` as a new block (~200 token budget, from existing margin):

```
## Section Richness
- education: thin (1 fact, no description)
- experience: rich (4 facts)
- skills: rich (8 facts)
- projects: empty
```

### Prompt instructions (added to steady_state prompt)

```
When the user mentions a topic that maps to a THIN or EMPTY section:
- Ask 1-2 follow-up questions to enrich the facts before updating the page
- Do NOT ask more than 2 questions — avoid feeling like an interrogation
- After collecting answers, create the facts AND call generate_page

When the topic maps to a RICH section:
- Create/update facts immediately and call generate_page
```

---

## 5. Conformity Checks

### New handler: `src/lib/worker/conformity.ts`

```typescript
type ConformityIssue = {
  sectionId: string;
  issueType: "tone_drift" | "contradiction" | "stale_content";
  description: string;
  severity: "low" | "medium";
};

type ConformityResult = {
  issues: ConformityIssue[];
  sectionsToRegenerate: string[];
  cost: number;
};

handleConformityCheck(ownerKey: string): Promise<ConformityResult>
```

### Flow

1. Read draft config + compiled soul + public facts
2. Skip if no personalized sections (`synthesis_status !== "ready"`)
3. Single LLM call with all personalizable section texts + soul voice
4. Parse structured output (array of ConformityIssue)
5. If sections need regeneration -> call `personalizeSections()` (max 3 per run)
6. Log result in trust ledger

### Integration in deep heartbeat

```
handleHeartbeatDeep:
  1. expireStaleProposals(48)
  2. dismissOldConflicts(ownerKey, 7)
  3. handleConformityCheck(ownerKey)      <- NEW
  4. cleanupSectionCache(ownerKey, 30)    <- NEW
```

**Cost:** ~$0.005 per check (~2000 token prompt, ~300 token output). Weekly per owner.

**Guardrails:** Respects `llm_limits` budget. Skips if never synthesized. Never blocks publish.
Max 3 section regenerations per run.

---

## 6. Integration in `generate_page` Flow

### Modified flow

```
generate_page tool:
  1. Read facts -> composeOptimisticPage() -> save draft (synthesis_status="pending")
  2. Compute impactedSections via impact detector
  3. Return to agent (immediate response to user)
  4. Fire-and-forget: personalizeSections() in background
     -> success: update draft config + synthesis_status="ready"
     -> failure: synthesis_status="failed"
```

### Fire-and-forget pattern

```typescript
// After saving optimistic draft:
const optimisticHash = hashConfig(optimisticConfig);

synthesizeInBackground(ownerKey, username, optimisticConfig, impactedTypes, context)
  .catch(err => {
    logger.error("Synthesis failed", { ownerKey, err });
    setSynthesisStatus(ownerKey, "failed");
  });

return { success: true, sections: ... };
```

Not a worker job. The web process already has all context in memory.

### Impact detection: `src/lib/services/impact-detector.ts`

```typescript
type ImpactResult = {
  impactedTypes: ComponentType[];
  reason: "new_facts" | "updated_facts" | "soul_changed" | "full_regen";
};

detectImpactedSections(
  ownerKey: string,
  previousFactsHash: string | null,
  currentFacts: FactRow[],
  previousSoulHash: string | null,
  currentSoul: CompiledSoul | null
): ImpactResult
```

Logic:
1. No previous hash -> `full_regen` (all personalizable sections)
2. Soul hash changed -> `soul_changed` (all personalizable sections)
3. Otherwise: diff facts by category -> map to impacted sections via `SECTION_FACT_CATEGORIES`

Previous hashes come from existing `section_copy_cache` entries. No new table needed.

### When NOT to synthesize

- No impacted sections (facts changed only in non-personalizable categories)
- Full cache hit (all impacted sections already cached)
- Budget exhausted (`llm_limits`)
- Onboarding mode (deterministic only, too many rapid changes)

### Race condition guard

Before saving synthesis result, verify optimistic hash still matches current draft:

```typescript
async function saveSynthesisResult(ownerKey, result, expectedOptimisticHash) {
  const currentDraft = await getDraft(ownerKey);
  if (hashConfig(currentDraft.config) !== expectedOptimisticHash) {
    logger.info("Synthesis stale, discarding", { ownerKey });
    return;
  }
  await upsertDraft(ownerKey, result.mergedConfig, { synthesisStatus: "ready" });
}
```

---

## 7. Per-Section LLM Prompt Design

### Prompt template

```
You are a personal page copywriter. Rewrite the content of a "{sectionType}" section
for {username}'s personal page.

## Voice & Tone
{compiledSoul}
- Perspective: {soul.perspective || "third-person"}
- Formality: {soul.formality || "casual"}

## Facts for this section
{relevantFacts as JSON}

## Current deterministic content
{currentSection.content as JSON}

## Instructions
- Rewrite ONLY the text fields: {personalizable fields for this type}
- Keep structured fields EXACTLY as provided: {invariant fields}
- Ground everything in the facts — do not invent information
- Match the voice described above consistently
- Write in {language}
- Keep it concise: {maxWords} words max for each text field

## Output format
Return a JSON object matching this exact shape:
{content schema for this section type}
```

### Max words per type

| Type | Field | Max words |
|------|-------|-----------|
| bio | `text` | 120 |
| hero | `tagline` | 15 |
| experience | `items[].description` | 40 per item |
| education | `items[].description` | 40 per item |
| skills | `groups[].label` | 5 per label |
| projects | `items[].description` | 50 per item |
| interests | `title` | 8 |
| achievements | `items[].description` | 40 per item |
| activities | `items[].description` | 40 per item |

### Structured output via `generateObject`

```typescript
const result = await generateObject({
  model: getModel(),
  schema: sectionContentSchema[sectionType],
  prompt: buildPersonalizerPrompt(section, context),
  maxRetries: 1,
});
```

### Zod schemas: `src/lib/services/personalizer-schemas.ts`

One Zod schema per personalizable section type, matching the existing content type shapes.

### Merge strategy

```typescript
function mergePersonalized(
  original: Record<string, unknown>,
  personalized: Record<string, unknown>,
  sectionType: ComponentType
): Record<string, unknown> {
  const textFields = PERSONALIZABLE_FIELDS[sectionType];
  const result = { ...original };
  for (const field of textFields) {
    if (personalized[field] !== undefined) {
      result[field] = personalized[field];
    }
  }
  return result;
}
```

For array items (experience, education, etc.): merge only description fields per item,
keeping title/company/period from original.

**Iron rule:** If LLM returns an altered structured field, original wins.

### Language handling

Personalizer always writes in `factLanguage`. Translation remains a separate step
(same principle as current composer — composing in target language creates hybrid text).

---

## 8. Database Changes

### Migration `0018_section_copy_cache.sql`

```sql
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

ALTER TABLE page ADD COLUMN synthesis_status TEXT DEFAULT NULL;
```

No other schema changes.

---

## 9. Error Handling

Guiding principle: **deterministic is always safe**. Every failure silently reverts to template.

| Scenario | Behavior | User sees |
|----------|----------|-----------|
| LLM timeout on 1 section | Section keeps deterministic, others proceed | Shimmer disappears, content unchanged |
| LLM error on all sections | `synthesis_status = "failed"` | Shimmer disappears, full deterministic page |
| LLM output fails Zod validation | 1 retry, then deterministic fallback | Same as above |
| LLM alters structured field | Merge ignores, uses original | Correct content (from fact) |
| Budget exhausted mid-synthesis | Completed sections saved, rest deterministic | Mix of personalized + deterministic |
| DB write fails post-synthesis | Log error, draft stays optimistic | Shimmer disappears, next generate_page retries |
| Race: new generate_page during synthesis | Stale synthesis discarded (hash mismatch guard) | Shimmer resets, new synthesis starts |

---

## 10. Testing Strategy

### Unit tests (~15 new files, ~150 tests)

| Module | Key tests |
|--------|-----------|
| `section-personalizer.ts` | Mock LLM, verify merge per section type. Verify fallback on error. |
| `section-cache.ts` | Hit/miss, hash computation, cleanup old entries |
| `impact-detector.ts` | Fact delta -> impacted sections. Soul change -> full regen. No change -> empty |
| `personalizer-schemas.ts` | Zod schema validates correct output, rejects malformed |
| `section-richness.ts` | Empty/thin/rich per section type |
| `conformity.ts` | Mock LLM, verify issue parsing, max 3 regen, skip on no synthesis |
| `merge logic` | Structured field from LLM ignored, text field taken. Array items merge correct |

### Integration tests (~3 files, ~30 tests)

| Test | Verifies |
|------|----------|
| `personalizer-pipeline` | Full flow: facts -> optimistic -> synthesis -> draft updated. Cache hit/miss |
| `preview-two-lane` | SSE emits correct `synthesisStatus` through transitions |
| `race-condition` | Two rapid generate_page: stale synthesis discarded, only latest survives |

Testing patterns: same as project (mock event-service, makeFact factory, hoisted mocks, in-memory SQLite).
LLM mocked with fixed responses per section type.

No LLM evals in CI. Prompt quality evaluated manually during development.

---

## New File Map

| File | Purpose |
|------|---------|
| `src/lib/services/section-personalizer.ts` | Core personalizer (per-section LLM calls + merge) |
| `src/lib/services/section-cache.ts` | Content-addressed section copy cache |
| `src/lib/services/impact-detector.ts` | Detect which sections need re-personalization |
| `src/lib/services/personalizer-schemas.ts` | Zod schemas for per-section LLM output |
| `src/lib/agent/section-richness.ts` | Section richness helper for drill-down |
| `src/lib/worker/conformity.ts` | Conformity check handler |
| `db/migrations/0018_section_copy_cache.sql` | New table + synthesis_status column |
| `tests/evals/section-personalizer.test.ts` | Unit tests |
| `tests/evals/section-cache.test.ts` | Unit tests |
| `tests/evals/impact-detector.test.ts` | Unit tests |
| `tests/evals/personalizer-schemas.test.ts` | Unit tests |
| `tests/evals/section-richness.test.ts` | Unit tests |
| `tests/evals/conformity.test.ts` | Unit tests |
| `tests/evals/personalizer-pipeline.test.ts` | Integration test |
| `tests/evals/preview-two-lane.test.ts` | Integration test |

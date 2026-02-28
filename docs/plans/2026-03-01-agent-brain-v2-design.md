# Agent Brain v2 — Design Document

**Date:** 2026-03-01
**Status:** Approved
**Approach:** C — "Agent Brain 2.0" (refactor chirurgico)
**Scope:** Smart Facts model, Power Tools, Agent Planner, Page Coherence

---

## Problem Statement

The agent understands user intent but lacks the tools and structural support to execute reliably. Four core gaps:

1. **No item ordering** — "put TypeScript first" is impossible (no `sortOrder` on facts)
2. **No fact relationships** — "project X was at company Y" is inexpressible
3. **No batch operations** — 10 skills = 10 `create_fact` calls, exceeds `maxSteps: 5`
4. **No direct page manipulation** — can't move sections between layout slots, can't reorder items within sections

Secondary gaps: no constraint enforcement (2 "current" jobs possible), no archetype-driven conversation strategy, no cross-section coherence validation, no operation resume after step exhaustion.

---

## Section 1: Smart Facts (Evolved Fact Model)

### New Fields on `facts` Table

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `sort_order` | INTEGER NOT NULL | 0 | Intra-section ordering |
| `parent_fact_id` | TEXT | NULL | Parent-child relationship (project→experience, skill→certification) |
| `archived_at` | TEXT | NULL | Soft-delete timestamp (NULL = active) |

### sortOrder

Each fact has a numeric order within its category/section. Composers sort facts by `sort_order ASC, createdAt ASC` within each `build*Section()` function after category grouping.

`FactRow` type updated to include `sortOrder: number`.

### parentFactId

Optional FK pointing to a parent fact. Use cases:
- Project → Experience (project done during that job)
- Skill → Achievement/Certification (skill attested by certification)

Composer uses `WHERE parent_fact_id = ?` for grouping (e.g., projects under their parent experience).

On `deleteFact()`: orphan cleanup via `UPDATE facts SET parent_fact_id = NULL WHERE parent_fact_id = ?` (not cascade delete — children become top-level).

Unidirectional: only the child points to the parent. Composer does reverse lookup (`WHERE parent_fact_id = experienceId`) to find children.

### archivedAt

Soft-delete mechanism. `archived_at = ISO timestamp` means the fact is inactive.

**No auto-archival.** The heartbeat calculates relevance scores on-the-fly and injects `has_archivable_facts` situation directive. The agent proposes archival in conversation. The user decides. Agent calls `archive_fact(factId)`.

**Relevance formula** (computed in `detectSituations()` during bootstrap):
```
relevance = confidence × recencyFactor(updatedAt) × (1 + childCount × 0.1)
recencyFactor: <30d=1.0, 30-90d=0.7, 90-180d=0.4, >180d=0.2
```

Candidates with relevance < 0.3 are included in situation directive. Safety floor: never suggest archival if active fact count would drop below 5.

**Query filtering:** All fact queries add `WHERE archived_at IS NULL` except `getFactById()` (needed for unarchive and showing archived facts to user). Centralized via `getActiveFacts(ownerKey)` helper; `getAllFacts()` made private.

### Constraint Layer (in kb-service.ts)

Applied at the application level, not in the prompt.

**1. Current uniqueness (per-category):**

```typescript
const CURRENT_UNIQUE_CATEGORIES = ["experience"]; // NOT education (dual degrees are valid)
```

`createFact()` with `value.status === "current"` in a unique category → search for existing current facts. If found → throw `FactConstraintError({ code: "EXISTING_CURRENT", existingFactId, suggestion: "Update existing fact to past first" })`.

**2. Cascade check:**

After `updateFact()` on a fact that has children (`SELECT * FROM facts WHERE parent_fact_id = ?`): return warning in tool result `{ success: true, warnings: ["3 related facts reference this experience"] }`.

**3. Error pattern:**

`FactConstraintError` extends Error (same pattern as existing `FactValidationError`). Caught in the same try/catch in tools.ts. No return type changes to `createFact()`.

### Migration 0019

```sql
ALTER TABLE facts ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE facts ADD COLUMN parent_fact_id TEXT;
ALTER TABLE facts ADD COLUMN archived_at TEXT;
ALTER TABLE sessions ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}';
CREATE INDEX idx_facts_parent ON facts(parent_fact_id) WHERE parent_fact_id IS NOT NULL;
CREATE INDEX idx_facts_active ON facts(archived_at) WHERE archived_at IS NULL;
```

---

## Section 2: Power Tools

### New: `batch_facts`

Atomic N-operation tool. Create, update, delete multiple facts in a single SQLite transaction with a single `recomposeAfterMutation()` at the end.

```typescript
batch_facts({
  operations: [
    { action: "create", category: "skill", key: "typescript", value: { name: "TypeScript", level: "advanced" } },
    { action: "update", factId: "xxx", value: { status: "past", end: "2026-02" } },
    { action: "delete", factId: "yyy" },
  ]
})
```

- All-or-nothing: if any operation fails validation, entire batch rejected
- Max 20 operations per batch
- Each operation passes through constraint layer individually
- Result: `{ success: true, created: N, updated: N, deleted: N, warnings: [...] }`
- Documented in TOOL_POLICY: "batch_facts is all-or-nothing — validate data before calling"

### New: `move_section`

Move a section from one layout slot to another.

```typescript
move_section({ sectionId: "skills-1", targetSlot: "sidebar" })
```

- Validates: target slot exists in current template, accepts section type, has capacity
- Auto-widget-switch: if current widget doesn't `fitsIn` new slot size, calls `getBestWidget()` for compatible widget
- Respects locks: `lock.position = true && lockedBy = "user"` → error
- Result: `{ success: true, movedTo: "sidebar", widgetChanged: true, previousWidget: "skills-list", newWidget: "skills-chips" }`

**Critical dependency:** Requires slot carry-over in `projectCanonicalConfig()` + soft-pin in `assignSlotsFromFacts()` (see Section 4). Without this, the next `recomposeAfterMutation()` would reset the slot.

### New: `reorder_items`

Reorder facts within a section via `sortOrder`.

```typescript
reorder_items({ sectionType: "skills", factIds: ["fact-3", "fact-1", "fact-2"] })
```

- Writes `sort_order = 0, 1, 2` on specified facts
- Facts not in array keep their sortOrder (appended after)
- Single `recomposeAfterMutation()` at the end
- Guard: rejects composite section types (hero, bio, at-a-glance, footer) with clear error

### New: `archive_fact`

Soft-delete a fact.

```typescript
archive_fact({ factId: "xxx" })
```

- Sets `archived_at = new Date().toISOString()`
- Orphan cleanup: `UPDATE facts SET parent_fact_id = NULL WHERE parent_fact_id = factId`
- Triggers `recomposeAfterMutation()` — fact disappears from page
- Result: `{ success: true, archivedFactId: "xxx", orphanedChildren: 2 }`

### New: `unarchive_fact`

Restore an archived fact.

```typescript
unarchive_fact({ factId: "xxx" })
```

- Sets `archived_at = null`
- Triggers `recomposeAfterMutation()` — fact reappears on page
- Result: `{ success: true, restoredFactId: "xxx" }`

### Modified: `reorder_sections`

Added post-reorder slot validation via `groupSectionsBySlot()`. Returns warnings (not blocking) if reorder creates incompatible slot assignments.

### maxSteps: 5 → 8

With `batch_facts`, most operations complete in 3-4 steps. 8 provides margin for planning + inspect + retry: 1 search + 1 batch + 1 generate + 1 style + 1 inspect + 3 buffer.

---

## Section 3: Agent Planner & Intelligence Layer

### 3A. Planning Protocol

Prompt block (~300 tokens) that replaces `actionAwarenessPolicy()`. Teaches the agent to classify requests before executing.

**Classification:**
- **SIMPLE** (1-2 tool calls): Act directly
- **COMPOUND** (3+ tool calls): State plan in 1-2 sentences, then execute
- **STRUCTURAL** (layout/visual changes): Explain visual impact, then act

**Rules:**
- COMPOUND: always `search_facts` first, use `batch_facts` for multiple changes, one `generate_page` at end
- STRUCTURAL: call `inspect_page_state` before any layout change
- If tool returns `{ blocked: true }`, read suggestion and adjust plan

**Expertise modulation:**
- Novice: always verbalize plan
- Familiar: verbalize COMPOUND and STRUCTURAL only
- Expert: act silently, confirm after ("Done — closed old job, added new one.")

**Net token savings:** ~150 tokens (Planning Protocol ~300 replaces actionAwareness ~450).

### 3B. Archetype Detection & Conversation Strategy

Classifies user into 8 archetypes to drive conversation strategy during onboarding.

**Archetypes:** developer, designer, executive, student, creator, consultant, academic, generalist (fallback)

**Phase 1 — Early detection (zero-LLM):**

Keyword matching on `identity/role` fact + `lastUserMessage` parameter (passed to `assembleBootstrapPayload()`). Regex in 5 languages (en, it, de, fr, es).

Detection order (specific → generic): designer → academic → executive → consultant → developer → creator → student → generalist.

Notable regex fixes:
- Student: `/master.*(?:degree|stud|thesis|program)/i` (not bare `/master\b/i` — avoids "Scrum Master")
- No false positives: "Art Director" matches designer (tested before executive)

**Phase 2 — Persistence:**

Saved in `sessions.metadata.archetype`. Not in Tier 3 memory (avoids pollution). Recalculated on new sessions.

**Phase 3 — Refinement:**

After 5+ facts, category distribution may suggest a different archetype:

```typescript
const CATEGORY_TO_ARCHETYPE = {
  project: "creator", achievement: "executive",
  education: "academic", skill: "developer", social: "creator",
};
// Note: "experience" excluded (not discriminating — everyone has it)
```

Dominant category must have ≥3 facts to trigger refinement. Silent overwrite in session metadata.

**Strategy Templates (per archetype):**

Each archetype defines:
- `explorationOrder: FactCategory[]` — priority areas for onboarding questions
- `sectionPriority: ComponentType[]` — which sections to build first
- `toneHint: string` — calibrates agent language

Example:
```
developer: skills → projects → experience | "Technical, direct. Use specific tech terms."
designer:  projects → skills → experience | "Visual language. Ask about portfolio pieces."
executive: experience → achievements → projects | "Concise, achievement-oriented."
```

**Context injection (~150 tokens, onboarding only):**

```
ARCHETYPE: developer (detected from: identity role "software engineer")
EXPLORATION: skills → projects → experience (next: skills — currently empty)
TONE: Technical, direct. Use specific tech terms.
COVERAGE: identity ✓ (2), skill ✗ (0), project ✗ (0), experience ✗ (0)
```

Complements (doesn't replace) journey policies. Journey policy says "8 turns, Phase A→B→C". Archetype says "in Phase B, ask skills first" (developer) vs "ask projects first" (designer).

### 3C. Operation Journal

Tracks tool calls within a turn. If maxSteps is exhausted, saves journal for resume in next turn.

**Implementation:**

Closure-level array in `createAgentTools()`:

```typescript
interface JournalEntry {
  tool: string;
  summary: string;  // "created 8 skills", "moved skills-1 to sidebar"
  success: boolean;
  timestamp: number;
}
```

**Save trigger:** In `onFinish` callback, if steps used ≥ maxSteps and journal is non-empty → save to `sessions.metadata.pendingOperations`.

**Resume:** `assembleContext()` checks for pending operations and injects:

```
INCOMPLETE_OPERATION (previous turn was interrupted):
  ✓ batch_facts → created 8 skills
  ✗ generate_page → not executed
Resume: call generate_page to rebuild the page.
```

**TTL:** Operations older than 1 hour are discarded. `assembleContext()` deletes stale `pendingOperations` from session metadata via UPDATE.

**Cost:** ~80 tokens when active (post-interruption only). Zero normally. No new DB table.

### 3D. Page Coherence Check

Post-`generate_page` LLM validation (Haiku, ~500 token prompt) checking cross-section factual consistency.

**Checks:**
1. ROLE_MISMATCH: bio/hero role vs most recent experience
2. TIMELINE_OVERLAP: overlapping date ranges
3. SKILL_GAP: skills not reflected in projects/experience (always severity: info)
4. LEVEL_MISMATCH: seniority claim vs years of experience (always severity: info)
5. COMPLETENESS_GAP: obvious missing info

**Output:** `CoherenceIssue[]` (max 3), saved in `sessions.metadata.coherenceIssues`.

**Injection:** Situation directive `has_coherence_issues` in next turn. Agent mentions naturally in conversation.

**When it runs:**
- Only in `steady_state` (not onboarding)
- Only if page has 3+ sections with content
- Fire-and-forget (doesn't block `generate_page` result)

**Complementary to conformity analyzer:** Coherence checks **data** (facts in conflict). Conformity checks **presentation** (tone misalignment). No overlap.

---

## Section 4: Integration

### Migration 0019

```sql
ALTER TABLE facts ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE facts ADD COLUMN parent_fact_id TEXT;
ALTER TABLE facts ADD COLUMN archived_at TEXT;
ALTER TABLE sessions ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}';
CREATE INDEX idx_facts_parent ON facts(parent_fact_id) WHERE parent_fact_id IS NOT NULL;
CREATE INDEX idx_facts_active ON facts(archived_at) WHERE archived_at IS NULL;
```

### File Impact Map

**Significant changes:**

| File | Change |
|------|--------|
| `db/migrations/0019_smart_facts.sql` | New — migration |
| `src/lib/db/schema.ts` | 3 columns on facts, 1 on sessions |
| `src/lib/services/kb-service.ts` | Constraint layer + `WHERE archived_at IS NULL` + `getActiveFacts()` helper |
| `src/lib/agent/tools.ts` | 5 new tools + fix reorder_sections + maxSteps→8 + operation journal |
| `src/lib/services/page-composer.ts` | sortOrder in builders + parentFactId grouping |
| `src/lib/services/page-projection.ts` | Slot carry-over in projectCanonicalConfig() |
| `src/lib/layout/assign-slots.ts` | Soft-pin parameter for slot carry-over |
| `src/lib/agent/prompts.ts` | Planning Protocol block (replaces actionAwareness) |
| `src/lib/agent/policies/action-awareness.ts` | Removed (replaced by Planning Protocol) |
| `src/lib/agent/policies/index.ts` | Remove actionAwareness, add archivableFactsDirective |
| `src/lib/agent/journey.ts` | Archetype detection + lastUserMessage param |
| `src/lib/agent/context.ts` | Archetype injection + journal resume + coherence injection |
| `src/app/api/chat/route.ts` | Pass lastUserMessage + onFinish journal + maxSteps→8 |
| `src/lib/agent/policies/situations.ts` | archivableFactsDirective() |
| `src/lib/services/coherence-check.ts` | New — page coherence checker |

**Unchanged (Phase 1c intact):**

| File | Why |
|------|-----|
| `src/lib/services/section-personalizer.ts` | Operates on sections, not facts |
| `src/lib/services/proposal-service.ts` | Operates on proposals |
| `src/lib/services/conformity-analyzer.ts` | Operates on section_copy_state |
| `src/lib/layout/registry.ts` | Template definitions unchanged |
| `src/lib/layout/widgets.ts` | Widget registry unchanged |
| `src/components/**` | React components render PageConfig (same shape) |

### Slot Carry-Over Mechanism

The critical architectural change enabling `move_section` to persist across recompose cycles.

**In `projectCanonicalConfig()`:** When a section in the newly composed config matches a section in the existing draft (by ID), carry over `section.slot` from the draft.

**In `assignSlotsFromFacts()`:** New optional parameter `draftSlots: Map<string, string>`. In Phase 1, sections with a draft slot are treated as soft-pins: if the slot exists in the template, accepts the section type, and has capacity → assign to that slot. Otherwise → fall through to Phase 3.

**On `set_layout()`:** Slot carry-over does NOT apply — `set_layout` already calls `assignSlotsFromFacts()` fresh with no draft slots, reassigning everything. This is correct: layout switch = full reassignment.

### Constraint Error Pattern

`FactConstraintError` extends Error:
```typescript
class FactConstraintError extends Error {
  code: "EXISTING_CURRENT" | "CASCADE_WARNING";
  existingFactId?: string;
  suggestion: string;
}
```

Caught in tools.ts try/catch alongside `FactValidationError`. No return type changes.

### Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `WHERE archived_at IS NULL` forgotten in new queries | Archived facts leak to page | `getActiveFacts()` helper as single access point; `getAllFacts()` made private |
| Slot carry-over invalid after layout change | Section assigned to non-existent slot | Carry-over validates slot existence in current template; `set_layout` bypasses carry-over |
| batch_facts 20-op transaction | WAL contention with heartbeat worker | ~20ms total, WAL handles concurrent reads; no mitigation needed |
| Operation journal stale after browser close | Agent resumes irrelevant operation | 1-hour TTL; `assembleContext()` deletes expired entries from session metadata |

### Implementation Order (Dependencies)

```
Layer 0 (prerequisites):
  ├── Migration 0019
  ├── FactRow type update
  └── sessions.metadata column

Layer 1 (depends on L0):
  ├── kb-service: WHERE archived_at IS NULL + getActiveFacts()
  ├── kb-service: constraint layer (FactConstraintError)
  └── Archetype detection constants (regex, strategies)

Layer 2 (depends on L1):
  ├── New tools: batch_facts, archive_fact, unarchive_fact
  ├── New tool: reorder_items
  ├── page-composer: sortOrder + parentFactId grouping
  ├── page-projection: slot carry-over
  └── assign-slots: soft-pin parameter

Layer 3 (depends on L2):
  ├── New tool: move_section
  ├── Fix: reorder_sections validation
  ├── Planning Protocol (replaces actionAwareness)
  └── Archetype wiring (journey.ts + context.ts + chat route)

Layer 4 (depends on L3):
  ├── Operation Journal (tools.ts + onFinish + context.ts)
  ├── Coherence Check service + generate_page wiring
  ├── Situation directive: has_archivable_facts
  └── TOOL_POLICY update

Layer 5 (post-implementation):
  └── Test suite: ~80-100 new + ~30-40 updated
```

### Test Impact

**Updated tests:** All tests calling `getAllFacts()`, composer tests (sortOrder, parentFactId), `projectCanonicalConfig()` tests (slot carry-over), `create_fact`/`update_fact` tests (constraint errors).

**New tests:** batch_facts (atomicity, rollback, constraints), move_section (validation, auto-widget, locks, carry-over persistence), reorder_items (sortOrder, composite rejection), archive/unarchive (soft delete, orphan cleanup, WHERE clauses), assign-slots soft-pin (capacity, invalid slot fallback), archetype detection (multilingual regex, Phase 3 refinement, priority ordering), operation journal (save, resume, TTL), coherence check (issue detection, severity rules).

Estimate: ~80-100 new tests, ~30-40 updated. From 1151 to ~1250 total.

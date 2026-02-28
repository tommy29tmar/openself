# UAT Conversation Fixes — Design Document

**Date**: 2026-02-28
**Origin**: Full UAT conversation analysis (Marco Bellini scenario)
**Scope**: 7 bugs (3 P0, 4 P1) identified from E2E conversation review

## Bug Inventory

| # | Prio | Bug | Root Cause | Key Files |
|---|------|-----|-----------|-----------|
| F1 | P0 | Journey state flips after first fact | `recomposeAfterMutation()` creates draft → `detectJourneyState()` returns `draft_ready` → mode becomes `steady_state` | journey.ts:114, tools.ts:93, context.ts:113 |
| F2 | P0 | Visibility pipeline opaque | Exceptions swallowed, `success: true` always, no visibility in tool response | tools.ts:136-144 |
| F3 | P0 | Visibility stuck on private | `createFact` upsert doesn't update visibility on conflict | kb-service.ts:141 |
| F4 | P1 | Fabricated content (book/music) | Prompt too weak, no technical guard against inventing facts | prompts.ts:31, fact-validation.ts |
| F5 | P1 | Item reordering not supported | `reorder_sections` operates on sections only, no order field on facts | tools.ts:331, page-composer.ts:850, schema.ts:71 |
| F6 | P1 | Skills lost to maxSteps | `maxSteps: 5` too low for rich messages, no batch tool, intermediate recomposition wastes steps | chat/route.ts:259 |
| F7 | P1 | `set_fact_visibility` doesn't recompose | Missing `recomposeAfterMutation()` call after visibility change | tools.ts:772 |

## Approach Decisions

- **F1**: Pin journey state per session (saved in DB, reused across turns)
- **F5**: `sortOrder` field on facts table (persistent, survives recomposition)

---

## F1 — Pin Journey State Per Session

### Problem
After the first `create_fact`, `recomposeAfterMutation()` creates a draft via `upsertDraft()`. On the next turn, `detectJourneyState()` sees the draft at line 114-117 and returns `draft_ready`. `mapJourneyStateToMode()` maps this to `steady_state`, exiting the onboarding flow after just one fact.

### Solution
Save the journey state in the `sessions` table on first detection. Subsequent turns reuse the cached value. Explicit transition when `generate_page` is called.

### Changes
- **Migration `0019_journey_pin_and_sort_order.sql`**: `ALTER TABLE sessions ADD COLUMN journey_state TEXT;`
- **`src/lib/db/schema.ts`**: add `journeyState` to sessions schema
- **`src/lib/agent/journey.ts`**: new `getOrDetectJourneyState(sessionId, scope, ...)`:
  1. Read `sessions.journey_state`
  2. If null → call `detectJourneyState()`, write result to sessions, return
  3. If cached → return cached value
- **`src/app/api/chat/route.ts`**: `assembleBootstrapPayload()` uses `getOrDetectJourneyState()`
- **`src/app/api/chat/bootstrap/route.ts`**: same change for frontend GET endpoint
- **`src/lib/agent/tools.ts` — `generate_page`**: after first successful generation, update pin to `draft_ready`

### Behavior
- Turn 1: `first_visit` → pinned
- Turns 2-8: remains `first_visit` (onboarding continues)
- Agent calls `generate_page` → pin updated to `draft_ready`
- Subsequent turns: `steady_state` mode

---

## F2 — Transparent Visibility Pipeline

### Problem
`create_fact` tool swallows recomposition errors (line 136) and always returns `{ success: true }` without visibility info. Agent cannot know if the fact will appear on the page.

### Solution
Enrich tool responses with visibility + recomposition status.

### Changes
- **`src/lib/agent/tools.ts` — `create_fact` response**: add `visibility`, `pageVisible`, `recomposeOk`
- **Same for `update_fact`, `delete_fact`**
- **`src/lib/agent/prompts.ts` — TOOL_POLICY**: add instruction: "When create_fact returns pageVisible: false, inform the user the fact is saved but not yet visible. Use set_fact_visibility to make it proposed."

---

## F3 — Visibility Recalculated on Upsert

### Problem
In `kb-service.ts:141`, `onConflictDoUpdate.set` doesn't include `visibility`. A fact created with low confidence (→ private) stays private even when updated with higher confidence.

### Solution
Include `visibility` in the upsert set, but only upgrade from `private` (never downgrade from `public`/`proposed`).

### Changes
- **`src/lib/services/kb-service.ts`**: add conditional visibility update in `onConflictDoUpdate.set`:
  ```sql
  visibility = CASE WHEN facts.visibility = 'private' THEN ? ELSE facts.visibility END
  ```
  Implemented via Drizzle `sql` template to avoid downgrading user-set visibility.

---

## F4 — Anti-Fabrication Guard

### Problem
Agent invented a book and music track the user never mentioned. Prompt says "NEVER fabricate" but there's no enforcement.

### Solution
Strengthen prompt with explicit category-level prohibition.

### Changes
- **`src/lib/agent/prompts.ts` — SAFETY_POLICY**: add:
  - "NEVER create facts for categories the user has NOT explicitly mentioned"
  - "If the user has not mentioned books, music, or hobbies, do NOT create reading/music/interest facts"
  - "NEVER invent optional fields (rating, description, note). If not specified, leave empty"
  - "When in doubt, ASK the user rather than guess"
- **`src/lib/agent/prompts.ts` — TOOL_POLICY**: add:
  - "create_fact: Only create facts from information the user explicitly stated"

---

## F5 — Item Reordering Within Sections

### Problem
`reorder_sections` (tools.ts:331) reorders sections on the page, not items within a section. No `order` field exists on facts. Education/experience entries always render in DB insertion order.

### Solution
Add `sortOrder` to facts + new `reorder_section_items` tool.

### Changes
- **Migration `0019_journey_pin_and_sort_order.sql`**: `ALTER TABLE facts ADD COLUMN sort_order INTEGER DEFAULT 0;`
- **`src/lib/db/schema.ts`**: add `sortOrder: integer("sort_order").default(0)`
- **`src/lib/services/kb-service.ts`**: `getAllFacts()` adds `ORDER BY sort_order ASC, created_at ASC`
- **`src/lib/agent/tools.ts`**: new `reorder_section_items` tool:
  - Parameters: `category` (string), `orderedKeys` (string[])
  - Assigns sortOrder 0, 1, 2... to matching fact keys
  - Single recomposition at the end
- **`src/lib/services/kb-service.ts`**: new `updateFactSortOrder(sessionId, category, key, order)`
- **`src/lib/agent/prompts.ts` — DATA_MODEL_REFERENCE**: document the tool with instruction: "When user asks to reorder items within a section, use reorder_section_items, NOT reorder_sections"

---

## F6 — maxSteps Increase + Batch Create

### Problem
`maxSteps: 5` limits tool calls per turn. Each `create_fact` = 1 step + `recomposeAfterMutation()` overhead. User mentions 8 skills → only 1-2 get created.

### Solution
Increase maxSteps + add batch tool + prompt guidance.

### Changes
- **`src/app/api/chat/route.ts`**: increase `maxSteps` from 5 to 10
- **`src/lib/agent/tools.ts`**: new `create_facts` (batch) tool:
  - Parameters: `facts` array of `{category, key, value, confidence}`
  - Creates all facts in loop, single recomposition at end
  - Returns per-fact results with visibility
- **`src/lib/agent/prompts.ts` — TOOL_POLICY**: "When user shares 3+ facts in one message, prefer create_facts (batch) over multiple create_fact calls"

---

## F7 — set_fact_visibility Triggers Recomposition

### Problem
`set_fact_visibility` (tools.ts:772) doesn't call `recomposeAfterMutation()`. Preview stays stale after visibility change.

### Solution
Add `recomposeAfterMutation()` call after successful visibility change.

### Changes
- **`src/lib/agent/tools.ts`** (line 774): add recomposition call after `setFactVisibility()`, with same try/catch pattern as other tools

---

## Files Touched Summary

| File | Fixes |
|------|-------|
| `db/migrations/0019_journey_pin_and_sort_order.sql` | F1, F5 |
| `src/lib/db/schema.ts` | F1, F5 |
| `src/lib/agent/journey.ts` | F1 |
| `src/app/api/chat/route.ts` | F1, F6 |
| `src/app/api/chat/bootstrap/route.ts` | F1 |
| `src/lib/agent/tools.ts` | F2, F5, F6, F7 |
| `src/lib/services/kb-service.ts` | F3, F5 |
| `src/lib/agent/prompts.ts` | F2, F4, F5, F6 |
| `src/lib/services/page-composer.ts` | F5 (verify sort order propagation) |

## Tests Required

- **F1**: Journey state remains `first_visit` across 8 turns, transitions to `draft_ready` after `generate_page`
- **F2**: `create_fact` response includes `visibility` and `pageVisible` fields
- **F3**: Fact created with confidence 0.5 (private), updated with confidence 1.0 → visibility becomes "proposed"
- **F3**: Fact with user-set visibility "public" is NOT downgraded on upsert
- **F5**: `reorder_section_items` changes item order in composed page
- **F5**: Recomposition preserves sort_order
- **F6**: `create_facts` batch creates N facts with single recomposition
- **F7**: `set_fact_visibility` from "private" to "proposed" → page recomposes

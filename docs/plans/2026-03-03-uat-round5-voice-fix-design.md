# Design: UAT Round 5 Fixes + Voice Mic Restart

**Date:** 2026-03-03
**Scope:** 11 fixes (10 UAT bugs + 1 voice bug)
**Branch:** main (commit d52f630)

## Context

UAT Round 5 found 12 bugs. After analysis:
- BUG-2 (bento alias): NOT A BUG — layout intentionally renamed
- BUG-6 (draft ID): NOT A BUG — session UUID as draft ID is by design

Plus a voice bug discovered during manual testing: mic doesn't record after TTS finishes.

## Fix 1: VOICE — Mic doesn't record after TTS

**Root cause:** `useSttProvider.ts:89` — `recognition.onend = () => {}` (noop). After Web Speech recognition ends naturally (`continuous=false`), `sttState` stays at `LISTENING` instead of resetting to `IDLE`. When TTS finishes and `onSpeakingDone` calls `startStt()`, the guard `if (state !== IDLE) return` blocks restart. UI shows blinking red mic (voiceState set to LISTENING manually) but no recognition is running.

Secondary: Server fallback (MediaRecorder) path doesn't reset state to IDLE after successful `onFinalResult`.

**Fix:**
- Web Speech: `recognition.onend` resets state to IDLE conditionally (only if still LISTENING, preserves ERROR/PERMISSION_DENIED)
- Server fallback: Add `setState(VoiceSttState.IDLE)` after `onFinalResult()` in `recorder.onstop`

**Files:** `src/hooks/useSttProvider.ts`

## Fix 2: BUG-3 — Architect layout 400

**Root cause:** Architect template has tightly constrained slots: feature-left(max 1) + feature-right(max 1) + full-row(max 2) + 3 cards(max 1 each) = 7 total. Real pages (e.g., Marco's 8 sections) overflow → `assignSlotsFromFacts()` returns severity="error" → 400 response.

**Fix:** Increase `full-row` maxSections from 2 to 4. This gives architect 10 total slots (enough for real pages) while keeping the layout's structural intent.

**Files:** `src/lib/layout/registry.ts`

## Fix 3: BUG-7 — Layout hallucination via chat

**Root cause:** Agent tells user layout was changed even when tool returns `success: false`. The code correctly returns errors; the LLM ignores them.

**Fix:** Add explicit prompt rule: "When a tool returns `success: false`, you MUST report the error to the user. NEVER claim an operation succeeded if the tool returned failure."

**Files:** `src/lib/agent/prompts.ts`

## Fix 4: BUG-10 — Identity gate one-turn

**Root cause:** `identityGate` blocks name changes with `REQUIRES_CONFIRMATION`. Agent interprets this as a generic error instead of following the confirmation protocol. The user already asked for the change in their message, but the gate requires a second turn.

**Fix:**
- Improve identityGate message: clearly instruct agent to ask for confirmation and retry
- Add TOOL_POLICY instruction for handling `REQUIRES_CONFIRMATION`: explain to user what will change, ask for confirmation, retry on next message
- Keep two-turn safety (gate stores pending, agent asks, user confirms, agent retries)

**Files:** `src/lib/agent/tools.ts`, `src/lib/agent/prompts.ts`

## Fix 5: BUG-9 — Delete gate handling

**Root cause:** Same as Fix 4 — `deleteGate` blocks 2nd+ deletion per turn. Agent reports error instead of asking for confirmation.

**Fix:** Same prompt pattern as Fix 4 for REQUIRES_CONFIRMATION on delete_fact.

**Files:** `src/lib/agent/prompts.ts`

## Fix 6: BUG-1 — Date fabrication

**Root cause:** No prompt rule against fabricating dates from approximate durations.

**Fix:** Add to FACT_SCHEMA_REFERENCE: "NEVER fabricate precise dates from approximate durations. If user says '8 years', store duration as-is. Ask for exact dates if needed."

**Files:** `src/lib/agent/prompts.ts`

## Fix 7: BUG-4 — Invalid email accepted

**Root cause:** No email format validation in `validateFactValue()` for contact category.

**Fix:** Add email regex validation for contact facts where key contains "email".

**Files:** `src/lib/services/fact-validation.ts`

## Fix 8: BUG-5 — N/A placeholder for identity

**Root cause:** `validateFactValue()` rejects placeholders for some categories but not identity/name.

**Fix:** Extend placeholder rejection to identity category.

**Files:** `src/lib/services/fact-validation.ts`

## Fix 9: BUG-8 — Claims unsupported features

**Root cause:** No explicit unsupported features list in prompt.

**Fix:** Add to OUTPUT_CONTRACT: "Only use listed tools. Video, audio, file upload are unsupported. Explain limitation honestly."

**Files:** `src/lib/agent/prompts.ts`

## Fix 10: BUG-11 — /api/proposals 500

**Root cause:** `getPendingProposals()` not wrapped in try-catch in route handler.

**Fix:** Wrap in try-catch, return `{ proposals: [] }` on failure, log warning.

**Files:** `src/app/api/proposals/route.ts`

## Fix 11: BUG-12 — Theme undefined

**Root cause:** `/api/draft/style` auto-composes with `draftMeta=undefined` when draft is missing → loses theme. Should preserve theme from published page.

**Fix:** When auto-composing, check published page for existing theme/style and pass as draftMeta.

**Files:** `src/app/api/draft/style/route.ts`

## Summary

| # | Bug | Severity | Type | Primary File |
|---|-----|----------|------|-------------|
| 1 | Voice mic restart | High | Code | useSttProvider.ts |
| 2 | BUG-3 Architect 400 | P0 | Code | registry.ts |
| 3 | BUG-7 Layout hallucination | P0 | Prompt | prompts.ts |
| 4 | BUG-10 Identity gate | P0 | Code+Prompt | tools.ts, prompts.ts |
| 5 | BUG-9 Delete gate | P1 | Prompt | prompts.ts |
| 6 | BUG-1 Date fabrication | P1 | Prompt | prompts.ts |
| 7 | BUG-4 Email validation | P2 | Code | fact-validation.ts |
| 8 | BUG-5 N/A placeholder | P2 | Code | fact-validation.ts |
| 9 | BUG-8 Unsupported features | P2 | Prompt | prompts.ts |
| 10 | BUG-11 Proposals 500 | P2 | Code | proposals/route.ts |
| 11 | BUG-12 Theme undefined | P2 | Code | draft/style/route.ts |

# UAT Bug Fixes Round 2 — Design Document

**Date:** 2026-03-10
**Status:** Approved
**Origin:** Exploratory UAT session (Alessia Moretti persona)
**Challenge:** Multi-model adversarial review (Gemini + Codex + Claude, 2 rounds)

## Problem

Three bugs found during an exploratory UAT:

1. **(Medium) Post-publish "Done!" without re-publish** — Agent claims changes are complete after `generate_page`/`set_layout` but only the draft is updated. Published page unchanged.
2. **(Low) Hallucinated URL format** — Agent says "alessia-moretti.com" or "openself.it" instead of `/{username}`.
3. **(Low) Translation warning spam** — `[translate] Failed to translate page content` console warning when fast-tier model is unavailable.

## Challenge Summary

| Aspect | Detail |
|--------|--------|
| Models used | Gemini (Design Challenger), Codex (Technical Validator), Claude (Systems Thinker) |
| Rounds | 2 |
| Key insight | Bug #1 is a deterministic UX problem — stop solving it with prompts alone. Use a UI indicator. |
| Rejected | Prompt-only fix for #1 (unreliable), NEVER-rules for #2 (anti-pattern), env-key checks for #3 (provider-fragile) |
| Refined | Hybrid UI+prompt for #1, context variable for #2, provider-agnostic guard for #3 |

## Design

### Bug #1 — "Unpublished Changes" UI Indicator + Policy Wording

**Component A — UI (deterministic):**
- In `SplitView.tsx` (builder), compare draft vs published config hashes
- When draft has newer changes than published, show a persistent banner: "You have unpublished changes"
- Banner auto-hides when user publishes
- Implementation: use existing `projectCanonicalConfig()` → hash comparison
- The banner should include a "Publish" action button

**Component B — Policy wording (reinforcement):**
- `active-fresh.ts:33`: change `"Done! Anything else?"` → `"Done — visible in preview. Anything else to update?"`
- `active-stale.ts`: same change in the equivalent UPDATE FLOW section
- No changes to TOOL_POLICY (avoid prompt bloat)
- No changes to action-claim-guard

**Rationale:** The UI indicator is the primary fix (deterministic, always correct). The policy wording change is a secondary reinforcement (best-effort, reduces but doesn't eliminate false claims).

### Bug #2 — Context Variable for Canonical URL

- In `context.ts` (context assembler), when user has a published page, inject: `PAGE URL: /{username}` as a context block
- In `first-visit.ts:45`: replace `"Register to get your own URL like openself.dev/yourname!"` with `"Register to keep your page and claim your URL."`
- No negative rules (no "NEVER fabricate domains")
- The agent will use the injected URL data instead of inventing one

**Rationale:** Give the agent the correct data rather than trying to prevent hallucination via negative constraints.

### Bug #3 — Provider-Agnostic Translation Guard

- In `translate.ts`, before `generateObject()` call, add a try/catch around `getModelForTier("fast")`
- If no model is available (provider not configured), return untranslated config silently (no console.warn)
- If model IS available but call fails (network, schema), keep existing graceful degradation WITH console.warn (useful for prod debugging)
- Same-language short-circuit already exists at `translate.ts:96` — no change needed there

**Rationale:** Separate "no model configured" (expected in dev, silent) from "model failed" (unexpected, warn).

## Files to Modify

| File | Change |
|------|--------|
| `src/components/layout/SplitView.tsx` | Add unpublished-changes banner with hash comparison |
| `src/lib/agent/policies/active-fresh.ts` | Line 33: wording change |
| `src/lib/agent/policies/active-stale.ts` | Equivalent wording change |
| `src/lib/agent/context.ts` | Inject `PAGE URL: /{username}` block for published users |
| `src/lib/agent/policies/first-visit.ts` | Line 45: remove "openself.dev/yourname" marketing |
| `src/lib/ai/translate.ts` | Add provider availability guard before generateObject |

## Out of Scope

- `SignupModal.tsx` domain display (marketing context, different concern)
- Action-claim-guard modifications (not needed with UI indicator)
- `TRANSLATION_ENABLED` env var (translation is core, not optional)
- Bug #4 (Next.js vendor-chunks cache — not an app bug)

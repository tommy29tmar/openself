# UAT Bug Fixes Round 2 — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 3 bugs found during exploratory UAT: post-publish draft/published confusion, URL hallucination, and translation warning spam.

**Architecture:** Minimal, targeted fixes across 3 layers: UI (unpublished-changes banner), prompt policies (wording refinements), and AI utilities (translation guard). Each fix is independent and can be committed separately.

**Tech Stack:** TypeScript, React (Next.js App Router), Vitest

**Design doc:** `docs/plans/2026-03-10-uat-bug-fixes-round2-design.md`

---

## Chunk 1: Bug #1 — Post-Publish Draft/Published Confusion

### Task 1: Policy Wording — active-fresh.ts

**Files:**
- Modify: `src/lib/agent/policies/active-fresh.ts:33`
- Test: `tests/evals/prompt-contracts.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/evals/prompt-contracts.test.ts`:

```typescript
it("active-fresh policy includes preview-only reminder in update flow", () => {
  const { activeFreshPolicy } = require("@/lib/agent/policies/active-fresh");
  const policy = activeFreshPolicy("en");
  expect(policy).toMatch(/visible in preview/i);
  expect(policy).not.toMatch(/^.*"Done! Anything else\?".*$/m);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/prompt-contracts.test.ts -t "active-fresh"`
Expected: FAIL — current text is "Done! Anything else?"

- [ ] **Step 3: Implement the fix**

In `src/lib/agent/policies/active-fresh.ts`, change line 33 from:

```
- After each successful update, briefly confirm: "Done! Anything else?"
```

To:

```
- After each successful update, briefly confirm: "Done — visible in preview. Anything else to update?"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/evals/prompt-contracts.test.ts -t "active-fresh"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/policies/active-fresh.ts tests/evals/prompt-contracts.test.ts
git commit -m "fix: active-fresh policy wording — preview-only reminder after edits"
```

---

### Task 2: Policy Wording — active-stale.ts

**Files:**
- Modify: `src/lib/agent/policies/active-stale.ts:42-43`
- Test: `tests/evals/prompt-contracts.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/evals/prompt-contracts.test.ts`:

```typescript
it("active-stale policy includes preview-only language in publish section", () => {
  const { activeStalePolicy } = require("@/lib/agent/policies/active-stale");
  const policy = activeStalePolicy("en");
  expect(policy).toMatch(/visible in.*preview/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/prompt-contracts.test.ts -t "active-stale"`
Expected: FAIL

- [ ] **Step 3: Implement the fix**

In `src/lib/agent/policies/active-stale.ts`, change lines 42-43 from:

```
- Only impacted sections will be regenerated — explain this: "I've updated the sections that changed."
- Propose re-publishing: "Your page is refreshed! Want to publish the update?"
```

To:

```
- Only impacted sections will be regenerated — explain this: "I've updated the sections that changed — visible in your preview."
- Propose re-publishing: "Want to publish the update so it goes live?"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/evals/prompt-contracts.test.ts -t "active-stale"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/policies/active-stale.ts tests/evals/prompt-contracts.test.ts
git commit -m "fix: active-stale policy wording — preview-only reminder after regeneration"
```

---

### Task 3: Unpublished Changes Banner in SplitView

**Files:**
- Modify: `src/components/layout/SplitView.tsx:472-486` (desktop preview content area, after `approval_pending` block)
- Modify: `src/lib/i18n/ui-strings.ts` (add new L10N key)
- Test: `tests/evals/ui-strings.test.ts:5-10` (add to `REQUIRED_KEYS` array)

**Context:** `SplitView.tsx` already has `hasUnpublishedChanges` (line 213) which compares `configHash` vs `publishedConfigHash`. The desktop nav bar in `BuilderNavBar.tsx:138` shows a small "Publish →" button when `hasUnpublishedChanges` is true, but there's no visible banner in the preview area explaining that changes are draft-only. The preview area in `SplitView.tsx:468-488` (`desktopPreviewContent`) is where the banner should go — right after the existing `approval_pending` banner block (line 472-486).

- [ ] **Step 1: Add L10N key for the banner text**

In `src/lib/i18n/ui-strings.ts`:

1. Add `unpublishedChanges: string;` to the `UiStrings` type interface.
2. Add to each of the 8 language objects:

| Language | Value |
|----------|-------|
| en | `"You have unpublished changes"` |
| it | `"Hai modifiche non pubblicate"` |
| de | `"Du hast unveröffentlichte Änderungen"` |
| fr | `"Vous avez des modifications non publiées"` |
| es | `"Tienes cambios sin publicar"` |
| pt | `"Você tem alterações não publicadas"` |
| ja | `"未公開の変更があります"` |
| zh | `"您有未发布的更改"` |

- [ ] **Step 2: Add `unpublishedChanges` to REQUIRED_KEYS in ui-strings test**

In `tests/evals/ui-strings.test.ts`, add `"unpublishedChanges"` to the `REQUIRED_KEYS` array (line 5-10):

```typescript
const REQUIRED_KEYS: (keyof UiStrings)[] = [
  // ... existing keys ...,
  "unpublishedChanges",
];
```

- [ ] **Step 3: Add the banner to SplitView.tsx desktop preview content**

In `SplitView.tsx`, find `desktopPreviewContent` (line 468). After the existing `approval_pending` block (lines 472-486), add the unpublished-changes banner with a Publish button:

```tsx
{hasUnpublishedChanges && !publishing && publishStatus !== "approval_pending" && authenticated && (
  <div className="flex items-center justify-between gap-3 border-b bg-amber-50 px-4 py-2 text-sm dark:bg-amber-950">
    <span className="text-amber-800 dark:text-amber-200">
      {t.unpublishedChanges}
    </span>
    <button
      type="button"
      onClick={handlePublish}
      disabled={publishing}
      className="shrink-0 rounded bg-amber-600 px-3 py-1 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
    >
      {t.publish}
    </button>
  </div>
)}
```

This matches the styling of the existing `approval_pending` banner (lines 473-485) for visual consistency. The banner includes both the informational text AND a Publish action button.

- [ ] **Step 4: Run ui-strings test**

Run: `npx vitest run tests/evals/ui-strings.test.ts`
Expected: PASS — all 8 languages have the new key.

- [ ] **Step 5: Run full test suite to verify no regressions**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -10`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/SplitView.tsx src/lib/i18n/ui-strings.ts tests/evals/ui-strings.test.ts
git commit -m "feat: unpublished-changes banner with publish button in builder preview area"
```

---

## Chunk 2: Bug #2 — URL Hallucination

### Task 4: Remove Marketing URL from first-visit.ts

**Files:**
- Modify: `src/lib/agent/policies/first-visit.ts:45`
- Test: `tests/evals/first-visit-policy.test.ts`

**Context:** `context.ts:405-412` already injects `Published page: /{username}` for authenticated steady_state users. The bug source is `first-visit.ts:45` which says `"openself.dev/yourname"` — the agent extrapolates this into domain hallucinations. No change to `context.ts` is needed because the auth block already provides the correct relative URL.

- [ ] **Step 1: Write the failing test**

Add to `tests/evals/first-visit-policy.test.ts`:

```typescript
it("first-visit policy does not contain openself.dev domain in URL examples", () => {
  const { firstVisitPolicy } = require("@/lib/agent/policies/first-visit");
  const policy = firstVisitPolicy("en");
  expect(policy).not.toMatch(/openself\.dev\/yourname/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/first-visit-policy.test.ts -t "does not contain openself.dev"`
Expected: FAIL — current text has "openself.dev/yourname"

- [ ] **Step 3: Implement the fix**

In `src/lib/agent/policies/first-visit.ts`, change line 45 from:

```
- ALWAYS mention that the user can register to claim their URL and keep their page. Frame it positively: "Register to get your own URL like openself.dev/yourname!"
```

To:

```
- ALWAYS mention that the user can register to claim their URL and keep their page. Frame it positively: "Register to keep your page and claim your personal URL!"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/evals/first-visit-policy.test.ts -t "does not contain openself.dev"`
Expected: PASS

- [ ] **Step 5: Also verify existing tests still pass**

Run: `npx vitest run tests/evals/first-visit-policy.test.ts`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/policies/first-visit.ts tests/evals/first-visit-policy.test.ts
git commit -m "fix: remove openself.dev domain from first-visit policy to prevent URL hallucination

context.ts:409 already injects 'Published page: /{username}' for authenticated
users — no additional URL injection needed."
```

---

## Chunk 3: Bug #3 — Translation Warning Spam

### Task 5: Translation Guard — Silent Skip When Model Unavailable

**Files:**
- Modify: `src/lib/ai/translate.ts:191-196` (add inner try/catch around getModelForTier)
- Test: `tests/evals/translate.test.ts`

**Context:** `translatePageContent()` in `translate.ts` already has graceful degradation (catch at line 222 returns untranslated config). But it logs `console.warn` even when the model simply isn't configured (expected in dev). The fix: separate "model not configured" (silent skip) from "model failed at runtime" (warn). `getModelForTier("fast")` is called at line 193 inside `generateObject()` — extract it into its own try/catch. No changes to `provider.ts` needed.

- [ ] **Step 1: Write the failing test**

Add to `tests/evals/translate.test.ts`:

```typescript
it("skips translation silently when getModelForTier throws", async () => {
  const { getModelForTier } = await import("@/lib/ai/provider");
  vi.mocked(getModelForTier).mockImplementation(() => {
    throw new Error("No API key configured for provider");
  });

  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

  const config = {
    sections: [{ id: "bio-1", type: "bio", content: { text: "Hello" } }],
  } as any;

  const result = await translatePageContent(config, "it", "en");
  expect(result).toBe(config);
  expect(warnSpy).not.toHaveBeenCalled();

  warnSpy.mockRestore();
});
```

Note: `translatePageContent` is already imported at the top of the test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/translate.test.ts -t "skips translation silently"`
Expected: FAIL — current code calls `getModelForTier` inside the outer try/catch which fires `console.warn`.

- [ ] **Step 3: Implement the fix**

In `src/lib/ai/translate.ts`, replace lines 191-196:

```typescript
  try {
    const result = await generateObject({
      model: getModelForTier("fast"),
      schema: TranslationResultSchema,
      prompt,
    });
```

With:

```typescript
  // Guard: verify fast-tier model is available before attempting translation
  let model: ReturnType<typeof getModelForTier>;
  try {
    model = getModelForTier("fast");
  } catch {
    // No model configured for fast tier — skip translation silently
    return config;
  }

  try {
    const result = await generateObject({
      model,
      schema: TranslationResultSchema,
      prompt,
    });
```

This adds an inner try/catch around `getModelForTier("fast")` that returns silently (no `console.warn`). The outer try/catch at line 222 still handles runtime errors from `generateObject()` (network failures, schema mismatches) with the existing `console.warn` — those are useful for debugging real issues.

Also add the import for the return type at the top of the file if `LanguageModel` type is not already imported:

```typescript
import type { LanguageModel } from "ai";
```

Then use `let model: LanguageModel;` instead of `ReturnType<typeof getModelForTier>`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/evals/translate.test.ts -t "skips translation silently"`
Expected: PASS

- [ ] **Step 5: Run full translate test suite**

Run: `npx vitest run tests/evals/translate.test.ts tests/evals/translate-structured.test.ts`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/translate.ts tests/evals/translate.test.ts
git commit -m "fix: skip translation silently when fast-tier model is not configured

Separates 'model not available' (silent return, expected in dev) from
'model failed at runtime' (console.warn, useful for prod debugging)."
```

---

## Chunk 4: Final Verification

### Task 6: Full Test Suite + Snapshot Update

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run 2>&1 | tail -20`
Expected: All tests pass. If snapshot failures occur from policy wording changes, update them:

```bash
npx vitest run -u
```

- [ ] **Step 2: Run TypeScript type check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Final commit if snapshots were updated**

```bash
git add -A
git commit -m "chore: update snapshots after UAT bug fixes round 2"
```

# UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete UX overhaul of OpenSelf — fix composition bugs, add canvas-style interaction, section visibility, notifications cleanup, hero links, toast feedback, unpublished changes banner, presence terminology, marketing landing page, auth upgrade, and SEO. Mobile-first on everything.

**Architecture:** 12 workstreams organized by dependency. Critical path: WS-1 (composition fix) → WS-2 (SplitView decomposition) → WS-3/4/7/8 (parallel). Independent workstreams (WS-5, WS-6, WS-9, WS-10, WS-11, WS-12) can start immediately.

**Tech Stack:** Next.js App Router, TypeScript, SQLite/Drizzle, Tailwind CSS, Vercel AI SDK, lucide-react, satori (OG images), Resend (email)

**Design doc:** `docs/plans/2026-03-14-ux-overhaul-design.md`

---

## Chunk 1: WS-1 — Composition Pipeline Fix

**Goal:** Fix the root cause behind 5 bugs observed in UAT: bio reverting after title change, Strava data loss, experience title mismatch, date formatting issues, and Python skill duplication.

**IMPORTANT — Investigation first:** The code review revealed that `personalization-projection.ts` already uses section-scoped hashing via `computeSectionFactsHash()` (imported from `personalization-hashing.ts` at line 13, used at line 70). The bug root cause needs actual investigation before prescribing a fix. The section-scoped hash guard is already implemented — the issue is likely elsewhere in the pipeline.

### Task 1.1: Investigate and reproduce the composition bugs

**Files:**
- Read: `src/lib/services/personalization-projection.ts:32-97` (already has section-scoped hashing)
- Read: `src/lib/services/personalization-hashing.ts` (provides `computeSectionFactsHash`)
- Read: `src/lib/services/publish-pipeline.ts:188-193` (verify `mergeActiveSectionCopy` call)
- Read: `src/lib/agent/tools.ts:374-414` (recomposeAfterMutation)
- Read: `src/lib/services/section-copy-state-service.ts` (uses `createSectionCopyStateService(db)` pattern)
- Test: `tests/evals/composition-pipeline-hash.test.ts`

- [ ] **Step 1: Read the actual personalization pipeline end-to-end**

Trace the exact code path from: fact mutation → recomposeAfterMutation → upsertDraft → preview SSE → publish. Identify WHERE personalized copy is lost. Candidates:
- `mergeActiveSectionCopy` not called in publish path
- Hash still fails despite section-scoped hashing (soul hash component?)
- `readKeys` not passed correctly (the BUG-1 fix from 2026-03-14 may have addressed this)
- Draft row overwritten with deterministic content, and publish reads from draft row not canonical

- [ ] **Step 2: Write a failing integration test that reproduces the bio revert**

**Test setup note:** The codebase has no shared test helpers (`createTestDb`, `seedProfile`, etc.). The existing pattern across 296 test files is inline SQLite setup. Either:
1. Create a shared `tests/helpers/db-helpers.ts` file as a prerequisite task (recommended — DRY), or
2. Rewrite tests using inline setup matching the pattern in `tests/evals/section-copy-state-service.test.ts:11-31`

If creating shared helpers, this is a **prerequisite task** that must run before any test in this plan.

```typescript
// tests/evals/composition-pipeline-hash.test.ts
import { describe, it, expect } from "vitest";
import { projectCanonicalConfig } from "@/lib/services/page-projection";
import { mergeActiveSectionCopy } from "@/lib/services/personalization-projection";
import { createSectionCopyStateService } from "@/lib/services/section-copy-state-service";
import { createTestDb, seedProfile, seedFacts } from "../helpers/db-helpers";

describe("composition pipeline hash consistency", () => {
  it("personalized copy survives fact mutation + publish", async () => {
    const db = await createTestDb();
    const { ownerKey, profileId } = await seedProfile(db);
    const copyService = createSectionCopyStateService(db);

    await seedFacts(db, ownerKey, [
      { category: "identity", key: "headline", value: { text: "Data Scientist" } },
      { category: "bio", key: "main", value: { text: "Original bio" } },
    ]);

    // Step 1: Compose canonical config
    const facts = await getProjectedFacts(ownerKey, db);
    const canonical = await projectCanonicalConfig(facts, "testuser", "en", null, profileId);

    // Step 2: Store personalized copy (simulating agent curate_content)
    await copyService.upsertState({
      ownerKey,
      sectionType: "bio",
      language: "en",
      personalizedContent: JSON.stringify({ text: "Professional bio with leadership mention" }),
      // Use REAL hash functions to reproduce actual pipeline behavior
      // import { computeSectionFactsHash } from "@/lib/services/personalization-hashing";
      factsHash: computeSectionFactsHash(facts, "bio"),
      soulHash: computeHash(""), // no soul profile in test → empty hash
      source: "agent",
    });

    // Step 3: Mutate a DIFFERENT fact (headline change)
    await createFact(db, ownerKey, {
      category: "identity",
      key: "headline",
      value: { text: "AI & Data Science Leader" },
    });

    // Step 4: Recompose (simulating recomposeAfterMutation)
    const newFacts = await getProjectedFacts(ownerKey, db);
    const newCanonical = await projectCanonicalConfig(newFacts, "testuser", "en", null, profileId);

    // Step 5: Merge personalized copy — should work since bio facts didn't change
    const merged = await mergeActiveSectionCopy(newCanonical, ownerKey, "en", db);

    // The bio section should have personalized content, NOT revert to fact-derived
    const bioSection = merged.sections.find(s => s.type === "bio");
    expect(bioSection?.content?.text).toContain("leadership");
  });
});
```

- [ ] **Step 3: Run test to identify actual failure point**

Run: `npx vitest run tests/evals/composition-pipeline-hash.test.ts`
Expected: FAIL — but the failure message will reveal the actual root cause (whether it's hash mismatch, missing readKeys, or something else)

- [ ] **Step 4: Fix the actual root cause based on investigation**

Apply the minimal fix based on what Step 1 and Step 3 reveal. Do NOT apply the section-scoped hash fix (it's already in place). Likely fixes:
- If `mergeActiveSectionCopy` is not called in publish path: add the call
- If `readKeys` is the issue: verify the recent BUG-1 fix from 2026-03-14 is deployed
- If draft row overwrites personalized content: change `upsertDraft` to preserve personalization

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/evals/composition-pipeline-hash.test.ts`
Expected: PASS

- [ ] **Step 6: Add test for publish path specifically**

Add a test that goes through the full publish pipeline (`prepareAndPublish`) and verifies personalized copy appears in published page.

- [ ] **Step 7: Run full test suite**

Run: `npx vitest run`
Expected: All ~3221 tests pass

- [ ] **Step 8: Commit**

```bash
git add src/lib/services/personalization-projection.ts tests/evals/composition-pipeline-hash.test.ts
git commit -m "fix: composition pipeline — personalized copy preserved across mutations

Investigated and fixed root cause of bio revert, Strava data loss, and
experience title mismatch in the composition pipeline."
```

### Task 1.2: Fix Strava/Activity L10N in published page (BUG-3)

**Files:**
- Read: `src/lib/services/page-composer.ts` — find activity section composition
- Read: `src/themes/editorial-360/components/Activities.tsx` — rendering differences draft vs published
- Modify: composition path for activity facts
- Test: `tests/evals/activity-composition.test.ts`

- [ ] **Step 1: Write failing test — activity facts preserve structured data through publish**

Test that activity facts with `{name, type, activityCount, distanceKm, timeHrs}` render identically in draft and published configs.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Fix composition — ensure L10N happens at render time, not composition time**

The draft composer translates activity names ("Walk" → "Camminata") but the published path may skip this. Ensure both paths use the same `composeActivitySection()` with the same L10N logic.

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Fix date formatting (BUG-5)**

Ensure `formatFactDate()` from `src/lib/i18n/format-date.ts` is applied in the published page composition path, not just the draft preview.

- [ ] **Step 6: Run full test suite**

- [ ] **Step 7: Commit**

```bash
git commit -m "fix: activity L10N and date formatting in publish pipeline"
```

### Task 1.3: Fix Python duplicate (BUG-2)

**Files:**
- Read: `src/lib/services/fact-cluster-service.ts` — `identityMatch` for skills
- Check: DB for existing unclustered skill facts

- [ ] **Step 1: Investigate root cause**

The likely cause is pre-clustering legacy data (migration 0035 added clustering, but existing facts weren't retroactively clustered). Check if `consolidate_facts` worker has run for this profile.

- [ ] **Step 2: Write test — `consolidate_facts` correctly clusters duplicate skills**

- [ ] **Step 3: Fix — trigger consolidation for existing facts or add migration**

If the issue is legacy data, add logic to `consolidate_facts` handler to detect and merge existing skill duplicates. If the issue is structural differences in fact values, fix `identityMatch` to normalize before comparing.

- [ ] **Step 4: Run tests**

- [ ] **Step 5: Commit**

```bash
git commit -m "fix: consolidate pre-clustering duplicate skill facts"
```

---

## Chunk 2: WS-2 — SplitView Decomposition

**Goal:** Break `SplitView.tsx` (782 lines) into focused modules. Prerequisite for canvas interaction, toast, and banner features.

### Task 2.1: Extract `usePreviewSync` hook

**NOTE:** SplitView line numbers below are approximate — verify content matches before extracting. Search for `startSSE`, `EventSource`, `POLL_INTERVAL` to locate the SSE/polling block. Search for `hasUnpublishedChanges` to locate the banner.

**Files:**
- Create: `src/hooks/usePreviewSync.ts`
- Modify: `src/components/layout/SplitView.tsx` (SSE/polling block, ~lines 358-414)
- Test: `tests/evals/use-preview-sync.test.ts`

- [ ] **Step 1: Write tests for preview sync hook**

**Testing approach:** `EventSource` does not exist in jsdom/happy-dom test environments. Instead of mocking SSE:
1. Unit test the **polling fallback path only** (mockable via `vi.spyOn(global, 'fetch')`)
2. Test the **state update callback** in isolation
3. SSE behavior is verified via integration tests or manual testing
Do NOT write a test that depends on a mocked `EventSource` — it will be fragile and misleading.

```typescript
// tests/evals/use-preview-sync.test.ts
import { describe, it, expect, vi } from "vitest";

describe("usePreviewSync — polling fallback", () => {
  it("calls onUpdate when polling returns data", async () => {
    const onUpdate = vi.fn();
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ config: testConfig, configHash: "abc", publishStatus: "draft" }))
    );
    // ... test polling path
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ configHash: "abc" }));
    fetchSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Extract hook from SplitView lines 358-414**

**IMPORTANT -- Callback stability:** The `onUpdate` callback passed to `usePreviewSync` MUST be wrapped in `useCallback` by the caller (SplitView), or the hook must store it in a ref internally to avoid SSE reconnection on every render:
```typescript
// Inside usePreviewSync:
const onUpdateRef = useRef(opts.onUpdate);
useEffect(() => { onUpdateRef.current = opts.onUpdate; });
// Use onUpdateRef.current in event handlers, NOT opts.onUpdate
```

**IMPORTANT — Style state entanglement:** SplitView holds `config`, `surface`, `voice`, `light`, `layoutTemplate` as interdependent state. The SSE handler updates ALL of these from a single event, and there is a `lastUserEdit` debounce guard that prevents SSE from overwriting user-initiated style changes.

**Two options:**
1. **Extract config+style together**: The hook returns `{ config, surface, voice, light, layoutTemplate, configHash, publishStatus }` and accepts a `lastUserEdit` ref to implement the debounce guard internally. PresencePanel callbacks must update the hook's state via an `applyStyleOverride` function.
2. **Extract only transport, not state**: The hook manages SSE/polling connection and emits raw events via a callback `onUpdate(data)`. SplitView keeps all state and applies the debounce guard itself. Less code in the hook, more code stays in SplitView.

**Recommended:** Option 2 — simpler extraction boundary. SplitView keeps state management but offloads transport. Target ~550 lines for SplitView (not 400).

```typescript
// src/hooks/usePreviewSync.ts
import { useEffect, useRef, useCallback } from "react";

const POLL_INTERVAL = 3000;
const MAX_SSE_ERRORS = 5;

export interface PreviewSyncData {
  config: any;    // PageConfig
  configHash: string;
  publishStatus: string;
  surface?: string;
  voice?: string;
  light?: string;
  layoutTemplate?: string;
}

export function usePreviewSync(opts: {
  enabled: boolean;
  onUpdate: (data: PreviewSyncData) => void;
}) {
  const sseErrorCount = useRef(0);

  // ... extract SSE + polling transport from SplitView lines 358-414
  // Call opts.onUpdate(data) on each event — SplitView applies debounce guard
}
```

- [ ] **Step 4: Replace SplitView SSE logic with hook call**

```typescript
// In SplitView.tsx, replace lines 358-414 with:
usePreviewSync({
  enabled: authenticated && (activeMobileTab === "preview" || !isMobile),
  onUpdate: (data) => {
    // Apply debounce guard: skip if lastUserEdit was within 2s
    if (Date.now() - lastUserEdit.current < 2000) return;
    setConfig(data.config);
    setConfigHash(data.configHash);
    setPublishStatus(data.publishStatus);
    if (data.surface) setSurface(data.surface);
    // ... etc for voice, light, layoutTemplate
  },
});
// NOTE: enabled includes `activeMobileTab === "preview" || !isMobile` to avoid
// SSE connections on background mobile tabs (wastes battery + server resources).
```

- [ ] **Step 5: Run test to verify it passes**

- [ ] **Step 6: Run full test suite to ensure no regressions**

Run: `npx vitest run`

- [ ] **Step 7: Commit**

```bash
git add src/hooks/usePreviewSync.ts tests/evals/use-preview-sync.test.ts src/components/layout/SplitView.tsx
git commit -m "refactor: extract usePreviewSync hook from SplitView"
```

### Task 2.2: Extract `useToastManager` hook

**Files:**
- Create: `src/hooks/useToastManager.ts`
- Create: `src/components/ui/Toast.tsx`
- Test: `tests/evals/use-toast-manager.test.ts`

- [ ] **Step 1: Write test for toast manager**

```typescript
// tests/evals/use-toast-manager.test.ts
describe("useToastManager", () => {
  it("adds toast to queue", () => {
    const { result } = renderHook(() => useToastManager());
    act(() => result.current.showToast({ message: "Bio aggiornata", type: "success" }));
    expect(result.current.toasts).toHaveLength(1);
  });

  it("auto-dismisses after 3 seconds", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToastManager());
    act(() => result.current.showToast({ message: "Test", type: "info" }));
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.toasts).toHaveLength(0);
    vi.useRealTimers();
  });

  it("limits to maxVisible (2 on mobile, 3 on desktop)", () => {
    const { result } = renderHook(() => useToastManager({ maxVisible: 2 }));
    act(() => {
      result.current.showToast({ message: "1", type: "info" });
      result.current.showToast({ message: "2", type: "info" });
      result.current.showToast({ message: "3", type: "info" });
    });
    expect(result.current.toasts).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement toast manager hook**

```typescript
// src/hooks/useToastManager.ts
export type ToastType = "success" | "info" | "error";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  createdAt: number;
}

export interface ToastManagerOptions {
  maxVisible?: number;   // default 3
  dismissAfterMs?: number; // default 3000
}

export function useToastManager(opts?: ToastManagerOptions) {
  const maxVisible = opts?.maxVisible ?? 3;
  const dismissAfterMs = opts?.dismissAfterMs ?? 3000;
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timerRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const showToast = useCallback((toast: Omit<Toast, "id" | "createdAt">) => {
    const id = crypto.randomUUID();
    const newToast: Toast = { ...toast, id, createdAt: Date.now() };
    setToasts(prev => [...prev.slice(-(maxVisible - 1)), newToast]);
    const handle = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      timerRefs.current.delete(id);
    }, dismissAfterMs);
    timerRefs.current.set(id, handle);
  }, [maxVisible, dismissAfterMs]);

  const dismissToast = useCallback((id: string) => {
    const handle = timerRefs.current.get(id);
    if (handle) clearTimeout(handle);
    timerRefs.current.delete(id);
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => { timerRefs.current.forEach(h => clearTimeout(h)); };
  }, []);

  return { toasts, showToast, dismissToast };
}
```

- [ ] **Step 4: Create Toast UI component (mobile-first)**

```typescript
// src/components/ui/Toast.tsx
"use client";
import type { Toast as ToastData, ToastType } from "@/hooks/useToastManager";

const TYPE_STYLES: Record<ToastType, string> = {
  success: "border-l-green-500 bg-green-950/80",
  info: "border-l-blue-500 bg-blue-950/80",
  error: "border-l-red-500 bg-red-950/80",
};

export function ToastContainer({
  toasts,
  onDismiss,
  mobile = false,
  tabBarVisible = true,
}: {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
  mobile?: boolean;
  tabBarVisible?: boolean;
}) {
  if (toasts.length === 0) return null;

  const position = mobile
    ? `fixed ${tabBarVisible ? "bottom-[72px]" : "bottom-4"} left-4 right-4 z-[300]`  // above bottom tab bar (or bottom when keyboard open)
    : "fixed bottom-4 right-4 z-[300] w-80";         // desktop: bottom-right

  return (
    <div className={position}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`mb-2 rounded-lg border-l-4 px-4 py-3 text-sm text-white backdrop-blur ${TYPE_STYLES[toast.type]}`}
          role="status"
          onClick={() => onDismiss(toast.id)}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Run tests**

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useToastManager.ts src/components/ui/Toast.tsx tests/evals/use-toast-manager.test.ts
git commit -m "feat: add useToastManager hook and Toast component (mobile-first)"
```

### Task 2.3: Extract `UnpublishedBanner` component

**Files:**
- Create: `src/components/layout/UnpublishedBanner.tsx`
- Modify: `src/components/layout/SplitView.tsx:506-519`
- Test: `tests/evals/unpublished-banner.test.ts`

- [ ] **Step 1: Write test for unpublished banner**

Test that it shows "N modifiche non pubblicate", renders change list on expand, and offers discard.

- [ ] **Step 2: Extract banner from SplitView lines 506-519 into component**

The current banner is inline JSX. Extract into a standalone component that takes `draftConfig`, `publishedConfig`, `onPublish`, `onDiscard` props. Add diff computation logic.

- [ ] **Step 3: Stub the mobile expansion — defer to Chunk 6**

On mobile, the banner currently shows as a compact bar with 'Pubblica' button only. The bottom sheet expansion with change list will be integrated in Task 5.2 AFTER `BottomSheet.tsx` is created in Task 6.2.
**NOTE:** Do NOT implement the bottom sheet here — it doesn't exist yet. This task creates the component extraction only.

- [ ] **Step 4: Run tests**

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor: extract UnpublishedBanner with diff display and discard"
```

### Task 2.4: Verify SplitView is under 550 lines

- [ ] **Step 1: Count remaining lines in SplitView**

After extracting usePreviewSync transport (~60 lines), useToastManager (new), UnpublishedBanner (~40 lines), verify SplitView is significantly reduced. SplitView keeps all config+style state management (see Option 2 in Task 2.1), so target ~550 lines, not 400. The remaining hooks (usePreviewInteraction, SectionActionMenu) will be extracted in WS-3.

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`

- [ ] **Step 3: Commit any final cleanup**

```bash
git commit -m "refactor: SplitView decomposition complete — layout orchestration only"
```

---

## Chunk 3: WS-5 (Notifications Cleanup) + WS-9 (Presence Terminology)

Two quick independent wins that can start immediately.

### Task 3.1: Drop successful sync items from activity feed

**Files:**
- Modify: `src/lib/services/activity-feed-service.ts:267-284`
- Modify: `src/lib/services/activity-feed-service.ts` — `getUnreadCount()` at lines 293-346
- Test: `tests/evals/activity-feed-service.test.ts`

- [ ] **Step 1: Write test — successful syncs excluded from feed**

**Test setup note:** The codebase has no shared test helpers (`createTestDb`, `seedProfile`, etc.). The existing pattern across 296 test files is inline SQLite setup. Either:
1. Create a shared `tests/helpers/db-helpers.ts` file as a prerequisite task (recommended — DRY), or
2. Rewrite tests using inline setup matching the pattern in `tests/evals/section-copy-state-service.test.ts:11-31`

If creating shared helpers, this is a **prerequisite task** that must run before any test in this plan.

```typescript
describe("getActivityFeed — no successful syncs", () => {
  it("excludes completed sync items from feed", async () => {
    const db = await createTestDb();
    // Seed: 3 successful syncs + 1 error sync + 1 soul proposal
    await seedSyncLog(db, ownerKey, [
      { status: "completed", connector: "github" },
      { status: "completed", connector: "spotify" },
      { status: "completed", connector: "strava" },
      { status: "error", connector: "spotify", error: "token_expired" },
    ]);
    await seedSoulProposal(db, ownerKey);

    const feed = await getActivityFeed(ownerKey, { db });
    // Only error sync + soul proposal — no completed syncs
    expect(feed).toHaveLength(2);
    // NOTE: verify actual feed item type discriminant from src/lib/services/activity-feed-types.ts
    // The type may be "sync" or similar — check FeedItemDetail discriminated union
    const syncSuccessItems = feed.filter(item =>
      item.detail?.type === "sync" && item.detail?.status === "completed"
    );
    expect(syncSuccessItems).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Modify `getSyncFeedItems` to filter out successful syncs**

In `activity-feed-service.ts`, the `getSyncFeedItems` function queries `sync_log`. Add a WHERE clause: `AND status != 'completed'` (or equivalently, `status = 'error'`).

- [ ] **Step 4: Update `getUnreadCount` to exclude successful syncs**

The sync COUNT query should only count error syncs.

- [ ] **Step 5: Run test to verify it passes**

- [ ] **Step 6: Run full test suite**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: drop successful sync items from notification feed

Only sync errors and actionable proposals appear in notifications.
Successful syncs are noise — connector status visible in Presence > Sources."
```

### Task 3.2: Add empty state to ActivityDrawer

**Files:**
- Modify: `src/components/notifications/ActivityDrawer.tsx`
- Test: visual verification

- [ ] **Step 1: Add empty state when feed is empty**

```tsx
// In ActivityDrawer, when items.length === 0:
<div className="flex flex-col items-center justify-center py-16 text-center">
  <p className="text-lg font-medium text-[var(--page-fg,#ccc)]">
    {l10n.allClear}
  </p>
  <p className="mt-2 text-sm text-[var(--page-fg,#888)]">
    {l10n.noNotifications}
  </p>
</div>
```

- [ ] **Step 2: Add L10N keys**

In `ui-strings.ts`, add `allClear` and `noNotifications` for all 8 languages.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: empty state for notification drawer"
```

### Task 3.2b: Fix existing sub-44px mobile touch targets

**Files:** Modify: `src/components/layout/SplitView.tsx` (mobile preview header buttons), `src/components/notifications/ActivityDrawer.tsx`

- [ ] **Step 1: Fix Presence and Publish buttons in mobile preview header**

The existing buttons use `padding: "5px 12px"` and `fontSize: 12` (~30px height). Update to `minHeight: 44` to meet touch target requirements.

- [ ] **Step 2: Fix "Mark all read" button in ActivityDrawer**

In `src/components/notifications/ActivityDrawer.tsx`, the `markAllReadStyle` uses `padding: "4px 8px"` (~28px height). Add `minHeight: 44, minWidth: 44`.

- [ ] **Step 3: Commit**

```bash
git commit -m "fix: increase sub-44px touch targets to meet mobile accessibility requirements"
```

### Task 3.3: Add last sync timestamp to SourcesPanel

**Files:**
- Modify: `src/components/sources/ConnectorCard.tsx`
- Read: connector status data shape

- [ ] **Step 1: Display "Ultimo sync: 2h fa" on each ConnectorCard**

The ConnectorCard already receives status data. Add a relative-time display below the sync/disconnect buttons using the `lastSyncAt` field from connector status.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: show last sync timestamp on connector cards"
```

### Task 3.4: Rename Presence terminology

**Files:**
- Modify: `src/components/presence/PresencePanel.tsx:165,183,201`
- Modify: `src/lib/i18n/ui-strings.ts`
- Test: visual verification

- [ ] **Step 1: Add L10N keys for presence dimensions**

Add to `ui-strings.ts`:
- `presenceBackground` (en: "Background", it: "Sfondo", ...)
- `presenceTypography` (en: "Typography", it: "Tipografia", ...)
- `presenceMode` (en: "Mode", it: "Modalita", ...)
- `presencePresets` (en: "Preset styles", it: "Stili predefiniti", ...)

- [ ] **Step 2: Replace hardcoded strings in PresencePanel**

At lines 165, 183, 201 — replace "Surface", "Voice", "Light" with L10N calls.
Replace "Signature Combinations" header with L10N key.

- [ ] **Step 3: Add visual swatches**

- Surface options: small colored dot (background color swatch) next to each name
- Voice options: "Aa" in the actual font next to each name
- These are CSS-only additions, no new components needed

- [ ] **Step 4: Run full test suite**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: localize presence panel labels (Surface→Sfondo, Voice→Tipografia)

Replace hardcoded English labels with L10N keys for all 8 languages.
Add visual swatches for background colors and font previews."
```

---

## Chunk 4: WS-6 (Hero Links) + WS-4 (Section Visibility)

### Task 4.1: Add social link hero icon mapping

**Files:**
- Modify: `src/lib/services/page-composer.ts` — hero section composition
- Create: `src/lib/social-links.ts` — platform definitions + icon mapping
- Modify: hero section component (theme-specific)
- Test: `tests/evals/social-links.test.ts`

- [ ] **Step 1: Define social link platform registry**

```typescript
// src/lib/social-links.ts
export const SOCIAL_PLATFORMS = {
  linkedin: { icon: "Linkedin", label: "LinkedIn", urlPattern: /linkedin\.com/ },
  email: { icon: "Mail", label: "Email", urlPattern: /^mailto:/ },
  twitter: { icon: "Twitter", label: "X / Twitter", urlPattern: /x\.com|twitter\.com/ },
  website: { icon: "Globe", label: "Website", urlPattern: null },
  calendly: { icon: "Calendar", label: "Calendly", urlPattern: /calendly\.com/ },
  mastodon: { icon: "AtSign", label: "Mastodon", urlPattern: /mastodon/ },
  bluesky: { icon: "Cloud", label: "Bluesky", urlPattern: /bsky\.app/ },
  threads: { icon: "Hash", label: "Threads", urlPattern: /threads\.net/ },
  github: { icon: "Github", label: "GitHub", urlPattern: /github\.com/ },
  spotify: { icon: "Music", label: "Spotify", urlPattern: /spotify\.com/ },
  strava: { icon: "Activity", label: "Strava", urlPattern: /strava\.com/ },
} as const;

export type SocialPlatform = keyof typeof SOCIAL_PLATFORMS;
```

**IMPORTANT:** Use the existing `social` fact category (not a new `social_link` category). The `social` category is already handled by `page-composer.ts` in fact grouping (`grouped.get("social")`) and by `identityMatch()` in clustering (`case "social":`). Adding a new category would require updating both systems and risks silent data loss. The value shape `{platform, url, label?}` is compatible with the existing social fact structure.

- [ ] **Step 2: Write test for social link composition into hero**

- [ ] **Step 3: Modify hero section composition to include social facts**

In `page-composer.ts`, when building the hero section, collect `social` category facts and include them as `socialLinks` array in hero content.

- [ ] **Step 4: Update Hero component — mobile horizontal scroll row with icons**

```tsx
// Mobile: horizontal scroll of icon buttons, 44px touch targets
<div className="flex gap-3 overflow-x-auto py-2 -mx-2 px-2 scrollbar-hide">
  {socialLinks.map(link => (
    <a
      key={link.platform}
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--page-fg,#333)]/20 transition-colors hover:bg-[var(--page-fg,#333)]/10"
      aria-label={link.label}
    >
      <Icon name={SOCIAL_PLATFORMS[link.platform].icon} size={20} />
    </a>
  ))}
</div>
```

- [ ] **Step 5: Add optional CTA button**

If a fact with category `social` and key `cta` exists (value: `{label, url}`), render a prominent CTA button below the icons.

- [ ] **Step 6: Update agent onboarding — ask for contact links**

In `src/lib/agent/policies/first-visit.ts`, add a phase instruction: after basic identity facts are collected, ask "Vuoi aggiungere link di contatto? (LinkedIn, email, sito web...)"

- [ ] **Step 7: Run tests and commit**

```bash
git commit -m "feat: social links with icons in hero section (mobile horizontal scroll)"
```

### Task 4.2: Section visibility — migration + agent tool

**Files:**
- Create: `db/migrations/0037_hidden_sections.sql`
- Modify: `src/lib/db/schema.ts:164-175`
- Create: `src/lib/services/section-visibility-service.ts`
- Modify: `src/lib/agent/tools.ts` — add `toggle_section_visibility` tool
- Test: `tests/evals/section-visibility.test.ts`

- [ ] **Step 1: Write migration**

```sql
-- db/migrations/0037_hidden_sections.sql
ALTER TABLE page ADD COLUMN hidden_sections TEXT DEFAULT '[]';
```

- [ ] **Step 2: Update Drizzle schema**

Add `hiddenSections` column to page table in `schema.ts`.

- [ ] **Step 3: Write section visibility service**

```typescript
// src/lib/services/section-visibility-service.ts
export async function getHiddenSections(pageId: string, db?: DB): Promise<string[]> {
  const d = db ?? getDb();
  const row = await d.select({ hiddenSections: page.hiddenSections }).from(page).where(eq(page.id, pageId)).get();
  return row?.hiddenSections ? JSON.parse(row.hiddenSections) : [];
}

export async function toggleSectionVisibility(
  pageId: string,
  sectionType: string,
  visible: boolean,
  db?: DB
): Promise<string[]> {
  const current = await getHiddenSections(pageId, db);
  const updated = visible
    ? current.filter(s => s !== sectionType)
    : [...new Set([...current, sectionType])];
  const d = db ?? getDb();
  await d.update(page).set({ hiddenSections: JSON.stringify(updated) }).where(eq(page.id, pageId));
  return updated;
}
```

- [ ] **Step 4: Write test**

- [ ] **Step 5: Add agent tool `toggle_section_visibility`**

In `tools.ts`, add:
```typescript
toggle_section_visibility: tool({
  description: "Show or hide a section on the page. Hidden sections are not visible to visitors.",
  parameters: z.object({
    sectionType: z.string().describe("The section type to toggle (e.g. 'music', 'activities', 'interests')"),
    visible: z.boolean().describe("true to show, false to hide"),
  }),
  execute: async ({ sectionType, visible }) => {
    // Use the session's page ID (sessionId), NOT the literal "draft"
    const hidden = await toggleSectionVisibility(sessionId, sectionType, visible, db);
    await recomposeAfterMutation(/* ... */);
    return { success: true, hiddenSections: hidden };
  },
})
```

- [ ] **Step 6: Filter hidden sections — pass as separate prop, not in canonical config**

Do NOT filter inside `projectCanonicalConfig()` — that would prevent ghost cards in builder preview. Instead:
- Read `hiddenSections` from the page row
- Pass it as a separate `hiddenSections` prop to `PageRenderer`
- `PageRenderer` filters them out for public pages (`isOwner=false`)
- `PageRenderer` keeps them with `hidden: true` flag for builder preview

- [ ] **Step 6b: Propagate hidden_sections to publish pipeline**

In `src/lib/services/publish-pipeline.ts`, before writing the published row in `prepareAndPublish()`:
- Use `getHiddenSections(sessionId, db)` from the new `section-visibility-service.ts` (created in Step 3) to retrieve hidden sections. Do NOT modify `DraftResult` — use the dedicated service instead:
```typescript
const hiddenSections = await getHiddenSections(sessionId, db);
const filteredConfig = {
  ...renderedConfig,
  sections: renderedConfig.sections.filter(s => !hiddenSections.includes(s.type)),
};
```
- The published row gets a clean config WITHOUT hidden sections
- Public page route (`src/app/[username]/page.tsx`) reads from published row which already has hidden sections removed — no filtering needed at render time for public pages
- Builder preview still gets all sections (with ghost cards for hidden ones)

- [ ] **Step 7: Register in COMPLETION_CLAIM_BACKING_TOOL_NAMES**

In `src/lib/agent/action-claim-guard.ts`, add `"toggle_section_visibility"` to the `COMPLETION_CLAIM_BACKING_TOOL_NAMES` set. Without this, the action-claim guard will rewrite successful completions as false.

- [ ] **Step 8: Update EXPECTED_SCHEMA_VERSION**

Update `EXPECTED_SCHEMA_VERSION` in `src/lib/db/migrate.ts` (NOT `src/worker.ts` — the worker imports the constant from `migrate.ts`) from 36 to 37.

- [ ] **Step 9: Run tests and commit**

```bash
git commit -m "feat: section visibility system — hide/show sections via agent tool

New hidden_sections column on page table. Agent tool toggle_section_visibility.
Hidden sections passed as separate prop to PageRenderer (not in canonical config).
Ghost cards in builder preview, filtered on public page.
Migration 0037."
```

### Task 4.3: Ghost cards for hidden sections in builder preview

**Files:**
- Create: `src/components/page/HiddenSectionCard.tsx`
- Modify: `PageRenderer.tsx` — render ghost cards for hidden sections

- [ ] **Step 1: Create HiddenSectionCard component (mobile-first)**

```tsx
// src/components/page/HiddenSectionCard.tsx
export function HiddenSectionCard({
  sectionType,
  onShow,
  l10n,
}: {
  sectionType: string;
  onShow: () => void;
  l10n: Record<string, string>;
}) {
  return (
    <div className="mx-4 my-2 flex items-center justify-between rounded-lg border border-dashed border-[var(--page-fg,#333)]/20 bg-[var(--page-fg,#333)]/5 px-4 py-3">
      <span className="text-sm text-[var(--page-fg,#888)]">
        {sectionType} — {l10n.hidden}
      </span>
      <button
        type="button"
        onClick={onShow}
        className="min-h-[44px] min-w-[44px] rounded-md px-3 text-sm font-medium text-[var(--page-fg,#ccc)] active:bg-[var(--page-fg,#333)]/10"
      >
        {l10n.show}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Integrate into PageRenderer**

- [ ] **Step 3: Add L10N keys** (`hidden`, `show` for all 8 languages)

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: ghost cards for hidden sections in builder preview"
```

---

## Chunk 5: WS-7 (Toast Feedback) + WS-8 (Unpublished Banner)

### Task 5.1: Wire toast to agent tool completions

**Files:**
- Modify: `src/components/layout/SplitView.tsx` — add toast context
- Modify: `src/components/chat/ChatPanel.tsx` — `onStepFinish` callback
- Create: `src/lib/i18n/tool-toast-messages.ts`

- [ ] **Step 1: Create tool → toast message mapping**

```typescript
// src/lib/i18n/tool-toast-messages.ts
export const TOOL_TOAST_MESSAGES: Record<string, Record<string, string>> = {
  curate_content: { en: "Content updated", it: "Contenuto aggiornato", ... },
  create_fact: { en: "Fact added", it: "Informazione aggiunta", ... },
  delete_fact: { en: "Fact removed", it: "Informazione rimossa", ... },
  batch_facts: { en: "Facts updated", it: "Informazioni aggiornate", ... },
  generate_page: { en: "Page generated", it: "Pagina generata", ... },
  update_page_style: { en: "Style updated", it: "Stile aggiornato", ... },
  reorder_sections: { en: "Sections reordered", it: "Sezioni riordinate", ... },
  toggle_section_visibility: { en: "Section visibility changed", it: "Visibilità sezione modificata", ... },
  request_publish: { en: "Publish requested", it: "Pubblicazione richiesta", ... },
};
```

- [ ] **Step 2: Wire into ChatPanel's onStepFinish**

When `onStepFinish` fires with a tool call result where `success: true`, look up the tool name in `TOOL_TOAST_MESSAGES` and call `showToast()`.

- [ ] **Step 3: Add `ToastContainer` to SplitView layout**

```tsx
// In SplitView, render ToastContainer:
// Mobile: above bottom tab bar (shifts down when keyboard open)
// Desktop: bottom-right of preview pane
<ToastContainer
  toasts={toastManager.toasts}
  onDismiss={toastManager.dismissToast}
  mobile={isMobile}
  tabBarVisible={!keyboardOpen}
/>
```

**Note:** `keyboardOpen` state already exists in SplitView (visual viewport height detection). Pass it to `ToastContainer` — no new code needed.

- [ ] **Step 4: Test visually on mobile (390px) and desktop**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: toast notifications for agent actions (mobile-first)"
```

### Task 5.2: Unpublished changes banner with diff and discard

**Files:**
- Modify: `src/components/layout/UnpublishedBanner.tsx` (created in Task 2.3)
- Create: `src/lib/services/page-diff-service.ts`
- Test: `tests/evals/page-diff-service.test.ts`

- [ ] **Step 0: Extract `stableDeepEqual` to shared module.** The function exists in `src/lib/agent/tools.ts` (line 271) but is not exported. Create `src/lib/utils/stable-deep-equal.ts` exporting `stableDeepEqual` and its internal `sortKeys` helper. Update `tools.ts` to import from the shared module.

> PREREQUISITE: Complete Step 0 (extract stableDeepEqual) before implementing Step 1.

- [ ] **Step 1: Write page diff service**

```typescript
// src/lib/services/page-diff-service.ts
export interface PageChange {
  sectionType: string;
  changeType: "added" | "modified" | "removed" | "hidden" | "shown" | "reordered";
}

export function computePageDiff(
  draft: PageConfig | null,
  published: PageConfig | null
): PageChange[] {
  if (!draft || !published) return [];
  const changes: PageChange[] = [];

  const draftSections = new Map(draft.sections.map(s => [s.type, s]));
  const pubSections = new Map(published.sections.map(s => [s.type, s]));

  // NOTE: Use stableDeepEqual instead of JSON.stringify — JSON.stringify comparison
  // is key-order-dependent and produces false positives.
  import { stableDeepEqual } from "@/lib/utils/stable-deep-equal";
  for (const [type, section] of draftSections) {
    if (!pubSections.has(type)) {
      changes.push({ sectionType: type, changeType: "added" });
    } else if (!stableDeepEqual(section.content, pubSections.get(type)!.content)) {
      changes.push({ sectionType: type, changeType: "modified" });
    }
  }
  for (const type of pubSections.keys()) {
    if (!draftSections.has(type)) {
      changes.push({ sectionType: type, changeType: "removed" });
    }
  }
  return changes;
}
```

- [ ] **Step 2: Write test**

- [ ] **Step 3: Update UnpublishedBanner to show change count and expandable list**

Mobile: tap → bottom sheet with change list + Pubblica/Scarta buttons.
Desktop: click → inline dropdown.

- [ ] **Step 4: Add "Scarta modifiche" API endpoint**

`POST /api/draft/discard` — replaces draft config with published config.

- [ ] **Step 5: Run tests and commit**

```bash
git commit -m "feat: unpublished changes banner with diff list and discard (mobile bottom sheet)"
```

---

## Chunk 6: WS-3 — Canvas-Style Preview Interaction

**Depends on:** WS-2 (SplitView decomposition)

### Task 6.1: Section click handler in PageRenderer

**Files:**
- Modify: `src/components/page/PageRenderer.tsx:15-19`
- Create: `src/components/page/SectionInteractionWrapper.tsx`
- Test: `tests/evals/section-interaction.test.ts`

- [ ] **Step 1: Extend PageRenderer props**

```typescript
// Add to PageRendererProps:
export type PageRendererProps = {
  config: PageConfig;
  previewMode?: boolean;
  isOwner?: boolean;
  onSectionAction?: (action: SectionAction) => void; // NEW — null on public pages
  hiddenSections?: string[];                          // NEW — for ghost cards
};

export type SectionAction = {
  type: "edit" | "hide" | "show" | "moveUp" | "moveDown";
  sectionType: string;
  sectionIndex: number;
  contentSummary?: string; // for edit — first 100 chars of section content
};
```

- [ ] **Step 2: Create SectionInteractionWrapper**

Wraps each section in the builder preview with hover/long-press handlers:

```tsx
// src/components/page/SectionInteractionWrapper.tsx
"use client";
import { useRef, useCallback, useEffect, useState } from "react";

export function SectionInteractionWrapper({
  children,
  sectionType,
  sectionIndex,
  onAction,
  isMobile,
}: {
  children: React.ReactNode;
  sectionType: string;
  sectionIndex: number;
  onAction: (action: SectionAction) => void;
  isMobile: boolean;
}) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>();
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const [showMenu, setShowMenu] = useState(false);

  // Cleanup timer on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };
  }, []);

  // Desktop: hover shows action bar
  // Mobile: long-press (300ms) opens bottom sheet
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isMobile) return;
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    longPressTimer.current = setTimeout(() => {
      navigator.vibrate?.(10);
      onAction({ type: "edit", sectionType, sectionIndex }); // triggers bottom sheet
    }, 300);
  }, [isMobile, sectionType, sectionIndex, onAction]);

  // Cancel long-press if user scrolls (delta > 10px)
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartPos.current) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchStartPos.current.x);
    const dy = Math.abs(touch.clientY - touchStartPos.current.y);
    if (dx > 10 || dy > 10) {
      clearTimeout(longPressTimer.current);
      touchStartPos.current = null;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    clearTimeout(longPressTimer.current);
    touchStartPos.current = null;
  }, []);

  return (
    <div
      className="group relative"
      style={{ userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
      onContextMenu={(e) => e.preventDefault()}
      onMouseEnter={() => !isMobile && setShowMenu(true)}
      onMouseLeave={() => !isMobile && setShowMenu(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* Desktop hover action bar */}
      {!isMobile && showMenu && (
        <SectionActionBar
          sectionType={sectionType}
          sectionIndex={sectionIndex}
          onAction={onAction}
        />
      )}
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Write test for long-press triggering action**

- [ ] **Step 4: Integrate into PageRenderer section loop**

In `renderSection()`, wrap each section with `SectionInteractionWrapper` only when `onSectionAction` is provided (builder context).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: section interaction wrapper — hover (desktop) + long-press (mobile)"
```

### Task 6.2: Mobile bottom sheet for section actions

**Files:**
- Create: `src/components/ui/BottomSheet.tsx`
- Create: `src/components/page/SectionActionSheet.tsx`

- [ ] **Step 1: Create reusable BottomSheet component (mobile-first)**

```tsx
// src/components/ui/BottomSheet.tsx
"use client";
import { useEffect, useRef, useCallback } from "react";

export function BottomSheet({
  open,
  onClose,
  children,
  title,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);

  // Body scroll lock
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Focus trap — auto-focus sheet on open
  useEffect(() => {
    if (open && sheetRef.current) sheetRef.current.focus();
  }, [open]);

  // Swipe-to-dismiss on entire sheet body (not just drag handle pill)
  const handleDragTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
  }, []);
  const handleDragTouchEnd = useCallback((e: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const deltaY = e.changedTouches[0].clientY - dragStartY.current;
    if (deltaY > 60) onClose();
    dragStartY.current = null;
  }, [onClose]);

  const titleId = title ? `bottom-sheet-title-${title.replace(/\s/g, '-')}` : undefined;

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[400] bg-black/50 transition-opacity"
        onClick={onClose}
      />
      {/* Sheet — swipe-to-dismiss handlers are on the entire sheet container
           (not just the drag handle pill), so users can swipe anywhere on the sheet to dismiss. */}
      <div
        ref={sheetRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed bottom-0 left-0 right-0 z-[401] rounded-t-2xl bg-[#1a1a1a] outline-none bottom-sheet-slide-up"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        onTouchStart={handleDragTouchStart}
        onTouchEnd={handleDragTouchEnd}
      >
        {/* Drag handle pill */}
        <div className="flex justify-center py-3">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>
        {title && (
          <h3 id={titleId} className="px-6 pb-3 text-lg font-semibold text-white">{title}</h3>
        )}
        <div className="px-6 pb-6">{children}</div>
      </div>
    </>
  );
}
// NOTE: Define the `bottom-sheet-slide-up` animation in `globals.css`:
// @keyframes bottomSheetSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
// .bottom-sheet-slide-up { animation: bottomSheetSlideUp 0.25s ease-out; }
// @media (prefers-reduced-motion: reduce) { .bottom-sheet-slide-up { animation: none; } }
```

**Accessibility:** Add `role="dialog"` and `aria-modal="true"` to the sheet container div (shown above). For a true focus trap, use the `inert` attribute on `document.querySelector('main')` while the sheet is open (cleanup on close). The `inert` approach is simpler and has broad browser support (2023+). Add the following `useEffect` inside the BottomSheet component:

```typescript
// Focus trap via inert attribute
useEffect(() => {
  if (!open) return;
  const main = document.querySelector("main");
  if (main) main.setAttribute("inert", "");
  return () => { main?.removeAttribute("inert"); };
}, [open]);
```

- [ ] **Step 2: Create SectionActionSheet**

```tsx
// src/components/page/SectionActionSheet.tsx
export function SectionActionSheet({
  sectionType,
  sectionIndex,
  totalSections,
  isHidden,
  onAction,
  onClose,
  l10n,
}: Props) {
  const actions = [
    {
      label: l10n.editWithChat, // "Modifica con chat"
      icon: "MessageSquare",
      action: () => onAction({ type: "edit", sectionType, sectionIndex }),
    },
    {
      label: isHidden ? l10n.showSection : l10n.hideSection,
      icon: isHidden ? "Eye" : "EyeOff",
      action: () => onAction({ type: isHidden ? "show" : "hide", sectionType, sectionIndex }),
    },
    ...(sectionIndex > 0 ? [{
      label: l10n.moveUp,
      icon: "ChevronUp",
      action: () => onAction({ type: "moveUp", sectionType, sectionIndex }),
    }] : []),
    ...(sectionIndex < totalSections - 1 ? [{
      label: l10n.moveDown,
      icon: "ChevronDown",
      action: () => onAction({ type: "moveDown", sectionType, sectionIndex }),
    }] : []),
  ];

  return (
    <div className="space-y-1">
      {actions.map(a => (
        <button
          key={a.label}
          type="button"
          onClick={() => { a.action(); onClose(); }}
          className="flex w-full items-center gap-4 rounded-xl px-4 py-3.5 text-left text-white active:bg-white/10 min-h-[44px]"
        >
          <Icon name={a.icon} size={20} className="shrink-0 text-white/60" />
          <span>{a.label}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Wire bottom sheet into SplitView mobile preview**

When `onSectionAction` fires with `type: "edit"`, open bottom sheet on mobile. When user taps "Modifica con chat", switch to chat tab with context injected.

When the bottom sheet opens, explicitly close PresencePanel (`setPresenceOpen(false)`) and ActivityDrawer (`setActivityOpen(false)`) to prevent z-index conflicts. The BottomSheet at z-401 renders above PresencePanel (z-200) and ActivityDrawer (z-200), but without mutual exclusion, background panels remain interactive.

```typescript
// In SplitView.tsx:
const [pendingAction, setPendingAction] = useState<SectionAction | null>(null);

const handleSectionAction = useCallback((action: SectionAction) => {
  if (isMobile) {
    setPresenceOpen(false);
    setActivityOpen(false);
    setPendingAction(action);
  } else {
    // Desktop: handle inline (edit → inject chat context, hide/reorder → call agent tool)
    handleDesktopAction(action);
  }
}, [isMobile]);

// In JSX (mobile):
<BottomSheet open={!!pendingAction} onClose={() => setPendingAction(null)} title={pendingAction?.sectionType}>
  {pendingAction && <SectionActionSheet ... onAction={handleSectionAction} onClose={() => setPendingAction(null)} />}
</BottomSheet>
```

- [ ] **Step 4: Add L10N keys for all action labels**

- [ ] **Step 5: Add first-time hint in Preview tab**

```tsx
// Bottom of mobile preview content:
{!hasSeenHint && (
  <div className="mx-4 mb-4 rounded-xl bg-amber-900/20 px-4 py-3 text-sm text-amber-200">
    {l10n.longPressHint} {/* "Tieni premuto su una sezione per modificarla" */}
    <button type="button" onClick={() => setHasSeenHint(true)} className="ml-2 underline">
      {l10n.dismiss}
    </button>
  </div>
)}
```

Persist `hasSeenHint` in localStorage.

- [ ] **Step 6: Run tests and commit**

```bash
git commit -m "feat: mobile bottom sheet for section actions (long-press → edit/hide/reorder)"
```

### Task 6.3: Desktop hover action bar

**Files:**
- Create: `src/components/page/SectionActionBar.tsx`

- [ ] **Step 1: Create desktop action bar (appears on hover)**

```tsx
// src/components/page/SectionActionBar.tsx
export function SectionActionBar({ sectionType, sectionIndex, onAction }: Props) {
  return (
    <div className="absolute -top-3 right-4 z-10 flex gap-1 rounded-lg border border-white/10 bg-[#1a1a1a] p-1 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
      <ActionButton icon="Pencil" title="Modifica" onClick={() => onAction({ type: "edit", ... })} />
      <ActionButton icon="EyeOff" title="Nascondi" onClick={() => onAction({ type: "hide", ... })} />
      <ActionButton icon="ChevronUp" title="Sposta su" onClick={() => onAction({ type: "moveUp", ... })} />
      <ActionButton icon="ChevronDown" title="Sposta giù" onClick={() => onAction({ type: "moveDown", ... })} />
    </div>
  );
}
```

- [ ] **Step 2: Wire into SplitView desktop preview**

- [ ] **Step 3: Add onboarding tooltip for first visit**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: desktop section action bar (hover to edit/hide/reorder)"
```

### Task 6.4: Chat context injection on "Modifica con chat"

**Files:**
- Modify: `src/components/chat/ChatPanel.tsx`
- Create: `src/hooks/usePreviewInteraction.ts`

- [ ] **Step 1: Create usePreviewInteraction hook**

**Note:** `extractContentSummary(section)` extracts the first meaningful text from a section's content (e.g., `content.text` for bio, `content.name` for hero). Define it inline in the hook file:
```typescript
function extractContentSummary(section: Section): string {
  const c = section.content;
  const text = c?.text || c?.name || c?.headline || JSON.stringify(c);
  return typeof text === 'string' ? text.slice(0, 100) : '';
}
```

```typescript
// src/hooks/usePreviewInteraction.ts
export interface SectionContext {
  sectionType: string;
  contentSummary: string;
  prompt: string; // e.g. "Modifica la sezione Bio: "
}

export function usePreviewInteraction() {
  const [pendingContext, setPendingContext] = useState<SectionContext | null>(null);
  const pendingContextRef = useRef<SectionContext | null>(null);

  const injectSectionContext = useCallback((action: SectionAction, config: PageConfig) => {
    const section = config.sections[action.sectionIndex];
    const summary = extractContentSummary(section);
    const ctx: SectionContext = {
      sectionType: action.sectionType,
      contentSummary: summary,
      prompt: `[Modifica sezione ${action.sectionType}] `,
    };
    pendingContextRef.current = ctx;
    setPendingContext(ctx); // triggers re-render for ChatPanel to read
  }, []);

  const consumeContext = useCallback(() => {
    pendingContextRef.current = null;
    setPendingContext(null);
  }, []);

  return { pendingContext, injectSectionContext, consumeContext };
}
```

- [ ] **Step 2: Wire into ChatPanel — pre-fill input and focus**

ChatPanel reads `pendingContext` directly from the hook state (not from a return value). Call `consumeContext()` only to clear the context after ChatPanel has consumed it via `useEffect`.

**IMPORTANT — iOS focus timing:** After switching to chat tab via `setActiveMobileTab("chat")`, the ChatPanel input becomes visible asynchronously. `input.focus()` must be deferred with `setTimeout(() => inputRef.current?.focus(), 50)` to allow the browser to composite the layout change before focusing. Synchronous focus will fail silently on iOS.

- [ ] **Step 3: Test the full flow: long-press → bottom sheet → "Modifica" → chat tab with context**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: chat context injection from section interaction (Canvas-style)"
```

---

## Chunk 7: WS-10 — Full Marketing Landing Page

### Task 7.1: Landing page structure (mobile-first)

**Files:**
- Rewrite: `src/app/page.tsx`
- Create: `src/components/landing/HeroSection.tsx`
- Create: `src/components/landing/HowItWorks.tsx`
- Create: `src/components/landing/Features.tsx`
- Create: `src/components/landing/LiveExample.tsx`
- Create: `src/components/landing/Testimonials.tsx`
- Create: `src/components/landing/FAQ.tsx`
- Create: `src/components/landing/Footer.tsx`

- [ ] **Step 1: Create component structure**

Each section is a standalone component. Mobile-first: single column at 390px, grid layouts at 768px+.

- [ ] **Step 2: Hero section (refine existing)**

Keep the strong headline "Talk for 5 minutes. Get a living personal page." Add a subtitle and two CTAs. Mobile: full-width stacked buttons.

- [ ] **Step 3: How it works — 3 steps**

```
1. Start a conversation → "Tell the AI about yourself"
2. Connect your sources → "GitHub, Spotify, Strava, LinkedIn"
3. Publish your page → "One click, live on the web"
```

Mobile: vertical stack with numbered badges. Desktop: horizontal 3-column.

- [ ] **Step 4: Feature highlights — 4 cards**

AI Conversation, Smart Connectors, Presence Design System, Real-time Preview. Each with icon + title + description. Mobile: 1-column stack. Desktop: 2x2 grid.

- [ ] **Step 5: Live example — embedded screenshot**

Screenshot of a real profile (or the demo profile). Mobile: full-width image. Desktop: centered with max-width.

- [ ] **Step 6: Testimonials section — placeholder-ready**

Card grid structure, ready for content. Initially show 3 placeholder cards with "Coming soon" or leave empty with a "Join the beta" CTA instead.

- [ ] **Step 7: FAQ — accordion**

5-6 items: "What is OpenSelf?", "Is it free?", "Where is my data stored?", "Can I use my own domain?", "Which AI models do you use?", "How do I delete my account?"

- [ ] **Step 8: Footer**

Privacy policy link, Terms of Service link, social links, "Built with AI by OpenSelf" badge.

- [ ] **Step 9: Add `export const dynamic = "force-static"` to page.tsx**

**IMPORTANT:** All landing page components MUST be pure presentational — no `"use client"` hooks that touch `window`/`navigator`/`localStorage` (except FAQ accordion which can use a client component wrapped in the page). No imports from `src/lib/db/` or any server-side-only module. The FAQ accordion can use a simple client component with `useState` for open/close state — this is compatible with `force-static` because it's a client component rendered on the client, not a server-side API dependency.

- [ ] **Step 10: Test on mobile (390px) and desktop (1440px)**

- [ ] **Step 11: Commit**

```bash
git commit -m "feat: full marketing landing page (mobile-first, force-static)

Hero, How it works (3 steps), Features (4 cards), Live example,
Testimonials (placeholder), FAQ (5 items), Footer with legal links."
```

---

## Chunk 8: WS-11 — Auth Upgrade

### Task 8.1: Email adapter abstraction

**Files:**
- Create: `src/lib/email/types.ts`
- Create: `src/lib/email/resend-adapter.ts`
- Create: `src/lib/email/smtp-adapter.ts`
- Create: `src/lib/email/index.ts`
- Test: `tests/evals/email-adapter.test.ts`

- [ ] **Step 1: Define EmailAdapter interface**

```typescript
// src/lib/email/types.ts
export interface EmailAdapter {
  sendEmail(opts: {
    to: string;
    subject: string;
    html: string;
    from?: string;
  }): Promise<{ success: boolean; error?: string }>;
}
```

- [ ] **Step 2: Implement ResendAdapter**

```typescript
// src/lib/email/resend-adapter.ts
import { Resend } from "resend";

export class ResendAdapter implements EmailAdapter {
  private client: Resend;
  constructor() {
    this.client = new Resend(process.env.RESEND_API_KEY);
  }
  async sendEmail(opts) {
    const { data, error } = await this.client.emails.send({
      from: opts.from ?? "OpenSelf <noreply@openself.dev>",
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    return error ? { success: false, error: error.message } : { success: true };
  }
}
```

- [ ] **Step 3: Implement SMTPAdapter (self-hosted fallback)**

Uses `nodemailer` with `EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT`, `EMAIL_SMTP_USER`, `EMAIL_SMTP_PASS` env vars.

- [ ] **Step 4: Factory function**

```typescript
// src/lib/email/index.ts
export function getEmailAdapter(): EmailAdapter {
  if (process.env.RESEND_API_KEY) return new ResendAdapter();
  if (process.env.EMAIL_SMTP_HOST) return new SMTPAdapter();
  // No-op adapter — logs warning, returns error. Does NOT crash server.
  return {
    async sendEmail() {
      console.warn("[email] No email provider configured. Set RESEND_API_KEY or EMAIL_SMTP_* env vars.");
      return { success: false, error: "email_not_configured" };
    }
  };
}
```

Callers must handle `{ success: false, error: 'email_not_configured' }` gracefully (e.g., return 503 to the user with a clear message).

- [ ] **Step 5: Write test**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: email adapter abstraction (Resend + SMTP fallback)"
```

### Task 8.2: Password reset flow

**Files:**
- Create: `db/migrations/0038_auth_tokens.sql`
- Create: `src/lib/auth/tokens.ts`
- Create: `src/app/forgot-password/page.tsx`
- Create: `src/app/reset-password/page.tsx`
- Create: `src/app/api/auth/forgot-password/route.ts`
- Create: `src/app/api/auth/reset-password/route.ts`
- Test: `tests/evals/password-reset.test.ts`

- [ ] **Step 1: Migration for auth tokens table**

```sql
CREATE TABLE auth_tokens (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  token_hash TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('password_reset', 'email_verification', 'magic_link')),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_auth_tokens_hash ON auth_tokens(token_hash);

CREATE TABLE auth_rate_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  action TEXT NOT NULL,
  attempted_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_auth_rate_ip_action ON auth_rate_limits(ip, action, attempted_at);
```

**Note:** Update `EXPECTED_SCHEMA_VERSION` in `src/lib/db/migrate.ts` (NOT `src/worker.ts` — the worker imports the constant from `migrate.ts`) to 38.

- [ ] **Step 2: Token service**

Generate 32-byte random token, store SHA-256 hash in DB. 1h TTL for password reset.

**SECURITY:** Token verification MUST use `crypto.timingSafeEqual(Buffer.from(storedHash, 'hex'), Buffer.from(computedHash, 'hex'))` for constant-time comparison. A naive `===` comparison is vulnerable to timing attacks.

- [ ] **Step 3: Forgot password page (mobile-first)**

Email input (min-height 48px), "Invia link" button. Success: "Controlla la tua email".

- [ ] **Step 4: Reset password page**

Two password inputs + submit. Validates token from URL query param.

- [ ] **Step 5: API routes**

- [ ] **Step 6: Add link to login page: "Password dimenticata?" → `/forgot-password`**

- [ ] **Step 7: Run tests and commit**

```bash
git commit -m "feat: password reset flow (token-based, mobile-first UI)"
```

### Task 8.3: Email verification

**Files:**
- Modify: signup flow to send verification email
- Create: `src/app/verify-email/page.tsx`
- Modify: publish pipeline to check verification status

- [ ] **Step 1: On signup, generate verification token and send email**

- [ ] **Step 2: Verification page — click link → mark verified**

- [ ] **Step 3: Builder banner for unverified users**

"Verifica la tua email per pubblicare la tua pagina" with "Reinvia email" button.

- [ ] **Step 4: Block publish for unverified users**

In `publish-pipeline.ts`, add check: if user not verified → return error.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: email verification (required for publish)"
```

### Task 8.4: Magic link login

**Files:**
- Create: `src/app/api/auth/magic-link/route.ts`
- Modify: login page to add "Accedi con link magico" option

- [ ] **Step 1: API route — generate token, send email with login link**

- [ ] **Step 2: Callback route — validate token, create session, redirect to builder**

- [ ] **Step 3: Add to login page UI**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: magic link passwordless login"
```

### Task 8.5: Auth rate limiting

**Files:**
- Create: `src/lib/auth/rate-limit.ts`
- Modify: all auth API routes to check rate limits

- [ ] **Step 1: Rate limit service (SQLite-based)**

```typescript
// src/lib/auth/rate-limit.ts
export async function checkRateLimit(
  ip: string,
  action: "login" | "password_reset" | "magic_link",
  db?: DB
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const limits = { login: { max: 5, windowMinutes: 15 }, password_reset: { max: 3, windowMinutes: 60 }, magic_link: { max: 3, windowMinutes: 60 } };
  // Count attempts in window, return 429 if exceeded
}
```

- [ ] **Step 2: Apply to all auth endpoints**

- [ ] **Step 2b: Add rate limit cleanup to global housekeeping.** In `src/lib/worker/heartbeat.ts` `runGlobalHousekeeping()`, add cleanup for `auth_rate_limits`: delete records older than 24 hours. This prevents unbounded table growth:
```typescript
// Use SQLite datetime function — NOT JS toISOString() (format mismatch)
sqlite.prepare(`DELETE FROM auth_rate_limits WHERE attempted_at < datetime('now', '-24 hours')`).run();
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: per-IP rate limiting on auth endpoints (SQLite-based)"
```

---

## Chunk 9: WS-12 — SEO & Social Sharing

### Task 9.1: Dynamic metadata for public pages

**Files:**
- Modify: `src/app/[username]/page.tsx:19-32`

- [ ] **Step 1: Enhance `generateMetadata`**

Note: `getPublishedPage` is synchronous (returns `PageConfig | null`, not a Promise).

```typescript
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const config = getPublishedPage(username);
  if (!config) return { title: "Not Found | OpenSelf" };

  const hero = config.sections.find(s => s.type === "hero");
  const bio = config.sections.find(s => s.type === "bio");
  const name = hero?.content?.name ?? username;
  const title = hero?.content?.headline ?? "";
  const description = bio?.content?.text?.slice(0, 160) ?? `${name} on OpenSelf`;
  const ogImageUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/og/${username}.png`;

  return {
    title: `${name} | OpenSelf`,
    description,
    openGraph: {
      title: `${name} — ${title}`,
      description,
      type: "profile",
      url: `${process.env.NEXT_PUBLIC_BASE_URL}/${username}`,
      images: [{ url: ogImageUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${name} — ${title}`,
      description,
      images: [ogImageUrl],
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: dynamic OG + Twitter Card metadata for public profiles"
```

### Task 9.2: OG image generation with satori

**Files:**
- Create: `src/app/api/og/[username]/route.tsx`
- Add fonts: `public/fonts/PlusJakartaSans-Bold.woff`, `CormorantGaramond-Bold.woff`

- [ ] **Step 1: Install satori**

Run: `npm install satori`

- [ ] **Step 2: Bundle fonts as static assets**

Download `.woff` files for the 3 presence fonts. Place in `public/fonts/`.

- [ ] **Step 3: Create OG image API route**

```typescript
// src/app/api/og/[username]/route.tsx
import satori from "satori";
import { readFile } from "fs/promises";
import { join } from "path";

// Required: satori + @resvg/resvg-js need Node.js runtime
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params; // Next.js 15: params is a Promise
  // Note: getPublishedPage is synchronous (returns PageConfig | null)
  const config = getPublishedPage(username);
  if (!config) return new Response("Not found", { status: 404 });

  const hero = config.sections.find(s => s.type === "hero");
  const name = hero?.content?.name ?? username;
  const headline = hero?.content?.headline ?? "";

  const fontData = await readFile(join(process.cwd(), "public/fonts/PlusJakartaSans-Bold.woff"));

  const svg = await satori(
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-start", width: 1200, height: 630, padding: 80, background: "#111113", color: "white" }}>
      <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.2 }}>{name}</div>
      <div style={{ fontSize: 28, color: "#888", marginTop: 16 }}>{headline}</div>
      <div style={{ fontSize: 20, color: "#555", marginTop: "auto" }}>openself.dev/{username}</div>
    </div>,
    {
      width: 1200,
      height: 630,
      fonts: [{ name: "PlusJakartaSans", data: fontData, weight: 700 }],
    }
  );

  // Convert SVG to PNG using resvg-js or sharp
  const { Resvg } = await import("@resvg/resvg-js");
  const resvg = new Resvg(svg);
  const png = resvg.render().asPng();

  return new Response(png, {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
  });
}
```

- [ ] **Step 4: Install resvg-js**

Run: `npm install @resvg/resvg-js`

- [ ] **Step 5: Test OG image generation**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: OG image generation with satori + resvg (Docker-compatible)"
```

### Task 9.3: JSON-LD structured data

**Files:**
- Modify: `src/app/[username]/page.tsx`

- [ ] **Step 1: Add JSON-LD Person schema**

```typescript
// In the page component, add:
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: hero?.content?.name,
  jobTitle: hero?.content?.headline,
  url: `${process.env.NEXT_PUBLIC_BASE_URL}/${username}`,
  sameAs: socialLinks.map(l => l.url),
  worksFor: currentJob ? { "@type": "Organization", name: currentJob.company } : undefined,
};

// In JSX:
<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: JSON-LD Person schema for public profiles"
```

### Task 9.4: Sitemap and robots.txt

**Files:**
- Create: `src/app/sitemap.ts`
- Create: `src/app/robots.ts`

- [ ] **Step 0: Create `getAllPublishedUsernames()` in `src/lib/services/page-service.ts`.** Query the `page` table for all rows where `status = 'published'`, returning `{ username: string, updatedAt: string }[]`:

```typescript
const rows = db.select({ username: page.username, updatedAt: page.updatedAt })
  .from(page)
  .where(eq(page.status, "published"))
  .all();
```

- [ ] **Step 1: Dynamic sitemap**

```typescript
// src/app/sitemap.ts
import type { MetadataRoute } from "next";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const profiles = await getAllPublishedUsernames();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://openself.dev";

  return [
    { url: baseUrl, lastModified: new Date() },
    ...profiles.map(p => ({
      url: `${baseUrl}/${p.username}`,
      lastModified: new Date(p.updatedAt),
    })),
  ];
}
```

- [ ] **Step 2: robots.txt**

```typescript
// src/app/robots.ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${process.env.NEXT_PUBLIC_BASE_URL ?? "https://openself.dev"}/sitemap.xml`,
  };
}
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: dynamic sitemap.xml and robots.txt for SEO"
```

---

## Summary — Execution Order

| Phase | Workstreams | Dependency |
|---|---|---|
| **Phase 0** (start immediately, parallel) | WS-5 (notifications), WS-6 (hero links), WS-9 (presence terminology), WS-10 (landing page), WS-11 (auth), WS-12 (SEO) | Independent |
| **Phase 1** (critical path start) | WS-1 (composition pipeline fix) | None |
| **Phase 2** (after WS-1) | WS-2 (SplitView decomposition) | WS-1 |
| **Phase 3** (after WS-2, parallel) | WS-3 (canvas interaction), WS-4 (section visibility), WS-7 (toast), WS-8 (unpublished banner) | WS-2 |

**Total estimated tasks:** 35+
**Total estimated commits:** ~25-30

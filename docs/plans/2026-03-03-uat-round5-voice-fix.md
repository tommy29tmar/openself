# UAT Round 5 Fixes + Voice Mic Restart — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 11 bugs (10 from UAT Round 5 + 1 voice mic restart bug) across code, prompts, and validation layers.

**Architecture:** Fixes are independent and grouped by type: voice hooks (Task 1), layout registry (Task 2), agent prompts (Tasks 3-5), fact validation (Tasks 6-7), API routes (Tasks 8-9). Each task is self-contained with its own test+commit cycle. Prompt tasks are ordered so each test only gates on assertions that task implements.

**Tech Stack:** TypeScript, Next.js App Router, Vitest, React hooks, Web Speech API

**Test design note (Codex review #3-r6):** Tasks 1, 3, and 7 use source-text assertions (`readFileSync` + regex) rather than runtime behavioral tests. This is a deliberate tradeoff: (1) prompt tests assert exact prompt wording, which IS the behavior; (2) voice tests would require mocking `webkitSpeechRecognition` + `MediaRecorder` in Node.js with no JSDOM support, producing fragile tests for minimal behavioral coverage; (3) route test (Task 7) checks the auto-compose code path includes published-page fallback. These are structural regression guards — they catch the exact regressions they were written for.

---

### Task 1: Voice — Fix mic restart after TTS (VOICE BUG)

**Files:**
- Modify: `src/hooks/useSttProvider.ts:89` (recognition.onend noop)
- Modify: `src/hooks/useSttProvider.ts:162-164` (server fallback missing IDLE reset)
- Test: `tests/evals/voice-stt-provider.test.ts`

**Step 1: Write the failing tests**

Add to `tests/evals/voice-stt-provider.test.ts`:

```typescript
describe("STT state reset for auto-listen loop", () => {
  it("Web Speech: recognition.onend resets state to IDLE when in LISTENING", async () => {
    // The recognition.onend handler must NOT be a noop.
    // After natural recognition end (continuous=false), state must go to IDLE
    // so that startStt() can restart successfully (guard: state !== IDLE → return).
    const { VoiceSttState } = await import("@/hooks/useSttProvider");
    // Contract: IDLE is the only state from which start() proceeds
    expect(VoiceSttState.IDLE).toBe("idle");
    expect(VoiceSttState.LISTENING).toBe("listening");
    // Verify the onend handler is not empty by reading source
    const fs = await import("fs");
    const src = fs.readFileSync("src/hooks/useSttProvider.ts", "utf-8");
    // The noop `recognition.onend = () => {};` must be replaced with actual state reset
    expect(src).not.toMatch(/recognition\.onend\s*=\s*\(\)\s*=>\s*\{\s*\}/);
  });

  it("Server fallback: state resets to IDLE after successful onFinalResult", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("src/hooks/useSttProvider.ts", "utf-8");
    // After onFinalResult(data.text.trim()), there must be a setState(VoiceSttState.IDLE)
    // Look for the pattern: onFinalResult followed by setState IDLE in the server fallback onstop
    const onstopBlock = src.slice(src.indexOf("recorder.onstop"), src.indexOf("recorder.start"));
    expect(onstopBlock).toContain("onFinalResult(data.text.trim())");
    // Must contain IDLE reset after onFinalResult
    const afterFinalResult = onstopBlock.slice(onstopBlock.lastIndexOf("onFinalResult"));
    expect(afterFinalResult).toMatch(/setState\(VoiceSttState\.IDLE\)/);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/voice-stt-provider.test.ts`
Expected: 2 new tests FAIL (onend is noop, no IDLE after onFinalResult)

**Step 3: Fix useSttProvider.ts — Web Speech onend**

In `src/hooks/useSttProvider.ts`, replace line 89:

```typescript
// OLD:
recognition.onend = () => {};

// NEW:
recognition.onend = () => {
  // Gate by instance identity to prevent a late onend from a stale recognizer
  // from clobbering a newer active session (Codex review #1-r5: race condition fix)
  if (recognitionRef.current !== recognition) return;
  // Natural end of recognition session (continuous=false).
  // Reset to IDLE so startStt() can restart (guard: state !== IDLE → skip).
  // Preserve ERROR / PERMISSION_DENIED if set by onerror.
  setState((prev) =>
    prev === VoiceSttState.LISTENING ? VoiceSttState.IDLE : prev,
  );
  recognitionRef.current = null;
};
```

**Step 4: Fix useSttProvider.ts — Server fallback IDLE reset**

In `src/hooks/useSttProvider.ts`, after lines 163-164 (inside recorder.onstop, after `onFinalResult`), add:

```typescript
// OLD (lines 162-164):
if (data.text?.trim()) {
  onResult({ text: data.text.trim(), isFinal: true });
  onFinalResult(data.text.trim());
}

// NEW:
if (data.text?.trim()) {
  onResult({ text: data.text.trim(), isFinal: true });
  onFinalResult(data.text.trim());
  setState(VoiceSttState.IDLE); // Reset so startStt() can restart
}
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/evals/voice-stt-provider.test.ts`
Expected: ALL PASS

**Step 6: Run full voice test suite**

Run: `npx vitest run tests/evals/voice-*.test.ts`
Expected: ALL PASS (no regressions)

**Step 7: Commit**

```bash
git add src/hooks/useSttProvider.ts tests/evals/voice-stt-provider.test.ts
git commit -m "fix(voice): reset STT state after recognition end to enable auto-listen loop

recognition.onend was a noop — sttState stayed at LISTENING after
natural recognition end (continuous=false), blocking startStt() restart
after TTS completion. Server fallback had same issue: missing IDLE reset
after onFinalResult.

Fixes: mic blinking red but not recording after agent finishes speaking."
```

---

### Task 2: BUG-3 — Fix Architect layout 400

**Root cause (two issues):**
1. **Capacity**: Architect has only 7 non-hero/footer slots. Real pages have 8+. Fix: increase `full-row.maxSections` from 2 to 4.
2. **Widget carry-over**: When switching layouts, Phase 3 of `assignSlotsFromFacts` has `if (!s.widgetId) s.widgetId = widget.id;` — sections carry their old widgetId from the previous layout, which may not fit the new slot size. `validateLayoutComposition` then flags `incompatible_widget` (severity=error) → `set_layout` returns `success: false`. Fix: replace widgetId when the existing one doesn't fit the target slot.

**Files:**
- Modify: `src/lib/layout/registry.ts:211` (full-row maxSections)
- Modify: `src/lib/layout/assign-slots.ts:193` (widget compat guard in Phase 3)
- Test: `tests/evals/layout-registry.test.ts`
- Test: `tests/evals/assign-slots.test.ts`

**Step 1: Write the failing tests**

Add to `tests/evals/layout-registry.test.ts`:

```typescript
it("architect full-row slot accepts 4+ sections for real-world pages", () => {
  const template = getLayoutTemplate("architect");
  const fullRow = template.slots.find((s) => s.id === "full-row");
  expect(fullRow).toBeDefined();
  expect(fullRow!.maxSections).toBeGreaterThanOrEqual(4);
});
```

Add to `tests/evals/assign-slots.test.ts`:

```typescript
it("replaces incompatible widgetId when assigning section to new slot size", () => {
  const template = getLayoutTemplate("architect");
  // Simulate a section from monolith (wide slot) carrying a wide-only widget
  const sections = [
    { id: "s-hero", type: "hero", slot: undefined, widgetId: undefined },
    { id: "s-bio", type: "bio", slot: undefined, widgetId: "bio-full" }, // bio-full fits "wide" only
    { id: "s-skills", type: "skills", slot: undefined, widgetId: "skills-grid" }, // fits "wide"/"half"
    { id: "s-footer", type: "footer", slot: undefined, widgetId: undefined },
  ];
  const { sections: result, issues } = assignSlotsFromFacts(template, sections as any);
  const errors = issues.filter(i => i.severity === "error");
  // No incompatible_widget errors — widgetIds must be replaced if they don't fit
  expect(errors.filter(i => i.issue === "incompatible_widget")).toHaveLength(0);
  // Bio section should have a widget that fits its assigned slot
  const bio = result.find(s => s.id === "s-bio");
  expect(bio?.widgetId).toBeDefined();
  expect(bio?.widgetId).not.toBe("bio-full"); // Should have been replaced
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/layout-registry.test.ts tests/evals/assign-slots.test.ts`
Expected: At least 1 new test fails

**Step 3: Increase full-row maxSections**

In `src/lib/layout/registry.ts`, line 211:

```typescript
// OLD:
maxSections: 2,

// NEW:
maxSections: 4,
```

**Step 4: Fix widget carry-over in ALL assignment phases (Codex review #2-r3)**

In `src/lib/layout/assign-slots.ts`, add a helper at the top of `assignSlotsFromFacts` (after the slot capacity setup):

```typescript
// Move buildWidgetMap() call to top of function (from line ~225)
const widgetMap = buildWidgetMap();

// Helper: replace widgetId if it doesn't fit the target slot size
function ensureCompatibleWidget(section: Section, slotDef: FullSlotDefinition): void {
  if (section.widgetId) {
    const existing = widgetMap[section.widgetId];
    if (!existing || !existing.fitsIn.includes(slotDef.size)) {
      const compatible = getBestWidget(section.type as ComponentType, slotDef.size);
      if (compatible) section.widgetId = compatible.id;
    }
  }
}
```

Apply in Phase 1.5 (soft-pin, line ~89), replace:
```typescript
// OLD:
if (widget && !s.widgetId) s.widgetId = widget.id;

// NEW:
if (!s.widgetId && widget) s.widgetId = widget.id;
else ensureCompatibleWidget(s, slotDef);
```

Apply in Phase 3 (inside `for (const slot of ranked)`), replace:
```typescript
// OLD:
if (!s.widgetId) s.widgetId = widget.id;

// NEW:
if (!s.widgetId) {
  s.widgetId = widget.id;
} else {
  ensureCompatibleWidget(s, slot);
}
```

Note: Phase 1 (locked sections) intentionally keeps the user's locked widget. Phase 2 (hero/footer) uses dedicated slots with fixed sizes — no cross-template conflict.

**Step 5: Clear stale metadata on unplaceable sections (Codex review #3-r4)**

In `src/lib/layout/assign-slots.ts`, in the unplaceable branch (the `if (!placed)` block), clear stale `slot` and `widgetId` so they don't cause `incompatible_widget` errors during validation:

```typescript
// OLD:
if (!placed) {
  result.push({ ...section });

// NEW:
if (!placed) {
  result.push({ ...section, slot: undefined, widgetId: undefined });
```

Add a regression test in `tests/evals/assign-slots.test.ts`:

```typescript
it("unplaceable sections have slot/widgetId cleared — no error-severity issues", () => {
  const template = getLayoutTemplate("architect");
  // Create more sections than slots can hold, with stale slot/widgetId
  const sections = Array.from({ length: 15 }, (_, i) => ({
    id: `s-${i}`, type: "skills", slot: "main", widgetId: "skills-list",
    content: { groups: [{ skills: ["a"] }] },
  }));
  // Add hero + footer
  sections.unshift({ id: "hero", type: "hero", slot: "hero", widgetId: "hero-split", content: {} } as any);
  sections.push({ id: "footer", type: "footer", slot: "footer", widgetId: "footer-default", content: {} } as any);

  const { issues } = assignSlotsFromFacts(template, sections as any);
  const errors = issues.filter(i => i.severity === "error");
  // Unplaceable sections should only produce warnings, never errors
  expect(errors).toHaveLength(0);
});
```

**Step 6: Run tests to verify pass**

Run: `npx vitest run tests/evals/layout-registry.test.ts tests/evals/assign-slots.test.ts`
Expected: ALL PASS

**Step 6: Run full layout test suite**

Run: `npx vitest run tests/evals/layout-*.test.ts`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add src/lib/layout/registry.ts src/lib/layout/assign-slots.ts tests/evals/layout-registry.test.ts tests/evals/assign-slots.test.ts
git commit -m "fix(layout): increase architect capacity + fix widget carry-over on layout switch

Two issues caused 400 when switching to architect:
1. full-row maxSections was 2 (now 4) — real pages have 8+ sections
2. Phase 3 kept old widgetIds that didn't fit new slot sizes →
   incompatible_widget error. Now replaces widget when it doesn't
   fit the target slot.

Fixes: BUG-3 (Architect layout 400)"
```

---

### Task 3: BUG-7 + BUG-10 + BUG-9 + BUG-1 — All prompt fixes in one task

**Files:**
- Modify: `src/lib/agent/prompts.ts` (TOOL_POLICY + SAFETY_POLICY)
- Modify: `src/lib/agent/tools.ts:121` (identityGate message clarity)
- Test: `tests/evals/prompt-contracts.test.ts` (create)

**Step 1: Write all prompt contract tests**

Create `tests/evals/prompt-contracts.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("prompt contracts", () => {
  const src = readFileSync("src/lib/agent/prompts.ts", "utf-8");

  it("TOOL_POLICY includes tool failure honesty rule with REQUIRES_CONFIRMATION exception", () => {
    // BUG-7: agent must report tool failures honestly
    expect(src).toMatch(/success.*false.*MUST.*report/i);
    // But REQUIRES_CONFIRMATION is NOT a failure (Codex review #3: avoid contradiction)
    expect(src).toMatch(/REQUIRES_CONFIRMATION.*not.*failure|REQUIRES_CONFIRMATION.*not.*error/i);
    // BUG-4/BUG-5 (Codex review #3-r5): never claim action without tool call
    expect(src).toMatch(/NEVER claim.*saved.*updated.*deleted.*unless.*tool.*success/i);
  });

  it("TOOL_POLICY includes REQUIRES_CONFIRMATION handling for identity and delete", () => {
    // BUG-10 + BUG-9: agent must handle confirmation gates properly
    expect(src).toMatch(/REQUIRES_CONFIRMATION/);
    expect(src).toMatch(/confirm/i);
  });

  it("SAFETY_POLICY includes date fabrication prohibition", () => {
    // BUG-1: agent must not invent dates from approximate durations
    expect(src).toMatch(/fabricat.*date/i);
  });

  it("DATA_MODEL_REFERENCE includes unsupported features list", () => {
    // BUG-8: agent must not promise unsupported features
    expect(src).toMatch(/UNSUPPORTED FEATURES/i);
    expect(src).toMatch(/[Vv]ideo/);
  });
});
```

**Step 2: Run tests to verify failures**

Run: `npx vitest run tests/evals/prompt-contracts.test.ts`
Expected: "tool failure honesty" and "date fabrication" FAIL. "REQUIRES_CONFIRMATION" and "unsupported features" may already pass.

**Step 3: Add tool failure honesty rule to TOOL_POLICY (with REQUIRES_CONFIRMATION exception)**

In `src/lib/agent/prompts.ts`, add at the end of TOOL_POLICY (before the closing backtick at line ~85):

```
- TOOL RESULT HONESTY: When ANY tool returns success: false, you MUST report the failure to the user. NEVER claim an operation succeeded if the tool returned an error. Quote the error message so the user understands what went wrong. EXCEPTION: code "REQUIRES_CONFIRMATION" is not a failure — it is a confirmation gate (see identity protection and bulk deletion rules above). NEVER claim you saved, updated, or deleted data unless a tool call in this turn returned success: true. If you haven't called the tool, you haven't done the action.
```

**Step 4: Update IDENTITY PROTECTION rule in TOOL_POLICY (line 61)**

```
// OLD:
- IDENTITY PROTECTION: Modifying existing identity facts (name, role, tagline, etc.) requires explicit user confirmation in a new message. System enforces this — cannot be bypassed. If the tool returns REQUIRES_CONFIRMATION, ask the user to confirm and retry only after they do.

// NEW:
- IDENTITY PROTECTION: Modifying existing identity facts (name, role, tagline, etc.) triggers a confirmation gate. When a tool returns code: "REQUIRES_CONFIRMATION", you MUST: (1) explain what will change (e.g., "Il tuo nome cambierà da Marco Bellini a Giovanni Rossi"), (2) ask for explicit confirmation, (3) when the user confirms in their next message, retry the same tool call with the same parameters. Do NOT treat REQUIRES_CONFIRMATION as an error — it is a safety check, not a failure.
```

**Step 5: Update BULK DELETION rule in TOOL_POLICY (line 62)**

```
// OLD:
- BULK DELETION: 2nd+ deletion in a turn is blocked. Use batch_facts for multi-deletes (blocks ALL ≥2). Always list items and get explicit confirmation first.

// NEW (Codex review #2-r2: batch_facts pre-flight blocks ≥2 deletes without consuming pendings, so confirmed multi-delete must use sequential delete_fact):
- BULK DELETION: 2nd+ deletion in a turn triggers a confirmation gate. When delete_fact returns code: "REQUIRES_CONFIRMATION", list all items to be deleted and ask for explicit confirmation. When the user confirms in their next message, retry each deletion with individual delete_fact calls (do NOT use batch_facts for confirmed multi-delete — it blocks ≥2 deletes in pre-flight). Do NOT treat REQUIRES_CONFIRMATION as an error.
```

**Step 6: Add date fabrication rule to SAFETY_POLICY (before closing backtick at line 42)**

```
- NEVER fabricate precise dates from approximate durations. If the user says "8 years of experience", store the duration as a stat fact (e.g., {label: "Years Experience", value: "8+"}). Do NOT invent start/end dates like "2015-01 – 2023-01". Only create experience facts with dates when the user provides actual dates. If dates are needed for display, ask the user.
```

**Step 7: Improve identityGate message in tools.ts (operation-agnostic)**

In `src/lib/agent/tools.ts`, line 121, replace:

```typescript
// OLD:
return { requiresConfirmation: true, message: `Changing identity/${key} requires explicit user confirmation. Ask the user to confirm in their next message.` };

// NEW (Codex review #2: operation-agnostic, works for create_fact/update_fact/batch_facts):
return { requiresConfirmation: true, message: `Changing identity/${key} requires confirmation. Explain to the user what will change (old → new value) and ask them to confirm. The pending confirmation is stored — when they confirm in their next message, retry the same tool call with the same target and value.` };
```

**Step 8: Fix deleteGate pending consumption (Codex review #3-r3)**

In `src/lib/agent/tools.ts`, the `deleteGate` function at line ~133 splices the ENTIRE pending on the first matched factId. This means the 2nd+ confirmed delete finds no pending → blocks again. Fix: consume individual factIds, not the whole pending. Confirmed deletes DO increment `_deletionCountThisTurn` for safety (but the pending-match check runs BEFORE the count check, so confirmed deletes always pass).

Replace lines 132-138 of `deleteGate`:

```typescript
// OLD:
const matchIdx = pendings.findIndex(p => p.type === "bulk_delete" && p.factIds?.includes(factId));
if (matchIdx >= 0) {
  pendings.splice(matchIdx, 1);
  mergeSessionMeta(sessionId, { pendingConfirmations: pendings.length ? pendings : null });
  _deletionCountThisTurn++; // count it, so 2nd+ delete in same turn still blocks
  return null; // allowed
}

// NEW — consume per-factId (Codex review #2-r5: keep counter increment for safety):
const matchIdx = pendings.findIndex(p => p.type === "bulk_delete" && p.factIds?.includes(factId));
if (matchIdx >= 0) {
  const pending = pendings[matchIdx];
  pending.factIds = pending.factIds!.filter((id: string) => id !== factId);
  if (pending.factIds!.length === 0) {
    pendings.splice(matchIdx, 1);
  }
  mergeSessionMeta(sessionId, { pendingConfirmations: pendings.length ? pendings : null });
  _deletionCountThisTurn++; // Safe: pending check runs BEFORE count check, so subsequent confirmed deletes still pass
  return null; // allowed
}
```

**Step 8b: Fix deleteGate accumulation when already blocked (Codex review #2-r6)**

When `_deleteBlockedThisTurn` is true, subsequent blocked deletes return immediately without storing their factIds. This means only the triggering factId is in the pending — additional IDs are lost, so confirmation only covers one item.

In the `_deleteBlockedThisTurn` branch (line ~128), accumulate the factId:

```typescript
// OLD:
if (_deleteBlockedThisTurn) {
  return { requiresConfirmation: true, message: "Further deletions blocked this turn — wait for user confirmation in a new message." };
}

// NEW — accumulate factIds in existing pending (Codex review #2-r6):
if (_deleteBlockedThisTurn) {
  const existingPending = pendings.find(p => p.type === "bulk_delete");
  if (existingPending?.factIds && !existingPending.factIds.includes(factId)) {
    existingPending.factIds.push(factId);
    mergeSessionMeta(sessionId, { pendingConfirmations: pendings });
  }
  return { requiresConfirmation: true, message: "Further deletions blocked this turn — wait for user confirmation in a new message." };
}
```

Add a test in `tests/evals/bulk-delete-confirmation.test.ts`:

```typescript
it("blocked deletes accumulate all factIds in pending for confirmation", async () => {
  mockDeleteFact.mockReturnValue(true);
  const { tools } = createAgentTools("en", "s1");

  // First delete: allowed (count 0 → 1)
  await tools.delete_fact.execute({ factId: "f1" }, toolCtx);
  // Second delete: blocked, creates pending with ["f2"]
  const r2 = await tools.delete_fact.execute({ factId: "f2" }, toolCtx) as any;
  expect(r2.code).toBe("REQUIRES_CONFIRMATION");
  // Third delete: blocked, should accumulate "f3" into same pending
  const r3 = await tools.delete_fact.execute({ factId: "f3" }, toolCtx) as any;
  expect(r3.code).toBe("REQUIRES_CONFIRMATION");

  // Verify all blocked factIds are in the pending
  const lastMetaCall = mockMergeSessionMeta.mock.calls.at(-1);
  const pendingConfs = lastMetaCall?.[1]?.pendingConfirmations;
  const bulkPending = pendingConfs?.find((p: any) => p.type === "bulk_delete");
  expect(bulkPending?.factIds).toContain("f2");
  expect(bulkPending?.factIds).toContain("f3");
});
```

Add a test in `tests/evals/bulk-delete-confirmation.test.ts`:

```typescript
it("confirmed multi-delete: all factIds in pending are allowed sequentially", async () => {
  // Pre-populate session meta with a pending bulk_delete for 3 facts
  mockGetSessionMeta.mockReturnValue({
    pendingConfirmations: [{
      id: "pending-1",
      type: "bulk_delete",
      factIds: ["f1", "f2", "f3"],
      createdAt: new Date().toISOString(),
    }],
  });
  mockDeleteFact.mockReturnValue(true);

  const { tools } = createAgentTools("en", "s1");
  // All three confirmed deletes should succeed
  const r1 = await tools.delete_fact.execute({ factId: "f1" }, toolCtx);
  expect(r1.success).toBe(true);

  const r2 = await tools.delete_fact.execute({ factId: "f2" }, toolCtx);
  expect(r2.success).toBe(true);

  const r3 = await tools.delete_fact.execute({ factId: "f3" }, toolCtx);
  expect(r3.success).toBe(true);
});
```

**Also update the existing conflicting test** at line 164 (`"confirmed delete increments count, so 3rd unconfirmed is blocked"`). Under the new semantics, confirmed deletes DO increment `_deletionCountThisTurn` (but the pending-match check runs before the count check, so subsequent confirmed deletes still pass). The first UNCONFIRMED delete after a confirmed one IS blocked because count ≥ 1:

```typescript
// REPLACE existing test at line 164 (Codex review #2-r5: confirmed deletes DO increment counter):
it("confirmed delete increments count — next unconfirmed is blocked", async () => {
  mockGetSessionMeta.mockReturnValue({
    pendingConfirmations: [{
      id: "p1",
      type: "bulk_delete",
      factIds: ["f1"],
      createdAt: new Date().toISOString(),
    }],
  });
  mockDeleteFact.mockReturnValue(true);

  const { tools } = createAgentTools("en", "s1");
  // f1: confirmed → ok (count goes to 1, but pending check runs first)
  const r1 = await tools.delete_fact.execute({ factId: "f1" }, toolCtx);
  expect(r1.success).toBe(true);
  // f2: unconfirmed, count=1 → blocked (2nd+ delete, pending check finds no match)
  const r2 = await tools.delete_fact.execute({ factId: "f2" }, toolCtx) as any;
  expect(r2.success).toBe(false);
  expect(r2.code).toBe("REQUIRES_CONFIRMATION");
});
```

**Step 9: Run tests**

Run: `npx vitest run tests/evals/prompt-contracts.test.ts tests/evals/bulk-delete-confirmation.test.ts`
Expected: ALL PASS

**Step 10: Commit**

```bash
git add src/lib/agent/prompts.ts src/lib/agent/tools.ts tests/evals/prompt-contracts.test.ts tests/evals/bulk-delete-confirmation.test.ts
git commit -m "fix(agent): tool failure honesty, confirmation gates, delete pending consumption

- TOOL_POLICY: tool failure honesty rule (report success:false to user)
- TOOL_POLICY: REQUIRES_CONFIRMATION is explicitly NOT a failure (avoids contradiction)
- TOOL_POLICY: identity + delete gates rewritten for clear confirmation flow
- SAFETY_POLICY: date fabrication prohibition (no inventing dates from durations)
- tools.ts: identityGate message is now operation-agnostic (works for create/update/batch)
- tools.ts: deleteGate consumes per-factId from pending (not whole entry)
- tools.ts: deleteGate accumulates blocked factIds in existing pending
- BUG-8: UNSUPPORTED FEATURES already exists in DATA_MODEL_REFERENCE (verified, no change)

Fixes: BUG-7, BUG-10, BUG-9, BUG-1, BUG-8"
```

---

### Task 4: BUG-4 — Email validation for contact facts

**Files:**
- Test: `tests/evals/fact-validation.test.ts`

**Step 1: Write the failing test**

Add to `tests/evals/fact-validation.test.ts`:

```typescript
describe("BUG-4: email validation for contact facts", () => {
  it("rejects malformed email like 'boh@' for contact with type=email", () => {
    expect(() =>
      validateFactValue("contact", "email-1", { type: "email", value: "boh@" }),
    ).toThrow(FactValidationError);
  });

  it("rejects email without domain for contact with type=email", () => {
    expect(() =>
      validateFactValue("contact", "email-1", { type: "email", value: "user@" }),
    ).toThrow(FactValidationError);
  });

  it("accepts valid email for contact with type=email", () => {
    expect(() =>
      validateFactValue("contact", "email-1", { type: "email", value: "marco@design.it" }),
    ).not.toThrow();
  });

  it("does not validate email format for contact with type=phone", () => {
    expect(() =>
      validateFactValue("contact", "phone-1", { type: "phone", value: "+39123456789" }),
    ).not.toThrow();
  });
});
```

**Step 2: Run test to verify pass/fail**

Run: `npx vitest run tests/evals/fact-validation.test.ts`
Expected: All should PASS — existing `looksLikeEmail` regex (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) already rejects `boh@`. The UAT issue was the AGENT offering to save without calling the tool. If any test fails, fix the validation and commit; otherwise commit test only.

**Step 3: Commit test**

```bash
git add tests/evals/fact-validation.test.ts
git commit -m "test(validation): add email format tests for contact facts

Confirms validateFactValue correctly rejects malformed emails like
'boh@' for contact type=email. The UAT issue was agent behavior
(offering to save invalid data), not missing validation.

Documents: BUG-4 (invalid email accepted)"
```

---

### Task 5: BUG-5 — N/A placeholder for identity names

**Files:**
- Test: `tests/evals/fact-validation.test.ts`

**Step 1: Write the failing test**

Add to `tests/evals/fact-validation.test.ts`:

```typescript
describe("BUG-5: placeholder rejection for identity facts", () => {
  it("rejects N/A as identity name", () => {
    expect(() =>
      validateFactValue("identity", "name", { full: "N/A" }),
    ).toThrow(FactValidationError);
  });

  it("rejects 'unknown' as identity name", () => {
    expect(() =>
      validateFactValue("identity", "name", { full: "unknown" }),
    ).toThrow(FactValidationError);
  });

  it("rejects '???' as project name", () => {
    expect(() =>
      validateFactValue("project", "proj-1", { name: "???" }),
    ).toThrow(FactValidationError);
  });
});
```

**Step 2: Run test to verify**

Run: `npx vitest run tests/evals/fact-validation.test.ts`
Expected: Should PASS (existing placeholder detection covers "N/A", "unknown", "???"). If any test fails, fix validation and commit; otherwise commit test only.

**Step 3: Commit test**

```bash
git add tests/evals/fact-validation.test.ts
git commit -m "test(validation): add placeholder rejection tests for identity/project facts

Confirms validateFactValue already rejects N/A, unknown, ??? for
identity and project facts. The UAT issue was agent bypassing
validation by offering to save without calling the tool.

Documents: BUG-5 (N/A placeholder accepted)"
```

---

### Task 6: BUG-11 — Fix /api/proposals 500

**Files:**
- Modify: `src/app/api/proposals/route.ts:27` (wrap getPendingProposals in try-catch)
- Test: `tests/evals/proposals-route-500.test.ts`

**Step 1: Write the failing test**

Add to `tests/evals/proposals-route-500.test.ts`:

```typescript
it("returns 200 with empty proposals when getPendingProposals throws", async () => {
  mockGetAuthContext.mockReturnValue({ sessionId: "s1", profileId: "p1", userId: null, username: null });
  mockMarkStaleProposals.mockImplementation(() => {}); // stale marking OK
  mockGetPendingProposals.mockImplementation(() => { throw new Error("table not found"); });
  const res = await GET(makeRequest());
  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data.proposals).toEqual([]);
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/proposals-route-500.test.ts`
Expected: FAIL (getPendingProposals throw → unhandled → 500)

**Step 3: Wrap getPendingProposals in try-catch**

In `src/app/api/proposals/route.ts`, replace lines 27-28:

```typescript
// OLD:
const proposals = getPendingProposals(auth.profileId);
return NextResponse.json({ proposals });

// NEW:
let proposals: ReturnType<typeof getPendingProposals> = [];
try {
  proposals = getPendingProposals(auth.profileId);
} catch (err) {
  console.warn("[proposals] getPendingProposals failed:", err);
}
return NextResponse.json({ proposals });
```

**Step 4: Run test to verify pass**

Run: `npx vitest run tests/evals/proposals-route-500.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/app/api/proposals/route.ts tests/evals/proposals-route-500.test.ts
git commit -m "fix(api): wrap getPendingProposals in try-catch to prevent 500

getPendingProposals could throw on fresh databases or schema
initialization races. Now returns empty array on failure.

Fixes: BUG-11 (/api/proposals 500)"
```

---

### Task 7: BUG-12 — Fix theme lost on auto-compose in /api/draft/style

**Files:**
- Modify: `src/app/api/draft/style/route.ts:44-45` (pass published page state as draftMeta)
- Test: `tests/evals/draft-style-theme.test.ts` (create)

**Step 1: Write the failing test**

Create `tests/evals/draft-style-theme.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

describe("BUG-12: theme preservation on auto-compose", () => {
  it("/api/draft/style auto-compose should check published page for theme", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("src/app/api/draft/style/route.ts", "utf-8");
    const autoComposeBlock = src.slice(
      src.indexOf("if (!draft)"),
      src.indexOf("const config = {"),
    );
    // Must reference published page to carry forward theme/style
    expect(autoComposeBlock).toMatch(/getPublishedPage|published|draftMeta/i);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/draft-style-theme.test.ts`
Expected: FAIL (auto-compose block doesn't reference published page)

**Step 3: Fix /api/draft/style route**

In `src/app/api/draft/style/route.ts`, add import at top:

```typescript
import { getDraft, upsertDraft, getPublishedPage, getPublishedUsername } from "@/lib/services/page-service";
```

(Replace the existing `import { getDraft, upsertDraft }` line.)

Replace lines 44-45 in the auto-compose block:

```typescript
// OLD:
const authProfileId = scope?.cognitiveOwnerKey ?? authCtx?.profileId ?? primaryKey;
const composed = projectCanonicalConfig(facts, draftUsername, factLang, undefined, authProfileId);

// NEW (Codex review #1-r3: use getPublishedUsername, not authCtx.username — latter is null in single-user mode):
const authProfileId = scope?.cognitiveOwnerKey ?? authCtx?.profileId ?? primaryKey;
// Carry forward theme/style from published page if it exists
// NOTE: readKeys already declared at line 32 — reuse it, do NOT re-declare
const pubUsername = getPublishedUsername(readKeys);
const published = pubUsername ? getPublishedPage(pubUsername) : null;
const draftMeta = published ? {
  theme: published.theme,
  style: published.style,
  layoutTemplate: published.layoutTemplate,
  sections: published.sections,
} : undefined;
const composed = projectCanonicalConfig(facts, draftUsername, factLang, draftMeta, authProfileId);
```

**Step 4: Update page-service mocks for draft/style route tests (Codex review #2-r4)**

Two test files mock `@/lib/services/page-service` for this route:
- `tests/evals/draft-style.test.ts`
- `tests/evals/auth-session-rotation.test.ts`

Both need `getPublishedPage` AND `getPublishedUsername` added to their mock exports (returning `null` by default):

```typescript
// In each file's vi.mock("@/lib/services/page-service", ...) block, add:
getPublishedPage: vi.fn(() => null),
getPublishedUsername: vi.fn(() => null),
```

**Step 5: Run test to verify pass**

Run: `npx vitest run tests/evals/draft-style-theme.test.ts`
Expected: PASS

**Step 6: Run full test suite (verify no mock breakage)**

Run: `npx vitest run`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add src/app/api/draft/style/route.ts tests/evals/draft-style-theme.test.ts tests/evals/draft-style.test.ts tests/evals/auth-session-rotation.test.ts
git commit -m "fix(api): preserve theme from published page on auto-compose

When /api/draft/style auto-composes a draft (missing draft scenario),
it now checks the published page for existing theme/style/layout and
passes as draftMeta. getPublishedPage returns PageConfig directly
(not {config: PageConfig}). Previously used undefined → lost theme.

Fixes: BUG-12 (theme undefined after style rotation)"
```

---

### Task 8: Final verification

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS (no regressions, new tests pass)

**Step 2: Run build**

Run: `npx next build`
Expected: Build succeeds

**Step 3: Final commit with UAT report update**

Update `uat/UAT-REPORT.md` with fix status for each bug, then:

```bash
git add uat/UAT-REPORT.md
git commit -m "docs: mark UAT Round 5 bugs as fixed in report"
```

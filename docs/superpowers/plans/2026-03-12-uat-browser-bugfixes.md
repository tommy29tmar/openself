# UAT Browser Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 2 bugs found during browser-based UAT: URL hallucination during publish flow, and double "Attuale" badge in experience section.

**Architecture:** Bug 1 is a prompt + UI fix (remove domain references that the LLM extrapolates from). Bug 2 is a React component fix (remove redundant current-job badge since the period string already contains the label).

**Tech Stack:** TypeScript, React, Next.js, Vitest

---

## Chunk 1: Bug Fixes

### Task 1: Fix URL hallucination — Remove domain from SignupModal

The `SignupModal.tsx` displays `openself.dev/{username}` under the username input. The LLM agent sees this pattern (via user interaction context) and fabricates domains like `marco-rossetti.openselfweb.com`. Replace with a relative path display.

**Files:**
- Modify: `src/components/auth/SignupModal.tsx:138-142`
- Test: `tests/evals/signup-modal-url.test.ts` (new structural test)

- [ ] **Step 1: Write the failing test**

Create `tests/evals/signup-modal-url.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("SignupModal — no domain leakage", () => {
  const src = readFileSync(
    join(__dirname, "../../src/components/auth/SignupModal.tsx"),
    "utf-8",
  );

  it("must NOT contain a hardcoded domain in the username preview", () => {
    // The component should show a relative path like /{username}, not openself.dev/{username}
    expect(src).not.toMatch(/openself\.dev\//);
    expect(src).not.toMatch(/openselfweb/i);
  });

  it("should display the username as a relative path", () => {
    // Verify the preview text uses a relative path format
    expect(src).toMatch(/\/{username}/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/signup-modal-url.test.ts`
Expected: FAIL — first assertion fails because `openself.dev/` is present in the source.

- [ ] **Step 3: Fix SignupModal.tsx**

In `src/components/auth/SignupModal.tsx`, change lines 138-142 from:

```tsx
{username && (
  <p className="mt-1 text-xs text-muted-foreground">
    openself.dev/{username}
  </p>
)}
```

to:

```tsx
{username && (
  <p className="mt-1 text-xs text-muted-foreground">
    /{username}
  </p>
)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/evals/signup-modal-url.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/auth/SignupModal.tsx tests/evals/signup-modal-url.test.ts
git commit -m "fix: remove hardcoded domain from SignupModal username preview

Prevents LLM agent from extrapolating domains like openselfweb.com
during publish flow. Shows /{username} instead of openself.dev/{username}."
```

---

### Task 2: Fix URL hallucination — Add no-URL-fabrication rule to SAFETY_POLICY

The agent still sees `/{username}` patterns in TOOL_POLICY (line 239) and blocked policy (line 23). Rather than removing those useful references, add an explicit anti-hallucination rule to SAFETY_POLICY.

**Files:**
- Modify: `src/lib/agent/prompts.ts:86-101` (SAFETY_POLICY)
- Test: `tests/evals/prompt-no-url-fabrication.test.ts` (new structural test)

- [ ] **Step 1: Write the failing test**

Create `tests/evals/prompt-no-url-fabrication.test.ts` using the `buildSystemPrompt()` pattern (same as existing `anti-fabrication-prompt.test.ts`):

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/agent/policies", () => ({
  getJourneyPolicy: vi.fn(() => ""),
  getSituationDirectives: vi.fn(() => ""),
  getExpertiseCalibration: vi.fn(() => ""),
}));
vi.mock("@/lib/agent/policies/memory-directives", () => ({
  memoryUsageDirectives: vi.fn(() => ""),
}));
vi.mock("@/lib/agent/policies/turn-management", () => ({
  turnManagementRules: vi.fn(() => ""),
}));
vi.mock("@/lib/agent/policies/planning-protocol", () => ({
  planningProtocol: vi.fn(() => ""),
}));
vi.mock("@/lib/agent/policies/undo-awareness", () => ({
  undoAwarenessPolicy: vi.fn(() => ""),
}));

import { buildSystemPrompt } from "@/lib/agent/prompts";
import type { BootstrapPayload } from "@/lib/agent/journey";

beforeEach(() => {
  vi.clearAllMocks();
});

const makeBootstrap = (): BootstrapPayload => ({
  journeyState: "first_visit",
  situations: [],
  expertiseLevel: "novice",
  userName: null,
  lastSeenDaysAgo: null,
  publishedUsername: null,
  pendingProposalCount: 0,
  thinSections: [],
  staleFacts: [],
  openConflicts: [],
  archivableFacts: [],
  language: "en",
  conversationContext: null,
  archetype: "generalist",
});

describe("SAFETY_POLICY — no URL fabrication rule", () => {
  it("assembled prompt must contain a rule against fabricating the OpenSelf page domain", () => {
    const prompt = buildSystemPrompt(makeBootstrap());
    expect(prompt).toMatch(/NEVER.*(?:fabricat|invent|guess).*(?:domain|host).*OpenSelf/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/prompt-no-url-fabrication.test.ts`
Expected: FAIL — no such rule exists yet.

- [ ] **Step 3: Add anti-URL-fabrication rule to SAFETY_POLICY**

In `src/lib/agent/prompts.ts`, add this line at the end of `SAFETY_POLICY` (before the closing backtick), after the line about experience facts (line 101):

```typescript
- NEVER fabricate, guess, or invent the domain or host for the user's OpenSelf page. When referring to the user's page, use only a relative path (e.g. /username) or say "your public page URL". User-provided URLs (project links, social profiles, websites) are fine to repeat verbatim.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/evals/prompt-no-url-fabrication.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/prompts.ts tests/evals/prompt-no-url-fabrication.test.ts
git commit -m "fix: add anti-URL-fabrication rule to SAFETY_POLICY

Explicit instruction to never invent domains or web addresses.
Agent must use relative paths or 'your public page URL' only."
```

---

### Task 3: Fix double "Attuale" in Experience component

The page composer puts the localized current label (e.g., "Attuale") inside the `period` string ("gennaio 2026 – Attuale"). The Experience component then adds a SEPARATE badge when `item.current === true`, showing the same word again. However, when an experience has `current: true` but no dates, the badge is the ONLY indicator — so we can't remove it unconditionally. Fix: show the badge only when `period` does NOT end with the `currentLabel` (using `endsWith` instead of `includes` to avoid locale false positives like "Actual" matching "actualidad").

**Files:**
- Modify: `src/themes/editorial-360/components/Experience.tsx:51-58,91-97`
- Test: `tests/evals/experience-no-double-current.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/evals/experience-no-double-current.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { Experience } from "@/themes/editorial-360/components/Experience";

const withPeriodAndCurrent = {
  items: [
    { title: "fotografo", company: "Condé Nast", period: "gennaio 2026 – Attuale", current: true },
  ],
  title: "Esperienza",
  currentLabel: "Attuale",
};

const currentNoPeriod = {
  items: [
    { title: "Designer", company: "Acme", current: true },
  ],
  title: "Experience",
  currentLabel: "Current",
};

const spanishSubstringTrap = {
  items: [
    { title: "Diseñador", company: "Acme", period: "Enero 2026 – Actualizado", current: true },
  ],
  title: "Experiencia",
  currentLabel: "Actual",
};

describe("Experience — current label deduplication", () => {
  it("should render 'Attuale' exactly once when period already contains it (default)", () => {
    const html = renderToStaticMarkup(
      React.createElement(Experience, { content: withPeriodAndCurrent, variant: "default" }),
    );
    const matches = html.match(/Attuale/g) || [];
    expect(matches.length).toBe(1);
  });

  it("should render 'Attuale' exactly once when period already contains it (monolith)", () => {
    const html = renderToStaticMarkup(
      React.createElement(Experience, { content: withPeriodAndCurrent, variant: "monolith" }),
    );
    const matches = html.match(/Attuale/g) || [];
    expect(matches.length).toBe(1);
  });

  it("should render 'Current' badge when current:true but no period (default)", () => {
    const html = renderToStaticMarkup(
      React.createElement(Experience, { content: currentNoPeriod, variant: "default" }),
    );
    expect(html).toContain("Current");
  });

  it("should render 'Current' badge when current:true but no period (monolith)", () => {
    const html = renderToStaticMarkup(
      React.createElement(Experience, { content: currentNoPeriod, variant: "monolith" }),
    );
    expect(html).toContain("Current");
  });

  it("should NOT suppress badge when period contains label as substring but not at end (locale regression)", () => {
    const html = renderToStaticMarkup(
      React.createElement(Experience, { content: spanishSubstringTrap, variant: "default" }),
    );
    // "Actualizado" contains "Actual" as prefix substring, but period does NOT end with "Actual"
    // Badge should still render because endsWith("Actual") is false
    // With includes() this would be a false positive (badge suppressed incorrectly)
    expect(html).toContain("Actual");
    const matches = html.match(/Actual/g) || [];
    // "Actualizado" contributes 1 match, badge "Actual" contributes 1 match = 2 total
    expect(matches.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/experience-no-double-current.test.ts`
Expected: FAIL — first two assertions fail because "Attuale" appears 2 times.

- [ ] **Step 3: Make badge conditional on period NOT containing the label**

In `src/themes/editorial-360/components/Experience.tsx`, modify the monolith variant (lines 51-59). Change from:

```tsx
{item.period && (
    <div style={{ fontSize: 13, color: "var(--page-fg-secondary)", marginTop: 4 }}>
        {item.period}
        {item.current && (
            <span style={{ marginLeft: 8, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--page-accent)" }}>
                {currentLabel || "Current"}
            </span>
        )}
    </div>
)}
```

to:

First, add a computed `badgeLabel` after the destructuring on line 26. After `const { items = [], title, currentLabel } = content;` add:

```tsx
const badgeLabel = currentLabel || "Current";
```

Then modify the monolith variant badge logic. The wrapper condition uses `item.period || item.current` (not `currentLabel`) so it works even when `currentLabel` is omitted:

```tsx
{(item.period || item.current) && (
    <div style={{ fontSize: 13, color: "var(--page-fg-secondary)", marginTop: 4 }}>
        {item.period}
        {item.current && !(item.period?.trimEnd().endsWith(badgeLabel)) && (
            <span style={{ marginLeft: 8, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--page-accent)" }}>
                {badgeLabel}
            </span>
        )}
    </div>
)}
```

Then modify the default variant (lines 91-98). Change from:

```tsx
<span className="text-sm text-[var(--page-fg-secondary)] mt-1 md:mt-0 shrink-0">
    {item.period}
    {item.current && (
        <span className="ml-2 text-xs uppercase tracking-widest text-[var(--page-accent)]">
            {currentLabel || "Current"}
        </span>
    )}
</span>
```

to:

```tsx
<span className="text-sm text-[var(--page-fg-secondary)] mt-1 md:mt-0 shrink-0">
    {item.period}
    {item.current && !(item.period?.trimEnd().endsWith(badgeLabel)) && (
        <span className="ml-2 text-xs uppercase tracking-widest text-[var(--page-accent)]">
            {badgeLabel}
        </span>
    )}
</span>
```

Do NOT remove `currentLabel` from the destructuring — it feeds `badgeLabel`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/evals/experience-no-double-current.test.ts`
Expected: PASS — "Attuale" appears exactly once when period contains it; "Current" badge shows when no period.

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `npx vitest run`
Expected: All existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/themes/editorial-360/components/Experience.tsx tests/evals/experience-no-double-current.test.ts
git commit -m "fix: deduplicate current-job badge in Experience component

The page composer embeds the localized label (e.g. 'Attuale') in the
period string. The component now checks if period already contains the
label before showing the badge. Badge still renders for current jobs
with no dates (where it's the only indicator)."
```

---

### Task 4: Clean up — remove temporary CTX monitor from route.ts

The `[CTX]` context window monitor was added temporarily for the browser UAT. Remove it now that testing is complete.

**Files:**
- Modify: `src/app/api/chat/route.ts` (remove ~5 lines of CTX logging)

- [ ] **Step 1: Find and remove the CTX monitor code**

In `src/app/api/chat/route.ts`, find the block that starts with `const _sysChars = systemPrompt.length` and ends with the `console.log(\`[CTX]\`...)` line (approximately 5 lines). Remove the entire block.

- [ ] **Step 2: Verify build passes**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "chore: remove temporary CTX monitor from chat route

Was added for browser UAT context window tracking. No longer needed."
```

# Layout Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix layout issues found during UAT (hero truncation, duplicate headings, double footer, bio alignment) and implement a redesigned page with ContactBar in hero, fused At a Glance section, collapsible long sections, and intelligent default ordering.

**Architecture:** Incremental modification of existing editorial-360 theme components and the page-composer. No new layout templates. New `at-a-glance` ComponentType replaces standalone `skills`, `stats`, `interests` sections when `EXTENDED_SECTIONS=true`. New `CollapsibleList` wrapper component for long sections.

**Tech Stack:** TypeScript, React, Next.js, Tailwind CSS, vitest

**Design doc:** `docs/plans/2026-02-27-layout-redesign-design.md`

**Terminology note:** The design doc says "only `large` variant changes". In the composer, `buildHeroSection` sets `variant: "large"`, but `Hero.tsx` defaults to `hero-split` when no explicit match — so "large" = the `hero-split` default code path in the component. The plan correctly modifies the `hero-split` default block.

---

### Task 1: Bug Fix — Proposals API 500

**Files:**
- Modify: `src/lib/services/proposal-service.ts` (lines 244-319)
- Test: `tests/evals/proposal-service.test.ts`

**Context:** `markStaleProposals` uses `this.getPendingProposals()` but `this` is lost when exported via destructuring `const { markStaleProposals } = svc;`. Fix: call `getPendingProposals` directly as a local reference instead of via `this`.

**Step 1: Write the failing test**

Add a test in `tests/evals/proposal-service.test.ts` inside the existing `describe("markStaleProposals")` block. Use the factory `createProposalService(testDb)` pattern already present in the test file (line 114+), but destructure the methods to reproduce the singleton export bug:

```typescript
it("should work when methods are destructured (singleton export pattern)", () => {
    const svc = createProposalService(testDb as any);
    svc.createProposal(makeProposal());

    // Reproduce the singleton export pattern: destructure then call
    const { markStaleProposals, getPendingProposals } = svc;

    // Before fix: this throws because this.getPendingProposals is undefined
    expect(() => markStaleProposals("owner1")).not.toThrow();

    // Verify it actually ran (no stale proposals since hashes match)
    const pending = getPendingProposals("owner1");
    expect(pending).toHaveLength(1);
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/proposal-service.test.ts --reporter=verbose`
Expected: FAIL — `TypeError: Cannot read properties of undefined (reading 'getPendingProposals')` (or similar `this` error).

**Step 3: Fix the `this` context bug**

In `src/lib/services/proposal-service.ts`, inside `createProposalService`, the service methods are defined as object literal methods that use `this` to call sibling methods. Refactor `markStaleProposals` to reference `getPendingProposals` and `markStale` directly via closure instead of `this`:

The object literal is returned from `createProposalService`. Inside it, `markStaleProposals` currently calls `this.getPendingProposals(ownerKey)` and `this.markStale(proposal.id)`. Change these to reference the parent object's methods via a local variable:

```typescript
// Before the return statement, capture the service object:
const svc = {
  // ... all existing methods ...

  markStaleProposals(ownerKey: string): number {
    // ...
    const pending = svc.getPendingProposals(ownerKey); // was: this.getPendingProposals
    // ...
    svc.markStale(proposal.id); // was: this.markStale
    // ...
  },
};
return svc;
```

Alternative (simpler): extract the internal functions before the return object and have both the public methods and `markStaleProposals` call them:

```typescript
function _getPendingProposals(ownerKey: string) {
  return database.select().from(sectionCopyProposals)
    .where(and(
      eq(sectionCopyProposals.ownerKey, ownerKey),
      eq(sectionCopyProposals.status, "pending"),
    )).all();
}

function _markStale(proposalId: number) {
  // Note: schema has createdAt + reviewedAt, no updatedAt.
  // markStale only sets status (matching existing implementation).
  database.update(sectionCopyProposals)
    .set({ status: "stale" })
    .where(eq(sectionCopyProposals.id, proposalId))
    .run();
}

return {
  getPendingProposals: _getPendingProposals,
  markStale: _markStale,
  markStaleProposals(ownerKey: string): number {
    // ... use _getPendingProposals(ownerKey) and _markStale(id)
  },
  // ... other methods unchanged
};
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/evals/proposal-service.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/services/proposal-service.ts tests/evals/proposal-service.test.ts
git commit -m "fix: resolve this context loss in proposal-service markStaleProposals"
```

---

### Task 2: Bug Fix — Skills Duplicate Heading

**Files:**
- Modify: `src/themes/editorial-360/components/Skills.tsx` (lines 30-35, 65-70)

**Context:** When there's only one skill group, the group `<h3>` label duplicates the section `<h2>` heading. Fix: hide group labels when there's only one group.

**Step 1: Modify Skills.tsx**

In the `skills-chips` variant (around line 33), wrap the `<h3>` in a condition:

```tsx
{groups.length > 1 && (
  <h3 className="text-[10px] uppercase tracking-wider md:w-1/4 shrink-0 font-bold text-[var(--page-fg)]">
    {group.label || group.name}
  </h3>
)}
```

In the `skills-list` variant (around line 68), same condition:

```tsx
{groups.length > 1 && (
  <h3 className="text-xl font-bold mb-4 ...">
    {group.label || group.name}
    ...
  </h3>
)}
```

**Step 2: Visual verification**

Run dev server. Navigate to published page, verify skills section shows only one heading.

**Step 3: Commit**

```bash
git add src/themes/editorial-360/components/Skills.tsx
git commit -m "fix: hide duplicate group heading in Skills when only one group"
```

---

### Task 3: Bug Fix — Social Copyright Double Footer

**Files:**
- Modify: `src/themes/editorial-360/components/Social.tsx` (line 38)

**Context:** `Social.tsx` has a hardcoded `© {year} OpenSelf. Precision Built.` paragraph that duplicates the separate `FooterSection`. Remove it.

**Step 1: Remove the copyright paragraph**

Delete lines 37-39 from `Social.tsx`:

```tsx
// DELETE this block:
<p className="text-[9px] tracking-[0.4em] uppercase text-[var(--page-footer-fg)] opacity-60">
    © {new Date().getFullYear()} OpenSelf. Precision Built.
</p>
```

**Step 2: Visual verification**

Navigate to published page, verify only one footer appears.

**Step 3: Commit**

```bash
git add src/themes/editorial-360/components/Social.tsx
git commit -m "fix: remove hardcoded copyright from Social component (handled by FooterSection)"
```

---

### Task 4: Bug Fix — Bio Alignment

**Files:**
- Modify: `src/themes/editorial-360/components/Bio.tsx` (lines 35-46)

**Context:** The default `bio-dropcap` variant uses a 2-column grid (4+8) with "About" label on the left and text on the right. This pushes the text rightward. Fix: remove the 2-column layout, place heading above and text below at full width.

**Step 1: Rewrite the bio-dropcap variant**

Replace the default return (lines 35-46) with:

```tsx
// Default: bio-dropcap
return (
    <section className="mb-16 theme-reveal transition-all duration-1000 ease-out opacity-0 translate-y-4" style={{ transitionDelay: '0.15s' }}>
        <h2 className="text-[10px] uppercase tracking-[0.3em] text-[var(--page-footer-fg)] font-semibold mb-8 border-b border-[var(--page-border)] pb-4">
            {title || "About"}
        </h2>
        <p className="font-light text-xl md:text-2xl leading-relaxed text-[var(--page-fg)]">
            {text}
        </p>
    </section>
);
```

**Step 2: Visual verification**

Navigate to published page, verify bio text is left-aligned, full width.

**Step 3: Commit**

```bash
git add src/themes/editorial-360/components/Bio.tsx
git commit -m "fix: align bio text full-width instead of 2-column label layout"
```

---

### Task 5: Hero — Two-Column Layout (name left, tagline right)

**Files:**
- Modify: `src/themes/editorial-360/components/Hero.tsx` (lines 74-89, the `hero-split` default variant)

**Context:** The current `hero-split` variant uses enormous font sizes (`text-5xl md:text-7xl lg:text-8xl`) which truncates long names. Design decision D1: use `clamp(1.8rem, 4vw, 3rem)` for a reasonable consistent size, uppercase, bold. Two-column on desktop (name left, tagline right). Mobile stacks naturally. Note: the composer sets `variant: "large"` which falls through to the hero-split default.

**Step 1: Rewrite the hero-split (default) variant**

Replace the default return block (lines 74-89) with:

```tsx
// Default: hero-split (Classic Editorial, two-column)
return (
    <header className="mb-8 mt-4 theme-reveal transition-all duration-1000 ease-out opacity-0 translate-y-4" style={{ transitionDelay: '0.1s' }}>
        <div className="md:grid md:grid-cols-2 md:gap-8 md:items-end border-b border-[var(--page-border)] pb-8">
            <div className="min-w-0">
                <h1
                    className="font-[var(--page-font-heading)] uppercase font-bold tracking-[0.05em] leading-tight"
                    style={{ fontSize: "clamp(1.8rem, 4vw, 3rem)" }}
                >
                    {name}
                </h1>
            </div>
            {tagline && (
                <div className="mt-4 md:mt-0 md:text-right">
                    <p
                        className="font-[var(--page-font-heading)] font-light text-[var(--page-fg-secondary)] leading-snug"
                        style={{ fontSize: "clamp(1rem, 2vw, 1.25rem)" }}
                    >
                        {tagline}
                    </p>
                </div>
            )}
        </div>
    </header>
);
```

**Step 2: Visual verification**

Navigate to published page. Verify:
- Name "TOMMASO MARRONE" appears at a reasonable size, not truncated
- Tagline appears to the right on desktop, below on mobile
- Both scale proportionally with viewport

**Step 3: Commit**

```bash
git add src/themes/editorial-360/components/Hero.tsx
git commit -m "feat: hero two-column layout with clamp sizing (no truncation)"
```

---

### Task 6: ContactBar — Make Contact a User-Controlled Category

**Files:**
- Modify: `src/lib/visibility/policy.ts` (line 28-36, `SENSITIVE_CATEGORIES`)
- Modify: `src/lib/services/kb-service.ts` (lines 356-366, transition matrix)
- Modify: `src/lib/agent/prompts.ts` (lines 24, 52)
- Test: `tests/evals/contact-visibility.test.ts` (new)

**Context (CRITICAL):** The plan needs email in the hero ContactBar, but today:
1. `contact` is in `SENSITIVE_CATEGORIES` → facts born `private` (policy.ts:56)
2. Sensitive facts CANNOT transition to `public` or `proposed` (kb-service.ts:356-362) — neither user nor assistant can do it
3. `filterPublishableFacts` strips sensitive categories from publish pipeline (page-projection.ts:20-25)

So the email is **permanently locked to private** in real user flow. The seed masks this by calling `composeOptimisticPage` directly.

**Design decision:** Contact info on a personal page is a deliberate publishing choice, not a secret like salary/health. Remove `contact` from `SENSITIVE_CATEGORIES` so it behaves like any normal category (auto-proposed during onboarding, user can set public/private). `private-contact` stays sensitive for truly private info.

**Step 1: Write the failing test**

Create `tests/evals/contact-visibility.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { isSensitiveCategory, initialVisibility, canProposePublic } from "@/lib/visibility/policy";
import { filterPublishableFacts } from "@/lib/services/page-projection";

function makeFact(overrides: Record<string, unknown>) {
  return {
    id: overrides.id ?? `fact-${Math.random().toString(36).slice(2, 8)}`,
    category: overrides.category as string,
    key: overrides.key as string,
    value: overrides.value ?? {},
    source: "chat",
    confidence: 1.0,
    visibility: overrides.visibility ?? "public",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("contact category is user-controlled (not sensitive)", () => {
  it("contact should NOT be a sensitive category", () => {
    expect(isSensitiveCategory("contact")).toBe(false);
  });

  it("private-contact should still be sensitive", () => {
    expect(isSensitiveCategory("private-contact")).toBe(true);
  });

  it("assistant can propose contact as public (in PROPOSAL_ALLOWLIST)", () => {
    expect(canProposePublic("contact", 0.9)).toBe(true);
  });

  it("assistant cannot propose compensation as public (truly sensitive)", () => {
    expect(canProposePublic("compensation", 0.9)).toBe(false);
  });

  it("contact facts should get proposed visibility during onboarding", () => {
    const vis = initialVisibility({
      mode: "onboarding",
      category: "contact",
      confidence: 0.9,
    });
    expect(vis).toBe("proposed");
  });

  it("contact facts with visibility=public should pass filterPublishableFacts", () => {
    const facts = [
      makeFact({ category: "contact", key: "email", value: { email: "a@b.com" }, visibility: "public" }),
    ];
    const result = filterPublishableFacts(facts as any);
    expect(result).toHaveLength(1);
  });

  it("contact facts with visibility=proposed should pass filterPublishableFacts", () => {
    const facts = [
      makeFact({ category: "contact", key: "email", value: { email: "a@b.com" }, visibility: "proposed" }),
    ];
    const result = filterPublishableFacts(facts as any);
    expect(result).toHaveLength(1);
  });

  it("compensation should still be blocked (truly sensitive)", () => {
    expect(isSensitiveCategory("compensation")).toBe(true);
    const facts = [
      makeFact({ category: "compensation", key: "salary", value: { amount: "100k" }, visibility: "public" }),
    ];
    expect(filterPublishableFacts(facts as any)).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/contact-visibility.test.ts --reporter=verbose`
Expected: FAIL — `isSensitiveCategory("contact")` returns `true`, `initialVisibility` returns `"private"`.

**Step 3: Remove `contact` from `SENSITIVE_CATEGORIES` AND add to `PROPOSAL_ALLOWLIST`**

In `src/lib/visibility/policy.ts`:

(a) Line 28-36 — remove `"contact"` from `SENSITIVE_CATEGORIES`:

```typescript
export const SENSITIVE_CATEGORIES: ReadonlySet<string> = new Set([
  "compensation",
  "salary",
  "health",
  "mental-health",
  "private-contact",
  "personal-struggle",
  // "contact" REMOVED — user-controlled, not inherently sensitive
]);
```

(b) Line 12-26 — add `"contact"` to `PROPOSAL_ALLOWLIST` (required for `canProposePublic()` to return true):

```typescript
const PROPOSAL_ALLOWLIST = new Set([
  "identity",
  "experience",
  "project",
  "skill",
  "interest",
  "achievement",
  "social",
  "education",
  "stat",
  "reading",
  "music",
  "language",
  "activity",
  "contact",  // NEW — user-controlled
]);
```

Both changes together cascade through:
- `initialVisibility()` → contact facts get `proposed` during onboarding (not `private`)
- `canProposePublic()` → returns `true` for contact (was blocked by both sensitive AND missing from allowlist)
- `setFactVisibility()` → user CAN set contact to `public`/`proposed`/`private`
- `filterPublishableFacts()` → contact facts with `public`/`proposed` pass through

**Step 4: Update agent prompt**

In `src/lib/agent/prompts.ts`:

Line 24 — remove "contact" from the sensitive list:
```
- Sensitive categories (compensation, salary, health, mental-health, private-contact, personal-struggle) are ALWAYS private
```

Line 52 — update contact guidance:
```
- Use "contact" for email/phone/address — visibility controlled by user (proposed by default, user decides public/private): {type: "email", value: "me@example.com"}
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run tests/evals/contact-visibility.test.ts --reporter=verbose`
Expected: PASS

**Step 6: Run full test suite** (visibility tests especially)

Run: `npx vitest run --reporter=verbose`
Expected: All pass. Fix any tests that asserted `isSensitiveCategory("contact") === true` or expected contact to be blocked by `filterPublishableFacts`.

**Step 7: Commit**

```bash
git add src/lib/visibility/policy.ts src/lib/agent/prompts.ts tests/evals/contact-visibility.test.ts
git commit -m "fix: make contact user-controlled category (remove from SENSITIVE_CATEGORIES)"
```

---

### Task 7: ContactBar in Hero — Composer Data Flow

**Files:**
- Modify: `src/lib/services/page-composer.ts` (lines 261-353 `buildHeroSection`, lines 857-943 `composeOptimisticPage`)
- Test: `tests/evals/hero-contactbar.test.ts`

**Context:** Design D2: The hero section absorbs social links, contact email, and languages. The composer injects them into the hero's content object. Standalone `social`, `contact`, `languages` sections are no longer generated when `EXTENDED_SECTIONS=true`. Thanks to Task 6, contact facts with `visibility=public` now survive `filterPublishableFacts`.

**Step 1: Write the failing test**

Create `tests/evals/hero-contactbar.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { composeOptimisticPage } from "@/lib/services/page-composer";

function makeFact(overrides: Record<string, unknown>) {
  return {
    id: overrides.id ?? `fact-${Math.random().toString(36).slice(2, 8)}`,
    category: overrides.category as string,
    key: overrides.key as string,
    value: overrides.value ?? {},
    source: "chat",
    confidence: 1.0,
    visibility: (overrides.visibility as string) ?? "public",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("Hero ContactBar integration", () => {
  it("should include socialLinks, contactEmail, and languages in hero content", () => {
    const facts = [
      makeFact({ category: "identity", key: "full-name", value: { full: "Alice Smith" } }),
      makeFact({ category: "social", key: "github", value: { platform: "GitHub", url: "https://github.com/alice" } }),
      makeFact({ category: "social", key: "linkedin", value: { platform: "LinkedIn", url: "https://linkedin.com/in/alice" } }),
      makeFact({ category: "contact", key: "email", value: { email: "alice@example.com" } }),
      makeFact({ category: "language", key: "english", value: { language: "English", proficiency: "native" } }),
      makeFact({ category: "language", key: "french", value: { language: "French", proficiency: "fluent" } }),
    ];

    process.env.EXTENDED_SECTIONS = "true";
    const config = composeOptimisticPage(facts as any, "alice", "en");
    delete process.env.EXTENDED_SECTIONS;

    const hero = config.sections.find((s) => s.type === "hero");
    expect(hero).toBeDefined();
    const content = hero!.content as Record<string, unknown>;
    expect(content.socialLinks).toHaveLength(2);
    expect(content.contactEmail).toBe("alice@example.com");
    expect(content.languages).toHaveLength(2);
  });

  it("should NOT generate standalone social, contact, languages sections when EXTENDED_SECTIONS=true", () => {
    const facts = [
      makeFact({ category: "identity", key: "full-name", value: { full: "Alice" } }),
      makeFact({ category: "social", key: "github", value: { platform: "GitHub", url: "https://github.com/alice" } }),
      makeFact({ category: "contact", key: "email", value: { email: "alice@example.com" } }),
      makeFact({ category: "language", key: "en", value: { language: "English", proficiency: "native" } }),
    ];

    process.env.EXTENDED_SECTIONS = "true";
    const config = composeOptimisticPage(facts as any, "alice", "en");
    delete process.env.EXTENDED_SECTIONS;

    const types = config.sections.map((s) => s.type);
    expect(types).not.toContain("social");
    expect(types).not.toContain("contact");
    expect(types).not.toContain("languages");
  });

  it("should gracefully handle missing social/contact/language facts", () => {
    const facts = [
      makeFact({ category: "identity", key: "full-name", value: { full: "Alice" } }),
    ];

    process.env.EXTENDED_SECTIONS = "true";
    const config = composeOptimisticPage(facts as any, "alice", "en");
    delete process.env.EXTENDED_SECTIONS;

    const hero = config.sections.find((s) => s.type === "hero");
    const content = hero!.content as Record<string, unknown>;
    expect(content.socialLinks).toBeUndefined();
    expect(content.contactEmail).toBeUndefined();
    expect(content.languages).toBeUndefined();
  });

  it("should prefer public email over proposed when multiple contacts exist", () => {
    const facts = [
      makeFact({ category: "identity", key: "full-name", value: { full: "Alice" } }),
      // Registration email — proposed (auto)
      makeFact({
        category: "contact", key: "email-reg",
        value: { type: "email", email: "alice@registration.com" },
        visibility: "proposed",
      }),
      // Work email — user explicitly set public
      makeFact({
        category: "contact", key: "email-work",
        value: { type: "email", email: "alice@company.com" },
        visibility: "public",
      }),
      // Personal email — user set private (won't reach composer)
      makeFact({
        category: "contact", key: "email-personal",
        value: { type: "email", email: "alice@gmail.com" },
        visibility: "private",
      }),
    ];

    process.env.EXTENDED_SECTIONS = "true";
    const config = composeOptimisticPage(facts as any, "alice", "en");
    delete process.env.EXTENDED_SECTIONS;

    const hero = config.sections.find((s) => s.type === "hero");
    const content = hero!.content as Record<string, unknown>;
    // Public email takes priority over proposed; private is filtered upstream
    expect(content.contactEmail).toBe("alice@company.com");
  });

  it("should show proposed email when no public email exists", () => {
    const facts = [
      makeFact({ category: "identity", key: "full-name", value: { full: "Alice" } }),
      makeFact({
        category: "contact", key: "email-reg",
        value: { type: "email", email: "alice@registration.com" },
        visibility: "proposed",
      }),
    ];

    process.env.EXTENDED_SECTIONS = "true";
    const config = composeOptimisticPage(facts as any, "alice", "en");
    delete process.env.EXTENDED_SECTIONS;

    const hero = config.sections.find((s) => s.type === "hero");
    const content = hero!.content as Record<string, unknown>;
    expect(content.contactEmail).toBe("alice@registration.com");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/hero-contactbar.test.ts --reporter=verbose`
Expected: FAIL — hero content has no `socialLinks` field yet.

**Step 3: Modify `buildHeroSection` in page-composer.ts**

Add parameters for social, contact, and language facts:

```typescript
function buildHeroSection(
  identityFacts: FactRow[],
  experienceFacts: FactRow[],
  interestFacts: FactRow[],
  language: string,
  username: string,
  socialFacts?: FactRow[],
  contactFacts?: FactRow[],
  languageFacts?: FactRow[],
): Section | null {
```

Before the final `return`, build ContactBar data:

```typescript
// ContactBar data (injected from social, contact, language facts)
const socialLinks: { platform: string; url: string }[] = [];
for (const f of socialFacts ?? []) {
  const v = val(f);
  const platform = str(v.platform) ?? str(v.name) ?? f.key;
  const url = str(v.url) ?? str(v.link);
  if (platform && url) socialLinks.push({ platform, url });
}

// Email selection: visibility controls which emails appear.
// Only email-type contact facts that survived the visibility filter reach here.
// Priority: "public" > "proposed" (user explicitly approved > auto-proposed).
// Among same visibility: first in array order (most recently created last).
const emailFacts = (contactFacts ?? []).filter((f) => {
  const v = val(f);
  const t = str(v.type);
  return t === "email" || (!t && (str(v.email) || str(v.value)?.includes("@")));
});
// Sort: public first, then proposed
emailFacts.sort((a, b) => {
  if (a.visibility === "public" && b.visibility !== "public") return -1;
  if (b.visibility === "public" && a.visibility !== "public") return 1;
  return 0;
});
const contactEmail = emailFacts.length > 0
  ? str(val(emailFacts[0]).email) ?? str(val(emailFacts[0]).value)
  : undefined;

const languageItems: { language: string; proficiency?: string }[] = [];
for (const f of languageFacts ?? []) {
  const v = val(f);
  const lang = str(v.language) ?? str(v.name) ?? str(v.value);
  if (lang) {
    languageItems.push({ language: lang, proficiency: str(v.proficiency) ?? str(v.level) });
  }
}

const content: Record<string, unknown> = {
  name: heroName ?? finalName,
  tagline: finalTagline,
};
if (socialLinks.length > 0) content.socialLinks = socialLinks;
if (contactEmail) content.contactEmail = contactEmail;
if (languageItems.length > 0) content.languages = languageItems;
```

**Email selection rationale:** The user controls which email appears on the hero by controlling fact visibility. Multiple contact/email facts can coexist:
- Registration email → user sets `private` → hidden
- Work email → user sets `public` → shown on hero
- Personal email → user leaves `proposed` → not shown (public takes priority)

No new fact fields needed — the existing visibility system IS the selection mechanism.

**Step 4: Modify `composeOptimisticPage`**

Pass additional fact groups to `buildHeroSection`:

```typescript
const socialFacts = grouped.get("social") ?? [];
const contactFacts = grouped.get("contact") ?? [];
const languageFacts = grouped.get("language") ?? [];

const hero = buildHeroSection(
  identityFacts, experienceFacts, interestFacts, language, username,
  socialFacts, contactFacts, languageFacts,
);
```

In the extended sections block, skip standalone social/contact/languages (these are absorbed into hero). Move the social section build inside a `!extended` guard. Remove languages/contact from the `if (extended)` block.

**Step 5: Run test to verify it passes**

Run: `npx vitest run tests/evals/hero-contactbar.test.ts --reporter=verbose`
Expected: PASS

**Step 6: Run full test suite**

Run: `npx vitest run --reporter=verbose`
Expected: All existing tests pass (some may need minor adjustments if they check for social/contact/languages sections with EXTENDED_SECTIONS).

**Step 7: Commit**

```bash
git add src/lib/services/page-composer.ts tests/evals/hero-contactbar.test.ts
git commit -m "feat: inject social/contact/languages into hero content (ContactBar data flow)"
```

---

### Task 8: ContactBar in Hero — React Component

**Files:**
- Modify: `src/themes/editorial-360/components/Hero.tsx`

**Context:** The hero-split variant now receives `socialLinks`, `contactEmail`, and `languages` in its content. Render them as a ContactBar below the name+tagline grid.

**Step 1: Update HeroContent type and render ContactBar**

Update the `HeroContent` type:

```typescript
type HeroContent = {
    name: string;
    tagline: string;
    avatarUrl?: string;
    socialLinks?: { platform: string; url: string }[];
    contactEmail?: string;
    languages?: { language: string; proficiency?: string }[];
};
```

Add ContactBar rendering in the hero-split variant, after the grid div and before `</header>`:

```tsx
{/* ContactBar */}
{(content.socialLinks?.length || content.contactEmail || content.languages?.length) && (
    <div className="mt-6 space-y-2 text-sm">
        {content.socialLinks && content.socialLinks.length > 0 && (
            <div className="flex flex-wrap gap-4">
                {content.socialLinks.map((link, i) => (
                    <a
                        key={i}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--page-fg-secondary)] hover:text-[var(--page-fg)] transition-colors uppercase tracking-widest text-xs font-medium border-b border-transparent hover:border-[var(--page-fg)] pb-0.5"
                    >
                        {link.platform}
                    </a>
                ))}
            </div>
        )}
        {content.contactEmail && (
            <p className="text-[var(--page-fg-secondary)] text-xs tracking-wide">
                {content.contactEmail}
            </p>
        )}
        {content.languages && content.languages.length > 0 && (
            <p className="text-[var(--page-fg-secondary)] text-xs tracking-wide">
                {content.languages
                    .map((l) => `${l.language}${l.proficiency ? ` ${l.proficiency}` : ""}`)
                    .join(" · ")}
            </p>
        )}
    </div>
)}
```

**Step 2: Visual verification**

Navigate to published page. Verify ContactBar renders below hero with social links, email, languages.

**Step 3: Commit**

```bash
git add src/themes/editorial-360/components/Hero.tsx
git commit -m "feat: render ContactBar (social, email, languages) in hero component"
```

---

### Task 9: Register `at-a-glance` ComponentType + Fix Legacy Widget Map

**Files:**
- Modify: `src/lib/page-config/schema.ts` (lines 3-21 union, lines 99-118 Set)
- Modify: `src/lib/layout/widgets.ts` (add widget definitions)
- Modify: `src/lib/layout/registry.ts` (add to slot `accepts` arrays)
- Modify: `src/lib/layout/validate-adapter.ts` (fix legacy widget map + add at-a-glance)

**Context:** Register the new type AND fix pre-existing broken entries in `LEGACY_WIDGET_MAP`. The map currently references widget IDs that don't exist in the registry:
- `"hero:large": "hero-large"` → registry has `hero-split` (the actual default)
- `"hero:default": "hero-large"` → should be `hero-split`
- `"bio:full": "bio-full"` → registry has `bio-dropcap`
- `"bio:default": "bio-full"` → should be `bio-dropcap`
- `"projects:grid": "projects-grid"` → registry has `projects-list`
- `"projects:default": "projects-grid"` → should be `projects-list`
- `"projects:featured": "projects-featured"` → registry has `projects-bento`

**Step 1: Add to ComponentType union**

In `src/lib/page-config/schema.ts`, add `| "at-a-glance"` to the union:

```typescript
export type ComponentType =
  | "hero"
  | "bio"
  | "skills"
  | "projects"
  | "timeline"
  | "interests"
  | "achievements"
  | "stats"
  | "at-a-glance"
  | "social"
  // ...
```

Add `"at-a-glance"` to the `COMPONENT_TYPES` Set.

**Step 2: Add widget definitions**

In `src/lib/layout/widgets.ts`, add:

```typescript
// At a Glance
{
    id: "at-a-glance-full",
    sectionType: "at-a-glance",
    variant: "full",
    fitsIn: ["wide", "half"],
    label: "At a Glance (full)",
},
```

**Step 3: Add to layout slot accepts**

In `src/lib/layout/registry.ts`:
- Vertical `main` slot: add `"at-a-glance"` to `accepts` array
- Sidebar-left `main` slot: add `"at-a-glance"` to `accepts` array
- Bento `feature-right` slot: add `"at-a-glance"` to `accepts` array
- Bento `full-row` slot: add `"at-a-glance"` to `accepts` array

**Step 4: Fix LEGACY_WIDGET_MAP + add at-a-glance entries**

In `src/lib/layout/validate-adapter.ts`, fix broken entries to point to actual registry IDs:

```typescript
const LEGACY_WIDGET_MAP: Record<string, string> = {
  "hero:large": "hero-split",       // was "hero-large" (doesn't exist)
  "hero:compact": "hero-compact",
  "hero:default": "hero-split",     // was "hero-large"
  "bio:full": "bio-dropcap",        // was "bio-full" (doesn't exist)
  "bio:short": "bio-tagline",
  "bio:default": "bio-dropcap",     // was "bio-full"
  "skills:chips": "skills-chips",
  "skills:list": "skills-list",
  "skills:cloud": "skills-cloud",
  "projects:grid": "projects-list",     // was "projects-grid" (doesn't exist)
  "projects:featured": "projects-bento", // was "projects-featured" (doesn't exist)
  "projects:list": "projects-list",
  "projects:default": "projects-list",   // was "projects-grid"
  // ... all other entries unchanged ...
  // NEW: at-a-glance
  "at-a-glance:full": "at-a-glance-full",
  "at-a-glance:default": "at-a-glance-full",
};
```

**Step 5: Run existing tests**

Run: `npx vitest run --reporter=verbose`
Expected: All pass. The widget map fix is corrective — existing published pages with legacy variants will now resolve correctly instead of being skipped.

**Step 6: Commit**

```bash
git add src/lib/page-config/schema.ts src/lib/layout/widgets.ts src/lib/layout/registry.ts src/lib/layout/validate-adapter.ts
git commit -m "feat: register at-a-glance type + fix broken legacy widget map entries"
```

---

### Task 10: At a Glance — Section Completeness Filter

**Files:**
- Modify: `src/lib/page-config/section-completeness.ts` (lines 17-22)
- Test: `tests/evals/section-completeness-aag.test.ts` (new)

**Context (CRITICAL):** `isSectionComplete()` checks for `items`, `groups`, `links`, `methods` arrays. The `at-a-glance` section uses `stats`, `skillGroups`, `interests` — none of which match. Without this fix, at-a-glance will be filtered out by `filterCompleteSections()` in both the publish pipeline (`publishableFromCanonical` in `page-projection.ts:99`) and the public page renderer (`PageRenderer.tsx:30`). The section would simply disappear.

**Step 1: Write the failing test**

Create `tests/evals/section-completeness-aag.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { isSectionComplete } from "@/lib/page-config/section-completeness";
import type { Section } from "@/lib/page-config/schema";

describe("isSectionComplete — at-a-glance", () => {
  it("should be complete when stats are present", () => {
    const section: Section = {
      id: "aag-1",
      type: "at-a-glance" as any,
      content: { stats: [{ label: "repos", value: "47" }] },
    };
    expect(isSectionComplete(section)).toBe(true);
  });

  it("should be complete when skillGroups are present", () => {
    const section: Section = {
      id: "aag-1",
      type: "at-a-glance" as any,
      content: { skillGroups: [{ domain: "Frontend", skills: ["React"] }] },
    };
    expect(isSectionComplete(section)).toBe(true);
  });

  it("should be complete when interests are present", () => {
    const section: Section = {
      id: "aag-1",
      type: "at-a-glance" as any,
      content: { interests: [{ name: "open source" }] },
    };
    expect(isSectionComplete(section)).toBe(true);
  });

  it("should be incomplete when all arrays are empty", () => {
    const section: Section = {
      id: "aag-1",
      type: "at-a-glance" as any,
      content: { stats: [], skillGroups: [], interests: [] },
    };
    expect(isSectionComplete(section)).toBe(false);
  });

  it("should be incomplete when content has no recognized fields", () => {
    const section: Section = {
      id: "aag-1",
      type: "at-a-glance" as any,
      content: { title: "At a Glance" },
    };
    expect(isSectionComplete(section)).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/section-completeness-aag.test.ts --reporter=verbose`
Expected: FAIL — `isSectionComplete` returns `false` for all at-a-glance sections.

**Step 3: Add at-a-glance fields to `isSectionComplete`**

In `src/lib/page-config/section-completeness.ts`, add a type-guarded check for at-a-glance content fields after the existing array checks (after line 22). **Important:** scope to `section.type === "at-a-glance"` to avoid false positives on other section types that might coincidentally have a `stats` or `interests` array key:

```typescript
// At a Glance: any of stats, skillGroups, or interests non-empty
if (section.type === "at-a-glance") {
  if (Array.isArray(c.stats) && c.stats.length > 0) return true;
  if (Array.isArray(c.skillGroups) && c.skillGroups.length > 0) return true;
  if (Array.isArray(c.interests) && c.interests.length > 0) return true;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/evals/section-completeness-aag.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Run full completeness test suite**

Run: `npx vitest run tests/evals/section-completeness*.test.ts --reporter=verbose`
Expected: All pass.

**Step 6: Commit**

```bash
git add src/lib/page-config/section-completeness.ts tests/evals/section-completeness-aag.test.ts
git commit -m "fix: add at-a-glance to section completeness filter (stats/skillGroups/interests)"
```

---

### Task 11: At a Glance — Composer Function (`buildAtAGlanceSection`)

**Files:**
- Modify: `src/lib/services/page-composer.ts`
- Test: `tests/evals/at-a-glance-composer.test.ts`

**Context:** Design D3: Fuses stats + grouped skills + interests into one section. Uses `SKILL_DOMAINS` dictionary for deterministic grouping.

**Step 1: Write the failing test**

Create `tests/evals/at-a-glance-composer.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { composeOptimisticPage } from "@/lib/services/page-composer";

function makeFact(overrides: Record<string, unknown>) {
  return {
    id: overrides.id ?? `fact-${Math.random().toString(36).slice(2, 8)}`,
    category: overrides.category as string,
    key: overrides.key as string,
    value: overrides.value ?? {},
    source: "chat",
    confidence: 1.0,
    visibility: "public",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("At a Glance section composition", () => {
  it("should produce at-a-glance section with stats, skillGroups, and interests", () => {
    const facts = [
      makeFact({ category: "identity", key: "full-name", value: { full: "Alice" } }),
      makeFact({ category: "stat", key: "repos", value: { label: "repos", value: "47" } }),
      makeFact({ category: "stat", key: "contributions", value: { label: "contributions", value: "1284" } }),
      makeFact({ category: "skill", key: "react", value: { name: "React" } }),
      makeFact({ category: "skill", key: "typescript", value: { name: "TypeScript" } }),
      makeFact({ category: "skill", key: "nodejs", value: { name: "Node.js" } }),
      makeFact({ category: "skill", key: "docker", value: { name: "Docker" } }),
      makeFact({ category: "interest", key: "open-source", value: { name: "open source" } }),
      makeFact({ category: "interest", key: "coffee", value: { name: "specialty coffee" } }),
    ];

    process.env.EXTENDED_SECTIONS = "true";
    const config = composeOptimisticPage(facts as any, "alice", "en");
    delete process.env.EXTENDED_SECTIONS;

    const aag = config.sections.find((s) => s.type === "at-a-glance");
    expect(aag).toBeDefined();
    const content = aag!.content as Record<string, unknown>;
    expect(content.stats).toHaveLength(2);
    expect((content.skillGroups as any[]).length).toBeGreaterThanOrEqual(2);
    expect(content.interests).toHaveLength(2);
  });

  it("should group skills by SKILL_DOMAINS", () => {
    const facts = [
      makeFact({ category: "identity", key: "full-name", value: { full: "Alice" } }),
      makeFact({ category: "skill", key: "react", value: { name: "React" } }),
      makeFact({ category: "skill", key: "nextjs", value: { name: "Next.js" } }),
      makeFact({ category: "skill", key: "docker", value: { name: "Docker" } }),
      makeFact({ category: "skill", key: "unknowntool", value: { name: "UnknownTool" } }),
    ];

    process.env.EXTENDED_SECTIONS = "true";
    const config = composeOptimisticPage(facts as any, "alice", "en");
    delete process.env.EXTENDED_SECTIONS;

    const aag = config.sections.find((s) => s.type === "at-a-glance");
    const content = aag!.content as Record<string, unknown>;
    const groups = content.skillGroups as { domain: string; skills: string[] }[];

    const frontend = groups.find((g) => g.domain === "Frontend");
    expect(frontend?.skills).toContain("React");
    expect(frontend?.skills).toContain("Next.js");

    const infra = groups.find((g) => g.domain === "Infra");
    expect(infra?.skills).toContain("Docker");

    const other = groups.find((g) => g.domain === "Other");
    expect(other?.skills).toContain("UnknownTool");
  });

  it("should NOT produce standalone skills, stats, interests when EXTENDED_SECTIONS=true", () => {
    const facts = [
      makeFact({ category: "identity", key: "full-name", value: { full: "Alice" } }),
      makeFact({ category: "skill", key: "react", value: { name: "React" } }),
      makeFact({ category: "stat", key: "repos", value: { label: "repos", value: "47" } }),
      makeFact({ category: "interest", key: "coffee", value: { name: "coffee" } }),
    ];

    process.env.EXTENDED_SECTIONS = "true";
    const config = composeOptimisticPage(facts as any, "alice", "en");
    delete process.env.EXTENDED_SECTIONS;

    const types = config.sections.map((s) => s.type);
    expect(types).not.toContain("skills");
    expect(types).not.toContain("stats");
    expect(types).not.toContain("interests");
    expect(types).toContain("at-a-glance");
  });

  it("should hide domain labels when only 1-2 groups", () => {
    const facts = [
      makeFact({ category: "identity", key: "full-name", value: { full: "Alice" } }),
      makeFact({ category: "skill", key: "react", value: { name: "React" } }),
    ];

    process.env.EXTENDED_SECTIONS = "true";
    const config = composeOptimisticPage(facts as any, "alice", "en");
    delete process.env.EXTENDED_SECTIONS;

    const aag = config.sections.find((s) => s.type === "at-a-glance");
    if (aag) {
      const content = aag!.content as Record<string, unknown>;
      const groups = content.skillGroups as { domain: string; skills: string[]; showLabel?: boolean }[];
      if (groups && groups.length <= 2) {
        for (const g of groups) {
          expect(g.showLabel).toBe(false);
        }
      }
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/at-a-glance-composer.test.ts --reporter=verbose`
Expected: FAIL — no `at-a-glance` section produced yet.

**Step 3: Add SKILL_DOMAINS and `buildAtAGlanceSection` to page-composer.ts**

```typescript
const SKILL_DOMAINS: Record<string, string[]> = {
  "Frontend":  ["React", "Next.js", "Tailwind CSS", "Vue", "Angular", "Svelte", "CSS", "HTML"],
  "Backend":   ["Node.js", "Python", "Go", "Java", "Ruby", "PHP", "SQLite", "PostgreSQL", "Express", "FastAPI", "Django", "Spring"],
  "Infra":     ["Docker", "Kubernetes", "AWS", "GCP", "Git", "CI/CD", "Terraform", "Linux", "Nginx", "Vercel"],
  "Languages": ["TypeScript", "JavaScript", "Rust", "C++", "C#", "Swift", "Kotlin", "Scala"],
  "AI/ML":     ["PyTorch", "TensorFlow", "LangChain", "OpenAI", "Hugging Face"],
  "Design":    ["Figma", "Sketch", "Adobe XD"],
};

function groupSkillsByDomain(skillNames: string[]): { domain: string; skills: string[]; showLabel: boolean }[] {
  const groups: Record<string, string[]> = {};
  const assigned = new Set<string>();

  for (const [domain, domainSkills] of Object.entries(SKILL_DOMAINS)) {
    const matched = skillNames.filter(
      (s) => domainSkills.some((ds) => ds.toLowerCase() === s.toLowerCase()) && !assigned.has(s),
    );
    if (matched.length > 0) {
      groups[domain] = matched;
      matched.forEach((s) => assigned.add(s));
    }
  }

  const unmatched = skillNames.filter((s) => !assigned.has(s));
  if (unmatched.length > 0) groups["Other"] = unmatched;

  const result = Object.entries(groups).map(([domain, skills]) => ({ domain, skills, showLabel: true }));
  if (result.length <= 2) {
    for (const g of result) g.showLabel = false;
  }
  return result;
}

function buildAtAGlanceSection(
  skillFacts: FactRow[],
  statFacts: FactRow[],
  interestFacts: FactRow[],
  language: string,
): Section | null {
  const skills = skillFacts
    .map((f) => { const v = val(f); return str(v.name) ?? str(v.value); })
    .filter((s): s is string => s !== undefined);

  const stats = statFacts.map((f) => {
    const v = val(f);
    const label = str(v.label) ?? str(v.name);
    const value = str(v.value) ?? str(v.number);
    if (!label || !value) return null;
    return { label, value, unit: str(v.unit) };
  }).filter((s): s is { label: string; value: string; unit?: string } => s !== null);

  const interests = interestFacts.map((f) => {
    const v = val(f);
    const name = str(v.name) ?? str(v.value);
    if (!name) return null;
    return { name };
  }).filter((i): i is { name: string } => i !== null);

  if (skills.length === 0 && stats.length === 0 && interests.length === 0) return null;

  const skillGroups = skills.length > 0 ? groupSkillsByDomain(skills) : undefined;

  const l = getL10n(language);
  const content: Record<string, unknown> = {
    title: l.atAGlanceLabel ?? "At a Glance",
  };
  if (stats.length > 0) content.stats = stats;
  if (skillGroups) content.skillGroups = skillGroups;
  if (interests.length > 0) content.interests = interests;

  return {
    id: "at-a-glance-1",
    type: "at-a-glance" as any,
    variant: "full",
    content,
  };
}
```

Also add `atAGlanceLabel` to the localization objects (see Task 18 for full list).

**Step 4: Modify `composeOptimisticPage` to use `buildAtAGlanceSection`**

When `extended`: build fused At a Glance instead of standalone skills/stats/interests. Gate the standalone `skills`, `interests` pushes behind `!extended`. Remove standalone `stats` from the extended block.

**Step 5: Run test to verify it passes**

Run: `npx vitest run tests/evals/at-a-glance-composer.test.ts --reporter=verbose`
Expected: PASS

**Step 6: Run full test suite**

Run: `npx vitest run --reporter=verbose`
Expected: All pass.

**Step 7: Commit**

```bash
git add src/lib/services/page-composer.ts tests/evals/at-a-glance-composer.test.ts
git commit -m "feat: add buildAtAGlanceSection composer (fused stats+skills+interests)"
```

---

### Task 12: At a Glance — React Component

**Files:**
- Create: `src/themes/editorial-360/components/AtAGlance.tsx`
- Modify: `src/themes/editorial-360/index.ts`

**Context:** Design D3: Three sub-blocks — stats grid, grouped skill chips, interests with `·` separator.

**Step 1: Create `AtAGlance.tsx`**

```tsx
import React from "react";
import type { SectionProps } from "../../types";

type StatItem = {
    label: string;
    value: string;
    unit?: string;
};

type SkillGroup = {
    domain: string;
    skills: string[];
    showLabel?: boolean;
};

type AtAGlanceContent = {
    title?: string;
    stats?: StatItem[];
    skillGroups?: SkillGroup[];
    interests?: { name: string }[];
};

export function AtAGlance({ content }: SectionProps<AtAGlanceContent>) {
    const { title, stats, skillGroups, interests } = content;

    if (!stats?.length && !skillGroups?.length && !interests?.length) return null;

    return (
        <section className="mb-16 theme-reveal transition-all duration-1000 ease-out opacity-0 translate-y-4" style={{ transitionDelay: '0.2s' }}>
            <h2 className="text-[10px] uppercase tracking-[0.3em] text-[var(--page-footer-fg)] font-semibold mb-8 border-b border-[var(--page-border)] pb-4">
                {title || "At a Glance"}
            </h2>

            {/* Stats row */}
            {stats && stats.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
                    {stats.map((stat, i) => (
                        <div key={i} className="text-center md:text-left">
                            <p className="text-2xl font-bold text-[var(--page-fg)]">{stat.value}</p>
                            <p className="text-xs uppercase tracking-widest text-[var(--page-fg-secondary)]">
                                {stat.unit ?? stat.label}
                            </p>
                        </div>
                    ))}
                </div>
            )}

            {/* Separator */}
            {stats && stats.length > 0 && (skillGroups?.length || interests?.length) && (
                <hr className="border-[var(--page-border)] mb-8" />
            )}

            {/* Skill groups */}
            {skillGroups && skillGroups.length > 0 && (
                <div className="flex flex-col gap-4 mb-8">
                    {skillGroups.map((group, i) => (
                        <div key={i} className="flex flex-col md:flex-row gap-2 md:gap-4 items-baseline">
                            {group.showLabel !== false && (
                                <span className="text-xs uppercase tracking-widest text-[var(--page-fg-secondary)] md:w-24 shrink-0">
                                    {group.domain}
                                </span>
                            )}
                            <div className="flex flex-wrap gap-2">
                                {group.skills.map((skill, j) => (
                                    <span
                                        key={j}
                                        className="inline-flex rounded-full border border-[var(--page-border)] px-3 py-1 text-sm text-[var(--page-fg)] hover:bg-[var(--page-fg)] hover:text-[var(--page-bg)] transition-colors duration-300 cursor-default"
                                    >
                                        {skill}
                                    </span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Separator */}
            {skillGroups && skillGroups.length > 0 && interests?.length && (
                <hr className="border-[var(--page-border)] mb-8" />
            )}

            {/* Interests */}
            {interests && interests.length > 0 && (
                <p className="text-base font-light text-[var(--page-fg)]">
                    <span className="text-[var(--page-accent)] font-medium">Into</span>{" "}
                    {interests.map((i) => i.name).join(" · ")}
                </p>
            )}
        </section>
    );
}
```

**Step 2: Register in theme**

In `src/themes/editorial-360/index.ts`:

```typescript
import { AtAGlance } from "./components/AtAGlance";

const components: Record<string, React.ComponentType<any>> = {
    // ... existing entries ...
    "at-a-glance": AtAGlance,
};
```

**Step 3: Visual verification**

Navigate to published page. Verify At a Glance renders with stats, grouped skills, interests.

**Step 4: Commit**

```bash
git add src/themes/editorial-360/components/AtAGlance.tsx src/themes/editorial-360/index.ts
git commit -m "feat: add AtAGlance component (stats + grouped skills + interests)"
```

---

### Task 13: CollapsibleList Component

**Files:**
- Create: `src/components/page/CollapsibleList.tsx`

**Step 1: Create CollapsibleList component**

Create `src/components/page/CollapsibleList.tsx`:

```tsx
"use client";

import React, { useState, useRef, useEffect } from "react";

type CollapsibleListProps = {
    items: React.ReactNode[];
    summaryLine: string;
    threshold?: number;
};

export function CollapsibleList({ items, summaryLine, threshold = 3 }: CollapsibleListProps) {
    const [expanded, setExpanded] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const [contentHeight, setContentHeight] = useState(0);

    useEffect(() => {
        if (contentRef.current) {
            setContentHeight(contentRef.current.scrollHeight);
        }
    }, [expanded, items]);

    if (items.length < threshold) {
        return <>{items}</>;
    }

    const firstItem = items[0];
    const restItems = items.slice(1);

    return (
        <div>
            {firstItem}
            {!expanded && (
                <button
                    onClick={() => setExpanded(true)}
                    className="mt-4 flex items-center gap-2 text-sm text-[var(--page-fg-secondary)] hover:text-[var(--page-fg)] transition-colors cursor-pointer group"
                >
                    <span className="text-xs">▼</span>
                    <span className="border-b border-transparent group-hover:border-[var(--page-fg)] transition-colors">
                        {summaryLine}
                    </span>
                </button>
            )}
            <div
                ref={contentRef}
                style={{
                    maxHeight: expanded ? `${contentHeight}px` : "0px",
                    overflow: "hidden",
                    transition: "max-height 0.4s ease-in-out",
                }}
            >
                {restItems}
            </div>
            {expanded && (
                <button
                    onClick={() => setExpanded(false)}
                    className="mt-4 flex items-center gap-2 text-sm text-[var(--page-fg-secondary)] hover:text-[var(--page-fg)] transition-colors cursor-pointer group"
                >
                    <span className="text-xs">▲</span>
                    <span className="border-b border-transparent group-hover:border-[var(--page-fg)] transition-colors">
                        Collapse
                    </span>
                </button>
            )}
        </div>
    );
}
```

**Step 2: Commit**

```bash
git add src/components/page/CollapsibleList.tsx
git commit -m "feat: add CollapsibleList component with expand/collapse animation"
```

---

### Task 14: Integrate CollapsibleList into Experience, Projects, Achievements, Education

**Files:**
- Modify: `src/themes/editorial-360/components/Experience.tsx`
- Modify: `src/themes/editorial-360/components/Projects.tsx`
- Modify: `src/themes/editorial-360/components/Achievements.tsx`
- Modify: `src/themes/editorial-360/components/Education.tsx`

**Context:** Design D4. Each section wraps its items in `<CollapsibleList>`. Summary line varies per section type. Experience sorts `current: true` first.

**Step 1: Read current component code**

Read the body of each component to understand the iteration pattern.

**Step 2: Wrap items in CollapsibleList**

For each component, replace the direct iteration with `CollapsibleList`:

**Experience.tsx** pattern:

```tsx
import { CollapsibleList } from "@/components/page/CollapsibleList";

// Sort: current first, then by date
const sortedItems = [...items].sort((a, b) => {
    if (a.current && !b.current) return -1;
    if (!a.current && b.current) return 1;
    return 0;
});

const summaryLine = sortedItems
    .slice(1)
    .map((item) => `${item.title}${item.company ? ` @ ${item.company}` : ""}`)
    .join(", ");

<CollapsibleList
    items={sortedItems.map((item, i) => (
        <div key={i}>{/* existing item rendering */}</div>
    ))}
    summaryLine={summaryLine}
/>
```

**Projects.tsx:** summary = `title` of hidden items, joined with `, `
**Achievements.tsx:** summary = `title` of hidden items, joined with `, `
**Education.tsx:** summary = `institution` of hidden items, joined with `, `

**Step 3: Visual verification**

Navigate to published page. Verify collapsible behavior.

**Step 4: Commit**

```bash
git add src/themes/editorial-360/components/Experience.tsx src/themes/editorial-360/components/Projects.tsx src/themes/editorial-360/components/Achievements.tsx src/themes/editorial-360/components/Education.tsx
git commit -m "feat: integrate CollapsibleList into Experience, Projects, Achievements, Education"
```

---

### Task 15: Default Section Order in Composer

**Files:**
- Modify: `src/lib/services/page-composer.ts` (lines 869-943)
- Test: `tests/evals/section-order.test.ts`

**Context:** Design D5. New order: hero → bio → at-a-glance → experience → projects → education → achievements → reading → music → activities → footer. Social/contact/languages absorbed into hero.

**Step 1: Write the failing test**

Create `tests/evals/section-order.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { composeOptimisticPage } from "@/lib/services/page-composer";

function makeFact(overrides: Record<string, unknown>) {
  return {
    id: overrides.id ?? `fact-${Math.random().toString(36).slice(2, 8)}`,
    category: overrides.category as string,
    key: overrides.key as string,
    value: overrides.value ?? {},
    source: "chat",
    confidence: 1.0,
    visibility: "public",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("Section order in extended mode", () => {
  it("should follow design D5 default order", () => {
    const facts = [
      makeFact({ category: "identity", key: "full-name", value: { full: "Alice" } }),
      makeFact({ category: "identity", key: "bio", value: { text: "Software dev." } }),
      makeFact({ category: "skill", key: "react", value: { name: "React" } }),
      makeFact({ category: "stat", key: "repos", value: { label: "repos", value: "10" } }),
      makeFact({ category: "interest", key: "oss", value: { name: "open source" } }),
      makeFact({ category: "experience", key: "job1", value: { role: "Dev", company: "Acme", current: true } }),
      makeFact({ category: "project", key: "p1", value: { title: "Tool", description: "A tool" } }),
      makeFact({ category: "education", key: "uni", value: { institution: "MIT", degree: "BSc", field: "CS" } }),
      makeFact({ category: "achievement", key: "a1", value: { title: "Award", description: "Won it" } }),
    ];

    process.env.EXTENDED_SECTIONS = "true";
    const config = composeOptimisticPage(facts as any, "alice", "en");
    delete process.env.EXTENDED_SECTIONS;

    const types = config.sections.map((s) => s.type);

    const expectedOrder = [
      "hero",
      "bio",
      "at-a-glance",
      "experience",
      "projects",
      "education",
      "achievements",
      "footer",
    ];

    for (let i = 1; i < expectedOrder.length; i++) {
      const prev = types.indexOf(expectedOrder[i - 1]);
      const curr = types.indexOf(expectedOrder[i]);
      if (prev !== -1 && curr !== -1) {
        expect(curr).toBeGreaterThan(prev);
      }
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/section-order.test.ts --reporter=verbose`
Expected: FAIL — at-a-glance comes after experience (current order).

**Step 3: Reorder section pushes in `composeOptimisticPage`**

Restructure the extended path to use the D5 order. The entire `composeOptimisticPage` body after `const sections: Section[] = [];` and hero push should be restructured:

```typescript
if (extended) {
  // D5 order: bio → at-a-glance → experience → projects → education →
  //           achievements → reading → music → activities
  // Social/contact/languages absorbed into hero (Task 7)

  if (bio) sections.push(bio);

  const atAGlance = buildAtAGlanceSection(
    grouped.get("skill") ?? [], grouped.get("stat") ?? [], interestFacts, language,
  );
  if (atAGlance) sections.push(atAGlance);

  const experience = buildExperienceSection(experienceFacts, language);
  if (experience) sections.push(experience);

  const projects = buildProjectsSection(grouped.get("project") ?? []);
  if (projects) sections.push(projects);

  const education = buildEducationSection(grouped.get("education") ?? [], language);
  if (education) sections.push(education);

  const achievements = buildAchievementsSection(grouped.get("achievement") ?? [], language);
  if (achievements) sections.push(achievements);

  const reading = buildReadingSection(grouped.get("reading") ?? [], language);
  if (reading) sections.push(reading);

  const music = buildMusicSection(grouped.get("music") ?? [], language);
  if (music) sections.push(music);

  const activities = buildActivitiesSection(grouped.get("activity") ?? [], language);
  if (activities) sections.push(activities);
} else {
  // Legacy order (unchanged)
  if (bio) sections.push(bio);

  const timeline = buildTimelineSection(experienceFacts, language);
  if (timeline) sections.push(timeline);

  const skills = buildSkillsSection(grouped.get("skill") ?? [], language);
  if (skills) sections.push(skills);

  const projects = buildProjectsSection(grouped.get("project") ?? []);
  if (projects) sections.push(projects);

  const interests = buildInterestsSection(interestFacts, language);
  if (interests) sections.push(interests);

  const social = buildSocialSection(grouped.get("social") ?? []);
  if (social) sections.push(social);
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/evals/section-order.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/services/page-composer.ts tests/evals/section-order.test.ts
git commit -m "feat: reorder sections to design D5 default (bio → at-a-glance → experience → projects)"
```

---

### Task 16: Agent Prompt — Profile Archetype Detection + Section Intelligence

**Files:**
- Modify: `src/lib/agent/context.ts` (lines 69-148, `assembleContext`)
- Modify: `src/lib/agent/prompts.ts` (no signature change — archetype goes through context, not prompt function)

**Context:** Design D5. Add `detectArchetype()` function and thread it into the system prompt via `assembleContext`, which already has access to facts (line 80) and builds the full system prompt (line 123-143). The current `getSystemPromptText(mode, language)` signature remains unchanged — the layout intelligence block is appended in `assembleContext` alongside the existing context blocks (facts, soul, memories, etc.).

**Step 1: Add `detectArchetype` function to context.ts**

Add before `assembleContext`:

```typescript
export type ProfileArchetype = "developer" | "designer" | "executive" | "student" | "creator" | "generalist";

export function detectArchetype(facts: FactRow[]): ProfileArchetype {
  const projectFacts = facts.filter((f) => f.category === "project");
  const experienceFacts = facts.filter((f) => f.category === "experience");
  const identityFacts = facts.filter((f) => f.category === "identity");
  const skillFacts = facts.filter((f) => f.category === "skill");

  // Check role/title keywords
  const roleFact = identityFacts.find((f) => f.key === "role" || f.key === "title");
  const roleStr = roleFact ? JSON.stringify(roleFact.value).toLowerCase() : "";

  if (roleStr.includes("designer") || roleStr.includes("ux") || roleStr.includes("ui")) return "designer";
  if (roleStr.includes("ceo") || roleStr.includes("cto") || roleStr.includes("director") || roleStr.includes("vp")) return "executive";
  if (roleStr.includes("student") || roleStr.includes("intern")) return "student";

  // 3+ projects with URL = creator
  const projectsWithUrl = projectFacts.filter((f) => {
    const v = typeof f.value === "object" && f.value !== null ? f.value : {};
    return "url" in v || "link" in v;
  });
  if (projectsWithUrl.length >= 3) return "creator";

  // Dev signals
  if (skillFacts.length >= 3) return "developer";

  // Lots of experience = executive
  if (experienceFacts.length >= 5) return "executive";

  return "generalist";
}
```

**Step 2: Thread archetype into system prompt via `assembleContext`**

Inside `assembleContext`, after the existing context blocks (around line 143), add:

```typescript
// Layout intelligence block (steady_state only)
if (mode === "steady_state") {
  const archetype = detectArchetype(existingFacts);
  const layoutIntelligence = `
PAGE LAYOUT INTELLIGENCE:
Default order: bio → at-a-glance → experience → projects → education → achievements → [personality sections]

Profile archetype: ${archetype}

Consider reordering when:
- designer: projects before experience (portfolio-first)
- student: education before experience
- executive: experience before everything (track record)
- creator: projects + achievements before experience
- User EXPLICITLY asks: put requested section right after bio

Before proposing a reorder, explain reasoning and ask for confirmation.`;
  contextParts.push(`\n\n---\n\n${layoutIntelligence}`);
}
```

**Step 3: Commit**

```bash
git add src/lib/agent/context.ts
git commit -m "feat: add profile archetype detection and layout intelligence to agent context"
```

Note: `prompts.ts` is NOT modified — the archetype flows through `assembleContext` which already builds the full system prompt by combining `getSystemPromptText()` + dynamic context blocks.

---

### Task 17 (OPTIONAL — Stretch): Personalization Integration for At a Glance

**Files:**
- Modify: `src/lib/services/personalizer-schemas.ts`
- Modify: `src/lib/services/personalization-hashing.ts`

**Context:** The design doc marks personalizer integration as out of scope (line 217). This task adds minimal registration so the personalizer pipeline doesn't error on `at-a-glance` sections. It's safe to skip — the personalizer will simply ignore unregistered section types. Include only if time permits.

**Step 1: Add at-a-glance to PERSONALIZABLE_FIELDS**

In `src/lib/services/personalizer-schemas.ts`:

```typescript
export const PERSONALIZABLE_FIELDS: Record<string, string[]> = {
  // ... existing entries ...
  "at-a-glance": ["description"],
};

export const MAX_WORDS: Record<string, number> = {
  // ... existing entries ...
  "at-a-glance": 60,
};
```

**Step 2: Add at-a-glance to SECTION_FACT_CATEGORIES**

In `src/lib/services/personalization-hashing.ts`:

```typescript
export const SECTION_FACT_CATEGORIES: Record<string, string[]> = {
  // ... existing entries ...
  "at-a-glance": ["skill", "stat", "interest"],
};
```

**Step 3: Commit**

```bash
git add src/lib/services/personalizer-schemas.ts src/lib/services/personalization-hashing.ts
git commit -m "feat: register at-a-glance in personalizer field map and fact categories"
```

---

### Task 18: Update Localization + Re-seed

**Files:**
- Modify: `src/lib/services/page-composer.ts` (localization objects)
- Modify: `scripts/seed-realistic.ts` (if needed)

**Step 1: Add localization entry**

In `page-composer.ts`, wherever the `getL10n` function defines its language objects, add `atAGlanceLabel`:

```typescript
// English
atAGlanceLabel: "At a Glance",
// Italian
atAGlanceLabel: "Colpo d'Occhio",
// German
atAGlanceLabel: "Auf einen Blick",
// French
atAGlanceLabel: "En un Coup d'Œil",
// Spanish
atAGlanceLabel: "De un Vistazo",
// Portuguese
atAGlanceLabel: "Num Relance",
// Japanese
atAGlanceLabel: "概要",
// Chinese
atAGlanceLabel: "一览",
```

**Step 2: Re-seed the database**

```bash
rm -f db/openself.db db/openself.db-shm db/openself.db-wal
EXTENDED_SECTIONS=true INVITE_CODES=code1 npx tsx scripts/seed-realistic.ts
```

**Step 3: Verify published page**

```bash
EXTENDED_SECTIONS=true INVITE_CODES=code1 npm run dev
```

Navigate to `http://localhost:3000/tommaso`. Verify:
- Hero shows name left + tagline right, with ContactBar below (social, email, languages)
- Bio full-width
- At a Glance section with stats, grouped skills, interests
- Experience with collapsible (1 visible, rest expandable)
- Projects with collapsible
- No standalone skills/stats/interests/social/contact/languages sections
- Single footer
- Clean section ordering

**Step 4: Commit**

```bash
git add src/lib/services/page-composer.ts
git commit -m "feat: add at-a-glance localization labels for 8 languages"
```

---

### Task 19: Full Test Suite Pass + Final Cleanup

**Files:**
- Various test files may need adjustment

**Step 1: Run full test suite**

```bash
npx vitest run --reporter=verbose
```

**Step 2: Fix any failing tests**

Common expected fixes:
- Tests expecting standalone `skills`/`stats`/`interests` sections in extended mode → update to expect `at-a-glance`
- Tests counting section types → adjust counts
- Tests checking `filterPublishableFacts` behavior for contact category → update expectations
- Snapshot tests → update snapshots

**Step 3: Run tests again**

```bash
npx vitest run --reporter=verbose
```
Expected: All pass.

**Step 4: Commit**

```bash
git add -A
git commit -m "test: fix tests for layout redesign (at-a-glance, section order, hero contactbar, completeness)"
```

---

## Summary of Changes

| Task | Description | Type | Severity Addressed |
|------|-------------|------|--------------------|
| 1 | Fix proposals API 500 (`this` context) | Bug fix | Finding 5 (test robustness) |
| 2 | Fix skills duplicate heading | Bug fix | — |
| 3 | Fix social copyright double footer | Bug fix | — |
| 4 | Fix bio alignment (full-width) | Bug fix | — |
| 5 | Hero two-column layout with clamp sizing | Feature | Finding 6 (doc clarification) |
| 6 | **Contact → user-controlled category (remove from SENSITIVE)** | **Bug fix** | **Findings R1.2 + R2.1** |
| 7 | ContactBar data flow in composer | Feature | — |
| 8 | ContactBar rendering in Hero component | Feature | — |
| 9 | Register `at-a-glance` + **fix legacy widget map** | Feature | **Finding 3 (HIGH)** |
| 10 | **At-a-glance section completeness filter** | **Bug fix** | **Finding 1 (CRITICAL)** |
| 11 | `buildAtAGlanceSection` composer function | Feature | — |
| 12 | AtAGlance React component | Feature | — |
| 13 | CollapsibleList component | Feature | — |
| 14 | Integrate CollapsibleList into 4 components | Feature | — |
| 15 | Default section order in composer | Feature | — |
| 16 | Agent prompt archetype + layout intelligence | Feature | **Finding 4 (plumbing)** |
| 17 | Personalization integration (OPTIONAL) | Feature | Finding 6 (out-of-scope per design) |
| 18 | Localization + re-seed | Feature | — |
| 19 | Full test suite pass + cleanup | Test | — |

## Review Findings Addressed

### Round 1

| # | Finding | Severity | How Addressed |
|---|---------|----------|---------------|
| 1 | at-a-glance missing from completeness filter | Critical | **Task 10** — adds type-guarded `stats`/`skillGroups`/`interests` checks to `isSectionComplete()` |
| 2 | ContactBar email stripped by SENSITIVE_CATEGORIES in publish | High | **Task 6** — removes `contact` from `SENSITIVE_CATEGORIES` (user-controlled, not inherently sensitive) |
| 3 | Legacy widget map has non-existent IDs | High | **Task 9 Step 4** — fixes `hero-large→hero-split`, `bio-full→bio-dropcap`, `projects-grid→projects-list`, `projects-featured→projects-bento` |
| 4 | Task 14 underspecified (archetype plumbing) | Medium | **Task 16** — archetype injected via `assembleContext` (has facts access), NOT via `getSystemPromptText` |
| 5 | Task 1 test fragile (hits real DB) | Medium | **Task 1** — test uses `createProposalService(testDb)` factory + destructuring pattern to reproduce bug |
| 6 | Doc inconsistencies (variant naming, personalizer scope) | Low | Terminology note in header; Task 17 marked OPTIONAL per design doc |

### Round 2

| # | Finding | Severity | How Addressed |
|---|---------|----------|---------------|
| 1 | Contact visibility unreachable in real flow | High | **Task 6 rewritten** — removes `contact` from `SENSITIVE_CATEGORIES` entirely; contact becomes user-controlled (proposed during onboarding, user sets public/private). Agent prompt updated. `private-contact` stays sensitive. |
| 2 | Experience CollapsibleList uses `role` (field doesn't exist) | Medium | **Task 14** — fixed summary line to `item.title` + optional `item.company` (matches `ExperienceItem` type) |
| 3 | Completeness check lacks type guard | Medium | **Task 10** — `stats`/`skillGroups`/`interests` checks scoped to `section.type === "at-a-glance"` |
| 4 | `updatedAt` column doesn't exist on proposals | Low | **Task 1** — `_markStale` sets only `{ status: "stale" }` (matching existing implementation; schema has `createdAt` + `reviewedAt`, no `updatedAt`) |

### Round 3

| # | Finding | Severity | How Addressed |
|---|---------|----------|---------------|
| 1 | `PROPOSAL_ALLOWLIST` also missing `"contact"` — `canProposePublic()` returns false | Blocker | **Task 6** — adds `"contact"` to `PROPOSAL_ALLOWLIST` + `canProposePublic("contact", 0.9) === true` test |
| 2 | First-match email selection doesn't let user choose which email | Blocker | **Task 7** — email selection now uses visibility-priority: filter to `type=email`, sort `public > proposed`, pick first. User controls via visibility per fact. |
| 3 | No tests for multi-email priority | Medium | **Task 7** — 2 new tests: 3 emails with different visibilities (public wins), proposed-only fallback |

### Round 4

| # | Finding | Severity | How Addressed |
|---|---------|----------|---------------|
| 1 | Task 7 `makeFact` ignores `overrides.visibility` (hardcoded `"public"`) | Important | **Task 7** — `makeFact` now uses `(overrides.visibility as string) ?? "public"`, so multi-email tests with `proposed`/`private` actually test that logic |
| 2 | Multiple public emails → first-in-list (no explicit pick) | Note (accepted) | By design: user controls via visibility. Multiple public emails is an edge case; array order is sufficient. No `preferred` field needed. |

## Backward Compatibility

- Standalone `skills`, `stats`, `interests`, `social`, `contact`, `languages` components remain in code
- Existing drafts with these section types continue to render (legacy widget map now correctly maps to real widget IDs)
- `EXTENDED_SECTIONS=false` retains full legacy behavior (no at-a-glance, no contactbar, original section order)
- Contact privacy: `contact` removed from `SENSITIVE_CATEGORIES`. Contact facts now get `proposed` visibility during onboarding (like social/skill/etc), and user can set them to `public` or `private`. `private-contact` remains sensitive for truly private info. Existing contact facts with `visibility=private` are unaffected — they stay private until user changes them.

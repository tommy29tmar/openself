# Layout Redesign — Design Document

**Date:** 2026-02-27
**Status:** Approved
**Approach:** Incremental redesign (Approach A) — modify existing components, no new layout templates

## Context

UAT of the seed-realistic script revealed several layout issues on the published page:

1. Hero name truncated ("TO" / "MA" instead of "Tommaso Marrone")
2. Skills section: duplicate heading + bulleted list instead of chips + wastes horizontal space
3. Bio text pushed to the right by the "ABOUT" label layout
4. Social section has hardcoded copyright creating a double footer
5. Section ordering lacks narrative logic (social/footer in the middle, extended sections after)
6. No collapsible/expandable pattern for long sections
7. Contact, social links, and languages far from hero
8. Proposals API returns 500 (`this` lost in destructured export)

## Design Decisions

### D1: Hero — Two-Column Layout (name left, tagline right)

**Rationale:** A fixed reasonable font size treats all names equally (no shrink-to-fit hierarchy). Two-column layout uses horizontal space better and avoids truncation.

**Layout:**
```
Desktop (md+):
┌──────────────────────┬──────────────────────────┐
│  TOMMASO              │  Building tools that put  │
│  MARRONE              │  people in control of     │
│                       │  their data               │
└──────────────────────┴──────────────────────────┘

Mobile (<md):
┌────────────────────────────────────────────────┐
│  TOMMASO MARRONE                                │
│  Building tools that put people in control...   │
└────────────────────────────────────────────────┘
```

**CSS:** Name uses `clamp(1.8rem, 4vw, 3rem)`, uppercase, bold, tracking `0.05em`. Tagline uses `clamp(1rem, 2vw, 1.25rem)`, font-light, secondary color. Grid: `md:grid md:grid-cols-2 md:gap-8 md:items-end`. Mobile stacks naturally.

**Variants affected:** Only `large` variant changes. `compact` and `minimal` stay as-is.

### D2: ContactBar — Integrated in Hero Component

**Rationale:** No new section type or layout slot needed. The Hero component renders the ContactBar internally using data injected by the composer.

**Layout:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GitHub  LinkedIn  Twitter  Mastodon  Website
tommaso@openself.dev
IT native · EN fluent · DE intermediate
```

**Data flow:** `buildHeroSection()` in the composer receives social links, contact email, and languages from facts, and injects them into the hero's content object.

**Sections absorbed:** `social`, `contact`, `languages` no longer generated as standalone sections. Data flows into hero content instead.

**Graceful degradation:** If no social/contact/language facts exist, ContactBar doesn't render.

### D3: At a Glance — Fused Stats + Skills (Grouped) + Interests

**Rationale:** Three separate sections waste vertical space and leave horizontal space empty. A single fused section communicates 3x more in the same area.

**Layout:**
```
AT A GLANCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  47            1,284           2.3k           ∞
  repos      contributions     stars       coffees
─────────────────────────────────────────────────────

  Frontend    [TypeScript] [React] [Next.js] [Tailwind CSS]
  Backend     [Node.js] [SQLite] [Python]
  Infra       [Docker] [Git] [Rust]

─────────────────────────────────────────────────────

  Into  local-first software · open source ·
        AI/LLM tooling · photography · specialty coffee
```

**Content type:**
```typescript
type AtAGlanceContent = {
  stats?: { label: string; value: string; unit?: string }[];
  skillGroups?: { domain: string; skills: string[] }[];
  interests?: { name: string }[];
};
```

**Skill grouping:** Deterministic mapping via `SKILL_DOMAINS` dictionary:
```typescript
const SKILL_DOMAINS: Record<string, string[]> = {
  "Frontend":  ["React", "Next.js", "Tailwind CSS", "Vue", "Angular", "Svelte", "CSS", "HTML"],
  "Backend":   ["Node.js", "Python", "Go", "Java", "Ruby", "PHP", "SQLite", "PostgreSQL"],
  "Infra":     ["Docker", "Kubernetes", "AWS", "GCP", "Git", "CI/CD", "Terraform", "Linux"],
  "Languages": ["TypeScript", "JavaScript", "Rust", "C++", "C#", "Swift", "Kotlin"],
  "AI/ML":     ["PyTorch", "TensorFlow", "LangChain", "OpenAI"],
  "Design":    ["Figma", "Sketch", "Adobe XD"],
};
```
Unrecognized skills go to "Other". If only 1-2 groups, domain labels are hidden.

**Sections replaced:** `skills`, `stats`, `interests` are no longer generated as standalone sections when `EXTENDED_SECTIONS=true`.

**CSS:** Stats in 4-col grid (2-col mobile), numbers `text-2xl font-bold`, labels `text-xs uppercase tracking-widest`. Skill chips: `inline-flex rounded-full border px-3 py-1 text-sm`. Domain labels: `text-xs uppercase tracking-widest text-secondary`. Interests: `text-base font-light`, separated by `·`, prefix "Into" in accent color.

### D4: Collapsible Pattern for Long Sections

**Rationale:** Experience (3 jobs), Projects (4 items), Achievements (3 items) create very long pages. Show the most relevant item fully, summarize the rest.

**Component:** `CollapsibleList` — reusable wrapper.

```typescript
type CollapsibleListProps = {
  items: React.ReactNode[];
  summaryLine: string;        // e.g. "Software Engineer @ Vercel, Frontend Developer @ Zalando"
  threshold?: number;         // default 3
};
```

**Behavior:**
- 1-2 items: render all, no collapsible
- 3+ items: first item fully visible, then summary line + `▼ expand` button
- Expanded: all items visible + `▲ collapse` button
- Smooth `max-height` transition animation

**Summary line construction per section:**
- Experience: `role @ company` for hidden items, joined with `, `
- Projects: `title` for hidden items, joined with `, `
- Achievements: `title` for hidden items, joined with `, `
- Education: `institution` for hidden items, joined with `, `

**Item ordering:** First item = most relevant. Experience: `current === true` first, then by date. Others: array order (agent can reorder).

### D5: Default Section Order + Agent Intelligence

**Default order (composer):**
```
1.  hero          (name + tagline + contact bar)
2.  bio           (short text)
3.  at-a-glance   (stats + skills + interests)
4.  experience    (collapsible)
5.  projects      (collapsible)
6.  education     (collapsible)
7.  achievements  (collapsible)
8.  reading       (optional)
9.  music         (optional)
10. activities    (optional)
11. footer
```

**Agent reordering:** The existing `reorder_sections` tool works as-is. New prompt guidance added:

```
## Page Layout Intelligence

Default order: bio → at-a-glance → experience → projects → education → achievements → [personality]

Consider reordering when:
- DESIGNER: projects before experience (portfolio-first)
- STUDENT: education before experience
- EXECUTIVE: experience before everything (track record)
- CREATOR: projects + achievements before experience
- User EXPLICITLY asks: put requested section right after bio

Before proposing a reorder, explain reasoning and ask for confirmation.
```

**Profile archetype detection** in `context.ts`:
```typescript
function detectArchetype(facts): "developer" | "designer" | "executive" | "student" | "creator" | "generalist"
```
Deterministic logic based on facts (3+ projects with URL → creator, role contains designer → designer, etc.). Passed to agent prompt as context.

### D6: Bug Fixes

**6a: Proposals API 500** (`proposal-service.ts`)
`markStaleProposals` uses `this.getPendingProposals()` but `this` is lost via destructured export. Fix: extract internal `_getPendingProposals()` function called by both the public method and `markStaleProposals`.

**6b: Skills heading duplicate** (`editorial-360/Skills.tsx`)
Skip `<h3>{group.label}</h3>` when there's only one group: `{groups.length > 1 && <h3>...`}`.

**6c: Social copyright double** (`editorial-360/Social.tsx`)
Remove the hardcoded `© {year} OpenSelf. Precision Built.` paragraph. Footer is handled by FooterSection.

**6d: Bio alignment** (`editorial-360/Bio.tsx`)
Remove the two-column label layout. "ABOUT" header stays above, text below at full width.

## Files Changed

| # | Change | Files | Type |
|---|--------|-------|------|
| 1 | Hero 2-col layout | `src/themes/editorial-360/components/Hero.tsx` | Modify |
| 2 | ContactBar in hero | `Hero.tsx`, `src/lib/services/page-composer.ts` | Modify |
| 3 | At a Glance component | `src/themes/editorial-360/components/AtAGlance.tsx` (new), `page-composer.ts`, `src/lib/page-config/schema.ts`, `src/themes/editorial-360/index.ts` | New + Modify |
| 4 | CollapsibleList | `src/components/page/CollapsibleList.tsx` (new), `Experience.tsx`, `Projects.tsx`, `Achievements.tsx`, `Education.tsx` | New + Modify |
| 5 | Default order + agent prompt | `page-composer.ts`, `src/lib/agent/prompts.ts`, `src/lib/agent/context.ts` | Modify |
| 6a | Fix proposals 500 | `src/lib/services/proposal-service.ts` | Bug fix |
| 6b | Fix skills heading | `src/themes/editorial-360/components/Skills.tsx` | Bug fix |
| 6c | Fix social copyright | `src/themes/editorial-360/components/Social.tsx` | Bug fix |
| 6d | Fix bio alignment | `src/themes/editorial-360/components/Bio.tsx` | Bug fix |
| 7 | Update seed script | `scripts/seed-realistic.ts` | Modify |

## Backward Compatibility

- Standalone `skills`, `stats`, `interests`, `social`, `contact`, `languages` components remain in code
- Existing drafts with these section types continue to render
- The new composer simply stops producing them
- `EXTENDED_SECTIONS=false` retains full legacy behavior

## Out of Scope

- New layout templates (sidebar, bento)
- New themes
- Avatar upload
- Personalizer integration with new section types (can be added later)

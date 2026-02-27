# Theme Designer Agent

You are a specialized agent for creating and modifying OpenSelf themes. You have deep knowledge of the CSS custom property system, component architecture, and theme registration pipeline.

## CSS Custom Properties Reference

All theme colors and design tokens are defined via CSS custom properties in `src/app/globals.css`. Components MUST use `var(--page-*)` — never hardcode colors.

### Color Tokens (19 properties)

| Property | Purpose |
|----------|---------|
| `--page-bg` | Page background |
| `--page-fg` | Primary text color |
| `--page-fg-secondary` | Secondary/muted text |
| `--page-muted` | Muted backgrounds, dividers |
| `--page-border` | Default border color |
| `--page-accent` | Primary accent (links, highlights) |
| `--page-accent-fg` | Text on accent backgrounds |
| `--page-card-bg` | Card/section background |
| `--page-card-border` | Card border |
| `--page-card-hover` | Card hover state |
| `--page-badge-bg` | Badge/chip background |
| `--page-badge-fg` | Badge/chip text |
| `--page-badge-border` | Badge/chip border |
| `--page-footer-fg` | Footer text color |
| `--page-font-heading` | Heading font family |
| `--page-font-body` | Body font family |
| `--page-radius-base` | Default border radius |
| `--page-shadow` | Default box shadow |
| `--page-shadow-lg` | Large box shadow |

### Spacing Scale (`--space-*`)

| Token | Value |
|-------|-------|
| `--space-1` | 0.25rem (4px) |
| `--space-2` | 0.5rem (8px) |
| `--space-3` | 0.75rem (12px) |
| `--space-4` | 1rem (16px) |
| `--space-6` | 1.5rem (24px) |
| `--space-8` | 2rem (32px) |
| `--space-10` | 2.5rem (40px) |
| `--space-12` | 3rem (48px) |
| `--space-16` | 4rem (64px) |
| `--space-20` | 5rem (80px) |
| `--space-24` | 6rem (96px) |

### Typography Scale (`--text-*`)

| Token | Value |
|-------|-------|
| `--text-xs` | 0.75rem |
| `--text-sm` | 0.875rem |
| `--text-base` | 1rem |
| `--text-lg` | 1.125rem |
| `--text-xl` | 1.25rem |
| `--text-2xl` | 1.5rem |
| `--text-3xl` | 1.875rem |
| `--text-4xl` | 2.25rem |
| `--text-5xl` | 3rem |

### Border Radius Scale (`--page-radius-*`)

| Token | Value |
|-------|-------|
| `--page-radius-sm` | 0.25rem |
| `--page-radius-md` | 0.5rem |
| `--page-radius-lg` | 0.75rem |
| `--page-radius-xl` | 1rem |
| `--page-radius-2xl` | 1.5rem |
| `--page-radius-full` | 9999px |

### Layout Tokens

| Token | Value |
|-------|-------|
| `--page-max-width` | 48rem |
| `--page-wide-max-width` | 64rem |

### Transitions

| Token | Value |
|-------|-------|
| `--transition-fast` | 150ms cubic-bezier(0.4, 0, 0.2, 1) |
| `--transition-base` | 200ms cubic-bezier(0.4, 0, 0.2, 1) |
| `--transition-slow` | 300ms cubic-bezier(0.4, 0, 0.2, 1) |

## Current Themes

Three themes exist: `minimal`, `warm`, `editorial-360`. Source of truth: `AVAILABLE_THEMES` in `src/lib/page-config/schema.ts`.

Each theme defines light and dark variants in `globals.css` via media queries:
```css
[data-theme="mytheme"] { /* light values */ }
@media (prefers-color-scheme: dark) {
  [data-theme="mytheme"] { /* dark values */ }
}
```

## Section Types (18 ComponentTypes)

hero, bio, skills, projects, timeline (deprecated), interests, achievements, stats, social, custom, reading, music, contact, experience, education, languages, activities, footer

## Widget Registry (25 widgets)

Each section type has one or more widgets with different variants and slot compatibility:

| Widget ID | Section | Variant | Fits In |
|-----------|---------|---------|---------|
| hero-large | hero | large | wide |
| hero-compact | hero | compact | wide, half |
| bio-full | bio | full | wide, half |
| bio-tagline | bio | short | wide, half, third |
| skills-chips | skills | chips | wide, half, third |
| skills-list | skills | list | wide, half |
| skills-cloud | skills | cloud | wide, half, square |
| projects-grid | projects | grid | wide, half |
| projects-featured | projects | featured | wide |
| projects-list | projects | list | wide, half, third |
| timeline-full | timeline | list | wide, half |
| interests-chips | interests | chips | wide, half, third |
| social-icons | social | icons | wide, half, third |
| social-buttons | social | buttons | wide, half |
| footer-default | footer | footer | wide |
| achievements-list | achievements | list | wide, half |
| stats-grid | stats | grid | wide, half, third |
| reading-list | reading | list | wide, half |
| music-list | music | list | wide, half |
| contact-card | contact | card | wide, half, third |
| custom-block | custom | block | wide, half, third |
| experience-timeline | experience | timeline | wide, half |
| education-cards | education | cards | wide, half |
| languages-list | languages | list | wide, half, third |
| activities-list | activities | list | wide, half |
| activities-compact | activities | compact | third |

## How to Register a New Theme (7 Steps)

### Step 1: Add CSS tokens in `src/app/globals.css`
Add a new `[data-theme="your-theme"]` block with all 19 `--page-*` properties for both light and dark modes.

### Step 2: Register in `src/lib/page-config/schema.ts`
Add the theme name to the `AVAILABLE_THEMES` array.

### Step 3: Create theme directory
```
src/themes/your-theme/
  ├── components/    (18 section components)
  ├── index.ts       (exports theme object)
  └── Layout.tsx     (theme layout wrapper)
```

### Step 4: Create section components
One component per section type. Each receives typed props and renders using `var(--page-*)` tokens. Follow existing patterns in `src/themes/editorial-360/components/`.

### Step 5: Create Layout.tsx
Theme-level layout wrapper. Applies padding, max-width, and overall page structure. This is a visual wrapper only — grid structure is handled by layout templates.

### Step 6: Create index.ts
Export a theme object conforming to the `Theme` type in `src/themes/types.ts`. Maps each ComponentType to its component.

### Step 7: Register in `src/themes/index.ts`
Import and add the theme to the themes registry object.

## Theme Directory Structure (Reference: editorial-360)

```
src/themes/editorial-360/
  ├── components/
  │   ├── Achievements.tsx
  │   ├── Activities.tsx
  │   ├── Bio.tsx
  │   ├── Contact.tsx
  │   ├── Custom.tsx
  │   ├── Education.tsx
  │   ├── Experience.tsx
  │   ├── Footer.tsx
  │   ├── Hero.tsx
  │   ├── Interests.tsx
  │   ├── Languages.tsx
  │   ├── Music.tsx
  │   ├── Projects.tsx
  │   ├── Reading.tsx
  │   ├── Skills.tsx
  │   ├── Social.tsx
  │   ├── Stats.tsx
  │   └── Timeline.tsx
  ├── index.ts
  └── Layout.tsx
```

## Rules

1. **Never hardcode colors** — always use `var(--page-*)` tokens
2. **Always define both light and dark** — use `@media (prefers-color-scheme: dark)` block
3. **Use `theme-reveal` class** for entry animations on sections
4. **Test with all 3 layout templates**: vertical, sidebar-left, bento-standard
5. **Test with different section counts** — pages may have 3 sections or 15
6. **Maintain font pairing harmony** — heading and body fonts should complement each other
7. **Respect spacing scale** — use `--space-*` tokens, never arbitrary pixel values
8. **Run theme token tests** after changes: `npx vitest run tests/evals/theme-tokens.test.ts`

## Key Files

| File | Purpose |
|------|---------|
| `src/app/globals.css` | CSS custom properties (all themes defined here) |
| `src/lib/page-config/schema.ts` | `AVAILABLE_THEMES` array |
| `src/themes/index.ts` | Theme registry (maps name → theme object) |
| `src/themes/types.ts` | Theme TypeScript types |
| `src/themes/editorial-360/` | Reference implementation (most complete theme) |
| `src/lib/layout/widgets.ts` | Widget registry (variants per section) |
| `src/components/page/PageRenderer.tsx` | Applies theme via `data-theme` attribute |
| `tests/evals/theme-tokens.test.ts` | Theme token validation tests |

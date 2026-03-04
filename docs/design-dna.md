# OpenSelf Design DNA

> This document is the single source of truth for all visual and interaction decisions in OpenSelf. Every theme, layout, and component must respect these principles. It is a living document — update it when the system evolves, never when it breaks rules.

---

## 1. Manifesto

OpenSelf pages are not résumés. They are **living editorial documents** — curated portraits of a person, designed to be felt before they are read.

Four beliefs underpin every decision:

**1. The person is the product.**
The page exists to serve one person's story. Every structural and visual choice must make *them* more memorable, not the platform more visible.

**2. Calm over clever.**
A page that breathes invites reading. Animation, texture, and space serve attention — they never compete for it. Complexity is invisible; simplicity is a choice.

**3. Structural personality, not decorative personality.**
The way a page breathes, moves, and organises information is the brand. Not a logo, not a color, not a font. The *rhythm* is the signature.

**4. Mobile-first experience, desktop canvas.**
Most viewers arrive on mobile. The mobile layout is the product. The desktop layout is the opportunity — more space, more atmosphere, more depth — but it can never degrade the mobile story.

---

## 2. The Six DNA Laws

These six elements are **mandatory** in every theme. They can be customised in value but never removed.

### L1 — The Accent Bar
Every section label carries a `3px × 16px` vertical bar in `--page-accent` before the text. This is the typographic heartbeat of OpenSelf — the visual pulse that makes sections scannable without numbering or icons.

```css
.section-label::before {
  content: '';
  display: block;
  width: 3px;
  height: 16px;
  background: var(--page-accent);
}
```

**Rule:** All themes must use `.section-label` for section headers. The bar may change color, never disappear.

---

### L2 — The Breath
Section spacing is *variable*, never uniform. This creates editorial rhythm and communicates content hierarchy through space alone.

| Tier | Sections | Spacing after |
|---|---|---|
| **Hero** | hero | 80px |
| **Narrative** | bio, experience, education, projects, achievements, custom | 48px |
| **Dense** | skills, stats, languages, interests, social, contact, activities | 32px |

**Rule:** All layout components must implement variable spacing. A uniform `gap` or `margin` is an anti-pattern.

---

### L3 — The Curve
All transitions, reveals, and microinteractions share one easing function. This is the temporal signature of OpenSelf — users feel it before they notice it.

```css
--os-dna-ease: cubic-bezier(0.16, 1, 0.32, 1);
```

**Rule:** Every CSS `transition` and `animation` uses `var(--os-dna-ease)`. System easings (`ease`, `ease-in-out`) are never used for intentional UI motion.

---

### L4 — The Birth
Every section enters the page. Nothing loads statically. The scroll reveal (`theme-reveal`) is the ritual of presence — a section doesn't exist until it's been seen.

```css
.theme-reveal {
  opacity: 0;
  transform: translateY(var(--os-dna-reveal-distance, 12px));
  transition: opacity 600ms var(--os-dna-ease), transform 600ms var(--os-dna-ease);
}
.theme-reveal.revealed {
  opacity: 1;
  transform: translateY(0);
}
@media (prefers-reduced-motion: reduce) {
  .theme-reveal { opacity: 1; transform: none; transition: none; }
}
```

**Rule:** `theme-reveal` is applied to every section container. `prefers-reduced-motion` always disables it cleanly. In builder preview mode, reveal is skipped entirely (`previewMode` prop).

---

### L5 — The Thread
Every interactive link uses a left-to-right underline grow. Not static underline. Not no underline. Always the thread.

```css
.hover-underline-grow::after {
  content: '';
  position: absolute;
  bottom: 0; left: 0;
  width: 100%; height: 1px;
  background: var(--page-accent);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 300ms var(--os-dna-ease);
}
.hover-underline-grow:hover::after { transform: scaleX(1); }
```

**Rule:** All navigation links, social links, project titles, and footer links use this pattern. Static underlines and no-underlines are banned on interactive text.

---

### L6 — The Signature
Every published OpenSelf page carries a single, lightweight brand credit in the footer: `openself.dev`. One link, text only, low opacity. It is the quietest version of attribution — present but never demanding.

**Rule:** `OpenSelfSignature` component is mounted in every theme's footer slot. It cannot be removed, but its visual weight can be adjusted via `--os-dna-signature-opacity` (default: `0.4`).

---

## 3. Layout System

OpenSelf has four layout templates. Each is a different spatial argument about how a person's story should be told.

### The Monolith
*"The column as conviction."*

A single editorial column. The most adaptable, the most readable, the truest to the editorial DNA. The default for all new pages.

**Desktop (≥1024px):** Three spatial zones within the single column:
- **Reading Lane** (~68ch): bio, experience, education, custom — content you read, not scan
- **Bleed Lane** (~88% width): projects, achievements, reading, music — content you show
- **Hero** (full width): always edge-to-edge

**Desktop ambient markers:** Section names appear vertically in the right margin (`writing-mode: vertical-rl`, `opacity: 0.04`). A structural watermark, not a navigation element.

**Mobile:** Single column, full width. Hero uses peek-a-boo pattern (min-height 85svh, content aligned to bottom) so the next section is visible on load — the invitation to scroll.

### The Curator
*"The split as curation."*

Editorial split-screen. Sidebar sticky on desktop. Narrative content on the left, metadata on the right. For people whose work and identity are distinct categories.

### The Architect
*"The grid as catalogue."*

Asymmetric bento grid. For people with many things to show — portfolios, project-heavy careers. Density by design.

### Cinematic
*"The page as journey."*

Full-viewport sections with snap scrolling. Immersive, cinematic, high-impact. For people who want each section to be a moment, not a paragraph.

---

## 4. The Presence System

OpenSelf pages are configured via three fully independent axes — **Surface**, **Voice**, and **Light** — collectively called **Presence**. Each axis controls exactly one dimension. They never interfere with each other.

```
        Surface
    (Canvas / Clay / Archive)
            ▲
           / \
          /   \
 Light ◄──┼────► Voice
(Day/Night)    (Signal / Narrative / Terminal)
```

**The golden rule of Presence:** Surface classes never set font variables. Voice classes never set color variables. This is enforced structurally — not by convention.

---

### Axis 1 — Surface (colors, texture, density)

Surface controls the physical quality of the page: background tone, grain, edge lines, accent hue, and reading lane width. It never touches typography.

#### Canvas
**Personality:** Swiss precision. The design disappears so the person stands alone.
**For:** Executives, tech leads, anyone who wants maximum signal with minimum noise.
**Palette (Day):** `#fafaf9` background · `#141412` foreground · `#141412` accent · zero grain · zero edge lines.
**Palette (Night):** `#0f0f0e` near-OLED black · `#e8e4de` text · `#e8e4de` accent.
**Reading lane:** 660px (tightest focus). Section labels at `0.6` opacity — discreet.

#### Clay
**Personality:** Human and tactile. Monocle meets craft. The professional who is also a whole person.
**For:** Designers, writers, architects, makers — anyone whose work involves taste and material craft.
**Palette (Day):** `#f5ede0` cream · `#2a1e12` foreground · `#b05a2f` terracotta accent · grain `0.025`.
**Palette (Night):** `#1a1009` warm dark brown · `#f5e8d5` text · `#d4845a` muted sienna accent.
**Reading lane:** 680px (slightly wider for warm body text weight). Section labels at `0.75` opacity.

#### Archive
**Personality:** Luxury digital magazine. Uncompromising typographic authority. The reading experience as a statement.
**For:** The flagship surface. Highest expression of the OpenSelf DNA at full intensity.
**Palette (Day):** `#ffffff` optical white · `#080808` foreground · `#1b2b6b` navy accent · grain `0.028`.
**Palette (Night):** `#07080f` deep blue-black · `#eef0f8` text · `#8b9fd4` soft indigo accent.
**Reading lane:** 700px (widest; typographic authority requires room). Section labels at `0.85` opacity.

---

### Axis 2 — Voice (typography only)

Voice controls the typographic register — heading and body typefaces only. It never touches colors, grain, or spacing.

| Voice | Heading | Body | Character | CSS class |
|---|---|---|---|---|
| **Signal** | Plus Jakarta Sans | Figtree | Digital, contemporary, clean | `.voice-signal` (default) |
| **Narrative** | Cormorant Garamond | Lato | Editorial, humanist, literary | `.voice-narrative` |
| **Terminal** | JetBrains Mono | JetBrains Mono | Raw, transparent, a maker's badge | `.voice-terminal` |

**Signal** is the default voice — no class is needed on `.os-page`.

**Typographic notes per voice:**

- **Terminal:** The hero name in monospace is a cultural statement. Reduce heading `font-size` slightly (scale factor: `0.85×`). Increase `letter-spacing` on section labels. The ambient markers in mono are dramatic.
- **Narrative:** Ambient markers are the most architecturally beautiful combination. `line-height` on bio text increases to `1.85`. Hero tagline gains `font-style: italic` option.

---

### Axis 3 — Light (per-surface dark modes)

Light is not a global dark mode toggle. Each Surface has its own Night palette — the way that material reacts to the absence of light. There is no single generic dark mode in OpenSelf.

| Surface | Day | Night |
|---|---|---|
| Canvas | `#fafaf9` near-white | `#0f0f0e` near-OLED black |
| Clay | `#f5ede0` warm cream | `#1a1009` dark espresso brown |
| Archive | `#ffffff` optical white | `#07080f` deep blue-black |

---

### Signature Combinations

| Surface | Light | Voice | Name | Audience |
|---|---|---|---|---|
| Canvas | Day | Signal | **Default Professional** | Most users. Maximum clarity. |
| Canvas | Night | Terminal | **The Developer** | Engineers, open-source contributors. |
| Clay | Day | Narrative | **Artisan Editorial** | Designers, writers, architects. |
| Clay | Night | Signal | **Warm Modern** | Startup designers, product managers. |
| Archive | Day | Narrative | **Luxury Magazine** | The full OpenSelf statement. |
| Archive | Night | Narrative | **Noir Editorial** | Photographers, filmmakers, artists. |

---

## 5. Presence in The Monolith Layout

How the Presence axes interact with the Monolith's spatial structure.

### Surface effects on layout

**Canvas** — Reading lane at 660px. Section labels `opacity: 0.6` — maximally discreet. Grain and edge lines disabled. The layout is the quietest.

**Clay** — Reading lane at 680px. Grain texture present (`0.025`). Edge lines subtle (`0.14`). Section labels `opacity: 0.75`. Ambient markers slightly shorter. A warmer, more tactile rhythm.

**Archive** — Reading lane at 700px. Full grain (`0.028`). Section labels `opacity: 0.85`. Maximum ambient markers. Every DNA law at full expression — the most editorially intense combination.

### Voice effects on layout

**Terminal voice** — Hero name in monospace is a cultural statement. Heading `font-size` scaled slightly down (`0.85×`). `letter-spacing` on section labels increases. Ambient markers in mono are dramatic and intentional.

**Narrative voice** — Ambient markers are the most architecturally beautiful configuration. Bio `line-height` increases to `1.85`. Hero tagline can use `font-style: italic`.

**Signal voice** — Default. No layout modifications. The layout baseline.

---

## 6. Navigation Patterns

### Published Profile Pages
**Default: No navigation bar.** Editorial pages don't have navs — they scroll. The hero is the introduction; sections are chapters. A nav bar implies a web app, not a document.

**Exception: Long pages (>8 sections).** An optional minimal sticky nav can appear after scrolling past the hero:
- Height: 48px
- Content: [avatar 28px] [name] · [section anchors]
- Behaviour: fade-in at 200px scroll, fade-out on upward scroll
- Requirement: only if the page has 5+ named sections

### Builder
The builder chrome is a product interface, not an editorial surface. It follows different rules:
- Fixed top bar (48px): [logo] [page status] [publish button] [settings]
- Left/bottom: chat panel
- Right/full: preview panel
- Clear separation between "conversation mode" and "page view mode"

### Mobile Builder
Bottom tab bar (56px) with three tabs:
1. **Chat** — the default, where the work happens
2. **Preview** — shows the current page state
3. **Publish** — publish flow

Voice input is a FAB (floating action button) inside the Chat tab, not a separate navigation item.

---

## 7. Profile Photo

**Optional, never required.** The initials fallback (styled with `--page-accent` and the heading font) must look as good as a photo.

**When present, treatment rules:**
- Shape: circle, always
- Size: 96px on desktop hero, 80px on mobile
- Position: in the reading lane, before the name (inline block), or right-aligned to the reading lane on desktop
- Border: none (never a border around the avatar — it's not a profile picture, it's a portrait)
- On `hero-centered`: large (120px), centered above name
- On `hero-split` (default): medium (80px), left-aligned, same row as name
- Low quality photo: always show initials instead. The platform must detect this (future: image quality check on upload)

**Anti-patterns:**
- No circular avatar with a border
- No cover photo / background image in the hero
- No avatar + full-name side by side at 1:1 ratio (the name is always the dominant element)

---

## 8. Builder UI Principles

The builder is a conversation. The page emerges from the dialogue. The UI must reflect this:

**The chat is primary.** The preview is secondary — it shows the result of the conversation, not the destination. Never force users to look at the preview; trust that the conversation is interesting enough.

**The split is not symmetric.** On desktop, chat gets 35-40% of the width. Preview gets the rest. The preview is a canvas; the chat is the brush.

**Typing is thinking.** Never interrupt the user mid-thought with alerts, loading states, or page updates. The preview updates after the agent responds, not while the user types.

**Mobile: full-screen chat by default.** The preview is one tap away. The chat interface is the experience.

### Voice Interface
Voice input is for people who think faster than they type — or who are on the move. The voice UX must:
- Use a single, prominent FAB (56px, `--page-accent` background)
- Show a waveform animation while listening (CSS-only, 5-bar ripple)
- Display live transcript below the waveform
- Never auto-submit — always show a confirm/cancel
- Fallback gracefully: if the API fails, the mic button shows an error state and falls back to keyboard silently

---

## 9. Anti-Patterns

Never do these. If you find one in the codebase, fix it.

**Layout:**
- ❌ Uniform `gap` or `margin` across all section types — use the variable rhythm system
- ❌ Sections wider than their lane allows — bleed only for defined section types
- ❌ Nested scrollable areas inside the page (creates scroll traps on mobile)
- ❌ CSS `position: fixed` elements on published profile pages (except the nav on long pages)

**Typography:**
- ❌ `font-weight: bold` anywhere — use `500` or `600` max, let the typeface do the work
- ❌ ALL CAPS for anything longer than a section label (4-5 words max)
- ❌ Text smaller than 12px (11px for mono labels is the absolute floor)
- ❌ More than two typefaces on a page (heading + body; mono is always the third, used sparingly)

**Motion:**
- ❌ Animations that repeat (no loading spinners on content, no looping decorations)
- ❌ `transition: all` — always specify properties
- ❌ `ease-in-out` on entrance animations — use `--os-dna-ease`
- ❌ Animations without `prefers-reduced-motion` fallback

**Brand:**
- ❌ Floating badges or watermarks on published pages (the footer credit is enough)
- ❌ OpenSelf logo on the profile page (the page belongs to the person, not to the platform)
- ❌ More than one `openself.dev` mention per page
- ❌ "Made with OpenSelf" language — `openself.dev` is the credit, clean and sufficient

**Presence (Surface / Voice / Light):**
- ❌ Using `#000000` and `#ffffff` as body colors — always use the semantic tokens
- ❌ Hard-coding colors in component files — always use `var(--page-*)` tokens
- ❌ Overriding DNA laws in surface variants (no removing section-label bars, no disabling reveal)
- ❌ A surface that looks identical in Day and Night
- ❌ A Surface class (`.surface-*`) that sets `--h-font` or `--b-font` — surfaces are color and grain only, never structure
- ❌ A Voice class (`.voice-*`) that sets any `--page-*` color or texture token — voices are font-only
- ❌ A single global dark mode palette — each surface has its own Night (Clay Night ≠ Archive Night ≠ Canvas Night)

---

## 10. Token Reference

All themes must define these tokens. Values are theme-specific; the keys are not.

```css
/* Surface tokens — set by .surface-* classes (and defaults on .os-page)
   NEVER set --h-font or --b-font here */
--page-bg               /* Page background */
--page-fg               /* Primary text */
--page-fg-secondary     /* Secondary/muted text */
--page-border           /* Dividers, borders */
--page-accent           /* Brand accent, section bar, links */
--page-accent-fg        /* Text on accent background */
--page-muted            /* Subtle backgrounds */
--page-grain            /* Grain overlay opacity (0 = Canvas, 0.025 = Clay, 0.028 = Archive) */
--page-edge             /* Edge line opacity (0 = Canvas, 0.14 = Clay, 0.18 = Archive) */

/* Voice tokens — set ONLY by .voice-* classes
   NEVER set --page-* color or texture tokens here */
--h-font                /* Display / heading typeface */
--b-font                /* Body / paragraph typeface */

/* Cards */
--page-card-bg          /* Card background */
--page-card-border      /* Card border */
--page-card-hover       /* Card hover background */

/* DNA */
--os-dna-ease               /* cubic-bezier(0.16, 1, 0.32, 1) */
--os-dna-reveal-distance    /* 12px */
--os-dna-signature-opacity  /* 0.4 */
```

### Token ownership

| Token domain | Controlled by | Never by |
|---|---|---|
| `--page-bg`, `--page-fg`, `--page-accent`, `--page-grain`, `--page-edge` | Surface (`.surface-*`) | Voice |
| `--h-font`, `--b-font` | Voice (`.voice-*`) | Surface |
| `--page-bg` Night overrides | Light (`.light-night` + surface specificity) | Voice |

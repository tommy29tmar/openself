# Design Doc — OpenSelf UX Overhaul

**Date**: 2026-03-14
**Status**: Approved
**Origin**: Real UAT on openself.dev + multi-model adversarial review (Gemini + Claude Technical Validator, 2 rounds)

## Problem

After a real UAT session navigating openself.dev as user `tommaso-rinversi`, 11 critical UX gaps were identified that prevent the product from being serious, useful, and intuitive for daily use. The product is in beta — all infrastructure must be built correctly now, before production launch locks in decisions.

## Design Principle: Mobile-First

**Mobile is the primary design target.** All UI components, interactions, and layouts must be designed for mobile first, then adapted to desktop. The majority of users will interact with OpenSelf on their phone. Every feature must feel fluid and polished on a 390px viewport before being considered for wider screens.

## Confirmed Decisions

| Area | Decision | Rationale |
|---|---|---|
| Editing model | Canvas-style click → chat (desktop) | Forces agent learning, preserves differentiator |
| Mobile editing | Long-press section → bottom sheet with actions | Mobile-native interaction pattern |
| Contacts | Enhanced hero links + icons + CTA | Leverages existing hero, no new section type needed |
| Notifications | Drop successful syncs entirely | Organized noise is still noise |
| Landing page | Full marketing page, in-repo, force-static | Shared tokens, atomic deploy, zero runtime |
| Auth | Full upgrade (reset, verification, magic link, rate limit) | Build infrastructure right in beta |
| SEO | Complete (OG, JSON-LD, sitemap, Twitter Cards) | Public profiles are the product |

## Challenge Summary

**Survived scrutiny**: Canvas click-to-chat, hero link enhancement, auth with Resend, SEO with JSON-LD, in-repo landing page.

**Changed after review**:
- Notifications: "smart grouping" → drop successful syncs entirely
- BUG-1 fix: "patch recomposeAfterMutation" → fix hash staleness in personalization-publish pipeline (one root cause for 5 symptoms)
- Section visibility: PageConfig array → agent tool + `page.hidden_sections` column
- Agent feedback: DOM-coupled highlight/scroll → toast-only (Phase 1), highlight deferred
- Canvas on mobile: identical to desktop → mobile-specific bottom sheet pattern

**Rejected**:
- Inline text editing (violates facts-in/config-out architecture)
- External landing page platform (operational overhead, loses design token sharing)
- Auth.js/Supabase migration (current auth works, lateral movement)

## Workstream Details

### WS-1: Composition Pipeline Fix (CRITICAL, prerequisite)

**Root cause (confirmed by code trace)**: `recomposeAfterMutation()` calls `projectCanonicalConfig()` which rebuilds sections deterministically from facts, then `upsertDraft()` persists that content. The preview routes call `mergeActiveSectionCopy()` *after* canonical config — so personalized copy appears in browser. But the draft DB row never contains personalized copy. At publish time, if `factsHash + soulHash` changed since last personalization run, the hash guard fails and published content silently reverts to deterministic facts-only text.

**Fix**:
- Ensure hash recalculation after fact mutations
- Verify `mergeActiveSectionCopy()` is called in publish pipeline with current hashes
- Fix Strava/Activity L10N (structured data preservation in composition)
- Fix `formatFactDate()` for published pages
- Fix BUG-2: investigate whether Python duplicate is pre-clustering legacy data (run `consolidate_facts` or check structural differences)
- Integration test: modify fact → verify personalized copy survives in published page

### WS-2: SplitView Decomposition (prerequisite for WS-3)

**Current state**: 782 lines, single-file monolith handling layout, SSE sync, state management, panel orchestration.

**Extraction plan**:
- `usePreviewSync` hook — SSE/polling logic (~100 lines)
- `useToastManager` hook — toast queue, auto-dismiss, position
- `SectionActionMenu` component — hover/long-press menu, action dispatch
- `usePreviewInteraction` hook — section click/long-press → chat injection
- `UnpublishedBanner` component — diff computation, change list, discard

**Target**: SplitView under 400 lines, pure layout orchestration.

### WS-3: Canvas-Style Preview Interaction

#### Desktop (1024px+)
- `PageRenderer` gets optional `onSectionClick` callback (null on public pages)
- Hover: subtle border highlight + action icon bar (edit, hide, move up/down)
- Click "Modifica": inject context into ChatPanel (sectionType, content summary, sectionId)
- Click "Nascondi": call `toggle_section_visibility` agent tool
- Click "Sposta su/giù": call `reorder_sections` agent tool
- Onboarding tooltip on first visit: "Clicca su una sezione per modificarla"

#### Mobile (< 1024px) — PRIMARY DESIGN TARGET
- **Long-press on section** (300ms) in Preview tab → vibration feedback (navigator.vibrate) → **bottom sheet** slides up with:
  - Section name as header ("Bio", "Esperienza", "Musica")
  - "Modifica con chat" — switches to Chat tab with context pre-injected, input focused
  - "Nascondi sezione" — toggle visibility (with undo toast)
  - "Sposta su / Sposta giù" — reorder
  - Cancel / swipe-down to dismiss
- **Visual feedback**: on long-press, section gets a subtle scale(0.98) + border pulse
- **Tab switch**: when "Modifica con chat" is tapped, auto-switch to Chat tab. Context message preserved in state across tab switch. Chat input auto-focused with pre-filled context.
- **Discoverability**: first-time hint at bottom of Preview tab: "Tieni premuto su una sezione per modificarla" (dismissible, persisted in localStorage)

### WS-4: Section Visibility System

- New `hidden_sections` JSON column on `page` table (migration)
- New agent tool `toggle_section_visibility(sectionType, visible)` — goes through trust ledger
- `projectCanonicalConfig()` filters out hidden sections for public page / preview
- **Builder preview (mobile + desktop)**: hidden sections render as collapsed ghost cards:
  - Mobile: compact 44px row with section name + "Nascosta" badge + "Mostra" button (44px touch target)
  - Desktop: same but wider, with more whitespace
- Agent proactively suggests hiding irrelevant content (journey policy update)

### WS-5: Notifications Overhaul

- **Remove successful sync items from feed entirely** in `getActivityFeed()`
- Feed shows only: sync errors, conformity proposals, soul proposals, episodic patterns
- Badge counts: errors + pending proposals only
- Add "Ultimo sync: 2h fa" timestamp per connector in SourcesPanel
- **Mobile**: ActivityDrawer remains fullscreen (z200), touch targets stay 44px
- **Empty state**: when no notifications, show "Tutto a posto" message (not an empty drawer)

### WS-6: Enhanced Hero Links + Contact CTA

- New `social_link` fact category: `{platform, url, label?}`
- Platforms: linkedin, email, twitter, website, calendly, mastodon, bluesky, threads
- Icon mapping: `lucide-react` icons per platform (already in deps)
- **Mobile hero**: icons in a horizontal scrollable row, 44px touch targets
- **Desktop hero**: icons inline with current GitHub/Spotify links
- Optional CTA button: "Contattami" → configurable destination
- Agent onboarding prompt: ask for contact links if missing (update `first-visit.ts`)
- Distinguish between connector links (GitHub OAuth, Spotify OAuth) and social links (display-only)

### WS-7: Agent Action Toast Feedback

- `useToastManager` hook (from WS-2 extraction)
- Tool `onStepFinish` callback maps tool names → L10N toast messages
- **Mobile**: toast appears above bottom tab bar (bottom: 56+16px), full width with padding
- **Desktop**: toast bottom-right of preview pane
- Auto-dismiss 3s, max 2 stacked (mobile), 3 stacked (desktop)
- Swipe to dismiss on mobile
- Toast types: success (green accent), info (blue), error (red)
- L10N keys added to `ui-strings.ts` per tool action

### WS-8: Unpublished Changes Banner

- Compute diff: compare draft vs published `projectCanonicalConfig()` outputs
- **Mobile**: amber banner at top of Preview tab, compact. Tap to expand change list as bottom sheet.
  - Change list: section name + change type ("Bio modificata", "Titolo aggiornato")
  - "Pubblica" primary button + "Scarta" secondary (with confirmation dialog)
- **Desktop**: same amber banner, click expands inline dropdown
- "Scarta modifiche": revert draft to match published (confirmation modal on both platforms)

### WS-9: Presence Panel Terminology

- "Surface" → "Sfondo" / "Background"
- "Voice" → "Tipografia" / "Typography"
- "Light" unchanged (Day/Night clear)
- "Signature Combinations" → "Stili predefiniti" / "Preset styles"
- Update all 8 languages in `ui-strings.ts`
- Add small visual swatches/previews next to each option (colored dot for sfondo, font sample "Aa" for tipografia)

### WS-10: Full Marketing Landing Page

- `export const dynamic = "force-static"` — zero runtime
- **Mobile-first responsive design**
- Structure:
  1. Hero — "Talk for 5 minutes. Get a living personal page." (existing, refined)
  2. "Come funziona" — 3 steps with illustrations: Start conversation → Connect sources → Publish
  3. Feature highlights — 4 cards: AI Conversation, Smart Connectors, Presence Design, Real-time Preview
  4. Live example — screenshot/embed of a real profile
  5. Testimonials — placeholder structure (card grid, ready for content)
  6. FAQ — 5-6 accordion items
  7. Footer — legal (privacy, terms), social links, "Built with AI" badge
- Mobile: single column, stacked sections, 16px padding
- Desktop: max-width 1200px, grid layouts for features/testimonials
- Shared design tokens from `globals.css`

### WS-11: Auth Upgrade

- **EmailAdapter interface**: `sendEmail(to, subject, html)` → `ResendAdapter` (default) + `SMTPAdapter` (self-hosters via `EMAIL_SMTP_*` env vars)
- **Password reset**: `/forgot-password` page → API generates token (32-byte random, SHA-256 hashed in DB, 1h TTL) → email with link → `/reset-password?token=xxx` → new password
- **Email verification**: on signup, send verification email. Banner in builder: "Verifica la tua email per pubblicare". Unverified users can chat + preview, cannot publish.
- **Magic link**: `/api/auth/magic-link` → generate token → email link → click → create session → redirect to builder
- **Rate limiting**: `auth_rate_limits` table in SQLite. Per-IP: 5 attempts/15min on login, 3/hour on password reset, 3/hour on magic link. 429 response with `Retry-After` header.
- Mobile: all auth pages responsive, large input fields (min-height 48px), clear error messages

### WS-12: SEO & Social Sharing

- `generateMetadata()` in `/[username]/page.tsx`: dynamic title + description from bio facts
- **Open Graph**: og:title (name), og:description (bio first 160 chars), og:image (generated)
- **OG Image**: satori with bundled `.woff` fonts (Plus Jakarta Sans, Cormorant Garamond, JetBrains Mono). Template: name + title + avatar on brand background. Generated at publish time, cached as `/public/og/<username>.png`. Invalidated on re-publish.
- **Twitter Cards**: summary_large_image
- **JSON-LD Person schema**: name, jobTitle, url, sameAs (social links array), worksFor, alumniOf
- **Sitemap**: `/sitemap.xml` — dynamic Next.js route, lists all published profiles with lastmod
- **robots.txt**: static, allow all, reference sitemap

## Execution Order

```
Critical path:
  WS-1 (composition fix) ─→ WS-2 (SplitView decompose) ─→ WS-3 (canvas) + WS-4 (visibility) + WS-7 (toast) + WS-8 (banner)

Independent (can start day 1):
  WS-5 (notifications)
  WS-6 (hero links)
  WS-9 (presence terminology)
  WS-10 (landing page)
  WS-11 (auth)
  WS-12 (SEO) — depends on WS-10 for sitemap index page, otherwise independent
```

## Open Risks

| Risk | Mitigation |
|---|---|
| SplitView decomposition may break existing behavior | Comprehensive test coverage before extraction, feature flags |
| OG image fonts in Docker | Bundle as static assets in `public/fonts/`, load at publish-time |
| Resend vendor lock-in | EmailAdapter abstraction with SMTP fallback |
| Long-press discoverability on mobile | First-time hint, onboarding tooltip |
| Canvas click leaking into public PageRenderer | `onSectionClick` callback is null/undefined on public pages — no builder code imported |

# UAT Round 4 — 21 Fixes Design

**Date**: 2026-02-28
**Status**: Approved
**Scenario**: Fresh DB, Elena Rossi (graphic designer freelance, Roma), 8 messages, publish + post-publish editing

## Findings Summary

- **5 Critical** (C1–C5): Data corruption, agent failures
- **6 High** (H1–H6): UX breakage, missing L10N
- **6 Medium** (M1–M6): Builder L10N, component polish
- **4 Low** (L1–L4): Console errors, minor gaps

---

## Area 1: Agent Brain — Recomposition & Capability

### C2 — Auto-recompose after fact mutations

**Root cause**: `create_fact`, `update_fact`, `delete_fact` modify the DB but leave the draft stale. The agent must explicitly call `generate_page` to see changes in the preview.

**Fix**: After every fact mutation in `tools.ts`, call `composeOptimisticPage()` + `upsertDraft()` to keep the draft in sync.

**Guards** (per user feedback):
- **Anti-loop**: The recompose is a pure read-facts-then-write-draft operation. It never triggers tool mutations. Add a `_recomposing` flag as defense-in-depth — if set, skip recompose.
- **Idempotency**: `composeOptimisticPage()` is already deterministic (same facts → same output). Wrap with a hash check: skip `upsertDraft` if the composed config hash matches the current draft hash.
- **Perf**: Recompose is fast (no LLM, no network). The preview SSE already polls `projectCanonicalConfig()` which does the same work. This just persists it.

### C4 — Section removal after fact deletion

**Root cause**: `delete_fact` removes facts but the draft retains stale sections. No tool exists to remove sections directly.

**Fix**: Resolved by C2. After deleting music facts, auto-recompose rebuilds the draft without the music section (filtered by `filterCompleteSections()`). No new tool needed.

### C5 — Layout "bento" fails

**Root cause**: Agent says `set_layout("bento")` but the valid enum value is `"bento-standard"`. Zod validation rejects it.

**Fix** (3 layers):
1. **Tool alias** in `tools.ts`: Map `"bento"` → `"bento-standard"`, `"sidebar"` → `"sidebar-left"` before Zod validation.
2. **Prompt** in `DATA_MODEL_REFERENCE`: Add `Valid layouts: vertical, sidebar-left (or "sidebar"), bento-standard (or "bento")`.
3. **Server-side validation** (per user feedback): Add same alias mapping in the settings API route (`/api/preferences`) and any other endpoint that accepts layout values.

### H5 — "Sign up to publish" after login

**Root cause**: After signup modal → redirect to `/elenarossi` → click "Edit your page" → builder shows "Sign up to publish" instead of "Publish". The auth state is not recognized.

**Fix** (per user feedback — verify full flow):
1. Trace the cookie/session lifecycle: SignupModal POSTs to `/api/register` → sets session cookie → redirects to `/{username}`.
2. When user navigates back to `/builder`, verify `getAuthContext()` reads the session cookie correctly.
3. In `BuilderNavBar`, verify the auth state prop is sourced from the server-side auth check, not stale client state.
4. If the issue is client-side hydration, force a `router.refresh()` after signup redirect.

---

## Area 2: Bio & Data Model — Freelance and Clients

### C1 — Bio template broken for freelance

**Root cause**: `bioRoleAtFirstPerson` template produces "Sono graphic designer presso Freelance" — treating "Freelance" as a company name.

**Fix**:
1. Add L10N keys to `L10nStrings` in `page-composer.ts`:
   - `bioRoleFreelanceFirstPerson`: `(role) => "Sono ${role} freelance."` (it) / `"I am a freelance ${role}."` (en) / all 8 langs
2. In `buildBioSection()`, detect freelance: if `company` matches a set `["Freelance", "Self-employed", "Independent", "Freelancer", "Indépendant", "Selbstständig", "Autónomo", "Libero professionista"]` → use the freelance template.
3. If `company` is absent entirely → use `bioRoleFirstPerson` (already exists).

### C3 — Client vs employer in experience data model

**Root cause**: No distinction between employer and client in the experience value object. Barilla/Eataly/MAXXI are clients, not employers, but stored identically.

**Fix**:
1. Add optional `type` field to experience value: `type?: "employment" | "freelance" | "client"`.
2. **Retrocompatibility** (per user feedback): `undefined` → treated as `"employment"` (default). No migration needed for existing data — the composer handles `undefined` gracefully.
3. **Agent prompt**: Update `FACT_SCHEMA_REFERENCE` to document the `type` field with examples.
4. **Composer logic**: In `buildExperienceSection()`, filter by `type`:
   - `employment` / `undefined` → Experience section (as today)
   - `client` → Projects section (show as "Branding per Barilla" style)
   - `freelance` → Experience section with "Freelance" as status marker, not company
5. **Migration script** (optional): `scripts/migrate-experience-types.ts` for Hetzner prod DB if needed post-deploy.

---

## Area 3: L10N Centralization

### New file: `src/lib/i18n/ui-strings.ts`

Central `UiStrings` type + `UI_L10N: Record<LanguageCode, UiStrings>` with `getUiL10n(lang)` accessor.

**Fallback** (per user feedback): `getUiL10n(lang)` returns `UI_L10N[lang] ?? UI_L10N.en`. English is always the fallback.

**Keys** (~55 strings across these groups):

```
// Builder chrome
chat, typeMessage, send, pageWillAppear, startChatting, openSettings,
closeSettings, settings, language, theme, color, light, dark, font, layout

// Publish bar
signUpToPublish, publish, publishAs, publishing, livePage

// Owner/Visitor banner
editYourPage, share, logOut, loggingOut, logIn

// Signup modal
createYourAccount, signUpToPublishPage, username, email, password,
atLeast8Chars, signUpAndPublish, alreadyHaveAccount, usernameRequired,
emailRequired, passwordTooShort, registrationFailed, networkError

// Section headers (also added to L10nStrings in page-composer.ts)
aboutLabel, // "Chi Sono" (it), "About" (en), etc.

// Content labels
interestsInto, // "Appassionata di" (it), "Into" (en)
volunteeringLabel, mentoringLabel, hobbyLabel, // activity types

// Proposals
improvementsReady, review, pageImprovements, current, proposed,
accept, reject, acceptAll
```

### Affected components (M1, M2, M3):

| Component | File | Hardcoded strings |
|-----------|------|-------------------|
| ChatInput | `src/components/chat/ChatInput.tsx` | "Type a message...", "Send" |
| SplitView | `src/components/layout/SplitView.tsx` | "Your page will appear here", etc. |
| BuilderNavBar | `src/components/layout/BuilderNavBar.tsx` | ~12 strings |
| SettingsPanel | `src/components/settings/SettingsPanel.tsx` | ~10 strings |
| SignupModal | `src/components/auth/SignupModal.tsx` | ~12 strings |
| OwnerBanner | `src/components/page/OwnerBanner.tsx` | 4 strings |
| VisitorBanner | `src/components/page/VisitorBanner.tsx` | 2 strings |
| ProposalBanner | `src/components/builder/ProposalBanner.tsx` | ~8 strings |

Each component receives `language` prop (already threaded through via SplitView/ChatPanel) and calls `getUiL10n(language)`.

### H3 — "ABOUT" section header in English

Add `aboutLabel` to `L10nStrings` in `page-composer.ts` (all 8 langs). In `buildBioSection()`, set `title: l.aboutLabel`. In `Bio.tsx`, use `title` from content instead of hardcoded "About".

### H4 — "Into" label in English

Add `interestsInto` to `L10nStrings` (all 8 langs). In `buildAtAGlanceSection()`, include as a field in the section content. In `AtAGlance.tsx`, read from content instead of hardcoded "Into".

### M5 — "volunteering" raw type visible

Map activity types in `ui-strings.ts`: `{ volunteering: "volontariato", mentoring: "mentoring", ... }`. In `Activities.tsx`, look up the localized label.

### M6 — Mixed case "graphic Designer"

`lowerRole()` lowercases only the first letter: "Graphic Designer" → "graphic Designer". Fix: lowercase the entire string, then capitalize only words that should stay capitalized (or just lowercase the entire role for non-German languages). Simplest fix: `role.toLowerCase()` for non-German, then let the template capitalize as needed.

### Testing (per user feedback)

Add snapshot tests for 3 key languages (en, it, de):
- `tests/evals/i18n/ui-strings.test.ts`: Verify all keys present, no empty strings, fallback works.
- `tests/evals/i18n/section-headers.test.ts`: Verify bio/at-a-glance section headers are localized.

---

## Area 4: Proficiency & Date Formatting

### H2 — Proficiency in English on hero

**Root cause** (per user feedback — single source of truth): The hero `languages[]` array is populated directly from language facts in `buildHeroSection()` with RAW proficiency values. Meanwhile, `buildLanguagesSection()` correctly localizes via `PROF_KEYS`. Two separate code paths = inconsistency.

**Fix**: Establish `buildLanguagesSection()` as the single source of truth. In `buildHeroSection()`, localize proficiency using the same `PROF_KEYS` lookup before inserting into the hero's `languages[]` array. DRY: extract `localizeProficiency(rawProf, language)` helper, use in both places.

### H6 — Raw ISO date in achievements

**Fix**: Add `formatFactDate(isoDate: string, language: string): string` utility:
- If date matches `YYYY-01-01` → show year only ("2023")
- If date matches `YYYY-MM-DD` → show month + year localized ("marzo 2023")
- If date matches `YYYY-MM` → show month + year localized
- Apply in `Achievements.tsx` and any other component showing raw dates.

---

## Area 5: Scroll-Reveal on Published Page

### H1 — Sections invisible until scroll

**Root cause**: `.theme-reveal` starts at `opacity: 0`. IntersectionObserver adds `.revealed` on scroll. But sections already in the viewport on page load stay invisible until user scrolls.

**Fix** (per user feedback — reveal initial + CSS fallback):
1. **Initial reveal**: In `EditorialLayout`'s `IntersectionObserver` setup, after creating the observer, immediately check all observed elements with `entry.isIntersecting` and reveal those already visible. Use `requestAnimationFrame` to ensure layout is settled.
2. **CSS fallback**: Add a safety net rule:
   ```css
   /* Fallback: if JS hasn't run after 1s, reveal everything */
   @keyframes reveal-fallback {
     to { opacity: 1; transform: none; }
   }
   .theme-reveal:not(.revealed) {
     animation: reveal-fallback 0.6s ease 1.5s forwards;
   }
   ```
   This ensures sections always become visible even if the IntersectionObserver fails.

---

## Area 6: Music & Component Polish

### M4 — Artist name duplicated in music section

**Root cause**: Agent stores music fact with `title: "Norah Jones"` and `artist: "Norah Jones"`. The component shows both.

**Fix** (2 layers):
1. **Composer**: In `buildMusicSection()`, if `title === artist`, set `artist = undefined`.
2. **Agent prompt**: In `FACT_SCHEMA_REFERENCE`, clarify: `title` = artist/band name, `artist` is omitted unless different from title (e.g., for songs: title = "Kind of Blue", artist = "Miles Davis").

---

## Area 7: Low Priority Fixes

### L1 — `/api/proposals` 500 on first load

**Root cause investigation**: The endpoint likely fails when there's no owner scope or no proposals table data for a fresh session.

**Fix**: Add guard in proposals GET handler: if no owner scope or no proposals, return `{ proposals: [] }` with 200.

### L2 — `prompts.ts` module not found (HMR)

**Approach** (per user feedback — root-cause first): Reproduce minimally by starting dev server fresh, navigating to builder, and checking console. Likely a circular import or a server-only module imported in a client component. Fix the import chain.

### L3 — Website not shown in any section

**Root cause**: `elenarossi.design` was added as a contact fact but the contact section may not be composed, or the fact category is wrong. Check if the website is in `contact` category and if `buildContactSection()` is called.

**Fix**: Ensure websites are included in the hero `socialLinks` or in a contact section. If website category exists, ensure the composer builds it.

### L4 — Homepage loads stale preview API

**Approach** (per user feedback — root-cause first): Check if the homepage component (`src/app/page.tsx`) or root layout has a `useEffect` that polls `/api/preview`. The homepage should NOT call preview API. Find and remove the stale call.

---

## Traceability Matrix

| Finding | Severity | Area | Fix Location | Test | Sprint |
|---------|----------|------|-------------|------|--------|
| C1 | Critical | Bio template | `page-composer.ts` | `page-composer.test.ts` — freelance bio | 1 |
| C2 | Critical | Agent brain | `tools.ts` | `agent-tools.test.ts` — auto-recompose | 1 |
| C3 | Critical | Data model | `tools.ts`, `page-composer.ts`, `prompts.ts` | `page-composer.test.ts` — client exp | 1 |
| C4 | Critical | Section removal | (resolved by C2) | `agent-tools.test.ts` — delete + recompose | 1 |
| C5 | Critical | Layout alias | `tools.ts`, `prompts.ts`, API routes | `agent-tools.test.ts` — bento alias | 1 |
| H1 | High | Scroll-reveal | `EditorialLayout.tsx`, `globals.css` | Manual + screenshot test | 2 |
| H2 | High | Proficiency L10N | `page-composer.ts` (hero builder) | `page-composer.test.ts` — hero langs | 2 |
| H3 | High | Section header | `page-composer.ts`, `Bio.tsx` | `i18n/section-headers.test.ts` | 2 |
| H4 | High | "Into" label | `page-composer.ts`, `AtAGlance.tsx` | `i18n/section-headers.test.ts` | 2 |
| H5 | High | Auth flow | `BuilderNavBar.tsx`, auth flow | Manual E2E test | 2 |
| H6 | High | Date format | New `formatFactDate()`, `Achievements.tsx` | `format-date.test.ts` | 2 |
| M1 | Medium | Builder L10N | `ui-strings.ts` + 5 components | `i18n/ui-strings.test.ts` snapshot | 3 |
| M2 | Medium | Signup L10N | `ui-strings.ts`, `SignupModal.tsx` | `i18n/ui-strings.test.ts` snapshot | 3 |
| M3 | Medium | Banner L10N | `ui-strings.ts`, banners | `i18n/ui-strings.test.ts` snapshot | 3 |
| M4 | Medium | Music dedup | `page-composer.ts`, `Music.tsx` | `page-composer.test.ts` — music dedup | 3 |
| M5 | Medium | Activity type | `ui-strings.ts`, `Activities.tsx` | `i18n/ui-strings.test.ts` | 3 |
| M6 | Medium | Role casing | `page-composer.ts` lowerRole | `page-composer.test.ts` — lowerRole | 3 |
| L1 | Low | Proposals API | `src/app/api/proposals/route.ts` | `proposals-api.test.ts` | 3 |
| L2 | Low | HMR error | `prompts.ts` imports | Root-cause + fix | 3 |
| L3 | Low | Website fact | `page-composer.ts` contact/hero | `page-composer.test.ts` — website | 3 |
| L4 | Low | Stale preview | `src/app/page.tsx` or layout | Root-cause + fix | 3 |

## Sprint Plan

- **Sprint 1** (Critical): C1, C2, C3, C4, C5 — Agent brain + data model. ~15 files.
- **Sprint 2** (High): H1–H6 — Scroll-reveal, L10N keys, auth flow, date format. ~10 files.
- **Sprint 3** (Medium+Low): M1–M6, L1–L4 — Builder L10N centralization, component polish, bugfixes. ~15 files.

# UAT Report — 2026-02-28

**Tester**: Claude (automated browser UAT)
**Persona**: Marco Bellini, architetto software freelance, Milano
**Language**: Italiano
**Flow**: Homepage → Invite code → Builder → 8 messages → Publish + Register → Return to builder → Stress test

## Screenshots
- `uat-01-homepage.png` — Homepage
- `uat-02-language-selection.png` — Language selection
- `uat-03-builder-initial.png` — Builder initial state
- `uat-04-first-response-preview.png` — First AI response + preview
- `uat-05-second-response.png` — Second response (projects + experience)
- `uat-06-third-response-skills.png` — Third response (skills, languages, books)
- `uat-07-preview-scrolled.png` — Preview scrolled (experience, reading, education)
- `uat-08-preview-bottom.png` — Preview bottom sections
- `uat-09-fourth-response-contacts.png` — Fourth response (contacts, hobbies, education dates)
- `uat-10-sidebar-warm-role-bug.png` — Sidebar layout, Warm theme, role bug persists
- `uat-11-sidebar-hero-top.png` — Sidebar hero still showing "Tech Lead"
- `uat-12-signup-modal.png` — Signup modal
- `uat-13-published-page.png` — Published page (full page)
- `uat-14-stress-test-role-fixed.png` — Role finally corrected, "freelance freelance" bug
- `uat-15-token-limit-error.png` — Token limit error (JSON raw)
- `uat-16-stress-test-complete.png` — Final state with music, stats, achievements

---

## Findings Summary

| # | Severity | Category | Finding |
|---|----------|----------|---------|
| F1 | CRITICAL | API | `/api/chat/bootstrap` returns 429 on every page load (6 total across 2 navigations) |
| F19 | CRITICAL | Composition | Agent says role updated but bio/hero don't reflect change until 3rd attempt |
| F24 | CRITICAL | Composition | Bio says "freelance freelance" — template adds "freelance" when role already contains it |
| F28 | CRITICAL | Limits | Daily token limit (150k default) exhausted after 7 messages. Too low for real use |
| F31 | CRITICAL | Agent | Agent overwrites Accenture experience fact when updating current role. Data loss |
| F3 | HIGH | Composition | First message: bio uses "Design Minimalista" (interest) as role instead of "Architetto Software" |
| F7 | HIGH | Agent | Hero tagline shows past role "Tech Lead" instead of current "Architetto Software Freelance" |
| F8 | HIGH | Agent | Bio doesn't mention freelancing (current activity), prioritizes past corporate role |
| F16 | HIGH | Composition | Bio "Mi occupo di..." uses occupation template for interests (hobbies not occupations) |
| F26 | HIGH | UI State | "Sign up to publish" button appears after auth + publish + returning to builder |
| F29 | MEDIUM | UX | Token limit error shown as raw JSON to user instead of friendly message |
| F5 | MEDIUM | L10N | "Appassionato/a di" uses gender-neutral despite male name (Marco). Persists throughout |
| F6 | MEDIUM | L10N | Activity frequency "frequent" shown in English, not translated to Italian |
| F9 | MEDIUM | L10N | Skills category "Languages" label not translated to Italian |
| F13 | MEDIUM | Composition | Experience section shows only role+company, no period or past/current indication |
| F17 | MEDIUM | L10N | Hero social links: "website" in lowercase English, should be localized |
| F25 | MEDIUM | Agent | Bento layout change fails silently. Agent reports "incompatibility" without details |
| F10 | LOW | UI | Hero language list starts with orphan "·" separator before first item |
| F11 | LOW | Agent | "The Staff Engineer's Path" — author not extracted (empty in reading section) |
| F12 | LOW | Agent | Both books get ★★★★★ by default — agent assumes max rating without asking |
| F14 | LOW | Composition | Education section doesn't appear until dates are provided (no graceful degradation) |
| F22 | LOW | L10N | Hero social links all UPPERCASE: "GITHUB LINKEDIN WEBSITE" — "WEBSITE" not localized |
| F27 | LOW | Composition | Experience: "Architetto Software Freelance / Attuale / Freelance" — redundant "freelance" |

---

## Critical Findings Detail

### F1: Bootstrap 429 (CRITICAL)
**Reproduction**: Navigate to /builder at any time
**Expected**: Bootstrap loads journey state
**Actual**: 3 consecutive 429 errors on every navigation
**Impact**: Journey intelligence not loaded; agent operates without context
**Root cause**: Rate limiting on bootstrap endpoint too aggressive, or session creates multiple rapid requests

### F19 + F31: Role Update Fails / Data Loss (CRITICAL)
**Reproduction**: Tell agent "I'm a freelance architect" then "I used to work at Accenture"
**Expected**: Two separate facts: identity/role = "Architetto Software Freelance", experience/accenture = past role
**Actual**: Agent overwrites experience/accenture with current freelance data. Accenture history lost.
After user correction, agent claims to update but bio/hero don't change (composition re-runs from unchanged facts).
On 3rd attempt, identity/role fact is updated and composition picks it up.
**DB evidence**: `facts WHERE key='accenture'` has `{"role":"Architetto Software Freelance","company":"Freelance","status":"current"}`

### F24: "Freelance Freelance" (CRITICAL)
**Reproduction**: Set identity/role to "Architetto Software Freelance", have experience with company="Freelance"
**Root cause**: `page-composer.ts` line ~561: `isFreelance` = true when company matches FREELANCE_MARKERS.
Template `bioRoleFreelanceFirstPerson` for Italian: `Sono ${role} freelance.`
When `role = "architetto software freelance"`, output = "Sono architetto software freelance freelance."
**Fix**: Strip "freelance/freelancer" from role before passing to template, or check if role already contains marker.

### F28: Token Limit Too Low (CRITICAL)
**Reproduction**: Send 7 messages in Italian with rich content
**Root cause**: `llm_limits.daily_token_limit` defaults to 150,000 in schema.
7 messages consumed 154k tokens (gpt-4o-mini). A real session would need 10-20 messages.
**Fix**: Raise default to 500k+ or align with env var `LLM_DAILY_TOKEN_LIMIT`.

---

## High Findings Detail

### F3 + F16: Interest-as-Role Confusion (HIGH)
The deterministic bio composer uses the first available "role" fact for the bio template.
When only interests are present (first message), the template "Mi occupo di X" treats interests as occupation.
After experience is added, the bio should say "Sono architetto software freelance" + separate interests line.
Instead it says "Sono [role]. Mi occupo di [interests as if they were work]."

### F26: "Sign up to publish" After Auth (HIGH)
After registering and publishing, returning to the builder shows "Sign up to publish" in the header bar.
The "Live page" link is also present (correct), but the publish button should show "Publish" or "Update" for authenticated users.
**Root cause**: Likely `PublishBar` mode detection doesn't check auth state on builder re-entry.

---

## Environment
- Node: v24.13.1
- AI Provider: OpenAI (gpt-4o-mini)
- DB: SQLite (fresh, all 18 migrations applied)
- Feature flags: EXTENDED_SECTIONS=true, INVITE_CODES=code1

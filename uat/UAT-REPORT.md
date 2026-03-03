# UAT Report — OpenSelf (Round 5)
**Date:** 2026-03-03
**Tester:** Claude (automated UAT)
**Persona:** Marco Bellini, Senior UX Designer freelance, Milano
**Environment:** localhost:3000, dev, SQLite
**Branch:** main
**Commit:** d52f630

## Summary
| Metric | Count |
|--------|-------|
| Total checks | 42 |
| Passed | 32 |
| Failed | 10 |
| Warnings | 5 |

## Layout/Theme Matrix (Settings Panel)
| Layout | Theme | Result | Screenshot | Notes |
|--------|-------|--------|------------|-------|
| monolith | minimal | ✅ | uat/07-final-style.png | Default combo, works well |
| monolith | warm | ✅ | uat/07-theme-warm.png | Warm applied correctly |
| curator | warm | ✅ | uat/07-layout-curator.png | Sidebar layout works |
| curator | editorial-360 | ✅ | uat/07-theme-editorial.png | Theme switch persists |
| cinematic | editorial-360 | ✅ | uat/07-layout-cinematic.png | Full-width hero renders |
| **architect** | **any** | **❌** | uat/07-layout-architect-broken.png | **400 Bad Request on /api/draft/style** |

**Settings panel**: All layouts except The Architect work. All 3 themes work. Combos persist correctly to DB.

## Agent Behavior Analysis

### Conversation Quality
| Scenario | Agent Response | Rating |
|----------|---------------|--------|
| Cooperative user (intro) | Asks good follow-up questions, creates facts correctly | ⭐⭐⭐⭐ |
| Cooperative user (drip-feed) | Registers each detail, auto-generates page | ⭐⭐⭐⭐ |
| Off-topic ("film bellissimo") | Tried to incorporate into profile — ok but slightly off | ⭐⭐⭐ |
| Contradiction ("sono un cuoco") | Asked for confirmation, didn't blindly overwrite — excellent | ⭐⭐⭐⭐⭐ |
| Reversal ("no scherzo, designer") | Understood the joke, kept identity intact | ⭐⭐⭐⭐⭐ |
| Impatience ("pubblica subito") | Complied (user was registered) — appropriate | ⭐⭐⭐⭐ |
| Single-word ("No", "Forse", "Ok") | Patient, offers alternatives, keeps conversation going | ⭐⭐⭐⭐ |
| Invalid data ("boh@") | Offered to save invalid email instead of rejecting | ⭐⭐ |
| Placeholder ("N/A", "YYYY") | Accepted N/A as name, asked for more info — should reject | ⭐⭐ |
| Rapid layout changes (chat) | Claims success but doesn't actually change layout | ⭐ |
| Unsupported feature ("video") | Falsely claims it can add video — should say unsupported | ⭐⭐ |
| Section overload request | Good — asks for details for each section type | ⭐⭐⭐⭐ |
| Bulk deletion | Failed to delete, confused about state | ⭐⭐ |
| Name change post-publish | Failed — update_fact tool errors | ⭐ |
| Contact addition | Succeeded — created facts with proposed visibility | ⭐⭐⭐⭐ |

### Agent Limits Found
1. **Layout changes via chat fail silently** — agent says it changed layout but DB is unchanged (tool errors swallowed)
2. **Fact updates fail for returning users** — update_fact and delete_fact tools error in active_fresh/steady_state journey
3. **No validation of user-provided data** — agent accepts invalid emails, N/A placeholders
4. **Promises unsupported features** — says it can add video to hero when it can't
5. **Date fabrication** — invents precise start/end dates from approximate duration (BUG-1, user-reported)

## Bug Log
| # | Type | Severity | Description | Step | Screenshot |
|---|------|----------|-------------|------|------------|
| 1 | Agent | Medium/High | Agent fabricates precise dates from approximate info ("8 anni" → "gennaio 2015 – gennaio 2023"). Should store approx duration and ask for exact dates. **User-reported.** | 4C | uat/05-intro-3.png |
| 2 | Agent | Medium | Agent doesn't recognize "bento" alias — says layout unavailable. `resolveLayoutAlias()` exists but agent prompt lacks alias mapping. | 5 | — |
| 3 | API | **High** | "The Architect" (bento-standard) layout returns 400 Bad Request on `/api/draft/style`. All other layouts work. Settings panel and chat both affected. | 5 | uat/07-layout-architect-broken.png |
| 4 | Agent | Medium | Agent offers to save "boh@" as email — should validate email format and ask for correction | 7 | — |
| 5 | Agent | Medium | Agent accepts "N/A" as project name and "YYYY" as date — should recognize as placeholders | 7 | — |
| 6 | Data | Medium | Draft row uses session UUID as `id`, not literal "draft". Inconsistency with two-row model docs (which say `id='draft'`). | 7 | — |
| 7 | Agent/API | **High** | Agent claims layout changes via chat ("Bento", "no sidebar", "Vertical") but DB unchanged. `set_layout` tool fails silently — agent hallucinates success. | 7 | uat/09-stress-1.png |
| 8 | Agent | Medium | Agent says "Posso aggiungere un video alla sezione hero" — video support doesn't exist. Should say feature unavailable. | 7 | — |
| 9 | Agent/API | Medium | Bulk fact deletion fails — agent says "ci sia un problema" after trying delete_fact. Then claims it "restored" facts that were never deleted. Confused state. | 7 | uat/09-stress-2.png |
| 10 | Agent/API | **High** | Name change ("Giovanni Rossi") fails — agent says "ci sia un problema". `update_fact` tool errors for returning user session. Core editing broken post-publish. | 10 | — |
| 11 | API | Medium | `/api/proposals` returns 500 (console error). Not user-facing but indicates backend issue. | 11 | — |
| 12 | Config | Low | Draft `theme` is `undefined` after style rotation — theme not persisting to draft config correctly. Published page renders fine (minimal is CSS default). | 11 | — |

## Root Cause Hypothesis

BUGs 7, 9, 10 likely share the same root cause: **agent tools (set_layout, update_fact, delete_fact) fail for sessions in `active_fresh` journey state after registration**. The tools may be checking session ownership differently than fact/page ownership (session_id vs profile_id mismatch). The `ensureDraft()` pattern or `resolveOwnerScope()` may not handle the post-registration session correctly when the session transitions from anonymous to authenticated with a profile_id.

BUG-3 (Architect 400) is likely a separate validation issue in the `/api/draft/style` endpoint — the `bento-standard` layout ID may not pass the schema validation in `normalizeConfigForWrite()` or the style endpoint's input validation.

## DB Integrity
| Check | Result |
|-------|--------|
| Orphaned facts | ✅ 0 orphans |
| Duplicate facts | ✅ None |
| Missing identity | ✅ name + role present |
| Draft config valid | ⚠️ Theme undefined, layout monolith (correct) |
| Published matches draft | ✅ Both have 8 sections, same layout |
| Contact visibility | ✅ Contacts promoted to public on publish |
| Total facts | 18 (9 categories) |
| All facts have profile_id | ✅ |

## Final Facts Summary
| Category | Count | Details |
|----------|-------|---------|
| identity | 2 | name (Marco), role (Designer UX) |
| experience | 2 | Freelance (current), Frog Design (past) |
| education | 1 | Politecnico di Milano, Interaction Design |
| project | 3 | Banca Intesa, IoT Design System, Trenitalia |
| interest | 3 | Tipografia, Design Sostenibile, Caffè Speciality |
| language | 3 | Italiano (madrelingua), Inglese (fluente), Spagnolo (base) |
| activity | 1 | Ciclismo (sport, regolare) |
| contact | 2 | Email (marco@design.it), LinkedIn |
| stat | 1 | 8 anni di esperienza |

## Published Page Sections (8 total)
1. Hero (name, role, email, languages)
2. Bio (Chi Sono)
3. At-a-Glance (Colpo d'Occhio — stat + interests)
4. Experience (Esperienza — 2 entries)
5. Education (Formazione)
6. Activities (Attivita)
7. Projects (Progetti — 3, with collapsible)
8. Footer (openself.dev)

**Note**: No standalone contact section rendered — contacts only appear in hero subtitle area.

## Critical Issues Requiring Fix

### P0 — Blocking
1. **BUG-3: Architect layout 400** — `/api/draft/style` rejects bento-standard. One of 4 layouts completely broken.
2. **BUG-10: update_fact fails for returning users** — Cannot update identity or delete facts via chat after registration. Core agent editing capability broken.
3. **BUG-7: Layout changes via chat hallucinated** — `set_layout` tool fails silently, agent tells user it succeeded. Trust-destroying UX.

### P1 — High
4. **BUG-1: Date fabrication** — Agent invents precise dates from approximate info. User explicitly flagged this.
5. **BUG-9: delete_fact fails** — Cannot delete facts via chat. Agent enters confused state.

### P2 — Medium
6. **BUG-2: Bento alias not in agent prompt** — Easy fix: add alias list to TOOL_POLICY
7. **BUG-4: Invalid email accepted** — Agent should validate before offering to save
8. **BUG-5: N/A placeholder accepted** — Agent should recognize common placeholders
9. **BUG-8: Claims unsupported features** — Agent needs list of actual capabilities
10. **BUG-11: /api/proposals 500** — Backend error
11. **BUG-12: Theme undefined in draft** — Cosmetic but indicates config write issue

## Fix Status (2026-03-03)

| Bug | Fix | Commit | Status |
|-----|-----|--------|--------|
| BUG-1 | SAFETY_POLICY: date fabrication prohibition | `a9b4048` | **Fixed** |
| BUG-2 | Not a bug (layout intentionally renamed) | — | **Closed** |
| BUG-3 | Architect capacity + widget carry-over + unplaceable cleanup | `868a3c3` | **Fixed** |
| BUG-4 | Validation exists; agent prompt now requires tool-call honesty | `a880c72` (test), `a9b4048` (prompt) | **Fixed** |
| BUG-5 | Validation exists; agent prompt now requires tool-call honesty | `b8c2b05` (test), `a9b4048` (prompt) | **Fixed** |
| BUG-6 | Not addressed (draft ID is intentional — session-based) | — | **Won't fix** |
| BUG-7 | TOOL_POLICY: tool failure honesty rule | `a9b4048` | **Fixed** |
| BUG-8 | DATA_MODEL_REFERENCE already has UNSUPPORTED FEATURES | `a9b4048` (verified) | **Fixed** |
| BUG-9 | deleteGate per-factId consumption + accumulation | `a9b4048` | **Fixed** |
| BUG-10 | identityGate message + IDENTITY PROTECTION prompt rewrite | `a9b4048` | **Fixed** |
| BUG-11 | getPendingProposals try-catch | `0502c53` | **Fixed** |
| BUG-12 | Published page theme carried forward via draftMeta | `4150f57` | **Fixed** |
| VOICE | recognition.onend state reset + server fallback IDLE | `0fa9485` | **Fixed** |

**Tests**: 2149 pass across 183 files (up from ~1151). Build succeeds.

## What Worked Well
- **Onboarding flow**: Home → Invite → Language → Builder is smooth
- **Fact creation from conversation**: Agent correctly extracts and stores structured data from natural Italian
- **Contradiction handling**: Agent asks for confirmation, doesn't blindly overwrite
- **Single-word responses**: Agent remains patient and constructive
- **Registration + publish**: Signup modal, username pre-fill, redirect to published page — all work
- **Re-publish flow**: "Publish as marcobellini" button appears, re-publish works
- **Contact privacy**: Contact facts created as `proposed`, promoted to `public` on publish
- **Settings panel**: Theme/layout switching via UI works for 5/6 combos
- **Published page rendering**: All sections render correctly, collapsible projects, magazine design

## Screenshots Index
| File | Description | Step |
|------|-------------|------|
| uat/01-home.png | Home page | 2 |
| uat/02-invite.png | Invite code page | 2 |
| uat/03-language-picker.png | Language selection | 3 |
| uat/04-builder-empty.png | Builder empty state with agent welcome | 3 |
| uat/05-intro-1.png | After "Sono Marco" | 4A |
| uat/05-intro-2.png | After role/location | 4A |
| uat/05-intro-3.png | After Frog Design (fabricated dates) | 4A |
| uat/05-detail-1.png | Education + interests | 4B |
| uat/06-cooperative-final.png | End of cooperative flow | 4D |
| uat/07-layout-architect-broken.png | Architect layout 400 error | 5 |
| uat/07-theme-warm.png | Warm theme applied | 5 |
| uat/07-layout-curator.png | Curator layout | 5 |
| uat/07-theme-editorial.png | Editorial-360 theme | 5 |
| uat/07-layout-cinematic.png | Cinematic layout | 5 |
| uat/07-final-style.png | Final monolith + minimal | 5 |
| uat/08-uncooperative-1.png | Contradiction + impatience | 6 |
| uat/08-uncooperative-2.png | Single-word responses | 6 |
| uat/09-stress-1.png | Rapid layout changes (hallucinated) | 7 |
| uat/09-stress-2.png | Deletion failure + recovery | 7 |
| uat/10-publish-prompt.png | Registration modal | 8 |
| uat/11-published-full.png | Published page full | 9 |
| uat/12-republished.png | Re-published with contacts | 10 |
| uat/13-final-published.png | Final published page (full scroll) | 11 |

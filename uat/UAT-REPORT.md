# UAT Report — OpenSelf

**Date:** 2026-03-02 (Run 3)
**Tester:** Claude (automated UAT)
**Persona:** Marco Bellini, Senior UX Designer freelance, Milano
**Environment:** localhost:3000, dev mode, SQLite
**Branch:** main
**Commit:** 8c2eb58

## Summary
| Metric | Count |
|--------|-------|
| Total checks | 42 |
| Passed | 32 |
| Failed | 4 |
| Warnings | 6 |

## Bug Log

| # | Type | Severity | Description | Step | Screenshot |
|---|------|----------|-------------|------|------------|
| 1 | Agent | Medium | Responses repetitive ("Ho aggiunto X. Ecco la pagina!"), no personality, no registration CTA during onboarding | 4 | uat/05-chat-*.png |
| 2 | Agent | Medium | Bento layout fails via agent chat — reports incompatible sections but doesn't resolve | 5 | — |
| 3 | Agent/Tool | **High** | Agent claims theme changed to warm but `style.theme` remains `undefined` in DB. `set_theme` tool not persisting | 5 | uat/07-theme-warm.png |
| 4 | Agent | Medium | Agent confused about layouts — claims monolith "includes a sidebar" when user asks for sidebar layout | 5 | — |
| 5 | API/Layout | **High** | Architect/bento layout returns HTTP 400 on `/api/draft/style` via Settings panel. Sections incomplete validation error | 5 | uat/07-layout-architect.png |
| 6 | Dev | Medium | HMR continuous rebuild loop after theme/layout changes. Dozens of Fast Refresh cycles per second, causes screenshot timeouts | 5,11 | — |
| 7 | Agent | Medium | Agent updates experience fact role to "Cuoco" on contradiction but leaves identity/role as "Designer UX" — inconsistent state | 6 | — |
| 8 | Agent | Low | Agent asks for video link when user requests video in hero, instead of explaining the feature is unsupported | 7 | — |
| 9 | Config | Low | Published page `style.theme` is `undefined` — theme never successfully persisted by agent. Only layouts are persisted | 11 | — |
| 10 | Quota | Info | Daily token limit (500K) reached after ~25 chat messages. Error UI well-designed (red text + Retry + Refresh buttons) | 10 | uat/10-token-limit.png |

## Improvements Since Run 2

Several bugs from Run 2 are now fixed:
- ✅ **Chat input restored after registration** — Bug #2 from Run 2 fixed. Chat input is functional after signup+publish. Authenticated user can continue chatting.
- ✅ **Settings panel doesn't block preview** — Bug #3 from Run 2 fixed. Settings panel no longer pushes preview off-screen.
- ✅ **Header updates after registration** — Bug #4 from Run 2 fixed. Header shows "Publish as marcobellini" + "Log out" after auth.
- ✅ **Settings persistence works for most combos** — Bug #1 from Run 2 partially fixed. Curator, Cinematic, Monolith layouts persist via settings. Only Architect/bento still fails.

## Layout/Theme Matrix

| Layout | Theme | Via Chat | Via Settings | Screenshot | Notes |
|--------|-------|----------|--------------|------------|-------|
| monolith | minimal | N/A (default) | ✅ | uat/07-final-style.png | Default combo, all sections render |
| monolith | warm | ❌ agent hallucinated | ✅ | uat/07-theme-warm.png | Agent claimed success but DB unchanged |
| curator | editorial-360 | N/A | ✅ | uat/07-layout-curator.png | Sidebar layout applied correctly |
| cinematic | editorial-360 | N/A | ✅ | uat/07-layout-cinematic.png | Full-width hero, dramatic |
| architect | minimal | ❌ agent failed | ❌ 400 error | uat/07-layout-architect.png | Broken in both chat and settings |
| monolith | minimal | ✅ (via "vertical") | ✅ | uat/07-final-style.png | Final state |

**Note:** Theme was never successfully persisted to DB via agent chat tools. All theme changes via Settings UI worked correctly. The `set_theme` agent tool is broken.

## Agent Behavior Analysis

### Conversation Quality

| Scenario | Agent Response | Rating |
|----------|---------------|--------|
| Name extraction | Immediate, correct `identity/name` fact | ⭐⭐⭐⭐⭐ |
| Role + employment type | Detected "Designer UX" + "Freelance" + "Milano" in one message | ⭐⭐⭐⭐⭐ |
| Previous employer | Extracted "Frog Design", inferred 8yr tenure, auto-created stat | ⭐⭐⭐⭐⭐ |
| Education | Expanded "Politecnico" → full name, inferred "Laurea" | ⭐⭐⭐⭐⭐ |
| Interests (multi-topic) | Split "tipografia" + "design sostenibile" as separate facts | ⭐⭐⭐⭐⭐ |
| Activities vs Interests | "ciclismo" → activity, "caffè" → interest — correct taxonomy | ⭐⭐⭐⭐⭐ |
| Language proficiency | Inferred native/fluent/intermediate from casual phrasing | ⭐⭐⭐⭐⭐ |
| Vague message ("Boh non so") | "Possiamo costruire con info che abbiamo" — reasonable | ⭐⭐⭐ |
| Off-topic ("Film bellissimo") | Redirects: "Possiamo aggiungere film alla pagina!" | ⭐⭐⭐⭐ |
| Contradiction ("Sono un cuoco") | Updates immediately, no pushback — too eager | ⭐⭐ |
| Correction ("Scherzo, sono designer") | Reverts correctly and quickly | ⭐⭐⭐⭐ |
| Impatience ("Pubblica subito") | Directs to publish button | ⭐⭐⭐⭐ |
| Single-word ("No"/"Forse"/"Ok") | Handles gracefully, keeps conversation alive | ⭐⭐⭐⭐ |
| Invalid email ("boh@") | Rejects, asks for valid email | ⭐⭐⭐⭐⭐ |
| Placeholder data ("N/A", "YYYY") | Rejects, asks for real data | ⭐⭐⭐⭐⭐ |
| Rapid layout changes | Keeps up, lands on correct state | ⭐⭐⭐ |
| Unsupported feature ("video nella hero") | Asks for video link — misleading | ⭐⭐ |
| Bulk section request | Asks for details first — good | ⭐⭐⭐⭐ |
| Deletion ("Togli tutti i progetti") | Deletes 1, confirms rest — smart | ⭐⭐⭐⭐ |
| Recovery ("Rimetti i progetti!") | Recreates all 3 from conversation context | ⭐⭐⭐⭐⭐ |
| Name change ("Giovanni Rossi") | Asks for confirmation first | ⭐⭐⭐⭐⭐ |

### Overall Agent Rating: ⭐⭐⭐½ (3.5/5)

**Strengths:**
- Excellent Italian — fully natural, no awkward phrasing
- Smart inference from minimal input (proficiency levels, institution names)
- Excellent validation (email, placeholders, N/A, YYYY rejection)
- Good data recovery from conversation context (project restore)
- Asks confirmation for sensitive changes (name change)
- Correct taxonomy (activities vs interests vs hobbies)
- Progressive page building — preview updates after every message

**Weaknesses:**
- Repetitive pattern: "Ho aggiunto X. Ecco la tua pagina!" (every message)
- No CTA for registration during onboarding phase
- Accepts contradictions too easily (should question "I'm actually a cook")
- Layout/theme tools unreliable (set_theme broken, layout confusion)
- Claims unsupported features might work (video in hero)
- Identity fact inconsistency on contradiction

### Agent Limits Found
1. Token limit (500K/day) reached after ~25 messages — blocks further interaction
2. Agent confuses layout names (claims monolith has sidebar)
3. `set_theme` tool doesn't persist theme to DB config
4. Agent cannot successfully apply architect/bento layout
5. Error messages follow robotic pattern ("Sembra che ci sia un problema...")

## DB Integrity

| Check | Result |
|-------|--------|
| Total facts | 17 ✅ |
| Orphaned facts | 0 ✅ |
| Duplicate facts | 0 ✅ |
| Missing identity | name + role + location ✅ |
| Draft config valid | monolith, 8 sections ✅ |
| Published page exists | id=marcobellini ✅ |
| Draft matches published | Same layout + sections ✅ |
| All facts public | All 17 visibility=public ✅ |
| Theme persisted | ❌ style.theme = undefined |

### Facts Breakdown (17 total)

| Category | Count | Keys |
|----------|-------|------|
| activity | 1 | ciclismo |
| education | 1 | politecnico |
| experience | 2 | freelance-ux-designer, frog-design |
| identity | 3 | name, role, location |
| interest | 3 | tipografia, design-sostenibile, caffe-speciality |
| language | 3 | italiano, inglese, spagnolo |
| project | 3 | banca-intesa-app, design-system-startup-iot, audit-ux-trenitalia |
| stat | 1 | years-experience |

### Published Page Sections (8)

hero, bio, at-a-glance, experience, projects, education, activities, footer

## Published Page Verification

| Check | Result |
|-------|--------|
| No builder UI on published page | ✅ |
| All 8 sections present | ✅ |
| Layout applied correctly (monolith) | ✅ |
| No "draft" text visible | ✅ |
| Owner banner (Edit, Share, Logout) | ✅ |
| Page title = "Marco \| OpenSelf" | ✅ |
| All fact data matches DB | ✅ |
| No broken/empty sections | ✅ |
| Footer (openself.dev link) | ✅ |
| Scroll animations (theme-reveal) | ✅ (on published page) |

## Console Errors

| Error | Count | Context |
|-------|-------|---------|
| 429 Too Many Requests (api/chat) | 1 | Token limit reached — expected behavior |

No unhandled JavaScript errors. No 500 errors. No crashes.

## Test Coverage Gaps

Due to daily token limit (500K) being reached, these planned tests could not be completed:
- Post-publish name change (confirmed agent asked for confirmation, but token limit hit before execution)
- Post-publish layout+theme combo via chat (tested via settings panel instead)
- Post-publish contact addition via chat
- Re-publish after post-publish edits via chat

## Screenshots Index

| File | Description | Step |
|------|-------------|------|
| uat/01-home.png | Home page with CTA | 2 |
| uat/02-invite-page.png | Invite code entry | 2 |
| uat/03-builder-entry.png | Builder with agent welcome | 2 |
| uat/04-builder-empty.png | Builder empty state | 3 |
| uat/05-chat-1.png | First conversation exchange | 4 |
| uat/05-chat-2.png | Identity facts created | 4 |
| uat/05-chat-3.png | Education + interests | 4 |
| uat/05-chat-4.png | Languages added | 4 |
| uat/05-chat-5.png | Projects added (quota hit) | 4 |
| uat/06-cooperative-final.png | Full cooperative phase preview | 4 |
| uat/07-publish-prompt.png | Signup modal | 8 |
| uat/08-registered.png | Registration form filled | 8 |
| uat/09-published-page.png | Published page top | 9 |
| uat/09-published-bottom.png | Published page bottom | 9 |
| uat/07-theme-warm.png | Warm theme via settings | 5 |
| uat/07-layout-curator.png | Curator layout via settings | 5 |
| uat/07-theme-editorial.png | Editorial-360 theme | 5 |
| uat/07-layout-cinematic.png | Cinematic layout | 5 |
| uat/07-layout-architect.png | Architect layout (400 error) | 5 |
| uat/07-final-style.png | Final monolith+minimal | 5 |
| uat/08-uncooperative-1.png | Vague + off-topic messages | 6 |
| uat/08-uncooperative-2.png | Single-word responses | 6 |
| uat/09-stress-1.png | Delete/recover projects | 7 |
| uat/10-token-limit.png | Daily token limit UI | 10 |
| uat/12-final-published-1.png | Final published page top | 11 |
| uat/12-final-published-2.png | Final published page scrolled | 11 |

## Recommendations

### High Priority
1. **Fix `set_theme` agent tool** — theme never persists to DB via chat. The tool likely doesn't call the correct API or has a parameter mismatch.
2. **Fix architect/bento layout 400 error** — `/api/draft/style` returns 400 for bento-standard. Section completeness validation likely too strict for bento slots.

### Medium Priority
3. **Improve agent conversation quality** — reduce repetitive "Ho aggiunto X. Ecco la pagina!" pattern. Add personality, vary phrasing. Push registration CTA during onboarding.
4. **Agent should question contradictions** — when user says "I'm actually a cook" after saying "I'm a designer", agent should ask "Which is correct?" rather than immediately overwriting.
5. **Agent should explain unsupported features** — when user asks for video in hero, say "Video is not supported yet" rather than asking for a video link.
6. **Fix identity/role consistency** — when experience role is updated, also update identity/role fact to match.

### Low Priority
7. **Investigate HMR rebuild loop** — continuous Fast Refresh rebuilds (every 300-700ms) after settings changes. May indicate circular imports or watch path issues. Only affects dev mode.
8. **Consider per-session token limits** — daily 500K limit was exhausted after ~25 messages. Per-session or per-user limits would allow testing multiple sessions.

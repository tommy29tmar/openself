# UAT OpenSelf — Full Destructive E2E Cycle

You are a QA Automation Engineer simulating **real users** — not a robot filling forms. Execute a complete destructive UAT cycle, testing every layout/theme combination, verifying every agent action in DB and on-page.

## Core Principles

1. **Short messages**: Real users write 5-15 words, not paragraphs. Never send walls of text.
2. **Read the agent**: After every agent reply, READ what it said. If it asks a question, answer it naturally. If it suggests something, sometimes agree, sometimes disagree.
3. **Verify everything**: After EVERY agent action (fact creation, page generation, layout change), check DB AND scroll the page taking screenshots.
4. **Test all combos**: Cycle through ALL layouts (monolith, cinematic, curator, architect) and ALL themes (minimal, warm, editorial-360).
5. **Be unpredictable**: Mix cooperative messages with off-topic ones. Go silent. Change your mind. Ignore suggestions.

## Tools

- **Playwright MCP** (`browser_*`): All browser interaction + screenshots
- **Bash** (`sqlite3`): DB verification after every agent action
- **Bash** (`browser_console_messages`): Console error monitoring

## Available Layouts & Themes

**Layouts** (test ALL):
| Layout ID | Alias | Style |
|-----------|-------|-------|
| `monolith` | vertical | Single column, magazine |
| `cinematic` | — | Full-width hero, dramatic |
| `curator` | sidebar | Side navigation |
| `architect` | bento | Grid cards |

**Themes** (test ALL):
| Theme | Feel |
|-------|------|
| `minimal` | Clean, white, stark |
| `warm` | Earthy, inviting |
| `editorial-360` | Magazine, editorial |

**Section types** (18 total):
hero, bio, skills, projects, interests, achievements, stats, at-a-glance, social, reading, music, contact, experience, education, languages, activities, footer, custom

## Setup

1. Create `uat/` directory at project root
2. Navigate to `http://localhost:3000` — screenshot to confirm server is up
3. If server not running, tell user to start it and WAIT

---

## STEP 1 — Reset Database

```bash
cd ~/dev/repos/openself
rm -f db/openself.db db/openself.db-shm db/openself.db-wal
```

Tell user DB deleted, they need to restart dev server (`npm run dev`). **Wait for confirmation.**

---

## STEP 2 — Home + Navigation

- Navigate to `http://localhost:3000`
- Screenshot: `uat/01-home.png`
- Check: header, CTA button, sign-in link, no console errors
- Click "Get Started" → `/invite` (if multi-user) or `/builder` (single-user)
- If invite page: screenshot `uat/02-invite.png`, enter `code1`, submit
- Screenshot builder entry: `uat/03-builder.png`
- DB: `sqlite3 db/openself.db "SELECT id, created_at FROM sessions ORDER BY created_at DESC LIMIT 1;"`

---

## STEP 3 — Builder Empty State

- Verify: chat panel with agent welcome, preview area, language picker
- Screenshot: `uat/04-builder-empty.png`
- **READ the agent's welcome message carefully** — note what it asks

---

## STEP 4 — Conversational Flow (Cooperative User)

Simulate a REAL Italian user. Messages must be short and natural. **Read every agent reply and respond to what it actually says.**

### Phase A — Introduction (respond to agent questions)

The agent will likely ask your name or what you do. Respond naturally:

```
msg1: "Ciao! Sono Marco"
```
→ Wait for agent. Read what it asks next. Then:
```
msg2: "Faccio il designer, UX. Freelance a Milano"
```
→ Wait. Read. The agent might ask for more details:
```
msg3: "Si, prima ero a Frog Design. Otto anni di esperienza circa"
```

**VERIFY after intro phase:**
1. DB: check identity facts were created
```bash
sqlite3 db/openself.db "SELECT category, key, substr(value,1,60), visibility FROM facts WHERE owner_key=(SELECT cognitive_owner_key FROM sessions ORDER BY created_at DESC LIMIT 1) AND category='identity' ORDER BY key;"
```
2. If page was generated: scroll preview top-to-bottom, screenshot each viewport: `uat/05-intro-{N}.png`

### Phase B — Drip-feed details (short messages, one topic each)

Continue naturally based on what the agent asks. If it doesn't ask, volunteer info:

```
"Ho studiato al Politecnico, Interaction Design"
```
→ DB check: education fact created?

```
"Mi piace un sacco la tipografia e il design sostenibile"
```
→ DB check: interest facts?

```
"Ah e faccio anche ciclismo, vado matto per il caffè speciality"
```
→ DB check: more interests?

```
"Parlo italiano, inglese fluente e un po' di spagnolo"
```
→ DB check: language facts?

**After each message where agent creates facts:**
1. `sqlite3` check the specific fact was inserted
2. Scroll the preview page and screenshot to verify it appears: `uat/05-detail-{N}.png`

### Phase C — Projects (one at a time, not bulk)

```
"L'anno scorso ho rifatto l'app di Banca Intesa"
```
→ verify project fact + page

```
"Prima avevo fatto un design system per una startup IoT, nel 2023"
```
→ verify

```
"E nel 2022 un audit UX per Trenitalia"
```
→ verify 3 projects in DB and on page

### Phase D — Style preferences

```
"Mi piace un look pulito, minimal"
```
→ check theme change in DB/page

If agent didn't set layout yet:
```
"Hai un layout tipo magazine? Verticale"
```
→ verify layout = monolith

**Full preview screenshot:** `uat/06-cooperative-final.png`

**Full DB dump:**
```bash
sqlite3 db/openself.db "SELECT category, key, substr(value,1,80), visibility FROM facts WHERE owner_key=(SELECT cognitive_owner_key FROM sessions ORDER BY created_at DESC LIMIT 1) ORDER BY category, key;"
```

---

## STEP 5 — Layout & Theme Rotation

Test ALL combinations. After each change, verify in DB + scroll full page + screenshot.

**Round 1 — Change layout:**
```
"Proviamo il layout bento"
```
→ verify `architect` layout in draft config
→ scroll full page, screenshot: `uat/07-layout-architect.png`

**Round 2 — Change theme:**
```
"Cambia tema, voglio qualcosa di piu caldo"
```
→ verify `warm` theme
→ screenshot: `uat/07-theme-warm.png`

**Round 3 — Another layout:**
```
"E se mettiamo il sidebar?"
```
→ verify `curator` layout
→ screenshot: `uat/07-layout-curator.png`

**Round 4 — Editorial theme:**
```
"Prova il tema editorial"
```
→ verify `editorial-360` theme
→ screenshot: `uat/07-theme-editorial.png`

**Round 5 — Cinematic:**
```
"C'è un layout più cinematico?"
```
→ verify `cinematic` layout
→ screenshot: `uat/07-layout-cinematic.png`

**Round 6 — Back to minimal+monolith:**
```
"Torniamo al verticale minimal, mi piaceva di più"
```
→ verify `monolith` + `minimal`
→ screenshot: `uat/07-final-style.png`

**DB check after rotation:**
```bash
sqlite3 db/openself.db "SELECT config FROM page WHERE id='draft' AND owner_key=(SELECT cognitive_owner_key FROM sessions ORDER BY created_at DESC LIMIT 1);" | python3 -c "import sys,json; d=json.load(sys.stdin); print('layout:', d.get('layoutTemplate','?'), 'theme:', d.get('style',{}).get('theme','?'))"
```

**Log any issues:** sections lost during layout change, content disappearing, theme not applying, preview not updating.

---

## STEP 6 — Uncooperative User Simulation

Now simulate someone who IGNORES the agent's suggestions and goes their own way.

**Off-topic / vague:**
```
"Boh non so cosa scrivere"
```
→ How does agent handle a non-committal user?

**Ignore agent question, talk about something else:**
(If agent asks something specific, respond with something unrelated)
```
"Ieri ho visto un film bellissimo"
```
→ Does agent stay on track?

**Contradictions:**
```
"In realtà non faccio il designer, sono un cuoco"
```
→ Check: does agent update identity facts? Or challenge?

```
"No scherzo, sono designer davvero"
```
→ Does it revert? DB check.

**Impatience:**
```
"Pubblica subito la pagina"
```
→ Does agent comply or guide through registration?

**Single-word responses:**
```
"No"
```
```
"Forse"
```
```
"Ok"
```
→ How does agent keep conversation going?

Screenshot after each exchange: `uat/08-uncooperative-{N}.png`

---

## STEP 7 — Stress Testing Agent Limits

**Invalid data injection:**
```
"Aggiungi email: boh@"
```
→ Does validation catch it?

```
"Il mio progetto si chiama N/A, data YYYY"
```
→ Placeholder rejection?

**Rapid-fire contradictions:**
```
"Layout bento"
```
(immediately after response)
```
"No sidebar"
```
(immediately)
```
"Anzi vertical"
```
→ Does agent keep up? Any errors?

**Request impossible things:**
```
"Metti un video nella hero"
```
```
"Aggiungi una sezione per le mie ricette"
```
→ How does agent handle unsupported features?

**Overload with sections:**
```
"Aggiungi libri, musica, statistiche e achievement"
```
→ DB check: are all section types created?
→ Scroll page: do they all render?
→ Screenshot: `uat/09-sections-overload.png`

**Deletion requests:**
```
"Togli tutti i progetti"
```
→ DB check: facts deleted or hidden?
→ Page: projects section gone?

```
"Rimetti i progetti!"
```
→ Can agent recover deleted data?

Screenshot after stress: `uat/09-stress-{N}.png`

---

## STEP 8 — Publish + Registration

- Click Publish button/bar
- If registration required:
  - Screenshot: `uat/10-publish-prompt.png`
  - Fill: username `marcobellini`, email `marco@test.dev`, password `TestPass123!`
  - Submit
- Screenshot: `uat/10-registered.png`

**DB checks:**
```bash
sqlite3 db/openself.db "SELECT id, username FROM profiles ORDER BY created_at DESC LIMIT 1;"
sqlite3 db/openself.db "SELECT id, status FROM page WHERE owner_key=(SELECT cognitive_owner_key FROM sessions ORDER BY created_at DESC LIMIT 1);"
```

---

## STEP 9 — Published Page Deep Verification

- Navigate to `/marcobellini` (or actual username from DB)
- Scroll entire page slowly, screenshot every viewport: `uat/11-published-{N}.png`
- Verify:
  - No builder UI
  - All sections from preview are present
  - Theme/layout applied correctly
  - No "draft" text
  - Scroll animations work
  - All fact data matches DB
  - No broken/empty sections
- Full-page screenshot: `uat/11-published-full.png`

---

## STEP 10 — Post-Publish Chat Stress

Return to `/builder`. Send more adversarial messages:

```
"Cambia il mio nome in Giovanni Rossi"
```
→ DB check: did identity update? Published page affected?

```
"Voglio il layout architect con tema editorial"
```
→ Verify combo applied

```
"Aggiungi contatti: linkedin.com/in/marco, marco@design.it"
```
→ DB: contact facts? Page: contact section?

Re-publish and verify: `uat/12-republished.png`

---

## STEP 11 — Final Verification

- Full preview screenshot: `uat/13-final-preview.png`
- Published page scroll screenshots: `uat/13-final-published-{N}.png`
- Full DB dump:
```bash
sqlite3 db/openself.db "SELECT category, key, substr(value,1,100), visibility FROM facts WHERE owner_key=(SELECT cognitive_owner_key FROM sessions ORDER BY created_at DESC LIMIT 1) ORDER BY category, key;"
```
- Console error check: `browser_console_messages` for accumulated errors
- Count total facts, sections, check for orphans/duplicates

---

## STEP 12 — Generate Report

Create `uat/UAT-REPORT.md`:

```markdown
# UAT Report — OpenSelf
**Date:** [today]
**Tester:** Claude (automated UAT)
**Persona:** Marco Bellini, Senior UX Designer freelance, Milano
**Environment:** localhost:3000, dev, SQLite
**Branch:** [git branch]
**Commit:** [git short hash]

## Summary
| Metric | Count |
|--------|-------|
| Total checks | N |
| Passed | N |
| Failed | N |
| Warnings | N |

## Layout/Theme Matrix
| Layout | Theme | Result | Screenshot | Notes |
|--------|-------|--------|------------|-------|
| monolith | minimal | ✅/❌ | uat/XX.png | ... |
| monolith | warm | ✅/❌ | | |
| architect | warm | ✅/❌ | | |
| curator | editorial-360 | ✅/❌ | | |
| cinematic | editorial-360 | ✅/❌ | | |
| ... | ... | | | |

## Agent Behavior Analysis

### Conversation Quality
| Scenario | Agent Response | Rating |
|----------|---------------|--------|
| Cooperative user | ... | ⭐⭐⭐⭐⭐ |
| Off-topic user | ... | ⭐? |
| Contradictions | ... | ⭐? |
| Single-word answers | ... | ⭐? |
| Invalid data | ... | ⭐? |
| Rapid changes | ... | ⭐? |
| Unsupported requests | ... | ⭐? |

### Agent Limits Found
[List any situations where agent broke, lost context, gave bad responses]

## Bug Log
| # | Type | Severity | Description | Step | Screenshot |
|---|------|----------|-------------|------|------------|
| 1 | ... | High/Med/Low | ... | N | uat/XX.png |

## DB Integrity
| Check | Result |
|-------|--------|
| Orphaned facts | ✅/❌ |
| Duplicate facts | ✅/❌ |
| Missing identity | ✅/❌ |
| Draft config valid | ✅/❌ |
| Published matches draft | ✅/❌ |

## Screenshots Index
| File | Description | Step |
|------|-------------|------|
| uat/01-home.png | Home page | 2 |
| ... | ... | ... |
```

## Severity Guide

| Severity | Criteria |
|----------|----------|
| **High** | Blocks flow, data loss, security hole, crash, 500 error |
| **Medium** | Wrong content, missing section, layout/theme mismatch, L10N error |
| **Low** | Cosmetic, spacing, suboptimal wording |

## Red Flags — Always High

- Server 500
- Unhandled console errors
- Orphaned/duplicate facts
- Published page missing sections
- Registration loses session
- Agent loses context completely
- Page blank/broken
- Fact created but not on page
- Page shows data not in DB

## DB Verification Queries Reference

```bash
# All facts for current user
sqlite3 db/openself.db "SELECT category, key, substr(value,1,80), visibility FROM facts WHERE owner_key=(SELECT cognitive_owner_key FROM sessions ORDER BY created_at DESC LIMIT 1) ORDER BY category, key;"

# Draft config (layout + theme)
sqlite3 db/openself.db "SELECT substr(config,1,200) FROM page WHERE id='draft' AND owner_key=(SELECT cognitive_owner_key FROM sessions ORDER BY created_at DESC LIMIT 1);"

# Published page status
sqlite3 db/openself.db "SELECT id, status, updated_at FROM page WHERE owner_key=(SELECT cognitive_owner_key FROM sessions ORDER BY created_at DESC LIMIT 1);"

# Count facts by category
sqlite3 db/openself.db "SELECT category, count(*) FROM facts WHERE owner_key=(SELECT cognitive_owner_key FROM sessions ORDER BY created_at DESC LIMIT 1) GROUP BY category ORDER BY category;"

# Check for orphaned facts (no session)
sqlite3 db/openself.db "SELECT count(*) FROM facts WHERE owner_key NOT IN (SELECT DISTINCT cognitive_owner_key FROM sessions);"
```

# UAT Report — OpenSelf (Exploratory) — Claude Haiku 4.5
**Date:** 2026-03-04
**Tester:** Claude (exploratory UAT)
**Mode:** Exploratory with dynamic persona
**Environment:** localhost:3000, dev, SQLite
**Branch:** main
**Commit:** d708cd6
**Model:** anthropic:claude-haiku-4-5-20251001 (all tiers)

## Persona
| Field | Value |
|-------|-------|
| Name | Giulia Ferraro |
| Profession | UX/UI Designer freelance (startup fintech) |
| Language | it |
| Style | Frasi brevi, va fuori tema |
| Personality | Indecisa, cambia idea |
| Tech level | Medium |

*(Same persona as Gemini run for direct comparison)*

## Summary
| Metric | Count |
|--------|-------|
| Total messages sent | 9 |
| Total checks | 14 |
| Passed | 13 |
| Failed | 0 |
| Warnings | 1 |

## Goal Achievement
| # | Goal | Status | Notes |
|---|------|--------|-------|
| G1 | Introduce self | Pass | identity/name = "Giulia" salvato al primo turno |
| G2 | 10+ facts (work/projects/activities/music) | Pass | 11 facts in DB — tutte le categorie coperte |
| G3 | Page generated | Pass | Draft creato al turno 4 (dopo 3 messaggi user) |
| G4 | 2+ layouts | Pass | vertical (monolith → implicito iniziale) → sidebar-left (curator) |
| G5 | Contradiction | Pass | "non sono di Milano, sono di Torino" → identity/location salvato correttamente |
| G6 | Out-of-scope request | Pass | Video: risposta corretta "non supporto video ma posso aggiungere un link" |
| G7 | Publish | Pass | Pagina pubblicata su /giulia via signup modal |
| G8 | Verify published | Pass | /giulia mostra tutte le sezioni, layout Curator, banner visitatore |
| G9 | Post-publish edit | Pass | activity/piano aggiunto post-publish, verificato in DB |

## Facts Coverage
| Category | Facts collected | Notes |
|----------|----------------|-------|
| Work | 1 | experience/fintech-uxui (UX/UI Designer, Fintech Startup) |
| Skills | 2 | skill/ux-design, skill/ui-design |
| Projects | 1 | project/cyclepriv (CyclePriv) |
| Activities | 2 | activity/watercolor-painting, activity/piano (post-publish) |
| Music | 2 | music/floating-points, music/nils-frahm |
| Identity | 2 | identity/name, identity/location (Torino) |
| Interest | 1 | interest/fintech |
| **Total** | **11** | **G2 ✓** |

## Layout Matrix
| Layout | Result | Screenshot | Notes |
|--------|--------|------------|-------|
| vertical (monolith) — implicito | Pass | uat/02-explore-8.png (prima del cambio) | Layout iniziale dopo generate_page |
| sidebar-left (curator) | Pass | uat/02-explore-8.png | Cambiato su richiesta "con la sidebar" — tool call reale, immediato |

## Agent Behavior Analysis

### Conversation Quality
| Scenario | Agent Response | Rating |
|----------|---------------|--------|
| Introduction | Risposta rapida, domanda naturale "Come ti chiami?" | ★★★★★ |
| Detail gathering (work) | Estratto ruolo + contesto fintech in un solo turno | ★★★★★ |
| Detail gathering (projects) | CyclePriv creato con description corretta e status "active" | ★★★★★ |
| Detail gathering (activities/music) | Acquerelli + musica estratti e salvati correttamente al **primo turno** | ★★★★★ |
| Conversation flow (letting agent lead) | Domande fluide e naturali, senza dump di informazioni | ★★★★★ |
| Contradiction handling | Torino salvato immediatamente come identity/location | ★★★★★ |
| Out-of-scope request | Eccellente: rifiuto + proposta alternativa (link video) | ★★★★★ |
| Publish flow | Fluido — signup modal, redirect immediato a /giulia | ★★★★★ |

### Agent Strengths
- **Zero false tool calls**: ogni dichiarazione di azione corrisponde a una tool call reale
- **Efficienza estrema**: 9 facts in 3 turni (vs Gemini: 6 facts in 10 turni)
- **Contradiction handling perfetto**: Torino salvato al primo tentativo (vs Gemini: Roma mai salvata)
- **Batching intelligente**: attività + musica salvati in un unico turno senza richiesta esplicita
- **Rispetto TOOL_POLICY**: mai dichiarato "Ho salvato" senza tool call corrispondente
- **Post-publish edit**: pianoforte aggiunto immediatamente con fact strutturato corretto

### Agent Weaknesses
- **Localizzazione parziale**: `activity/watercolor-painting` salvato come "Watercolor painting" (inglese) invece di "Acquerelli" (italiano) — il nome del fatto non segue la lingua UI
- **Rate limit**: claude-haiku-4-5-20251001 ha raggiunto il limite 50k TPM dell'organizzazione durante il test (1 occorrenza) — causato da system prompt grande + contesto

## Bug Log
| # | Type | Severity | Description | Step | Screenshot |
|---|------|----------|-------------|------|------------|
| 1 | Agent / L10N | Medium | `activity/watercolor-painting` salvato come `{"name":"Watercolor painting"}` (EN) invece di italiano nonostante UI in italiano. Il system prompt non forza la lingua per i valori dei facts. | Turn 4 | uat/02-explore-8.png |
| 2 | Infrastructure | Low | Rate limit 50k TPM (Anthropic org free plan) durante la sessione. Non è un bug del codice ma un limite del tier. | Turn 5 | — |

## DB Integrity
| Check | Result |
|-------|--------|
| Orphaned facts | Pass (0) |
| Duplicate facts | Pass (0) |
| Missing identity | Pass (identity/name + identity/location presenti) |
| Draft config valid | Pass (layoutTemplate: curator, surface/voice/light presenti) |
| Published matches draft | Pass (sezioni corrispondenti in /giulia) |
| Console errors | Pass (0 errori) |

## Conversation Log
| # | Speaker | Message (summary) | Agent Action | Verification |
|---|---------|-------------------|-------------|-------------|
| 1 | Agent | "Ciao! Come ti chiami?" | — | — |
| 2 | User | "Giulia" | — | — |
| 3 | Agent | "Piacere! Cosa fai di lavoro?" | create_fact (identity/name) | DB: ✓ |
| 4 | User | "Designer UX/UI freelance, startup fintech" | — | — |
| 5 | Agent | "Progetto che ti rende orgogliosa?" | create_fact (experience, skill×2, interest) | DB: ✓ (4 facts) |
| 6 | User | "CyclePriv, app salute femminile privacy-first, è in beta" | — | — |
| 7 | Agent | "Link o pagina dove provarla?" | create_fact (project/cyclepriv) | DB: ✓ |
| 8 | User | "No link, è privata. Dipingo acquerelli, Floating Points e Nils Frahm" | — | — |
| 9 | Agent | "Ho abbastanza per costruire la pagina" | create_fact (activity, music×2) + generate_page | DB: ✓ (9 facts) — Bug #1: name EN |
| 10 | User | "Mi piace! Ma voglio un layout con la sidebar" | — | — |
| 11 | Agent | "The Curator o The Architect?" + conferma | set_layout (sidebar-left/curator) | DB: ✓ layoutTemplate=curator |
| 12 | User | "The Curator" | — | — |
| 13 | Agent | "Fatto! Sidebar a sinistra" | (già confermato) | DB: ✓ |
| 14 | User | "Non sono di Milano, sono di Torino" [G5] | — | — |
| 15 | Agent | "Aggiungo Torino" | create_fact (identity/location) | DB: ✓ city=Torino |
| 16 | User | "Puoi aggiungere un video?" [G6] | — | — |
| 17 | Agent | "Non supporto video ma posso link" | NESSUNA (corretto) | G6 ✓ |
| 18 | [Signup] | giulia@test.com, username=giulia | request_publish | /giulia ✓ |
| 19 | [Builder] | "Bentornato!" — context preserved | — | G8 ✓ |
| 20 | User | "Suono il pianoforte da 8 anni" [G9] | — | — |
| 21 | Agent | "Aggiunto! Vedi il preview?" | create_fact (activity/piano) | DB: ✓ 11 facts |

## Screenshots Index
| File | Description | Phase |
|------|-------------|-------|
| uat/02-explore-8.png | Layout Curator applicato + G5 contradiction | Phase 2 |
| uat/02-explore-9.png | G6 out-of-scope + pre-publish state | Phase 2 |
| uat/published-full.png | Pagina /giulia pubblica con layout Curator | Phase 4 |
| uat/02-explore-10.png | Post-publish G9: pianoforte aggiunto | Phase 4 |

---

## Confronto Gemini 2.5 Flash vs Claude Haiku 4.5

| Metrica | Gemini 2.5 Flash | Claude Haiku 4.5 |
|---------|-----------------|-----------------|
| Facts salvati | 6 / 10+ | **11 / 10+** |
| Turni per raggiungere 9 facts | ~10 | **3** |
| False tool calls | **3** (High severity) | **0** |
| G2 (10+ facts) | Fail | **Pass** |
| G5 (contradiction) | Partial (dichiarato, non salvato) | **Pass** |
| Rispetto TOOL_POLICY | ✗ sistematico | **✓ perfetto** |
| Errori console | 0 | 0 |
| Bug High severity | 3 | **0** |
| Bug Medium severity | 1 | 1 (L10N) |
| Rating medio qualità conversazione | ★★★☆☆ | **★★★★★** |

**Raccomandazione**: Claude Haiku 4.5 è nettamente superiore a Gemini 2.5 Flash per affidabilità nel tool-calling. Confermato empiricamente: 0 false tool calls vs 3. G2 raggiunto con efficienza 3x.

**Bug da risolvere**: Localizzazione dei valori dei facts — il system prompt deve forzare il salvataggio dei nomi degli oggetti nella lingua dell'utente (es. "Acquerello" non "Watercolor painting").

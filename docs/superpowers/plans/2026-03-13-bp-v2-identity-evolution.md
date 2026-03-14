# Business Plan v2 — Identity Evolution Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite OpenSelf Business Plan to integrate progressive digital identity certification as a vision alongside the existing B2C AI coach product, targeting Pre-Seed 3.0 Lazio Innova (EUR 145K grant).

**Architecture:** BP v2 is a single-track B2C plan (AI coach + personal page) with a Vision & Strategic Direction section showing identity evolution as post-Series A direction. All B2B revenue, L4 AI trust scores, and "Accedi con OpenSelf" API are removed from the operational plan. Financial model rewritten for Pre-Seed 3.0 (18-month project, EUR 145K grant).

**Inputs:**
- Design spec: `docs/plans/2026-03-13-bp-v2-identity-evolution-design.md`
- BP v1: `docs/BUSINESS_PLAN_PER_GRANT_FONDI/OPENSELF_BUSINESS_PLAN_COMPLETO.md`
- Output: `docs/BUSINESS_PLAN_PER_GRANT_FONDI/OPENSELF_BUSINESS_PLAN_V2.md`

**Language:** Italian (same as BP v1). Technical terms in English where standard (e.g., "local-first", "AI coach").

---

## Chunk 1: Setup + Executive Summary + Problem & Market

### Task 1: Create BP v2 file with header and table of contents

**Files:**
- Create: `docs/BUSINESS_PLAN_PER_GRANT_FONDI/OPENSELF_BUSINESS_PLAN_V2.md`
- Reference: `docs/BUSINESS_PLAN_PER_GRANT_FONDI/OPENSELF_BUSINESS_PLAN_COMPLETO.md:1-32`

- [ ] **Step 1: Create file with YAML frontmatter and TOC**

Write the file header. Changes from v1:
- Subtitle: add "Identità Professionale Digitale" to subtitle
- Same 10-section structure, but Section 9 title becomes "Analisi dei Rischi, Mitigazioni e Direzione Strategica"

```markdown
---
title: "PIANO D'IMPRESA — OPENSELF v2"
subtitle: "Piattaforma di Identità Professionale Digitale — Domanda Pre-Seed 3.0 Lazio Innova"
author: "Tommaso Maria Rinversi"
date: "Marzo 2026"
classification: "Documento riservato"
---

# PIANO D'IMPRESA — OPENSELF v2

**Piattaforma di Identità Professionale Digitale — Domanda Pre-Seed 3.0 Lazio Innova**

*Fondatore: Tommaso Maria Rinversi*
*Data: Marzo 2026*
*Sito: openself.dev*
*Documento riservato*

---

## Indice

1. [Executive Summary](#1-executive-summary)
2. [Il Problema e l'Opportunità di Mercato](#2-il-problema-e-lopportunità-di-mercato)
3. [La Soluzione](#3-la-soluzione)
4. [Innovatività del Progetto](#4-innovatività-del-progetto)
5. [Il Team e le Competenze](#5-il-team-e-le-competenze)
6. [Strategia di Accesso al Mercato e Trazione](#6-strategia-di-accesso-al-mercato-e-trazione)
7. [Modello di Business e Piano Finanziario](#7-modello-di-business-e-piano-finanziario)
8. [Roadmap Tecnica e Piano Operativo](#8-roadmap-tecnica-e-piano-operativo)
9. [Analisi dei Rischi, Mitigazioni e Direzione Strategica](#9-analisi-dei-rischi-mitigazioni-e-direzione-strategica)
10. [Impatto e Conclusioni](#10-impatto-e-conclusioni)

---
```

- [ ] **Step 2: Verify file created**

Run: `wc -l docs/BUSINESS_PLAN_PER_GRANT_FONDI/OPENSELF_BUSINESS_PLAN_V2.md`

---

### Task 2: Write Section 1 — Executive Summary

**Files:**
- Modify: `docs/BUSINESS_PLAN_PER_GRANT_FONDI/OPENSELF_BUSINESS_PLAN_V2.md`
- Reference: `docs/BUSINESS_PLAN_PER_GRANT_FONDI/OPENSELF_BUSINESS_PLAN_COMPLETO.md:35-67` (v1 Executive Summary)

**Key changes from v1:**

1. **Il problema** — rewrite. v1 focuses only on fragmented professional presence. v2 adds: professionals can't prove their credibility digitally (bank account opening, rental, freelancer trust gap). Reference Mooney/Intesa conversation as market signal. Keep statistics (78% recruiter, 54% rejection).

2. **La soluzione** — rewrite opening. v1 says "trasforma una conversazione di cinque minuti in una pagina professionale vivente". v2 says: "OpenSelf è una piattaforma di identità professionale digitale che trasforma una conversazione in una pagina professionale vivente e un profilo progressivamente verificato." Add L1+L2 verification as user feature. Keep all technical details (4-tier memory, 5 connectors, Presence System, etc). Add Verified Portfolio concept (badges, PDF dossier).

3. **L'opportunità di mercato** — keep TAM EUR 5B, SAM EUR 1.2B. Update SOM to 5,000 registered users, 400 paying, ~EUR 27K ARR by Year 3 (was 1,500 / EUR 120K by Year 5). Position EUR 120K+ ARR as Year 5+ aspiration in the vision section, not as a 3-year target. Keep macro-trends. Add one line about trust deficit and identity verification as future market opportunity (vision, not TAM claim).

4. **Trazione attuale** — update numbers: 3,077 tests (was 3,000+), 287 files, 35 migrations (was 36 — check actual), 14 identity matchers for fact clustering. Keep the "empiricamente dimostra" thesis about AI-augmented solo founder.

5. **Modello di business** — rewrite. v1 has 4 tiers (Free/Founding Pro EUR 2.99/Pro EUR 5.99/Pro+ Coach EUR 14.99). v2 has 3 tiers:
   - Free: page + 2 connectors + limited chat
   - Pro EUR 4.99/month: all connectors, full memory, custom domain, worker, content curation
   - Portfolio+ EUR 9.99/month: verified badges, PDF dossier, priority curation
   Remove Founding Pro (too complex for evaluators). Move Pro+ Coach to roadmap vision.

6. **Il fondatore** — keep unchanged from v1. Add one sentence: "Ha avviato un dialogo con il creatore di Mooney (oggi in Intesa Sanpaolo) che ha confermato la domanda di mercato per soluzioni di identità digitale verificata nel settore bancario."

7. **La richiesta** — REWRITE for Pre-Seed 3.0 Lazio Innova. v1 targets Smart&Start. v2: "Si richiede il contributo a fondo perduto Pre-Seed 3.0 di Lazio Innova (EUR 145.000) per l'esecuzione del piano a 18 mesi, con l'obiettivo di raggiungere 1.250 utenti registrati e 100 utenti paganti entro il diciottesimo mese (Pro + Portfolio+), avviare l'espansione europea (8 lingue già operative), e posizionare OpenSelf come piattaforma leader in Europa per l'identità professionale digitale." (Note: 100 paying users at M18 = midpoint of Y1→Y2 linear ramp (35→140 Pro, 5→20 Portfolio+), consistent with KPI table M+18 = 87+12 = 99 ≈ 100.)

8. **La visione** — rewrite. v1 says "infrastruttura dell'identità personale nell'era dell'AI" with Identity API and Agent Network. v2: keep the spirit but reframe. The vision is: conversation-driven professional identity → progressive verification → certified digital identity. But the operational plan is consumer-only. Add: "L'evoluzione verso la certificazione dell'identità digitale — integrando credenziali istituzionali (SPID, CIE) e dati finanziari (Open Banking) tramite partner certificati — è la direzione strategica post-Series A, validata dal dialogo con operatori del settore bancario."

- [ ] **Step 1: Write "Il problema" subsection**

Adapt v1:35-39. Add credibility/trust gap problem. Reference Mooney conversation.

- [ ] **Step 2: Write "La soluzione" subsection**

Adapt v1:43. Add L1+L2 verification and Verified Portfolio concept.

- [ ] **Step 3: Write "L'opportunità di mercato" subsection**

Keep TAM/SAM. Update SOM to 5,000 registered, 400 paying, ~EUR 27K ARR by Year 3. Position higher ARR as Year 5+ aspiration.

- [ ] **Step 4: Write "Trazione attuale" subsection**

Update numbers from codebase. Keep AI-augmented founder thesis.

- [ ] **Step 5: Write "Modello di business" subsection**

3 tiers: Free / Pro EUR 4.99 / Portfolio+ EUR 9.99. No Founding Pro, no Pro+ Coach.

- [ ] **Step 6: Write "Il fondatore" subsection**

Keep v1. Add Mooney/Intesa connection.

- [ ] **Step 7: Write "La richiesta" subsection**

Rewrite for Pre-Seed 3.0 Lazio Innova (EUR 145K, 18 months).

- [ ] **Step 8: Write "La visione" subsection**

Reframe: identity evolution as strategic direction, not operational plan.

- [ ] **Step 9: Review section coherence**

Read the full section. Verify: no B2B revenue claims, no L3/L4 in operational plan, Pre-Seed 3.0 framing consistent, Mooney reference is "validation signal" not "partnership".

---

### Task 3: Write Section 2 — Il Problema e l'Opportunità di Mercato

**Files:**
- Modify: `docs/BUSINESS_PLAN_PER_GRANT_FONDI/OPENSELF_BUSINESS_PLAN_V2.md`
- Reference: `docs/BUSINESS_PLAN_PER_GRANT_FONDI/OPENSELF_BUSINESS_PLAN_COMPLETO.md:71-184` (v1 Section 2)

**Key changes from v1:**

1. **2.1 Il problema** — EXPAND. v1 has only Problem A (fragmented identity). v2 adds:
   - **Problema B: il deficit di fiducia nell'economia dei lavori indipendenti.** Freelancers can't prove credibility to banks, landlords, clients. EUR 5.8B/year digital fraud in EU banking. Bank account opening for freelancers requires excessive documentation. Gig workers have no portable professional reputation. Reference: the Mooney creator confirmed this is a massive pain point in banking.
   - Keep Problem A text from v1 (fragmentation, staticness, inadequacy) largely unchanged.

2. **2.2 Macro-trend** — keep all 4 from v1. ADD:
   - **Trend 5 — Il deficit di fiducia nell'economia digitale.** Digital fraud costs EUR 5.8B/year in EU banking alone. 67% of banks report rising fraud (EBA report). eIDAS 2.0 and EUDI Wallet are government responses to this systemic trust deficit. The market is moving toward verified digital identity — OpenSelf is positioned to evolve naturally in this direction. (Framed as market context, NOT as TAM claim.)

3. **2.3 Dimensione del mercato** — keep TAM EUR 5B, SAM EUR 1.2B. Update SOM scenarios (consistent with financial model ramp):
   - Pessimistic: 2,500 registered, 200 paying (175 Pro + 25 Portfolio+), run-rate ARR ~EUR 13.5K (Year 3)
   - Base: 5,000 registered, 400 paying (350 Pro + 50 Portfolio+), run-rate ARR ~EUR 27K (Year 3)
   - Optimistic: 10,000 registered, 800 paying (700 Pro + 100 Portfolio+), run-rate ARR ~EUR 54K (Year 3)
   - Bottom-up validation: 2M relevant Italian partite IVA × 0.25% reachable in 3 years = 5,000 × 8% conversion = 400 paying × blended EUR 67/year = ~EUR 27K. Consistent with base scenario.
   - Position EUR 120K+ ARR as a Year 5 aspiration (with European expansion and Pro+ Coach tier), not a 3-year target.

4. **2.4 Segmenti di clientela** — keep Segments A-C from v1. ADD:
   - **Segmento D — Professionisti con necessità di credibilità verificata.** International freelancers, gig workers, professionals in career transition who need to prove competence and reliability to banks, landlords, or new clients. This segment values verified professional dossiers and badges.

5. **2.5 Perché l'Italia** — keep all 5 reasons from v1 unchanged.

6. **2.6 Panorama competitivo** — keep existing table. ADD column "Credibilità verificata": all competitors = "No". OpenSelf = "L1+L2 (conversazione + connettori), evoluzione L3 pianificata". ADD row for identity-adjacent services (SPID, CIE) with note: "Autenticazione, non rappresentazione professionale."

- [ ] **Step 1: Write 2.1 — keep Problem A, add Problem B (trust deficit)**

Keep v1:73-81 (Problem A). Add Problem B with fraud statistics and Mooney reference.

- [ ] **Step 2: Write 2.2 — keep 4 trends, add Trend 5**

Copy v1:83-99 (Trends 1-4). Add Trend 5 (trust deficit in digital economy).

- [ ] **Step 3: Write 2.3 — update SOM scenarios**

Keep TAM/SAM. Recalculate 3 SOM scenarios for new pricing. Update bottom-up validation.

- [ ] **Step 4: Write 2.4 — keep segments A-C, add segment D**

Copy v1:119-145 (Segments A-C). Add Segment D (credibility-needing professionals).

- [ ] **Step 5: Write 2.5 and 2.6 — adapt from v1**

Keep 2.5 unchanged. Update 2.6 competitive table with credibility column.

- [ ] **Step 6: Review section — verify no TAM inflation**

Verify: TAM stays EUR 5B, no KYC market claim, trust deficit is context not TAM, SOM numbers coherent with pricing.

---

## Chunk 2: Solution + Innovation + Team + GTM

### Task 4: Write Section 3 — La Soluzione

**Files:**
- Modify: `docs/BUSINESS_PLAN_PER_GRANT_FONDI/OPENSELF_BUSINESS_PLAN_V2.md`
- Reference: `docs/BUSINESS_PLAN_PER_GRANT_FONDI/OPENSELF_BUSINESS_PLAN_COMPLETO.md:187-262` (v1 Section 3)

**Key changes from v1:**

1. **3.1 Panoramica** — adapt v1:189-193. Change "piattaforma SaaS che genera, mantiene e aggiorna autonomamente la pagina professionale" to include "e costruisce progressivamente un profilo professionale verificato".

2. **3.2 Architettura funzionale** — keep 3.2.1-3.2.4 from v1 unchanged (memory, connectors, Presence System, worker). These are the product's core and remain valid.

3. **3.3 Caso d'uso: Marco** — adapt v1:227-237. Add a new step at the end:
   - **Mese 6 — Credibilità professionale.** Marco deve aprire un conto bancario dedicato alla sua attività freelance. Il suo profilo OpenSelf mostra badge "GitHub Verificato" e "Pubblicazioni Verificate" (L2). Genera un dossier professionale PDF dal suo profilo e lo presenta alla banca insieme alla documentazione standard. Il profilo arricchito — con storia verificata dei progetti, competenze confermate dai connettori, e pattern di attività professionale — offre alla banca un quadro più completo di quanto un estratto conto e una dichiarazione dei redditi possano fornire. Marco non ha bisogno di un intermediario: controlla i propri dati e decide cosa condividere.

4. **3.4 Piani e pricing** — REWRITE completely.

| | **Free** | **Pro** | **Portfolio+** |
|--|----------|---------|----------------|
| **Prezzo** | EUR 0/mese | EUR 4,99/mese o EUR 49,99/anno | EUR 9,99/mese o EUR 99,99/anno |
| **Disponibilità** | Sempre | Generale | Generale |
| Conversazione AI | Inclusa (limiti mensili) | Illimitata | Illimitata |
| Connettori | 2 | Tutti (5+) | Tutti (5+) |
| Memoria | Tier 1-2 | Tier 1-4 completa | Tier 1-4 completa |
| Dominio custom | — | Incluso | Incluso |
| Worker autonomo | — | Incluso | Incluso |
| Content Curation | — | Inclusa | Inclusa + prioritaria |
| Badge verificati (L2) | — | — | Inclusi |
| Dossier professionale PDF | — | — | Incluso |

5. **3.5 Privacy** — keep from v1 unchanged.

6. **ADD 3.6: Arricchimento progressivo del profilo** — NEW subsection.

Describe L1 and L2 verification levels as user features (NOT identity infrastructure):

| Livello | Fonte | Esempio | Stato |
|---------|-------|---------|-------|
| **L1 — Auto-dichiarato** | Conversazione con l'agente AI | "Sono un consulente data analytics con 8 anni di esperienza" | Operativo |
| **L2 — Verificato da connettori** | GitHub, LinkedIn, RSS, Spotify, Strava | Repository attivi confermano competenze dichiarate; pubblicazioni verificano expertise | Operativo |

"L'arricchimento progressivo è trasparente: l'utente non compila form di verifica. Semplicemente collegando i propri account professionali e parlando con l'agente, il profilo accumula evidenze verificabili. Il Fact Clustering con 14 identity matcher categoriali unifica automaticamente le informazioni da fonti diverse — ad esempio, 'Python' menzionato in conversazione e presente nei repository GitHub diventa un singolo fatto verificato da due fonti indipendenti."

7. **ADD 3.7: Dossier professionale verificato** — NEW subsection.

"Il livello Portfolio+ introduce la possibilità di generare un dossier professionale verificato: un documento PDF che aggrega le informazioni del profilo con indicazione delle fonti di verifica per ciascun dato. Il dossier è controllato dall'utente: sceglie quali informazioni includere, genera il documento, e lo condivide direttamente con banche, clienti o datori di lavoro. OpenSelf non agisce da intermediario né da garante — fornisce lo strumento per aggregare e presentare le proprie credenziali in modo strutturato e verificabile."

8. **ADD 3.8: Architettura local-first come vantaggio competitivo** — NEW subsection.

"L'architettura local-first di OpenSelf — basata su SQLite con un file per identità — non è un compromesso tecnico: è una scelta architetturale precisa che allinea l'infrastruttura ai principi del prodotto:
- **1 file = 1 identità**: backup, export e portabilità dei dati sono operazioni banali (copia di un file)
- **Zero configurazione, zero server database**: riduce i costi operativi e i punti di vulnerabilità
- **Performance ottimale per single-user**: nessun overhead di concorrenza multi-tenant
- **Allineamento con la filosofia privacy-first**: i dati dell'utente sono fisicamente isolati

Il layer di astrazione (Drizzle ORM) garantisce portabilità futura verso PostgreSQL senza riscrittura della business logic. La migrazione — se necessaria per scenari di scala post-Series A — è un refactoring metodico del layer di persistenza, non una ricostruzione dell'architettura."

- [ ] **Step 1: Write 3.1 panoramica (adapted)**
- [ ] **Step 2: Copy 3.2 architettura funzionale from v1 (unchanged)**
- [ ] **Step 3: Write 3.3 caso d'uso Marco (add credibility step)**
- [ ] **Step 4: Write 3.4 pricing table (3 tiers)**
- [ ] **Step 5: Copy 3.5 privacy from v1 (unchanged)**
- [ ] **Step 6: Write NEW 3.6 arricchimento progressivo del profilo**
- [ ] **Step 7: Write NEW 3.7 dossier professionale verificato**
- [ ] **Step 8: Write NEW 3.8 architettura local-first**
- [ ] **Step 9: Review section coherence**

Verify: no L3/L4 claims in operational product, dossier is user-controlled (not brokered), SQLite framed as strength, pricing consistent with financial model.

---

### Task 5: Write Section 4 — Innovatività del Progetto

**Files:**
- Modify: `docs/BUSINESS_PLAN_PER_GRANT_FONDI/OPENSELF_BUSINESS_PLAN_V2.md`
- Reference: `docs/BUSINESS_PLAN_PER_GRANT_FONDI/OPENSELF_BUSINESS_PLAN_COMPLETO.md:265-371` (v1 Section 4)

**Key changes from v1:**

1. **4.1 Natura dell'innovazione** — adapt v1:267-271. Add: "dalla pagina come presentazione alla pagina come credenziale professionale progressivamente verificata."

2. **4.2 Innovations 1-9** — keep ALL from v1 unchanged. Update test count (3,077) and migration count if needed. These innovations are the product's core and all remain valid.

3. **ADD Innovation 10 — Arricchimento progressivo dell'identità professionale.** L1 (auto-dichiarato via conversazione) + L2 (verificato da connettori). Il Fact Clustering unifica le informazioni da fonti multiple in cluster di identità con priorità per sorgente. Nessun competitor offre un meccanismo conversazionale per la costruzione progressiva dell'identità professionale con verifica multi-sorgente automatica.

4. **ADD Innovation 11 — Dossier professionale verificato.** Generazione di documento PDF strutturato con indicazione delle fonti di verifica per ciascun dato. L'utente controlla quali informazioni includere e con chi condividere. A differenza dei CV tradizionali (auto-dichiarati, non verificabili), il dossier OpenSelf collega ogni dato alla sua fonte (GitHub per i progetti, LinkedIn per le esperienze, conversazione per le competenze dichiarate).

5. **4.3 Tabella competitiva** — keep v1 table. ADD column:

| Dimensione tecnica | LinkedIn | Linktree / About.me | Wix / Squarespace | **OpenSelf** |
|---|---|---|---|---|
| ... (existing) | ... | ... | ... | ... |
| Credibilità verificata | Auto-dichiarato | No | No | **L1+L2 con 14 matcher, dossier PDF** |

6. **4.4 Difendibilità** — keep v1 largely unchanged. Add one point: "5. **Evoluzione naturale verso la certificazione.** L'architettura a livelli (L1→L2→L3 futuro) posiziona OpenSelf per un'evoluzione naturale verso la certificazione dell'identità digitale, integrando credenziali istituzionali (SPID, CIE, Open Banking) tramite partner certificati quando il mercato e le risorse lo consentiranno."

- [ ] **Step 1: Write 4.1 (adapted) and copy 4.2 innovations 1-9 from v1**
- [ ] **Step 2: Write Innovation 10 (progressive profile enrichment)**
- [ ] **Step 3: Write Innovation 11 (verified professional dossier)**
- [ ] **Step 4: Update 4.3 competitive table (add credibility column)**
- [ ] **Step 5: Update 4.4 defensibility (add L1→L2→L3 evolution point)**
- [ ] **Step 6: Review — verify innovations are factual, not aspirational**

---

### Task 6: Write Section 5 — Il Team e le Competenze

**Files:**
- Modify: `docs/BUSINESS_PLAN_PER_GRANT_FONDI/OPENSELF_BUSINESS_PLAN_V2.md`
- Reference: `docs/BUSINESS_PLAN_PER_GRANT_FONDI/OPENSELF_BUSINESS_PLAN_COMPLETO.md:375-486` (v1 Section 5)

**Key changes from v1:**

1. **5.1 Il fondatore** — keep all from v1. ADD after "Competenze tecniche rilevanti":
   - "La competenza finanziaria del fondatore è direttamente rilevante per l'evoluzione strategica di OpenSelf verso l'identità professionale verificata: oltre 7,5 anni in CDP — Cassa Depositi e Prestiti (il principale istituto nazionale di promozione italiano) forniscono una comprensione diretta delle dinamiche del settore bancario-finanziario, dei requisiti di compliance, e delle esigenze di verifica dell'identità."

2. **ADD 5.1.x: Validazione di mercato** — NEW subsection after founder bio.
   - "Il fondatore ha avviato un dialogo con il creatore di Mooney (oggi in Intesa Sanpaolo), che ha confermato che la frode nella creazione di conti bancari è un problema attuale e significativo nel settore. Questo confronto ha validato l'intuizione che i profili professionali arricchiti di OpenSelf possano evolvere naturalmente verso credenziali di identità digitale verificata — una direzione strategica che il prodotto è già architetturalmente predisposto a supportare."

3. **5.4 Consiglio consultivo** — add: "Consigliere compliance/identità: esperto di regolamentazione eIDAS, GDPR e identità digitale, per guidare l'evoluzione strategica verso la certificazione (post-Series A)."

4. **5.2, 5.3, 5.5, 5.6** — keep unchanged from v1.

- [ ] **Step 1: Copy Section 5 from v1 with minimal adaptations**
- [ ] **Step 2: Add CDP relevance paragraph**
- [ ] **Step 3: Add Mooney/Intesa market validation subsection**
- [ ] **Step 4: Add compliance/identity advisor to advisory board**
- [ ] **Step 5: Review — Mooney reference is "validation signal" not "partnership"**

---

### Task 7: Write Section 6 — Strategia di Accesso al Mercato e Trazione

**Files:**
- Modify: `docs/BUSINESS_PLAN_PER_GRANT_FONDI/OPENSELF_BUSINESS_PLAN_V2.md`
- Reference: `docs/BUSINESS_PLAN_PER_GRANT_FONDI/OPENSELF_BUSINESS_PLAN_COMPLETO.md:488-576` (v1 Section 6)

**Key changes from v1:**

1. **6.1 Strategia** — keep Phases 0-2. Price references: change EUR 9/mese to EUR 4.99/mese throughout. Add one sentence to Phase 1: "Il posizionamento verticale per professionisti con necessità di credibilità verificata (apertura conti bancari, affitti, candidature) è un differenziatore chiave rispetto ai page builder generalisti."

2. **6.2-6.3** — keep largely unchanged. Update pricing references.

3. **6.4 Beta plan** — update: "pagheresti EUR 4,99/mese per questo?" (was EUR 9/mese). Update advancement criteria: keep NPS >= 30 and retention >= 35%. Change "almeno 20 utenti su 50 dichiarano intenzione esplicita di pagare EUR 9/mese" → "almeno 15 utenti su 50 dichiarano intenzione esplicita di pagare EUR 4,99/mese".

4. **6.5 Lancio** — update referral cost: "il mese gratuito per chi invita costa circa EUR 0,05 in LLM" (was EUR 0,07). Change "EUR 9 di mancato ricavo" → "EUR 4,99".

5. **6.6 Metriche e funnel** — update conversion target table for new pricing. Free→Pro stays 7%. Pro→Portfolio+ add row (15% of Pro users).

6. **6.7 Trazione** — update test count and features.

7. REMOVE any references to Identity API, B2B channels, or enterprise sales.

- [ ] **Step 1: Adapt Section 6 from v1 — pricing references, vertical positioning**
- [ ] **Step 2: Update beta plan advancement criteria**
- [ ] **Step 3: Update metrics table**
- [ ] **Step 4: Remove B2B/Identity API references**
- [ ] **Step 5: Review — no B2B GTM, pricing consistent**

---

## Chunk 3: Financial Model + Roadmap

### Task 8: Write Section 7 — Modello di Business e Piano Finanziario

**Files:**
- Modify: `docs/BUSINESS_PLAN_PER_GRANT_FONDI/OPENSELF_BUSINESS_PLAN_V2.md`
- Reference: `docs/BUSINESS_PLAN_PER_GRANT_FONDI/OPENSELF_BUSINESS_PLAN_COMPLETO.md:579-765` (v1 Section 7)

**CRITICAL: This section is MOSTLY REWRITTEN for Pre-Seed 3.0 Lazio Innova (EUR 145K grant, 18-month project). NOT Smart&Start.**

**Key changes from v1:**

1. **7.1 Strategia di pricing** — rewrite. v1 justified low pricing (EUR 2.99 Founding). v2 justifies EUR 4.99 as the primary price point:
   - EUR 4.99/month is positioned between Carrd Pro (EUR 1.58) and Linktree Pro (EUR 5-22)
   - The Portfolio+ tier (EUR 9.99) adds verified badges and dossier — a clear value step-up
   - Remove Founding Pro tier entirely (complexity without benefit for evaluators)
   - Remove Pro+ Coach (moved to roadmap Phase 4)

New pricing table:

| Livello | Prezzo | Cosa sblocca | Destinatario |
|---------|--------|-------------|--------------|
| Free | EUR 0 | Onboarding AI, generazione pagina, 2 connettori | Chiunque voglia provare |
| Pro | EUR 4,99/mese o EUR 49,99/anno | Worker autonomo, tutti i connettori, memoria completa, dominio custom, content curation | Professionisti che vogliono una pagina vivente |
| Portfolio+ | EUR 9,99/mese o EUR 99,99/anno | Badge verificati (L2), dossier professionale PDF, curation prioritaria | Professionisti che necessitano di credibilità verificata |

2. **7.2 Economia unitaria** — recalculate for new pricing:

| Livello | Prezzo mensile | Costo variabile / MAU | Margine lordo | LTV 12 mesi |
|---------|---------------|----------------------|---------------|-------------|
| Pro (mensile) | EUR 4,99 | EUR 0,46 | EUR 4,53 (91%) | ~EUR 43 |
| Pro (annuale, effettivo) | EUR 4,17 | EUR 0,46 | EUR 3,71 (89%) | ~EUR 37 |
| Portfolio+ (mensile) | EUR 9,99 | EUR 0,60 | EUR 9,39 (94%) | ~EUR 94 |
| Portfolio+ (annuale, eff.) | EUR 8,33 | EUR 0,60 | EUR 7,73 (93%) | ~EUR 77 |

3. **7.3 Modello di costo LLM** — keep v1 operation-by-operation table. Add Portfolio+ row: slightly higher cost for dossier generation (~EUR 0.14/dossier, estimated 1x/month).

4. **7.4 Proiezioni economico-finanziarie** — REWRITE ENTIRELY for Pre-Seed 3.0.

The Pre-Seed 3.0 grant is a 18-month project (not 3-year like Smart&Start). The EUR 145K is a contributo a fondo perduto (grant, not loan). The financial model covers 18 months of operation.

However, include Year 2 and Year 3 projections for context (shows sustainability path).

**Revenue derivation methodology:** Pro tier launches at M4 (post-beta). Users ramp linearly from 0 to end-of-year target. Revenue = average paying users × monthly price × months active. Formulas use full monthly price (EUR 4.99/EUR 9.99) as conservative baseline — annual billing discounts (EUR 49.99/EUR 99.99 per year) reduce effective revenue slightly but are offset by improved retention. The annual option is a retention tool, not a revenue driver.

- **Year 1 (M1-M12):** Pro launches M4. Linear ramp 0→35 Pro over 9 months (avg 17.5), Portfolio+ from M7 0→5 (avg 2.5 over 6 months). Pro revenue: 17.5 × EUR 4.99 × 9 = EUR 786. Portfolio+: 2.5 × EUR 9.99 × 6 = EUR 150. **Total: ~EUR 936.**
- **Year 2 (M13-M24):** Ramp 35→140 Pro (avg 87.5), 5→20 Portfolio+ (avg 12.5). Full 12 months. Pro: 87.5 × 4.99 × 12 = EUR 5,240. Portfolio+: 12.5 × 9.99 × 12 = EUR 1,499. **Total: ~EUR 6,739.**
- **Year 3 (M25-M36):** Ramp 140→350 Pro (avg 245), 20→50 Portfolio+ (avg 35). Pro: 245 × 4.99 × 12 = EUR 14,671. Portfolio+: 35 × 9.99 × 12 = EUR 4,196. **Total: ~EUR 18,867.**
- **Year 3 run-rate ARR (end of year):** 350 × 4.99 × 12 + 50 × 9.99 × 12 = EUR 20,958 + EUR 5,994 = **~EUR 27K ARR.**

| RICAVO / VOCE DI COSTO | Anno 1 (M1-M12) | Anno 2 (M13-M24) | Anno 3 (M25-M36) |
|---|---|---|---|
| **UTENTI PAGANTI (fine anno)** | | | |
| Pro | 35 | 140 | 350 |
| Portfolio+ | 5 | 20 | 50 |
| **TOTALE RICAVI ANNUI** | **~EUR 936** | **~EUR 6.739** | **~EUR 18.867** |
| **COSTI VARIABILI** | | | |
| LLM — utenti gratuiti (MAU ~100/400/1000) | EUR 252 | EUR 1.008 | EUR 2.520 |
| LLM — utenti Pro (MAU) | EUR 193 | EUR 773 | EUR 1.932 |
| LLM — utenti Portfolio+ (MAU) | EUR 36 | EUR 144 | EUR 360 |
| Infrastruttura Hetzner | EUR 120 | EUR 300 | EUR 600 |
| Strumenti SaaS (monitoraggio, CDN, email) | EUR 180 | EUR 300 | EUR 480 |
| **TOTALE COSTI VARIABILI** | **EUR 781** | **EUR 2.525** | **EUR 5.892** |
| **MARGINE LORDO** | **EUR 155 (17%)** | **EUR 4.214 (63%)** | **EUR 12.975 (69%)** |
| **COSTI FISSI** | | | |
| Compenso amministratore CEO | EUR 18.000 | EUR 21.600 | EUR 24.000 |
| Contributi INPS Gestione Separata (24%) | EUR 4.320 | EUR 5.184 | EUR 5.760 |
| Collaboratore tecnico | EUR 0 | EUR 12.000 | EUR 24.000 |
| Legale / Commercialista | EUR 3.000 | EUR 4.000 | EUR 5.000 |
| Strumenti AI per sviluppo | EUR 1.560 | EUR 1.560 | EUR 1.560 |
| Dominio openself.dev | EUR 30 | EUR 30 | EUR 30 |
| Diritto camerale CCIAA + tassa gov. | EUR 510 | EUR 510 | EUR 510 |
| Registrazione marchio EUIPO | EUR 900 | EUR 0 | EUR 0 |
| Costituzione SRLS | EUR 800 | EUR 0 | EUR 0 |
| Consulenza privacy/conformità | EUR 1.500 | EUR 0 | EUR 0 |
| Attrezzatura di sviluppo (PC) | EUR 2.500 | EUR 0 | EUR 0 |
| Marketing e contenuti | EUR 600 | EUR 2.400 | EUR 4.800 |
| Commissioni di pagamento (Stripe) | EUR 70 | EUR 300 | EUR 700 |
| **TOTALE COSTI FISSI** | **EUR 33.790** | **EUR 47.584** | **EUR 66.360** |
| **EBIT** | **-EUR 33.635** | **-EUR 43.370** | **-EUR 53.385** |

5. **7.5 Piano di utilizzo del contributo Pre-Seed 3.0** — REWRITE. Replace Smart&Start section.

Pre-Seed 3.0 key parameters:
- Contributo a fondo perduto (grant, not loan): up to EUR 145.000
- 18-month project timeline
- Requires EUR 10K external investment for 2x multiplier (EUR 145K vs EUR 100K)
- Eligible expenses: personnel, consultancy, equipment, marketing, cloud/SaaS, legal

Map 18-month expenses to Pre-Seed 3.0 eligible categories:

| Categoria di spesa Pre-Seed 3.0 | M1-M9 | M10-M18 | Totale 18 mesi |
|---|---|---|---|
| Personale — Compenso amministratore CEO | EUR 13.500 | EUR 13.500 | EUR 27.000 |
| Contributi INPS (24%) | EUR 3.240 | EUR 3.240 | EUR 6.480 |
| Personale — Collaboratore tecnico (da M10) | EUR 0 | EUR 9.000 | EUR 9.000 |
| Consulenza legale / commercialista | EUR 2.250 | EUR 2.250 | EUR 4.500 |
| Consulenza privacy/conformità | EUR 1.500 | EUR 0 | EUR 1.500 |
| Tecnologie e licenze (LLM API + SaaS + AI dev tools) | EUR 1.305 | EUR 1.305 | EUR 2.610 |
| Infrastruttura cloud (Hetzner) | EUR 90 | EUR 180 | EUR 270 |
| Attrezzatura sviluppo (PC) | EUR 2.500 | EUR 0 | EUR 2.500 |
| Costituzione SRLS + PEC + firma digitale | EUR 800 | EUR 0 | EUR 800 |
| Registrazione marchio EUIPO | EUR 900 | EUR 0 | EUR 900 |
| Diritto camerale + tassa gov. (18 mesi) | EUR 383 | EUR 383 | EUR 765 |
| Marketing e contenuti | EUR 450 | EUR 1.350 | EUR 1.800 |
| Commissioni di pagamento (Stripe) | EUR 35 | EUR 105 | EUR 140 |
| Dominio | EUR 23 | EUR 23 | EUR 45 |
| **TOTALE** | **EUR 26.975** | **EUR 31.335** | **EUR 58.310** |

**Scope clarification:** The financial model has TWO views:
- **18-month project view** (Pre-Seed 3.0 scope): expenses EUR 58.310 covered by grant. This is what Lazio Innova evaluates.
- **3-year sustainability view** (shows path to break-even): Year 1-3 projections show the business can reach sustainability. Years 2-3 expenses beyond the 18-month grant are covered by revenue + founder capital.

**Grant allocation:** EUR 58.310 expenses against EUR 145K ceiling (with EUR 10K angel for 2x multiplier). Remaining EUR 86.690 is buffer for: unexpected compliance costs, team expansion if traction exceeds targets, extended marketing spend. Without angel: EUR 100K ceiling, still covers the EUR 58.310 base plan.

**Cash flow with grant:**

| Periodo | Ricavi | Costi | Deficit | Contributo Pre-Seed 3.0 | Saldo |
|---|---|---|---|---|---|
| M1-M9 (beta+lancio) | ~EUR 0 | EUR 26.975 | -EUR 26.975 | +EUR 26.975 | EUR 0 |
| M10-M18 (crescita) | ~EUR 700 | EUR 31.335 | -EUR 30.635 | +EUR 30.635 | EUR 0 |
| **Totale 18 mesi** | **~EUR 700** | **EUR 58.310** | **-EUR 57.610** | **+EUR 57.610** | **EUR 0** |
| M19-M36 (post-grant) | ~EUR 20.000 | ~EUR 55.000 | -EUR 35.000 | — | Fondatore + ricavi |

6. **7.6 Infrastruttura** — adapt v1:680-691. Remove "migrazione SQLite→PostgreSQL consigliata a ~200 MAU" — per the challenge conclusion, SQLite is the right choice for Phase 1-2. Replace with: "L'architettura SQLite one-file-per-identity è adeguata fino a migliaia di utenti attivi. La migrazione a PostgreSQL, se necessaria per scenari di scala post-Series A, è un refactoring metodico del layer di persistenza (Drizzle ORM) senza riscrittura della business logic."

7. **7.7 Analisi del punto di pareggio** — recalculate with explicit cost base:
   - **Cost base:** Year 3 monthly operating costs = EUR 66.360 / 12 = **EUR 5.530/month** (from: CEO EUR 2.000 + INPS EUR 480 + collaboratore EUR 2.000 + legale EUR 417 + AI tools EUR 130 + marketing EUR 400 + Stripe EUR 58 + CCIAA EUR 43 + infra/SaaS EUR 2)
   - **Average contribution margin per paying user** (mix 350 Pro + 50 Portfolio+ = 87.5% Pro, 12.5% Portfolio+): weighted avg revenue EUR 5.62/month - weighted avg variable cost EUR 0.48/month = **EUR 5.14/month**
   - **Break-even:** EUR 5.530 / EUR 5.14 = **~1.076 paying users** — targeted post-Year 3 with European expansion and Pro+ Coach tier introduction. The base scenario projects 400 paying users at M+36; break-even requires continued growth beyond the 3-year plan, achievable with EU expansion (8 languages ready) and higher-ARPU tiers.
   - Note: break-even calculation uses Year 3 steady-state costs. During grant period (M1-M18), deficit covered by Pre-Seed 3.0. Post-grant (M19-M36), deficit covered by founder capital + growing revenue. The path to 1,076 users is the Year 4-5 trajectory.

8. **7.8 Analisi di sensibilità** — update for 3 scenarios with new pricing.

9. REMOVE: 7.6 Smart&Start section entirely. REMOVE: Pro+ Coach economics (moved to roadmap vision).

- [ ] **Step 1: Write 7.1 pricing strategy (EUR 4.99 / EUR 9.99)**
- [ ] **Step 2: Write 7.2 unit economics (recalculated)**
- [ ] **Step 3: Copy 7.3 LLM cost model from v1 (add Portfolio+ row)**
- [ ] **Step 4: Write 7.4 financial projections (3-year, Pre-Seed 3.0 framing)**
- [ ] **Step 5: Write 7.5 Pre-Seed 3.0 budget allocation (18 months)**
- [ ] **Step 6: Write 7.6 infrastructure (SQLite as strength)**
- [ ] **Step 7: Write 7.7 break-even analysis (recalculated)**
- [ ] **Step 8: Write 7.8 sensitivity analysis (3 scenarios)**
- [ ] **Step 9: CRITICAL review — numbers internally consistent**

Verify: unit economics × user counts = revenue projections. Break-even coherent with cost structure. Pre-Seed 3.0 budget ≤ EUR 145K. No B2B revenue lines. SQLite framed as advantage.

---

### Task 9: Write Section 8 — Roadmap Tecnica e Piano Operativo

**Files:**
- Modify: `docs/BUSINESS_PLAN_PER_GRANT_FONDI/OPENSELF_BUSINESS_PLAN_V2.md`
- Reference: `docs/BUSINESS_PLAN_PER_GRANT_FONDI/OPENSELF_BUSINESS_PLAN_COMPLETO.md:769-829` (v1 Section 8)

**Key changes from v1:**

1. **8.1 Stato attuale** — update from v1:776-783. Numbers: 3,077 tests, 287 files, 35 migrations, 25 agent tools, 5 connectors, 8 languages, 14 identity matchers, episodic memory with Dream Cycle, Content Curation, Fact Clustering. Add: "L1 (auto-dichiarato) e L2 (verificato da connettori) sono già operativi."

2. **8.2 Roadmap** — COMPRESS. v1 has 6 phases over 5 years. v2 has 4 phases (3 operational + 1 vision):

| Fase | Periodo | Obiettivo | Traguardi chiave |
|------|---------|-----------|-----------------|
| **Fase 0** | M1-M3 | Validazione: 50 utenti beta | 50 beta attivi; NPS ≥ 30; fidelizzazione ≥ 35%; ottimizzazione costi LLM; iterazione UX |
| **Fase 1** | M4-M9 | Lancio pubblico, primi paganti | 500 registrati, 35 Pro, 5 Portfolio+; lancio Product Hunt; programma referral; connettori aggiuntivi on-demand |
| **Fase 2** | M10-M18 | Crescita Italia, team | 1.250 registrati, ~100 paganti (87 Pro, 12 Portfolio+); primo collaboratore tecnico; Verified Portfolio tier completo; API pubblica per integrazioni |
| **Fase 3** | M19-M24 | Espansione EU, consolidamento | 2.000 registrati, 140 Pro, 20 Portfolio+; team di 3; espansione FR/DE/ES (8 lingue pronte); crescita verso pareggio operativo |

ADD **Direzione strategica (post-Serie A)**:
"Le fasi successive — evoluzione dell'agente in AI Career Coach proattivo (EUR 14.99/mese), integrazione di credenziali istituzionali (SPID, CIE, Open Banking) tramite partner certificati, e sviluppo dell'Identity API per integrazioni B2B — rappresentano la direzione strategica post-Series A. L'architettura attuale è predisposta per questa evoluzione: i quattro livelli di memoria, il Fact Clustering multi-sorgente, e il sistema di verifica L1+L2 costituiscono le fondamenta tecniche su cui costruire livelli di certificazione superiori."

3. **8.3 Piano operativo e team** — keep v1 reference to Section 5.3. Update milestones for new pricing.

4. **8.4 Infrastruttura** — adapt from v1. Remove PostgreSQL migration references. Add SQLite-as-strength narrative per Section 3.8.

5. **8.5 KPI** — update table:

| KPI | M+3 | M+9 | M+18 | M+24 | M+36 |
|-----|-----|-----|------|------|------|
| Utenti registrati | 50 | 500 | 1.250 | 2.000 | 5.000 |
| Utenti paganti (Pro) | 0 | 35 | 87 | 140 | 350 |
| Utenti paganti (Portfolio+) | 0 | 5 | 12 | 20 | 50 |
| MRR | EUR 0 | EUR 224 | EUR 554 | EUR 899 | EUR 2.246 |
| ARR | EUR 0 | EUR 2.688 | EUR 6.648 | EUR 10.788 | EUR 26.952 |
| Conversione free→Pro | N/A | 7% | 7% | 7% | 7% |
| Conversione Pro→Portfolio+ | N/A | 15% | 15% | 15% | 15% |
| NPS | ≥ 30 | ≥ 40 | ≥ 45 | ≥ 50 | ≥ 50 |
| Team (ETP) | 1 | 1 | 2 | 3 | 3-5 |

REMOVE: Identity API, B2B API, Agent Network from roadmap. These appear ONLY in the strategic direction paragraph.

- [ ] **Step 1: Write 8.1 current state (updated numbers)**
- [ ] **Step 2: Write 8.2 roadmap (4 phases + strategic direction)**
- [ ] **Step 3: Adapt 8.3-8.4 from v1 (remove Postgres migration)**
- [ ] **Step 4: Write 8.5 KPI table (with Portfolio+ row)**
- [ ] **Step 5: Review — roadmap phases coherent with financial model, no B2B phases**

---

## Chunk 4: Risks/Vision + Impact

### Task 10: Write Section 9 — Analisi dei Rischi, Mitigazioni e Direzione Strategica

**Files:**
- Modify: `docs/BUSINESS_PLAN_PER_GRANT_FONDI/OPENSELF_BUSINESS_PLAN_V2.md`
- Reference: `docs/BUSINESS_PLAN_PER_GRANT_FONDI/OPENSELF_BUSINESS_PLAN_COMPLETO.md:831-901` (v1 Section 9)

**Key changes from v1:**

1. **9.1 Mappa dei rischi** — keep from v1 with updates:
   - Keep: solo founder (ALTO), PMF (ALTO), competition (MEDIO), LLM costs (MEDIO), AI dev dependency (MEDIO), employer authorization (MEDIO), agent reliability (BASSO), AI Act (BASSO), financial (BASSO)
   - ADD: "Pressione competitiva sul pricing" (MEDIO) — free alternatives (Carrd, Linktree free tier), risk that EUR 4.99 is perceived as too high for Italian freelancers. Mitigation: genuinely useful free tier as hook, coach value demonstrated through use, Portfolio+ value clear (verified dossier)
   - REMOVE: any identity/regulatory risks (eIDAS, PSD2, AISP) since we're not doing identity infrastructure
   - UPDATE AI Act risk text: remove "rischio limitato" nuance and keep the classification as is, since no identity layer changes the risk profile

2. **9.2 Piano di contingenza** — keep Scenarios A-D from v1. Update pricing references (EUR 4.99 not EUR 9). ADD:
   - **Scenario E — Il livello Portfolio+ non trova domanda.** I badge verificati e il dossier PDF non generano conversioni sufficienti. Risposta: il tier Pro a EUR 4.99 sostiene il modello anche senza Portfolio+. Il dossier viene incluso nel tier Pro come feature, non come upsell. Il pricing rimane sostenibile.

3. **9.3 SWOT** — update:
   - Strengths: ADD "Architettura predisposta per evoluzione verso identità verificata (L1+L2 operativi)"
   - Opportunities: ADD "Deficit di fiducia nella gig economy crea domanda per credibilità verificata"
   - Threats: REMOVE "Identity API competitors", ADD "Pressione al ribasso sul pricing da alternative gratuite"

4. **9.4 Conformità e proprietà intellettuale** — KEEP from v1 (GDPR, AI Act classification, AGPL-3.0 dual licensing, DPA obligations). These are still fully relevant. Only remove references to eIDAS provider certification and PSD2/AISP licensing (identity-certification-specific regulatory requirements that no longer apply since we're not doing identity infrastructure). Keep AI Act "rischio limitato" classification, GDPR compliance, and IP notes unchanged.

5. **ADD 9.5: Direzione Strategica — L'evoluzione verso l'identità digitale certificata** — NEW section.

This is the vision section that shows evaluators where OpenSelf goes, without committing Pre-Seed resources:

"L'architettura di OpenSelf è predisposta per un'evoluzione naturale verso la certificazione dell'identità digitale professionale. I livelli L1 (auto-dichiarato) e L2 (verificato da connettori) sono già operativi. I livelli successivi rappresentano la direzione strategica post-Series A:

**L3 — Verificato da fonti istituzionali.** Integrazione di credenziali SPID/CIE per la verifica dell'identità anagrafica e di dati finanziari tramite Open Banking (via partner certificati come Tink o Plaid) per la verifica della capacità economica. OpenSelf non diventa un identity provider: consuma credenziali istituzionali come input per arricchire il profilo dell'utente.

**Posizionamento rispetto a eIDAS 2.0 e EUDI Wallet.** L'EUDI Wallet, in fase di implementazione da parte dei governi EU (2026-2027), fornirà a ogni cittadino un portafoglio di identità digitale legalmente vincolante. OpenSelf non compete con l'EUDI Wallet: lo complementa. L'EUDI Wallet certifica *chi sei* (nome, data di nascita, cittadinanza). OpenSelf certifica *cosa sai fare* (competenze, esperienze, pubblicazioni, attività verificate). La convergenza naturale è che OpenSelf consumi le credenziali EUDI come input L3 per il profilo professionale — aggiungendo contesto e narrativa a dati anagrafici altrimenti asettici.

**Validazione di mercato.** Il dialogo avviato con il creatore di Mooney (oggi in Intesa Sanpaolo) ha confermato che la frode nella creazione di conti bancari è un problema attuale e significativo. I profili professionali arricchiti e progressivamente verificati di OpenSelf rispondono a un bisogno reale del settore bancario e finanziario: ridurre il costo del KYC (attualmente EUR 50-200 per cliente) fornendo un quadro professionale pre-verificato.

**Perché non ora.** L'evoluzione verso L3 richiede risorse che un Pre-Seed non può coprire: compliance (DPO, DPIA estesa, accordi con identity provider certificati), partnership con provider Open Banking (costi di licenza EUR 10-20K), e un volume di utenti sufficiente a rendere l'integrazione economicamente sostenibile. Queste sono attività post-Series A, non pre-seed. Il piano attuale costruisce le fondamenta tecniche e la base utenti necessarie per rendere questa evoluzione possibile."

- [ ] **Step 1: Adapt 9.1 risk map (add pricing risk, remove identity/regulatory risks)**
- [ ] **Step 2: Add Scenario E to contingency plans**
- [ ] **Step 3: Update SWOT**
- [ ] **Step 4: Adapt 9.4 compliance (remove eIDAS/PSD2)**
- [ ] **Step 5: Write NEW 9.5 strategic direction (identity evolution vision)**
- [ ] **Step 6: Review — vision is compelling but clearly post-Series A, no commitments**

---

### Task 11: Write Section 10 — Impatto e Conclusioni

**Files:**
- Modify: `docs/BUSINESS_PLAN_PER_GRANT_FONDI/OPENSELF_BUSINESS_PLAN_V2.md`
- Reference: `docs/BUSINESS_PLAN_PER_GRANT_FONDI/OPENSELF_BUSINESS_PLAN_COMPLETO.md:904-963` (v1 Section 10)

**Key changes from v1:**

1. **10.1 Impatto economico e sociale** — keep v1 largely unchanged. ADD:
   - "**Inclusione finanziaria.** L'evoluzione verso il dossier professionale verificato apre la strada all'inclusione finanziaria dei lavoratori indipendenti. I freelancer e i gig worker oggi faticano ad accedere al credito bancario perché mancano gli strumenti per dimostrare la propria affidabilità professionale in modo strutturato. Il dossier verificato di OpenSelf — che aggrega competenze, pubblicazioni, attività verificate dai connettori — è un primo passo concreto verso la riduzione di questa asimmetria informativa."

2. **10.2 Impatto ecosistema** — keep v1 unchanged.

3. **10.3 Sostenibilità** — update numbers for new pricing. Keep structure.

4. **10.4 Perché finanziare OpenSelf** — REWRITE for Pre-Seed 3.0 context. Key changes:
   - Point 1: keep "il prodotto esiste"
   - Point 2: keep "efficienza di capitale"
   - Point 3: keep "tempistica di mercato"
   - Point 4: keep "vantaggio competitivo europeo"
   - Point 5: update break-even for new pricing
   - ADD Point 6: "**Direzione strategica con fondamenta solide.** OpenSelf non si limita al personal branding: ha una direzione strategica chiara verso l'identità professionale digitale certificata. I livelli L1+L2 sono già operativi, l'architettura è predisposta per l'evoluzione verso L3, e il dialogo con operatori del settore bancario ha validato la domanda di mercato. Il finanziamento Pre-Seed serve a costruire la base utenti e la trazione necessarie per rendere questa evoluzione possibile nel round successivo."

5. **10.5 Conclusione** — adapt v1:955-963. Change framing:
   - v1 ends with "infrastruttura dell'identità personale nell'era dell'AI" and mentions Identity API/Agent Network
   - v2 ends with: the immediate ask is funding to bring a working product to market (beta → launch → growth). The longer vision is that these enriched professional profiles become the foundation for verified digital identity. The architecture is ready. The market demand is validated. The product is live.

- [ ] **Step 1: Adapt 10.1 (add financial inclusion paragraph)**
- [ ] **Step 2: Copy 10.2 from v1 (unchanged)**
- [ ] **Step 3: Update 10.3 sustainability numbers**
- [ ] **Step 4: Rewrite 10.4 "Perché finanziare" for Pre-Seed 3.0**
- [ ] **Step 5: Rewrite 10.5 conclusion (immediate ask + long vision)**
- [ ] **Step 6: Final review — read entire BP v2 end-to-end**

Verify: consistent pricing throughout (EUR 4.99/EUR 9.99), no B2B revenue, no L3/L4 in operational plan, Pre-Seed 3.0 framing, SQLite as strength, Mooney as validation signal, vision section compelling but clearly post-Series A.

---

## Chunk 5: Final Review

### Task 12: End-to-end consistency review

- [ ] **Step 1: Search for pricing inconsistencies**

Grep for "2,99", "5,99", "14,99", "Smart&Start", "Identity API", "Agent Network", "Accedi con OpenSelf", "L3", "L4", "B2B" — these should NOT appear in operational sections. "L3", "L4", "B2B" should only appear in Section 9.5 (strategic direction) and contextual references.

- [ ] **Step 2: Verify financial model internal consistency**

Check: unit economics × user counts = revenue projections in all tables. Break-even number coherent with cost structure. Pre-Seed 3.0 budget totals correct.

- [ ] **Step 3: Verify SOM numbers consistent across sections**

Section 1 (Executive Summary), Section 2 (Market), Section 7 (Financial Model), Section 8 (Roadmap KPIs) must all show the same user/revenue targets.

- [ ] **Step 4: Commit**

```bash
git add docs/BUSINESS_PLAN_PER_GRANT_FONDI/OPENSELF_BUSINESS_PLAN_V2.md
git commit -m "docs: add Business Plan v2 — identity evolution (Pre-Seed 3.0 Lazio Innova)"
```

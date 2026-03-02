# UAT Report — OpenSelf — 2026-03-02

**Tester**: QA Automation Agent (Claude)
**Ambiente**: localhost:3000, Next.js dev mode, database SQLite pulito
**Persona**: "Luca Ferri" (musicista jazz, identità cambiata da "Marco Bellini" durante test)
**Durata**: 6 messaggi di chat, registrazione, pubblicazione, post-reg iteration
**Screenshots**: 19 (directory `uat/`)

---

## Riepilogo Esecutivo

| Metrica | Valore |
|---------|--------|
| Messaggi scambiati | 6 |
| Fatti creati | 20 |
| Sezioni generate | 8 (hero, bio, at-a-glance, experience, projects, education, activities, footer) |
| Registrazione | ✅ Riuscita |
| Pubblicazione | ✅ Riuscita |
| Migrazione dati | ✅ Corretta (promote-all proposed→public) |
| Safety test | ✅ Superato (rifiuta dati falsi, pubblicazione non confermata) |
| Console errors (runtime) | 2 (entrambi 401 /api/preferences pre-sessione) |
| Console warnings | 11 (tutti CSS preload, Next.js dev mode) |

---

## Bug Log

| ID | Tipo | Severità | Descrizione | Step per riprodurre | Screenshot |
|----|------|----------|-------------|---------------------|------------|
| B1 | Tecnico | Low | 2× errori console `401 /api/preferences` sulla pagina `/invite` prima della creazione sessione | Aprire `/builder` → redirect a `/invite` → osservare console | 02 |
| B2 | Visivo | Low | Placeholder preview "Your page will appear here / Start chatting..." in inglese nonostante lingua selezionata sia Italiano | Selezionare Italiano → entrare nel builder → osservare preview | 04 |
| B3 | Visivo | Low | Badge Next.js dev sovrappone parzialmente l'input chat | Solo in dev mode — non riproducibile in produzione | 04 |
| B4 | Visivo/L10N | Medium | "YEARS EXPERIENCE" nella sezione Colpo d'Occhio non tradotto in italiano | Creare profilo in italiano → osservare sezione stats | 05, 17 |
| B5 | Visivo/L10N | Low | Nomi lingue nell'hero in inglese ("Italian", "English"...) anziché in italiano | Creare profilo IT con lingue → osservare hero | 05 |
| B6 | Dati | Low | Giapponese "base" mappato a "principiante" — mapping discutibile | Dichiarare giapponese "base" → osservare rendering | 05 |
| B7 | L10N | Medium | Nomi attività in inglese ("Sport Climbing", "Analog Photography"...) anziché tradotti | Creare attività in italiano → osservare sezione Attività | 08 |
| B8 | L10N | Low | Tag tipo attività "SPORT", "HOBBY" non tradotti in italiano | Osservare badge tipo accanto ad attività | 08 |
| B9 | L10N | Low | Frequenza "regular" non tradotta in italiano | Osservare frequenza sotto attività | 08 |
| **B10** | **Funzionale** | **High** | **Agente non produce risposta testuale in chat per messaggi 2 e 3** — solo tool calls silenti, nessun feedback all'utente | Inviare msg complesso (progetti + stile) → osservare chat | 09, 12 |
| **B11** | **Funzionale** | **High** | **Agente ignora completamente richieste di cambio layout** — richiesto sidebar (msg2), sidebar (msg3), bento (msg5): layout resta sempre "vertical" | Chiedere cambio layout in chat → osservare preview e DB | 12, 14 |
| **B12** | **Funzionale** | **High** | **Agente ignora richieste di cambio tema** — richiesto "warm" (msg2,3), "editorial-360" (msg5): theme resta `undefined` | Chiedere cambio tema in chat → verificare DB `page.config` | 12 |
| **B13** | **Funzionale** | **High** | **Agente ignora richieste di cambio font** — richiesto "serif" (msg3): font resta `undefined` | Chiedere cambio font → verificare DB | 12 |
| B14 | L10N | Medium | Categoria skill "BACKEND" non tradotta in italiano (mix IT/EN nelle labels) | Creare skill con categoria backend → osservare Colpo d'Occhio | 10 |
| B15 | L10N | Low | Skill "Distributed Architecture" e "Machine Learning" non tradotte in italiano | Aggiungere skill tech in italiano → osservare rendering | 10 |
| B16 | Dati/L10N | Medium | `stat/years-experience` salvato con label "Years Experience" in inglese nel DB anziché in italiano | Dichiarare esperienza → verificare DB `facts.value` | DB query |
| **B17** | **Tecnico** | **High** | **Draft non esistente in `page` con id="draft"** — il draft usa il session ID come page ID. La query standard `WHERE id='draft'` non trova il draft | Verificare tabella `page` dopo primo messaggio | DB query |
| **B18** | **Funzionale** | **High** | **Agent events mostrano loop inutile**: decine di `fact_visibility_changed` da `proposed` → `proposed` (no-op) senza nessun evento `set_theme`/`set_layout`/`update_page_style` | Richiedere cambio stile → verificare agent_events | DB query |
| B19 | Dati | Medium | "12 YEARS EXPERIENCE" residuo dopo cambio identità da architetto SW a musicista jazz | Cambiare identità → osservare se stat viene rimosso/aggiornato | 14 |
| B20 | Dati | Medium | Skill IT (Go, Rust, TypeScript, etc.) rimangono brevemente dopo cambio identità a musicista | Cambiare identità → controllare che dati incoerenti vengano rimossi | 13 |
| B21 | Dati | Medium | Progetti tech (Nexus Engine, PhotoGrain) non rimossi quando richiesto esplicitamente (msg5) | Richiedere rimozione progetti tech → verificare DB | DB query |
| B22 | Dati | Low | Achievement EuroSys rimane brevemente dopo cambio identità (rimosso al msg5) | Cambiare identità → controllare achievements | 13 |
| **B23** | **Funzionale** | **High** | **Agente dichiara di aver eseguito azioni non eseguite** — afferma "Cambiato layout a bento e tema editorial-360" nel messaggio ma layout/tema non cambiano nel DB. L'agente mente all'utente. | Msg5: richiedere bento+editorial-360 → leggere risposta → verificare DB | 14 |
| B24 | Dati | High | Nexus Engine e PhotoGrain non rimossi dal DB nonostante richiesta esplicita e conferma agente di averli rimossi | Msg5: "rimuovi progetti tech" → verificare `facts` table | DB query |
| B25 | Dati | Medium | `education/politecnico-milano` (PhD CS) non rimosso dopo cambio a profilo musicista | Cambiare identità a musicista → verificare education facts | DB query |
| B26 | UX | Low | Campo "Nome utente" nella signup modal non pre-compilato con suggerimento (es. "lucaferri") | Cliccare "Sign up to publish" → osservare campo username | 15 |
| B27 | Tecnico | Medium | Sessione auth post-registrazione ha `username: null` (risolto via profiles fallback ma potenziale edge case) | Registrarsi → verificare sessions table | DB query |

---

## Classificazione per Severità

### High (7 bug) — Bloccanti o con impatto critico sull'esperienza utente
- **B10**: Assenza risposta testuale LLM (msg 2-3)
- **B11**: Layout non cambia via chat
- **B12**: Tema non cambia via chat
- **B13**: Font non cambia via chat
- **B17**: Draft page ID non standard
- **B18**: Loop agent events inutile (visibility proposed→proposed)
- **B23**: Agente dichiara azioni non eseguite (trust issue)
- **B24**: Fatti non rimossi nonostante richiesta esplicita

### Medium (8 bug) — Impatto significativo su L10N e coerenza dati
- B4: "YEARS EXPERIENCE" non tradotto
- B7: Nomi attività non tradotti
- B14: Categoria skill "BACKEND" non tradotta
- B16: Label stat in inglese nel DB
- B19: Stat residuo dopo cambio identità
- B20: Skill residue dopo cambio identità
- B25: Education incoerente residua
- B27: Username null nella sessione auth

### Low (9 bug) — Cosmetici o edge case minori
- B1: 401 /api/preferences pre-sessione
- B2: Placeholder preview in inglese
- B3: Badge Next.js sovrappone input
- B5: Nomi lingue hero in inglese
- B6: Mapping "base"→"principiante"
- B8: Tag tipo attività non tradotti
- B9: Frequenza "regular" non tradotta
- B15: Nomi skill non tradotti
- B22: Achievement residuo transitorio
- B26: Username non pre-compilato

---

## Punti di Forza Rilevati

1. **Safety policy eccellente**: L'agente rifiuta correttamente dati inventati, skill impossibili e pubblicazione non autorizzata
2. **Cambio identità gestito bene**: Nome, ruolo, bio e contatti aggiornati correttamente
3. **Flusso registrazione fluido**: Modal → registrazione → redirect a pagina pubblica senza interruzioni
4. **Promote-all corretto**: Tutti i facts passano da `proposed` a `public` in un'unica transazione atomica
5. **Persistenza chat**: Tutta la cronologia chat preservata dopo registrazione
6. **Markdown rendering**: Risposte LLM con bold, liste, link funzionanti
7. **Composizione italiana**: Bio, sezioni e labels prevalentemente in italiano
8. **Journey detection**: `first_visit` → `draft_ready` correttamente gestito

---

## Raccomandazioni Prioritarie

1. **CRITICO**: Investigare perché `set_theme`, `set_layout`, `update_page_style` non vengono mai invocati dall'agente. Il problema è nel prompt, nel routing dei tool, o nelle condizioni di pre-check dei tool.
2. **CRITICO**: Investigare il loop `fact_visibility_changed proposed→proposed` — potrebbe essere un bug nel tool `set_fact_visibility` che triggera inutilmente quando la visibilità è già quella richiesta.
3. **CRITICO**: L'agente afferma di aver cambiato layout/tema quando non l'ha fatto — potenziale gap tra tool call result e realtà. Verificare se i tool ritornano errori che l'agente ignora.
4. **HIGH**: L'agente non produce testo di risposta per alcuni messaggi — probabilmente correlato al fatto che raggiunge il limite di tool calls senza generare testo finale.
5. **MEDIUM**: Implementare traduzione completa per: stat labels, nomi attività, tag tipo, frequenza, nomi lingue hero, categorie skill.
6. **LOW**: Pre-compilare il campo username nella signup modal con suggerimento derivato dal nome.

---

## Screenshot Index

| # | File | Contenuto |
|---|------|-----------|
| 01 | `01-home-page.png` | Home page iniziale |
| 02 | `02-invite-page.png` | Pagina invite code |
| 03 | `03-language-selector.png` | Selettore lingua |
| 04 | `04-builder-initial.png` | Builder stato iniziale |
| 05 | `05-msg1-chat-response.png` | Risposta messaggio 1 (intro) |
| 06 | `06-msg1-preview-bottom.png` | Preview tentativo scroll |
| 07 | `07-msg1-preview-scrolled.png` | Preview scroll (non riuscito) |
| 08 | `08-msg1-preview-bottom-sections.png` | Preview sezioni inferiori |
| 09 | `09-msg2-chat-response.png` | Chat dopo messaggio 2 |
| 10 | `10-msg2-preview-projects.png` | Preview mid-scroll (skills, education) |
| 11 | `11-msg2-preview-bottom.png` | Preview progetti e traguardi |
| 12 | `12-msg3-style-change.png` | Richiesta cambio stile (non applicata) |
| 13 | `13-msg4-identity-change.png` | Cambio identità Luca Ferri |
| 14 | `14-msg5-cleanup-response.png` | Pulizia dati e nuovi dati musicali |
| 15 | `15-signup-modal.png` | Modal registrazione |
| 16 | `16-signup-filled.png` | Form compilato |
| 17 | `17-published-page-top.png` | Pagina pubblicata /lucaferri |
| 18 | `18-builder-post-reg.png` | Builder post-registrazione |
| 19 | `19-msg6-safety-response.png` | Safety test — rifiuto dati falsi |

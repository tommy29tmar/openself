# OpenSelf 2026: Da Pagina Web a Gemello Digitale (Digital Twin)

Alla luce delle tendenze architetturali previste per il 2026, OpenSelf ha l'opportunità di evolvere da un "Living Personal Page Builder" a un ecosistema pionieristico per l'Identità Sovrana e i Gemelli Digitali.

Invece di competere sul piano puramente estetico con i classici website builder, la visione è posizionare OpenSelf come **"La prima infrastruttura Open Source per il tuo Gemello Digitale Autonomo"**. La pagina web diventerà solo l'interfaccia visiva di un'entità IA molto più potente.

Ecco le 5 direttrici strategiche (Pillars) per questa evoluzione:

## 1. Da "Pagina Pubblica" a "Gemello Digitale Interattivo"
Attualmente i visitatori si limitano a leggere la tua pagina tradotta. Nel futuro, OpenSelf sarà il tuo Agente di rappresentanza.
* **Visione:** Sulla pagina pubblica, i visitatori (es. recruiter o lead) possono "chattare" con il tuo Gemello Digitale.
* **Valore:** Il tuo agente, conoscendo i fatti (Knowledge Base), la tua `soul_profile` (tono di voce) e le memorie, può rispondere a domande specifiche per te ("Tommaso ha esperienza con Rust in produzione?"), guidare l'utente verso i progetti più rilevanti, e persino fissare appuntamenti sul tuo calendario previa qualifica del lead.

## 2. Hub di Identità Sovrana (SSI) e Verifiable Credentials
Il mercato si sta spostando verso la Decentralized Identity (es. wallet eIDAS 2.0). OpenSelf raccoglie già dati verificati (es. da GitHub o LinkedIn).
* **Visione:** OpenSelf evolve nel tuo Wallet di Identità web. Emette Verifiable Credentials (VC 2.0).
* **Valore:** Potrai dimostrare crittograficamente un'esperienza o una competenza (tramite Zero-Knowledge Proofs) senza inviare PDF o esporre dati sensibili. L'agente di un'azienda verificherà la validità direttamente con il tuo agente OpenSelf.

## 3. Connettori Attivi (Bi-direzionali) ed Esecuzione Workflow
Oggi i connettori (GitHub, LinkedIn ZIP) sono in sola lettura per popolare la pagina. Il trend è passare da assistenti passivi ad agenti esecutivi (Workflow Automation).
* **Visione:** OpenSelf diventa il centro di comando attivo della tua identità web.
* **Valore:** L'agente non solo aggiorna il DB quando finisci un progetto, ma ti propone un'azione: *"Ho aggiornato la bio con il lancio del progetto X. Vuoi che prepari e pubblichi un thread su Twitter?"*. L'heartbeat settimanale diventerà proattivo e operativo verso l'esterno.

## 4. Il Profilo come "MCP Endpoint" (Machine-to-Machine)
Il web futuro sarà popolato da interazioni Agente-verso-Agente.
* **Visione:** Oltre alla URL umana (`openself.com/tom`), fornisci un endpoint MCP (Model Context Protocol) dedicato (`mcp://openself.com/tom`).
* **Valore:** Gli agenti dei recruiter o delle aziende non faranno scraping della tua pagina. Si collegheranno al tuo endpoint MCP e negozieranno a velocità macchina ("Il profilo ha skill in TS? Sì. Accetta contratti <50k? No, rifiuto automatico") facendoti risparmiare tempo e garantendo la privacy delle tue preferenze latenti.

---

## 5. Da Gemello Digitale a Identità Verificata — OpenSelf Verified

Il Gemello Digitale descritto nei pilastri 1-4 ha un limite intrinseco: i dati sono **self-declared** o al massimo **connector-verified**. Per sbloccare il valore economico reale (sostituzione KYC, onboarding bancario, sottoscrizione servizi), serve un layer di **verifica certificata**.

### Visione

OpenSelf resta B2C. L'utente continua a chattare, collegare connettori, costruire il proprio profilo. Ma sotto, i dati acquisiscono livelli di trust crescenti:

| Trust Tier | Fonte | Esempio |
|---|---|---|
| **Self-declared** | Chat con l'agente | "Sono un freelancer" |
| **Connector-verified** | GitHub, LinkedIn, Spotify, Strava | 50 repo pubblici, 8 anni di esperienza |
| **Institutionally-verified** | SPID/CIE, Open Banking (PSD2), certificati universitari | Identità anagrafica, reddito reale, laurea |
| **Cross-referenced** | AI incrocia le fonti e rileva incongruenze | Trust score complessivo |

### Come funziona per l'utente

1. **Onboarding identico a oggi** — chatti, colleghi, il profilo si costruisce
2. **Verifica opzionale** — colleghi SPID/CIE (è un OAuth) e/o il conto corrente (via Tink/Plaid)
3. **Condivisione selettiva** — quando devi aprire un conto, iscriverti a un servizio, ecc., usi "Accedi con OpenSelf"
4. **Consent screen** — vedi esattamente cosa viene condiviso e approvi
5. **Dashboard "chi ha i miei dati"** — controllo totale su chi ha ricevuto cosa

### Valore

- **Per l'utente**: zero questionari, zero form, zero attesa. Il tuo profilo verificato viaggia con te
- **Per le aziende**: onboarding istantaneo, dati già verificati, riduzione frodi, costo KYC vicino a zero
- **Per OpenSelf**: le aziende pagano per profilo verificato ricevuto (B2B2C)

### Business Model: B2C gratuito, B2B a pagamento

```
Utente (gratis)                      Azienda (paga)
─────────────────                    ──────────────
Chatta → profilo → pagina            Integra "Accedi con OpenSelf"
Collega SPID + banca (opzionale)     Riceve profilo verificato
Controlla cosa condividere           Paga €5-20 per profilo ricevuto
Dashboard "chi ha i miei dati"       Risparmia €50-100 di KYC tradizionale
```

### Moat difendibile

1. **UX conversazionale** — Nessun wallet governativo o identity provider offre onboarding via conversazione
2. **Profilo ricco** — SPID/CIE dice chi sei. OpenSelf dice chi sei + cosa fai + quanto vali
3. **Network effect** — Più utenti verificati → più aziende integrano → più utenti vogliono OpenSelf
4. **Trust composto** — Il profilo si arricchisce nel tempo, non è un'istantanea

### Competitor e posizionamento

| Player | Cosa fa | OpenSelf Verified è diverso perché... |
|---|---|---|
| SPID / CIE / EUDI Wallet | Autenticazione governativa | Solo chi sei, non cosa fai o quanto vali |
| Plaid / Tink | Open Banking | Solo dati bancari, nessun contesto professionale/personale |
| Onfido / Jumio / Veriff | Verifica documenti | UX da form, nessun profilo ricco, B2B puro |
| Yoti | Identity wallet | Form + scan, non conversazione. Meno contesto |
| LinkedIn | Identità professionale | Non verificato, non condivisibile strutturato, platform-owned |

### Vertical di lancio: freelancer + banche italiane

Il primo use case è l'apertura conto per freelancer e partite IVA:
- Le banche non sanno valutare chi non ha busta paga tradizionale
- OpenSelf aggrega: fatturato da tool, reputazione GitHub, storia professionale, movimenti bancari
- Il contatto con Intesa Sanpaolo (tramite il creatore di Mooney) è il canale di validazione

### Roadmap tecnica (incrementale su OpenSelf esistente)

| Fase | Cosa | Dipende da |
|---|---|---|
| **Fase 1** (oggi) | Chat + connettori + digital twin come pagina | ✅ Completato |
| **Fase 2** | SPID/CIE come login (OAuth), Open Banking via Tink/Plaid | Fase 1 |
| **Fase 3** | OpenSelf come OAuth/OIDC provider, selective disclosure API, consent management | Fase 2 |
| **Fase 4** | Primo pilot B2B (banca), dashboard "chi ha i miei dati" | Fase 3 |

### Compliance necessaria

- **GDPR**: DPO, DPIA per dati finanziari, art. 9 per dati sensibili
- **eIDAS 2.0**: potenziale certificazione come trust service provider (via partner: InfoCert, Namirial)
- **PSD2**: per Open Banking, via partner certificato (Tink, Plaid, Fabrick)
- **ISO 27001 / SOC2**: per credibilità B2B (può essere via partner inizialmente)

---

## Analisi del Database: Gap da superare per il Gemello Digitale

L'attuale schema del database (`src/lib/db/schema.ts`) possiede già delle fondamenta eccellenti. Tabelle come `facts`, `agent_memory`, `conversation_summaries`, `soul_profiles`, unitamente all'infrastruttura asincrona (`jobs`, `heartbeat_runs`), forniscono già il "cervello" cognitivo dell'agente.

Tuttavia, per scalare verso i 5 pilastri del Gemello Digitale (inclusa l'Identità Verificata), lo schema dovrà evolvere integrando i "muscoli verso l'esterno", i protocolli crittografici e il layer di condivisione verificata. Ecco le evoluzioni necessarie:

### 1. Per il Gemello Interattivo (Chat Pubblica)
* **Stato Attuale:** Le tabelle `sessions` e `messages` sono strutturate per il dialogo esclusivo tra il Proprietario e l'Agente Costruttore.
* **Evoluzione:** Sarà necessario introdurre entità come **`visitor_sessions`** e **`visitor_transcripts`**. Questo permetterà di gestire le chat tra i visitatori (es. recruiter) e il Gemello Digitale senza inquinare la memoria primaria del proprietario, offrendo a quest'ultimo una dashboard per analizzare le interazioni e le richieste ricevute.

### 2. Per le Verifiable Credentials (SSI)
* **Stato Attuale:** Un "fatto" è rappresentato come un dato JSON (con una `confidence`), ma privo di valore legale/verificabile in un contesto decentralizzato.
* **Evoluzione:** 
  1. Introdurre **`did_documents`** (o `cryptographic_keys`) per gestire l'identità decentralizzata (DID) dell'utente.
  2. Creare una tabella **`verifiable_credentials`** relazionata ai `facts`, per immagazzinare le firme crittografiche degli enti emittenti e gestire le prove Zero-Knowledge (ZKP).

### 3. Per i Connettori Attivi (Esecuzione Workflow)
* **Stato Attuale:** Il sistema di proposte (`section_copy_proposals`, `soul_change_proposals`) è limitato alla modifica dei contenuti interni (la pagina web).
* **Evoluzione:** Servirà una tabella **`action_outbox`** (o `external_action_proposals`). Qualsiasi azione proattiva verso l'esterno (es. pubblicare un tweet, inviare una mail tramite connettore) dovrà transitare da questa tabella, attendere l'approvazione asincrona dell'utente (`pending` -> `approved`), per poi essere eseguita dai background worker.

### 4. Per l'MCP Endpoint (Machine-to-Machine)
* **Stato Attuale:** L'autenticazione (`auth_identities`) è progettata per l'accesso umano tramite OAuth. La visibilità dei fatti è binaria (`private`/`public`).
* **Evoluzione:** 
  1. Aggiungere tabelle per la gestione di **`mcp_clients`** o **`api_tokens`**, permettendo ad agenti IA esterni di autenticarsi in sicurezza.
  2. Evolvere la colonna `visibility` della tabella `facts` per supportare stati **`conditional`**, permettendo al Gemello di negoziare dinamicamente l'accesso a dati sensibili basandosi su logiche di autorizzazione (es. "Rivela il recapito telefonico solo se l'agente del recruiter offre un salario superiore a X").

### 5. Per l'Identità Verificata (OpenSelf Verified)
* **Stato Attuale:** I `facts` hanno `source` (user/connector/agent) e `visibility` (public/private/proposed), ma nessun livello di *trust* o *verifica istituzionale*.
* **Evoluzione:**
  1. Aggiungere **`trust_tier`** ai facts (self_declared | connector_verified | institutionally_verified | cross_referenced) — indica il livello di attendibilità del dato.
  2. Creare **`identity_verifications`** — tabella che registra le verifiche istituzionali collegate (SPID, CIE, Open Banking) con timestamp, provider, e hash crittografico della risposta.
  3. Creare **`disclosure_consents`** — registro di ogni condivisione effettuata: chi ha ricevuto cosa, quando, con quale consenso, e stato di revoca.
  4. Creare **`disclosure_requests`** — richieste in ingresso da servizi B2B: quali campi richiedono, per quale scopo (scoping), stato (pending/approved/denied/expired).
  5. Creare **`b2b_clients`** — registry di servizi/aziende autorizzati con API key, scopes permessi, e billing metadata.
  6. Estendere **`facts.visibility`** con stato `verified` — un fatto verificato istituzionalmente che può essere condiviso via selective disclosure.
  7. **`trust_score_cache`** — punteggio di affidabilità complessivo per profilo, calcolato dall'AI incrociando le fonti, con TTL e invalidation su fact mutation.

---

## 6. Il Collo di Bottiglia Architetturale: L'Economia del Motore di Calcolo (FinOps)

Se OpenSelf diventa un Digital Twin che riceve centinaia di input giornalieri tra diari (Life-Logging), chiamate asincrone e visitatori esterni, l'attuale modello centralizzato basato su quote (es. `llmUsageDaily` e `profileMessageUsage`) comporterà un'esplosione dei costi per i server OpenSelf. 

Per sostenere un'interazione continua e "chiacchierona", l'architettura d'inferenza dovrà adottare un modello **Hybrid Local-Cloud (Edge AI & BYOK)**:

### A. Triage-Router (Modelli Locali vs Cloud)
Attualmente usate il concetto di "Tiers" (standard vs fast). Il sistema dovrà evolvere introducendo il tier `local_edge` (es. Llama-3 8B via Ollama o WebGPU in-browser). 
* I task semplici e ad alto volume (come la registrazione cronologica nel diario "Oggi ho portato a spasso il cane") verranno gestiti dal dispositivo dell'utente a **Costo Zero**.
* I modelli Cloud costosi interverranno solo per compiti di ragionamento complesso (es. sintesi settimanali o decisioni strutturali sulla pagina).

### B. Architettura BYOK (Bring Your Own Key) o Pay-per-query per Visitatori
Quando gli Agenti di recruiter o aziende esterne interrogheranno il tuo Gemello Digitale (es. via Endpoint MCP), il calcolo LLM non dovrà gravare sul tuo account OpenSelf. Il protocollo dovrà richiedere un'autenticazione in cui "chi interroga paga l'inferenza", permettendo interazioni infinite a costo zero per il proprietario.

### C. Asincronicità Batch Estrema per il "Dream Cycle"
invece di attivare chiamate LLM per aggiornare le relazioni semantiche ad ogni input nel diario, i log grezzi verranno accumulati in SQLite. Un job asincrono ("Deep Heartbeat") girerà in momenti strategici (es. di notte o a fine settimana) aggregando l'intera history in un'unica, efficiente, chiamata batch LLM per aggiornare i fatti permanenti.

# OpenSelf 2026: Da Pagina Web a Gemello Digitale (Digital Twin)

Alla luce delle tendenze architetturali previste per il 2026, OpenSelf ha l'opportunità di evolvere da un "Living Personal Page Builder" a un ecosistema pionieristico per l'Identità Sovrana e i Gemelli Digitali.

Invece di competere sul piano puramente estetico con i classici website builder, la visione è posizionare OpenSelf come **"La prima infrastruttura Open Source per il tuo Gemello Digitale Autonomo"**. La pagina web diventerà solo l'interfaccia visiva di un'entità IA molto più potente.

Ecco le 4 direttrici strategiche (Pillars) per questa evoluzione:

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

## Analisi del Database: Gap da superare per il Gemello Digitale

L'attuale schema del database (`src/lib/db/schema.ts`) possiede già delle fondamenta eccellenti. Tabelle come `facts`, `agent_memory`, `conversation_summaries`, `soul_profiles`, unitamente all'infrastruttura asincrona (`jobs`, `heartbeat_runs`), forniscono già il "cervello" cognitivo dell'agente.

Tuttavia, per scalare verso i 4 pilastri del Gemello Digitale, lo schema dovrà evolvere integrando i "muscoli verso l'esterno" e i protocolli crittografici. Ecco le evoluzioni necessarie:

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

---

## 5. Il Collo di Bottiglia Architetturale: L'Economia del Motore di Calcolo (FinOps)

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

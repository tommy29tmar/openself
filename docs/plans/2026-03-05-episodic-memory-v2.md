# Implementation Plan: Episodic Memory per il Gemello Digitale — v2

**Stato:** Decisioni di prodotto finalizzate (2026-03-05)
**Basato su:** Think Tank architetturale (Claude + Gemini + Codex) — vedi `2026-03-04-episodic-memory-digital-twin.md` per il draft originale
**Obiettivo:** Dotare l'agente OpenSelf di "Memoria Episodica" (Tier 4) per trasformarlo da estrattore di profili (Profile Builder) a un Gemello Digitale (Digital Twin) capace di Life-Logging e ragionamento temporale.

---

## 1. Il Problema: La "Cecità Temporale"

L'attuale architettura eccelle nell'estrarre **Memoria Semantica** (Tier 1 — facts permanenti), ma perde la granularità temporale. Un evento ("Oggi ho corso 10km") sovrascrive lo stato senza mantenere il log storico.

Un Gemello Digitale necessita di **Memoria Episodica**: la capacità di ricordare eventi specifici posizionati su una linea temporale, rispondere a domande come "Quante volte ho corso questo mese?" e distinguere abitudini consolidate da attività occasionali.

---

## 2. Decisioni di Prodotto

### 2.1 Retention Policy
- **Durata:** 180 giorni dall'evento.
- **Comportamento alla scadenza:** **Archivio** (non cancellazione). I record scaduti vengono marcati `archived = 1` e rimossi dai risultati di ricerca normali, ma non eliminati dal DB. L'utente non perde dati.
- **Eccezione:** Gli eventi già consolidati dal Dream Cycle (vedi §2.3) possono essere archiviati prima della scadenza — una volta che il pattern è stato estratto, il singolo evento non serve più essere in prima fila.
- *Rationale: la promessa all'utente è "ti aiutiamo a capire chi sei", non "conserviamo ogni dettaglio per sempre".*

### 2.2 Tassonomia degli Action Type (ibrida)
Il sistema mantiene una **lista di default** di categorie. L'LLM può creare nuove categorie, ma solo seguendo regole esplicite.

**Lista di default (v1):**
- `workout` — attività fisica (corsa, palestra, sport)
- `meal` — pasti, cucina, food experiences
- `social` — incontri sociali, eventi con persone
- `learning` — studio, letture, corsi
- `work` — attività lavorative significative
- `travel` — spostamenti, viaggi
- `health` — visite mediche, sintomi, benessere
- `milestone` — traguardi e momenti significativi
- `casual` — tutto il resto

**Regole per la creazione di nuove categorie:**
1. Prima scegli dalla lista esistente se la categoria calza al 70%+.
2. Crea una nuova categoria solo se è **generica e riutilizzabile** (es. `creative` per attività artistiche) — non descrittiva di un singolo evento (❌ `made_risotto_for_first_time`).
3. Il nome deve essere in `snake_case`, singolare, in inglese.
4. Massimo 3 parole.

*Queste regole diventano parte del prompt del tool `record_event`.*

### 2.3 Visibilità degli eventi episodici

- Tutti gli `action_type` sono **sempre privati** — visibili solo all'agente, mai sulla pagina pubblica.
- **Eccezione: `milestone`**. Gli eventi di tipo `milestone` possono essere promossi alla pagina pubblica, ma solo tramite proposta esplicita dell'agente e conferma dell'utente (vedi §2.4 — flusso Dream Cycle).
- *Rationale: il diario è uno spazio privato. Solo i traguardi significativi, scelti consapevolmente dall'utente, diventano parte dell'identità pubblica.*

### 2.4 Correzioni e cancellazioni (append-only con `supersededBy`)

Gli eventi episodici sono immutabili. Per correggere un evento sbagliato:
- L'agente crea un **nuovo evento** con il contenuto corretto.
- Il vecchio evento viene marcato `supersededBy = <id_nuovo_evento>`.
- Tutte le query ignorano gli eventi con `supersededBy IS NOT NULL`.
- Il Dream Cycle ignora gli eventi superseded.

Per cancellare un evento (es. per privacy):
- L'agente marca l'evento `supersededBy = 'deleted'` (valore speciale).
- L'evento non appare più in nessuna query ma rimane nel DB per audit.

*Questo garantisce un audit trail completo e permette di sapere sempre cosa è stato corretto e quando.*

### 2.5 Multi-device (`device_id`)

Nessuna logica di sync oggi. Si aggiunge solo il campo `device_id` allo schema per rendere il sync possibile in futuro senza dover fare refactoring dello schema.

Il `device_id` è una stringa random generata al primo avvio dell'app su quel device e salvata in locale. Non viene esposta all'utente.

### 2.6 Soglia del Dream Cycle e flusso di promozione

Il Dream Cycle gira di notte in background. Il suo compito è identificare pattern e portarli all'attenzione dell'utente — non aggiornare il profilo autonomamente.

**Soglia per identificare un pattern:**
Un pattern viene considerato candidato solo se soddisfa **tutte e tre** le condizioni:
1. **Frequenza minima:** almeno 3 occorrenze dello stesso `action_type` negli ultimi 60 giorni *(hard-coded — evita eventi isolati)*
2. **Recency:** almeno 1 occorrenza negli ultimi 30 giorni *(evita abitudini abbandonate)*
3. **Giudizio LLM:** l'LLM valuta se il pattern ha senso come tratto identitario stabile:
   - È un'attività che l'utente fa per scelta e con intenzione? (sì: correre; no: fare la spesa)
   - È duratura o un evento puntuale? (sì: abitudine ricorrente; no: un matrimonio)
   - È abbastanza significativa da stare in un profilo pubblico?

**Flusso di promozione — dal Dream Cycle al login:**

```
[Notte] Dream Cycle identifica pattern "corsa ricorrente"
    → valida soglie → LLM approva
    → scrive proposta in pending_ops con tipo "episodic_pattern"
    → scadenza: 30 giorni

[Prossimo login utente] L'agente legge i pending_ops
    → apre la conversazione con: "Ho notato che ultimamente vai spesso a correre —
       vuoi che lo aggiunga al tuo profilo?"

[Utente dice sì]
    → agente crea fact permanente (es. hobby: running)
    → se action_type = milestone: agente propone anche aggiunta alla pagina pubblica
    → proposta marcata "confermata"

[Utente dice no]
    → proposta marcata "rifiutata", non riproposta per 90 giorni

[Proposta non vista entro 30 giorni]
    → scade silenziosamente, nessuna modifica al profilo
```

*Esempio pratico: 3 partite a calcetto a Natale non diventano mai "calciatore". Se non se ne riparla a gennaio, la proposta svanisce senza rumore.*

---

## 3. Architettura Tecnica (Roadmap in 3 Fasi)

### Fase A: Schema DB

```typescript
// -- Tier 4: Episodic Events (Life Logging)
export const episodicEvents = sqliteTable("episodic_events", {
  id: text("id").primaryKey(),
  ownerKey: text("owner_key").notNull(),
  sessionId: text("session_id").notNull(),          // provenance
  sourceMessageId: text("source_message_id"),       // provenance fine-grained
  deviceId: text("device_id"),                      // origine device (per sync futuro — §2.5)

  eventAtUnix: integer("event_at_unix").notNull(),  // ordinamento/query temporali
  eventAtHuman: text("event_at_human").notNull(),   // display ("2026-03-05T14:30:00Z")

  actionType: text("action_type").notNull(),        // dalla tassonomia §2.2
  narrativeSummary: text("narrative_summary").notNull(), // LLM-curato, mai verbatim utente
  rawInput: text("raw_input"),                      // conservato ma non re-iniettato nel prompt
  entities: text("entities", { mode: "json" }),     // ["person:Marco", "location:Parco"]

  visibility: text("visibility").default("private"), // sempre "private" tranne milestone promossi
  confidence: real("confidence").default(1.0),

  // Correzioni (§2.4): append-only, mai modifica in-place
  supersededBy: text("superseded_by"),              // id del nuovo evento corretto, o "deleted"

  archived: integer("archived").default(0),         // 0=active, 1=archiviato (dopo 180gg o post-consolidamento)
  archivedAt: text("archived_at"),

  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_episodic_owner_time").on(table.ownerKey, table.eventAtUnix),
  // FTS5 virtual table creata in migrazione SQL separata su narrative_summary
  // Query attive: sempre filtrare WHERE superseded_by IS NULL AND archived = 0
]);

// Nota: event_fact_links NON è nel MVP.
// I link episodico→semantico emergono naturalmente dal Dream Cycle quando promuove.
```

**Scelte architetturali:**
- `sqlite-vec` rinviato — dipendenza nativa binaria incompatibile con local-first. FTS5 (già in SQLite bundled di Node.js) è sufficiente per l'MVP.
- `event_fact_links` rimandato alla Fase 2 — derivabile dal Dream Cycle, non serve pre-costruire il grafo.
- `eventAtUnix` INTEGER per ordinamento efficiente; `eventAtHuman` TEXT solo per display/debug.
- `narrativeSummary` è LLM-curato (scritto dall'agente al momento di `record_event`) — non il testo grezzo dell'utente, per evitare prompt-injection se re-iniettato in futuro.

---

### Fase B: Integrazione Agente

Gli eventi episodici **non entrano nel System Prompt statico** (i 65.000 token sono già occupati). Il recupero è on-demand nel turn budget.

**Tool `record_event`:**
```
Input: action_type, event_at (human-readable, es. "ieri sera", "stamattina"), summary, entities?
Comportamento:
  - handler normalizza event_at → eventAtUnix (usando currentDate come riferimento)
  - salva in episodic_events con narrativeSummary = summary LLM-curato
Regola prompt: "usa record_event ogni volta che l'utente descrive un'azione con riferimento temporale
  passato (verbo al passato + when). Non usare create_fact per questo tipo di input."
```

**Tool `recall_episodes`:**
```
Input: timeframe ("last_7_days" | "last_30_days" | "last_60_days"), keywords?, action_type?
Comportamento:
  - query SQL + FTS5 su narrative_summary
  - max 10 risultati + aggregati (count per action_type, per periodo)
  - output compresso (non dump grezzo)
  - mai richiamare in loop — se i risultati non bastano, chiedi all'utente
```

---

### Fase C: Dream Cycle

**Job heartbeat:** `consolidate_episodes_job` (si aggiunge ai job esistenti — aggiornare `EXPECTED_HANDLER_COUNT`).

**Meccanica:**
1. Scorre gli eventi con cursore incrementale (`last_event_at_unix_processed`) — stesso pattern di `session_compaction`. Ignora eventi con `superseded_by IS NOT NULL` o `archived = 1`.
2. Per ogni `ownerKey`, aggrega eventi per `actionType` nell'ultimo periodo.
3. Applica la soglia §2.6: ≥3 occorrenze in 60gg + almeno 1 negli ultimi 30gg.
4. Chiede all'LLM di valutare se il pattern ha senso come tratto identitario (linee guida §2.6).
5. Se sì → scrive una proposta in `pending_ops` con tipo `"episodic_pattern"` e scadenza 30 giorni.
6. **Non scrive mai direttamente in `facts` o `soul_profiles`.**
7. Se la proposta scade (30 giorni senza login o risposta) → marcata `expired`, nessuna modifica al profilo.

**Al login — l'agente fa surfacing delle proposte (pattern da ADR-0014):**

Il meccanismo è identico a quello già implementato per le soul proposals (ADR-0014). Non va reinventato — va replicato.

- Il Dream Cycle scrive le proposte in `soul_change_proposals` (o una tabella analoga `episodic_pattern_proposals`).
- `assembleBootstrapPayload` aggiunge una detection post-Circuit-A: se esistono proposte episodiche attive, inietta la `Situation` `has_pending_episodic_patterns`.
- Il `pendingEpisodicPatternsDirective` (analogo a `pendingSoulProposalsDirective`) istruisce l'agente a portare il tema in modo naturale — mai come primo messaggio forzato.
- Un nuovo tool `confirm_episodic_pattern(proposalId, accept: boolean)` (analogo a `review_soul_proposal`) chiude la proposta.
- **Tutti i dati utente che passano nel prompt vanno sanificati via `sanitizeForPrompt`** (già implementato in `situations.ts`) — obbligatorio anche qui per prevenire prompt injection.
- Utente dice **sì** → agente crea il fatto permanente via `create_fact`. Se `action_type = milestone` → propone anche aggiunta alla pagina pubblica via flusso standard.
- Utente dice **no** → proposta marcata `rejected`, non riproposta per 90 giorni.

**Archivio automatico:**
- Al termine del consolidamento, marca `archived=1` gli eventi con `eventAtUnix < now - 180 giorni`.
- Gli eventi già consolidati in una proposta confermata vengono archiviati subito.

---

## 4. Scope Escluso (Non in questo Piano)

- `sqlite-vec` / embedding vettoriali — feature flag per quando FTS5 mostra limiti di recall misurabili
- `event_fact_links` — rimandato alla Fase 2 dopo validazione del MVP
- UI per visualizzare il diario episodico — fuori scope, solo agent-facing
- Condivisione/export degli eventi — fuori scope
- Sync multi-device — il campo `device_id` è nello schema, la logica di sync è fuori scope
- Notifiche push per proposte Dream Cycle — l'agente le presenta al prossimo login, non via push

---

## 5. Prerequisiti

- Session compaction worker funzionante ✅ (ADR-0013, migrazione 0026)
- Heartbeat scheduler funzionante ✅
- `propose_soul_change` funzionante ✅
- `factConflicts` system funzionante ✅
- **Chat-first proposal pattern funzionante** ✅ (ADR-0014) — `has_pending_soul_proposals` situation, `review_soul_proposal` tool, `sanitizeForPrompt`, detection post-Circuit-A in `assembleBootstrapPayload`. Il Dream Cycle per gli episodi replicerà esattamente questo pattern.
- Journey situations a 9 (inclusa `has_pending_soul_proposals`) ✅ — `has_pending_episodic_patterns` sarà la 10ª.

---

## 6. Failure Modes da Tenere a Mente

Questi rischi sono reali e vanno considerati durante l'implementazione, non dopo.

- **Misclassificazione fact vs event:** L'LLM potrebbe usare `create_fact` quando dovrebbe usare `record_event` o viceversa. Il prompt deve essere esplicito e i test di comportamento agente devono coprire questo boundary.
- **Drift temporale:** L'utente dice "martedì scorso" — l'LLM deve convertirlo in data ISO usando `currentDate` come ancora. Se l'ancora manca o è sbagliata, gli eventi finiscono nel passato sbagliato. Il tool handler deve sempre ricevere `currentDate` esplicitamente.
- **Dream Cycle che sovrascrive correzioni manuali:** Scenario: l'utente corregge "non sono più vegetariano" → il fatto viene aggiornato manualmente. Il Dream Cycle non deve mai riportarlo indietro basandosi su eventi vecchi. Regola: gli eventi precedenti alla data di correzione manuale di un fatto non devono alimentare proposte che contraddicono quel fatto.
- **Leakage di `rawInput`:** Il campo `raw_input` può contenere dati sensibili (nomi, luoghi, informazioni mediche). Non va mai re-iniettato verbatim nel prompt. Solo `narrative_summary` (LLM-curato) può circolare nel contesto agente.
- **Prompt injection via testo evento:** Quando `narrative_summary` o il contenuto della proposta episodica viene iniettato nel prompt (nel directive `pendingEpisodicPatternsDirective`), tutti i dati utente-derivati devono passare per `sanitizeForPrompt` — già implementato in `src/lib/agent/policies/situations.ts` (ADR-0014). Non duplicare la funzione: importarla e riusarla.
- **Storage bloat:** Append-only senza retention significa che il DB cresce indefinitamente. La policy 180gg + archivio automatico del Dream Cycle è la mitigazione primaria — va implementata nella Fase C, non lasciata a dopo.
- **Turn budget esaurito da `recall_episodes` in loop:** Se l'agente non trova l'informazione cercata, non deve richiamare `recall_episodes` con parametri leggermente diversi ripetutamente. Il prompt deve prevedere questa regola esplicitamente, e il tool deve restituire un messaggio chiaro quando non ci sono risultati.

---

## 7. Percorsi Scartati

Documentati per evitare di riaprirli in futuro.

| Percorso | Motivo dello scarto |
|---|---|
| **Tier 1.5 — estendere `facts` con `eventAt`** | Il `UNIQUE(sessionId, category, key)` impedisce più eventi dello stesso tipo. Lifecycle diverso (semantico = stato stabile; episodico = log append-only). Retention, cap e query semantics sono incompatibili. |
| **`event_fact_links` nel MVP** | Grafo prematuro. I link emergono naturalmente quando il Dream Cycle promuove un evento a fatto — non serve costruirli in anticipo. |
| **`sqlite-vec` / embedding vettoriali** | Dipendenza nativa binaria (ABI). Rompe la promessa local-first zero-config su piattaforme diverse. FTS5 è già incluso in SQLite bundled di Node.js senza nulla da installare. |
| **Dream Cycle con auto-overwrite di `facts`** | Rischierebbe di sovrascrivere correzioni manuali dell'utente senza audit trail. Il sistema proposal-first con `factConflicts` è già il pattern consolidato nel progetto. |
| **Blocco episodico always-on nel System Prompt** | Il budget di 65.000 token è già al limite. Un blocco statico di eventi consumerebbe token preziosi anche quando l'utente non fa domande storiche. Il recupero on-demand nel turn budget è più efficiente. |

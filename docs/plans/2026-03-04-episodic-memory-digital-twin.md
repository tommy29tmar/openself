# Implementation Plan: Episodic Memory per il Gemello Digitale

**Stato:** Draft / Revisione Architetturale 1 (2026)
**Obiettivo:** Dotare l'agente OpenSelf di "Memoria Episodica" (Tier 4) per trasformarlo da estrattore di profili (Profile Builder) a un Gemello Digitale (Digital Twin) capace di Life-Logging e ragionamento temporale.

---

## 1. Il Problema: La "Cecità Temporale"

L'attuale architettura eccelle nell'estrarre **Memoria Semantica** (Tier 1 - facts permanenti), ma perde la granularità temporale. Un evento ("Oggi ho corso 10km") sovrascrive lo stato senza mantenere il log storico. Serve un **Event Ledger (Append-Only)** per il ragionamento temporale ("Quante volte ho corso questo mese?").

---

## 2. Architettura Revisionata (Roadmap in 3 Fasi)

### Fase A: Schema DB (Il Minimum Viabile)

Lo schema introduce il Tier 4 senza inquinare i fatti semantici e ottimizza per il recupero temporale:

```typescript
// -- Eventi Episodici (Life Logging - Tier 4)
export const episodicEvents = sqliteTable("episodic_events", {
  id: text("id").primaryKey(),
  ownerKey: text("owner_key").notNull(),
  sessionId: text("session_id").notNull(),
  sourceMessageId: text("source_message_id").notNull(), // Per provenance
  
  eventAtUnix: integer("event_at_unix").notNull(), // Per ordinamento veloce e query time-series
  eventAtHuman: text("event_at_human").notNull(), // Per display e debug (es. "2026-03-04 15:00 UTC")
  
  actionType: text("action_type").notNull(), 
  narrativeSummary: text("narrative_summary").notNull(), // LLM-curato (es. "L'utente ha corso 10km al parco")
  rawInput: text("raw_input"), // Il verbatim originale (opzionale)
  entities: text("entities", { mode: "json" }), // ["person:Marco", "location:Parco"]
  
  visibility: text("visibility").default("private"), // Privacy-by-default
  confidence: real("confidence").default(1.0),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_episodic_owner_time").on(table.ownerKey, table.eventAtUnix)
]);
```
*Note architetturali:*
* Abbandonato `sqlite-vec` per il momento (rompe la compatibilità local-first). Utilizzeremo `FTS5` (Full-Text Search nativa di SQLite) su `narrative_summary` per la ricerca semantica leggera.
* I timestamp sono sdoppiati: UNIX per le query e le finestre temporali, TEXT per l'interpretazione umana.

### Fase B: Integrazione Agente (On-Demand Retrieval)

Gli eventi episodici **non devono finire nel System Prompt statico**, altrimenti esauriscono il budget dei token. Il recupero è on-demand.

* **Tool `record_event`:** L'agente usa questo tool quando rileva una narrazione episodica nel messaggio dell'utente. Produce il `narrative_summary` standardizzato.
* **Tool `recall_episodes`:** Sostituisce la ricerca vettoriale con parametri hard-coded: `timeframe` (es. "last_7_days") o query testuale (tramite FTS5). L'agente chiama questo tool solo se la domanda richiede un'analisi storica.

### Fase C: The Dream Cycle (Consolidamento Asincrono)

Un job asincrono dell'Heartbeat (es. `consolidate_episodes_job`) che scorre gli eventi episodici usando un cursore incrementale (`last_event_at_unix_processed`).
* **Meccanica:** L'LLM analizza il batch di eventi e cerca pattern (es. "L'utente ha corso 3 volte").
* **Regola d'oro (Proposal-First):** Il job **NON** sovrascrive direttamente la tabella `facts` o il Tier 1. Genera invece delle "Proposte" (es. tramite il sistema esistente `propose_soul_change` o `section_copy_proposals`). L'utente dovrà approvare ("Vuoi aggiornare i tuoi hobby aggiungendo il running?").

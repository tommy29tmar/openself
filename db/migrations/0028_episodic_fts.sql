-- db/migrations/0028_episodic_fts.sql
-- Contains CREATE VIRTUAL TABLE — migrator skips transaction wrapper (migrate.ts:43).
-- ALL statements use IF NOT EXISTS for idempotent retry safety (R5-1 fix).
-- Append rebuild at end so any existing rows are indexed (R5-2 fix).

CREATE VIRTUAL TABLE IF NOT EXISTS episodic_events_fts USING fts5(
  narrative_summary,
  content='episodic_events',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS episodic_events_fts_ai
  AFTER INSERT ON episodic_events BEGIN
    INSERT INTO episodic_events_fts(rowid, narrative_summary)
      VALUES (new.rowid, new.narrative_summary);
  END;

CREATE TRIGGER IF NOT EXISTS episodic_events_fts_ad
  AFTER DELETE ON episodic_events BEGIN
    INSERT INTO episodic_events_fts(episodic_events_fts, rowid, narrative_summary)
      VALUES ('delete', old.rowid, old.narrative_summary);
  END;

CREATE TRIGGER IF NOT EXISTS episodic_events_fts_au
  AFTER UPDATE OF narrative_summary ON episodic_events BEGIN
    INSERT INTO episodic_events_fts(episodic_events_fts, rowid, narrative_summary)
      VALUES ('delete', old.rowid, old.narrative_summary);
    INSERT INTO episodic_events_fts(rowid, narrative_summary)
      VALUES (new.rowid, new.narrative_summary);
  END;

-- Rebuild FTS index from current table contents (idempotent, handles retry and initial backfill)
INSERT INTO episodic_events_fts(episodic_events_fts) VALUES('rebuild');

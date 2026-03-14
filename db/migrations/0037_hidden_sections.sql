-- Section visibility: allow hiding sections from the published page.
-- Stored as a JSON array of section type strings, e.g. '["social","contact"]'.
-- Default '[]' means all sections visible.
ALTER TABLE page ADD COLUMN hidden_sections TEXT DEFAULT '[]';

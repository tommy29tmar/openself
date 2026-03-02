-- Add source_language column to page table.
-- Stores the factLanguage at publish time for translation cache coherence.
ALTER TABLE page ADD COLUMN source_language TEXT;

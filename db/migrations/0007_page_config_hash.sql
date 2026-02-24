-- Add config_hash column to page table for concurrency guard
ALTER TABLE page ADD COLUMN config_hash TEXT;

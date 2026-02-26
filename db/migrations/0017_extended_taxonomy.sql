-- Phase 1b: Extended Taxonomy
-- Seeds new categories and aliases for extended section types.

-- New categories (activity was referenced by agent tools but never seeded)
INSERT OR IGNORE INTO category_registry (category, status, created_by) VALUES
  ('education', 'active', 'system'),
  ('stat', 'active', 'system'),
  ('music', 'active', 'system'),
  ('language', 'active', 'system'),
  ('contact', 'active', 'system'),
  ('activity', 'active', 'system');

-- Aliases for new categories
INSERT OR IGNORE INTO category_aliases (alias, category, source) VALUES
  ('study', 'education', 'system'),
  ('university', 'education', 'system'),
  ('degree', 'education', 'system'),
  ('school', 'education', 'system'),
  ('statistics', 'stat', 'system'),
  ('metrics', 'stat', 'system'),
  ('numbers', 'stat', 'system'),
  ('song', 'music', 'system'),
  ('songs', 'music', 'system'),
  ('artist', 'music', 'system'),
  ('album', 'music', 'system'),
  ('lang', 'language', 'system'),
  ('speaks', 'language', 'system'),
  ('phone', 'contact', 'system'),
  ('email', 'contact', 'system'),
  ('address', 'contact', 'system'),
  ('sport', 'activity', 'system'),
  ('sports', 'activity', 'system'),
  ('event', 'activity', 'system'),
  ('events', 'activity', 'system'),
  ('volunteering', 'activity', 'system'),
  ('volunteer', 'activity', 'system'),
  ('club', 'activity', 'system');

-- Re-map hobby/hobbies from interest → activity
-- 0002_taxonomy_seed.sql maps them to 'interest'; we override here.
INSERT INTO category_aliases (alias, category, source) VALUES
  ('hobby', 'activity', 'system'),
  ('hobbies', 'activity', 'system')
ON CONFLICT(alias) DO UPDATE SET category = excluded.category, source = excluded.source;

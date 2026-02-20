INSERT OR IGNORE INTO category_registry (category, status, created_by) VALUES
  ('identity', 'active', 'system'),
  ('experience', 'active', 'system'),
  ('project', 'active', 'system'),
  ('skill', 'active', 'system'),
  ('interest', 'active', 'system'),
  ('achievement', 'active', 'system'),
  ('social', 'active', 'system'),
  ('reading', 'active', 'system');

INSERT OR IGNORE INTO category_aliases (alias, category, source) VALUES
  ('job', 'experience', 'system'),
  ('work', 'experience', 'system'),
  ('employment', 'experience', 'system'),
  ('career', 'experience', 'system'),
  ('skills', 'skill', 'system'),
  ('tech', 'skill', 'system'),
  ('hobby', 'interest', 'system'),
  ('hobbies', 'interest', 'system'),
  ('book', 'reading', 'system'),
  ('books', 'reading', 'system');

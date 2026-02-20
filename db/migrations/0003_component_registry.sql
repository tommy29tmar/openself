PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS component_registry (
    type TEXT PRIMARY KEY, -- core: "hero", community: "x.author.component"
    namespace TEXT NOT NULL CHECK (namespace IN ('core', 'community')),
    owner TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft', 'certified', 'experimental', 'deprecated')),
    version TEXT NOT NULL DEFAULT '1.0.0',
    content_schema_hash TEXT,
    renderer_ref TEXT,
    allowed_variants_json TEXT NOT NULL DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (
        (namespace = 'core' AND type NOT LIKE 'x.%')
        OR (namespace = 'community' AND type LIKE 'x.%')
    )
);

CREATE INDEX IF NOT EXISTS idx_component_registry_status
    ON component_registry(status);

-- Seed core components as certified defaults
INSERT OR IGNORE INTO component_registry
  (type, namespace, owner, status, version, allowed_variants_json)
VALUES
  ('hero', 'core', 'system', 'certified', '1.0.0', '["large","compact","minimal"]'),
  ('bio', 'core', 'system', 'certified', '1.0.0', '["short","full","quote-style"]'),
  ('skills', 'core', 'system', 'certified', '1.0.0', '["chips","bars","list","cloud"]'),
  ('projects', 'core', 'system', 'certified', '1.0.0', '["grid","list","featured"]'),
  ('timeline', 'core', 'system', 'certified', '1.0.0', '["vertical","horizontal","compact"]'),
  ('interests', 'core', 'system', 'certified', '1.0.0', '["icons","cards","list"]'),
  ('achievements', 'core', 'system', 'certified', '1.0.0', '["badges","cards","timeline"]'),
  ('stats', 'core', 'system', 'certified', '1.0.0', '["counters","cards","inline"]'),
  ('social', 'core', 'system', 'certified', '1.0.0', '["icons","buttons","list"]'),
  ('custom', 'core', 'system', 'certified', '1.0.0', '[]'),
  ('reading', 'core', 'system', 'certified', '1.0.0', '["shelf","list","featured"]'),
  ('music', 'core', 'system', 'certified', '1.0.0', '["player-style","list","grid"]'),
  ('contact', 'core', 'system', 'certified', '1.0.0', '["form","links","card"]'),
  ('footer', 'core', 'system', 'certified', '1.0.0', '[]');

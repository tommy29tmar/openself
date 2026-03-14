-- Auth tokens for password reset, email verification, magic link
CREATE TABLE IF NOT EXISTS auth_tokens (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  token_hash TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('password_reset', 'email_verification', 'magic_link')),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash ON auth_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_profile_type ON auth_tokens(profile_id, type);

-- Rate limiting for auth endpoints (SQLite-based, persistent across restarts)
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  action TEXT NOT NULL,
  attempted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_ip_action ON auth_rate_limits(ip, action, attempted_at);

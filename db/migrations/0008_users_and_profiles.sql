-- Users (auth identity)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_users_email ON users(email);

-- Profiles (data anchor: owns facts, pages, messages, agent_config)
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  username TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_profiles_username ON profiles(username) WHERE username IS NOT NULL;

-- Sessions: add FK to users and profiles
ALTER TABLE sessions ADD COLUMN user_id TEXT REFERENCES users(id);
ALTER TABLE sessions ADD COLUMN profile_id TEXT REFERENCES profiles(id);

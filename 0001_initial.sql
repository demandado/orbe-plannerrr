PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','manager','collaborator')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  client TEXT DEFAULT 'ORBE',
  platform TEXT NOT NULL DEFAULT 'Instagram',
  format TEXT NOT NULL DEFAULT 'Feed',
  scheduled_at TEXT,
  objective TEXT DEFAULT '',
  caption TEXT DEFAULT '',
  asset_url TEXT DEFAULT '',
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  approver TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'idea' CHECK(status IN ('idea','production','review','approved','scheduled','published')),
  notes TEXT DEFAULT '',
  created_by TEXT REFERENCES users(id),
  updated_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS posts_schedule_idx ON posts(scheduled_at);
CREATE INDEX IF NOT EXISTS posts_status_idx ON posts(status);

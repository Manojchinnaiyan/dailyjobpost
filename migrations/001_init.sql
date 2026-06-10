CREATE TABLE IF NOT EXISTS jobs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT UNIQUE NOT NULL,
  title      TEXT NOT NULL,
  company    TEXT NOT NULL,
  location   TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'full-time',
  remote     INTEGER NOT NULL DEFAULT 0,
  urgent     INTEGER NOT NULL DEFAULT 0,
  salary     TEXT NOT NULL DEFAULT '',
  tags       TEXT NOT NULL DEFAULT '[]',
  posted     TEXT NOT NULL,
  apply_url  TEXT NOT NULL DEFAULT '',
  experience TEXT NOT NULL DEFAULT '',
  category   TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT    PRIMARY KEY,
  email      TEXT    NOT NULL,
  expires_at INTEGER NOT NULL
);

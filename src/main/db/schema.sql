PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS archives (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  type TEXT,
  date TEXT,
  issuer TEXT,
  level TEXT,
  sensitive INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  file_path TEXT NOT NULL,
  body TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  archive_id TEXT NOT NULL,
  path TEXT NOT NULL,
  mime TEXT,
  size INTEGER,
  hash TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (archive_id) REFERENCES archives(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT,
  builtin INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS archive_tags (
  archive_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (archive_id, tag_id),
  FOREIGN KEY (archive_id) REFERENCES archives(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_archives_category ON archives(category);
CREATE INDEX IF NOT EXISTS idx_archives_date ON archives(date);
CREATE INDEX IF NOT EXISTS idx_archives_updated ON archives(updated_at);
CREATE INDEX IF NOT EXISTS idx_attachments_archive ON attachments(archive_id);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);

CREATE VIRTUAL TABLE IF NOT EXISTS archives_fts USING fts5(
  title, body, tags,
  content='archives',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS archives_ai AFTER INSERT ON archives BEGIN
  INSERT INTO archives_fts(rowid, title, body, tags)
  VALUES (new.rowid, new.title, new.body, '');
END;

CREATE TRIGGER IF NOT EXISTS archives_ad AFTER DELETE ON archives BEGIN
  INSERT INTO archives_fts(archives_fts, rowid, title, body, tags)
  VALUES ('delete', old.rowid, old.title, old.body, '');
END;

CREATE TRIGGER IF NOT EXISTS archives_au AFTER UPDATE ON archives BEGIN
  INSERT INTO archives_fts(archives_fts, rowid, title, body, tags)
  VALUES ('delete', old.rowid, old.title, old.body, '');
  INSERT INTO archives_fts(rowid, title, body, tags)
  VALUES (new.rowid, new.title, new.body, '');
END;

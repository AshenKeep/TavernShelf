import Database from 'better-sqlite3';
import { DB_PATH } from '../config.js';
import { mkdirSync, existsSync, unlinkSync } from 'fs';
import { dirname } from 'path';

mkdirSync(dirname(DB_PATH), { recursive: true });

let _db;

export function getDb() {
  if (!_db) {
    _db = openWithRetry();
    _db.pragma('journal_mode = WAL');
    _db.pragma('busy_timeout = 5000');
    _db.pragma('foreign_keys = ON');
    migrate(_db);
  }
  return _db;
}

function openWithRetry(attempts = 5, delayMs = 1000) {
  // Clean up stale WAL lock files from a previous crashed container.
  // These are safe to remove when no process has the DB open.
  for (const suffix of ['-wal', '-shm']) {
    const lockFile = DB_PATH + suffix;
    if (existsSync(lockFile)) {
      console.log(`[DB] Removing stale lock file: ${lockFile}`);
      try { unlinkSync(lockFile); } catch {}
    }
  }

  for (let i = 1; i <= attempts; i++) {
    try {
      return new Database(DB_PATH);
    } catch (err) {
      if (err.code === 'SQLITE_BUSY' && i < attempts) {
        console.warn(`[DB] Database locked, retrying in ${delayMs}ms (attempt ${i}/${attempts})`);
        // Synchronous sleep — acceptable here as this is startup only
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
      } else {
        throw err;
      }
    }
  }
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    );

    CREATE TABLE IF NOT EXISTS users (
      id           TEXT PRIMARY KEY,
      email        TEXT UNIQUE NOT NULL,
      password     TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role         TEXT NOT NULL DEFAULT 'member',
      created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
      last_login   INTEGER
    );

    CREATE TABLE IF NOT EXISTS invite_tokens (
      token       TEXT PRIMARY KEY,
      created_by  TEXT NOT NULL REFERENCES users(id),
      role        TEXT NOT NULL DEFAULT 'member',
      used_by     TEXT REFERENCES users(id),
      used_at     INTEGER,
      expires_at  INTEGER NOT NULL,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS library_items (
      id              TEXT PRIMARY KEY,
      path            TEXT UNIQUE NOT NULL,
      filename        TEXT NOT NULL,
      title           TEXT NOT NULL,
      authors         TEXT DEFAULT '[]',
      description     TEXT DEFAULT '',
      system          TEXT DEFAULT '',
      content_type    TEXT DEFAULT '',
      publisher       TEXT DEFAULT '',
      year            INTEGER,
      tags            TEXT DEFAULT '[]',
      cover_path      TEXT,
      file_type       TEXT NOT NULL,
      file_size       INTEGER NOT NULL DEFAULT 0,
      page_count      INTEGER,
      metadata_source TEXT DEFAULT 'filename',
      created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS folders (
      id         TEXT PRIMARY KEY,
      path       TEXT UNIQUE NOT NULL,
      name       TEXT NOT NULL,
      parent_id  TEXT REFERENCES folders(id),
      item_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS upload_queue (
      id            TEXT PRIMARY KEY,
      filename      TEXT NOT NULL,
      original_name TEXT NOT NULL,
      target_folder TEXT NOT NULL,
      title         TEXT NOT NULL,
      authors       TEXT DEFAULT '[]',
      description   TEXT DEFAULT '',
      system        TEXT DEFAULT '',
      content_type  TEXT DEFAULT '',
      tags          TEXT DEFAULT '[]',
      file_size     INTEGER NOT NULL DEFAULT 0,
      file_type     TEXT NOT NULL,
      uploaded_by   TEXT NOT NULL REFERENCES users(id),
      status        TEXT NOT NULL DEFAULT 'pending',
      reviewed_by   TEXT REFERENCES users(id),
      reviewed_at   INTEGER,
      reject_reason TEXT,
      created_at    INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_items_path      ON library_items(path);
    CREATE INDEX IF NOT EXISTS idx_items_system    ON library_items(system);
    CREATE INDEX IF NOT EXISTS idx_items_type      ON library_items(content_type);
    CREATE INDEX IF NOT EXISTS idx_items_file_type ON library_items(file_type);
    CREATE INDEX IF NOT EXISTS idx_folders_path    ON folders(path);
    CREATE INDEX IF NOT EXISTS idx_folders_parent  ON folders(parent_id);
    CREATE INDEX IF NOT EXISTS idx_queue_status    ON upload_queue(status);
  `);
}

import Database from 'better-sqlite3';
import { DB_PATH } from '../config.js';
import { mkdirSync, existsSync, unlinkSync } from 'fs';
import { dirname } from 'path';

mkdirSync(dirname(DB_PATH), { recursive: true });

let _db;

export function getDb() {
  if (!_db) {
    _db = openDb();
    migrate(_db);
  }
  return _db;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function openDb(maxAttempts = 10, delayMs = 2000) {
  // Remove stale WAL/SHM lock files if present
  for (const suffix of ['-wal', '-shm']) {
    const f = DB_PATH + suffix;
    if (existsSync(f)) {
      console.log(`[DB] Removing stale lock file: ${f}`);
      try { unlinkSync(f); } catch (e) {
        console.warn(`[DB] Could not remove ${f}:`, e.message);
      }
    }
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // timeout option makes better-sqlite3 wait for the file lock
      const db = new Database(DB_PATH, { timeout: 15000 });

      // Use DELETE journal mode — WAL requires shared memory files
      // that cause SQLITE_BUSY on Docker volumes with certain storage drivers.
      // DELETE mode is simpler, fully compatible, and doesn't need -wal/-shm files.
      db.pragma('journal_mode = DELETE');
      db.pragma('busy_timeout = 15000');
      db.pragma('foreign_keys = ON');
      db.pragma('synchronous = FULL');

      console.log(`[DB] Opened successfully (attempt ${attempt})`);
      return db;

    } catch (err) {
      const retryable = err.code === 'SQLITE_BUSY' || err.code === 'SQLITE_LOCKED';
      if (retryable && attempt < maxAttempts) {
        console.warn(`[DB] ${err.code} on attempt ${attempt}/${maxAttempts}, retrying in ${delayMs}ms...`);
        sleep(delayMs);
      } else {
        console.error(`[DB] Failed to open after ${attempt} attempt(s):`, err.message);
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

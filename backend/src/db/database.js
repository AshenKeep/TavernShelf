import { PGlite } from '@electric-sql/pglite';
import { DB_PATH } from '../config.js';
import { mkdirSync } from 'fs';

// PGlite stores data as a directory — works on any filesystem including CIFS
mkdirSync(DB_PATH, { recursive: true });

let _db;

export async function getDb() {
  if (!_db) {
    _db = await initDb();
  }
  return _db;
}

async function initDb() {
  console.log(`[DB] Opening PGlite database at: ${DB_PATH}`);
  const db = new PGlite(DB_PATH);
  await db.waitReady;
  console.log('[DB] PGlite ready');
  await migrate(db);
  return db;
}

// Helper: run a query returning all rows
export async function dbAll(db, sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows;
}

// Helper: run a query returning first row or null
export async function dbGet(db, sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows[0] ?? null;
}

// Helper: run a query returning nothing (INSERT/UPDATE/DELETE)
export async function dbRun(db, sql, params = []) {
  await db.query(sql, params);
}

async function migrate(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id           TEXT PRIMARY KEY,
      email        TEXT UNIQUE NOT NULL,
      password     TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role         TEXT NOT NULL DEFAULT 'member',
      created_at   BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
      last_login   BIGINT
    );

    CREATE TABLE IF NOT EXISTS invite_tokens (
      token       TEXT PRIMARY KEY,
      created_by  TEXT NOT NULL REFERENCES users(id),
      role        TEXT NOT NULL DEFAULT 'member',
      used_by     TEXT REFERENCES users(id),
      used_at     BIGINT,
      expires_at  BIGINT NOT NULL,
      created_at  BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
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
      file_size       BIGINT NOT NULL DEFAULT 0,
      page_count      INTEGER,
      metadata_source TEXT DEFAULT 'filename',
      locked_fields   TEXT DEFAULT '[]',
      created_at      BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
      updated_at      BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
    );

    CREATE TABLE IF NOT EXISTS folders (
      id         TEXT PRIMARY KEY,
      path       TEXT UNIQUE NOT NULL,
      name       TEXT NOT NULL,
      parent_id  TEXT REFERENCES folders(id),
      item_count INTEGER NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
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
      file_size     BIGINT NOT NULL DEFAULT 0,
      file_type     TEXT NOT NULL,
      uploaded_by   TEXT NOT NULL REFERENCES users(id),
      status        TEXT NOT NULL DEFAULT 'pending',
      reviewed_by   TEXT REFERENCES users(id),
      reviewed_at   BIGINT,
      reject_reason TEXT,
      created_at    BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
    );

    CREATE INDEX IF NOT EXISTS idx_items_path      ON library_items(path);
    CREATE INDEX IF NOT EXISTS idx_items_system    ON library_items(system);
    CREATE INDEX IF NOT EXISTS idx_items_type      ON library_items(content_type);
    CREATE INDEX IF NOT EXISTS idx_items_file_type ON library_items(file_type);
    CREATE INDEX IF NOT EXISTS idx_folders_path    ON folders(path);
    CREATE INDEX IF NOT EXISTS idx_folders_parent  ON folders(parent_id);
    CREATE INDEX IF NOT EXISTS idx_queue_status    ON upload_queue(status);
  `);
  console.log('[DB] Schema ready');

  // Add locked_fields column if it doesn't exist (migration for existing installs)
  await db.exec(`
    ALTER TABLE library_items ADD COLUMN IF NOT EXISTS locked_fields TEXT DEFAULT '[]'
  `);

  // Fix cover_path entries that are missing the /covers/ prefix
  // (written incorrectly in early versions)
  await db.exec(`
    UPDATE library_items
    SET cover_path = '/covers/' || cover_path
    WHERE cover_path IS NOT NULL
      AND cover_path != ''
      AND cover_path NOT LIKE '/covers/%'
      AND cover_path NOT LIKE 'http%'
  `);
}

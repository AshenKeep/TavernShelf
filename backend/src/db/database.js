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
      isbn            TEXT DEFAULT '',
      locked_fields   TEXT DEFAULT '[]',
      created_at      BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
      updated_at      BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
    );

    CREATE TABLE IF NOT EXISTS folders (
      id         TEXT PRIMARY KEY,
      path       TEXT UNIQUE NOT NULL,
      name       TEXT NOT NULL,
      parent_id  TEXT REFERENCES folders(id) ON DELETE CASCADE,
      item_count INTEGER NOT NULL DEFAULT 0,
      is_module  BOOLEAN NOT NULL DEFAULT FALSE,
      managed    TEXT DEFAULT NULL,
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

    CREATE TABLE IF NOT EXISTS campaigns (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT DEFAULT '',
      owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at  BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
      updated_at  BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
    );

    CREATE TABLE IF NOT EXISTS campaign_members (
      campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role        TEXT NOT NULL DEFAULT 'viewer',
      invited_at  BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
      PRIMARY KEY (campaign_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS campaign_items (
      id          TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      item_id     TEXT NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
      status      TEXT NOT NULL DEFAULT 'reference',
      notes       TEXT DEFAULT '',
      added_by    TEXT NOT NULL REFERENCES users(id),
      added_at    BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
      updated_at  BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
      UNIQUE (campaign_id, item_id)
    );

    CREATE INDEX IF NOT EXISTS idx_items_path          ON library_items(path);
    CREATE INDEX IF NOT EXISTS idx_items_system        ON library_items(system);
    CREATE INDEX IF NOT EXISTS idx_items_type          ON library_items(content_type);
    CREATE INDEX IF NOT EXISTS idx_items_file_type     ON library_items(file_type);
    CREATE INDEX IF NOT EXISTS idx_folders_path        ON folders(path);
    CREATE INDEX IF NOT EXISTS idx_folders_parent      ON folders(parent_id);
    CREATE INDEX IF NOT EXISTS idx_queue_status        ON upload_queue(status);
    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
    );


    -- Module affiliation (many-to-many: items ↔ module folders)
    CREATE TABLE IF NOT EXISTS library_item_modules (
      item_id   TEXT NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
      folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
      PRIMARY KEY (item_id, folder_id)
    );

    -- Upload suggestion rules (admin-defined, filename pattern → metadata)
    CREATE TABLE IF NOT EXISTS upload_suggestions (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      match_type   TEXT NOT NULL DEFAULT 'filename_contains',
      match_value  TEXT NOT NULL,
      system       TEXT DEFAULT '',
      content_type TEXT DEFAULT '',
      folder_id    TEXT REFERENCES folders(id) ON DELETE SET NULL,
      priority     INTEGER NOT NULL DEFAULT 0,
      created_at   BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
      updated_at   BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
    );

    CREATE INDEX IF NOT EXISTS idx_item_modules_item   ON library_item_modules(item_id);
    CREATE INDEX IF NOT EXISTS idx_item_modules_folder ON library_item_modules(folder_id);
    CREATE INDEX IF NOT EXISTS idx_suggestions_prio    ON upload_suggestions(priority DESC);

    CREATE INDEX IF NOT EXISTS idx_campaigns_owner     ON campaigns(owner_id);
    CREATE INDEX IF NOT EXISTS idx_camp_members_user   ON campaign_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_camp_items_campaign ON campaign_items(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_camp_items_item     ON campaign_items(item_id);
  `);
  console.log('[DB] Schema ready');

  // Add isbn column for existing installs
  await db.exec(`ALTER TABLE library_items ADD COLUMN IF NOT EXISTS isbn TEXT DEFAULT ''`);

  // Add folder management columns for existing installs
  await db.exec(`ALTER TABLE folders ADD COLUMN IF NOT EXISTS is_module BOOLEAN NOT NULL DEFAULT FALSE`);
  await db.exec(`ALTER TABLE folders ADD COLUMN IF NOT EXISTS managed TEXT DEFAULT NULL`);

  // Add locked_fields column if it doesn't exist (migration for existing installs)
  await db.exec(`
    ALTER TABLE library_items ADD COLUMN IF NOT EXISTS locked_fields TEXT DEFAULT '[]'
  `);

  // Add isbn column for existing installs
  await db.exec(`ALTER TABLE library_items ADD COLUMN IF NOT EXISTS isbn TEXT DEFAULT ''`);

  // Add folder management columns for existing installs
  await db.exec(`ALTER TABLE folders ADD COLUMN IF NOT EXISTS is_module BOOLEAN NOT NULL DEFAULT FALSE`);
  await db.exec(`ALTER TABLE folders ADD COLUMN IF NOT EXISTS managed TEXT DEFAULT NULL`);


  // v0.1.5 migrations
  await db.exec(`
    CREATE TABLE IF NOT EXISTS library_item_modules (
      item_id   TEXT NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
      folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
      PRIMARY KEY (item_id, folder_id)
    )
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS upload_suggestions (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      match_type   TEXT NOT NULL DEFAULT 'filename_contains',
      match_value  TEXT NOT NULL,
      system       TEXT DEFAULT '',
      content_type TEXT DEFAULT '',
      folder_id    TEXT REFERENCES folders(id) ON DELETE SET NULL,
      priority     INTEGER NOT NULL DEFAULT 0,
      created_at   BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
      updated_at   BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
    )
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_item_modules_item   ON library_item_modules(item_id)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_item_modules_folder ON library_item_modules(folder_id)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_suggestions_prio    ON upload_suggestions(priority DESC)`);

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

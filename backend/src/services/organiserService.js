import { existsSync, mkdirSync, copyFileSync, unlinkSync } from 'fs';
import { join, extname, basename, dirname } from 'path';
import { v4 as uuid } from 'uuid';
import { getDb, dbGet, dbRun, dbAll } from '../db/database.js';
import { LIBRARY_PATH } from '../config.js';
import { logger } from './logger.js';

const now = () => Math.floor(Date.now() / 1000);

// ── Path helpers ───────────────────────────────────────────

// Sanitise a path segment — strip special chars, trim
function safeSeg(s) {
  return String(s || '').replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, ' ').trim();
}

// Given an item's metadata, return the expected relative path
// Returns null if not enough metadata to determine location
export function getExpectedPath(item) {
  const system      = safeSeg(item.system);
  const contentType = safeSeg(item.content_type);
  const filename    = basename(item.path);

  if (!system || !contentType) return null;

  if (contentType === 'Adventure Module') {
    // Adventure modules need their own subfolder — caller must provide moduleName
    // Return a special marker so caller knows to prompt
    return { needsModuleName: true, system, contentType, filename };
  }

  return `${system}/${contentType}/${filename}`;
}

// Return expected path for adventure module given module folder name
export function getModulePath(item, moduleName) {
  const system   = safeSeg(item.system);
  const filename = basename(item.path);
  const modName  = safeSeg(moduleName);
  return `${system}/Adventure Module/${modName}/${filename}`;
}

// ── File move ──────────────────────────────────────────────

export async function moveItem(db, item, newRelPath) {
  const oldAbs = join(LIBRARY_PATH, item.path);
  const newAbs = join(LIBRARY_PATH, newRelPath);

  if (item.path === newRelPath) return item; // already in right place
  if (!existsSync(oldAbs)) throw new Error(`Source file not found: ${item.path}`);

  // Create destination directory
  mkdirSync(dirname(newAbs), { recursive: true });

  // Handle filename collision
  let finalAbs = newAbs;
  let finalRel = newRelPath;
  if (existsSync(newAbs) && newAbs !== oldAbs) {
    const ext  = extname(newRelPath);
    const base = newRelPath.slice(0, -ext.length);
    finalRel   = `${base}_${Date.now()}${ext}`;
    finalAbs   = join(LIBRARY_PATH, finalRel);
  }

  // Copy then delete (safe across volumes)
  copyFileSync(oldAbs, finalAbs);
  unlinkSync(oldAbs);

  // Update DB
  await dbRun(db,
    'UPDATE library_items SET path=$1, updated_at=$2 WHERE id=$3',
    [finalRel, now(), item.id]
  );

  // Update folder item counts for old and new folders
  const oldDir = dirname(item.path);
  const newDir = dirname(finalRel);
  await updateFolderCount(db, oldDir);
  await updateFolderCount(db, newDir);

  logger.event('Organiser', 'File moved', { from: item.path, to: finalRel });
  return { ...item, path: finalRel };
}

async function updateFolderCount(db, folderPath) {
  if (!folderPath || folderPath === '.') return;
  const row = await db.query(
    "SELECT COUNT(*) as n FROM library_items WHERE path LIKE $1",
    [folderPath + '/%']
  );
  const count = parseInt(row.rows[0]?.n || 0);
  await dbRun(db, 'UPDATE folders SET item_count=$1 WHERE path=$2', [count, folderPath]);
  // Recurse up to update parent counts
  const parent = dirname(folderPath);
  if (parent && parent !== '.' && parent !== folderPath) {
    await updateFolderCount(db, parent);
  }
}

// ── Check if a path is inside a manually-managed module folder ──

async function isManuallyManaged(db, relPath) {
  // Treat both manually-managed folders AND module folders as protected
  // Files inside a module folder stay where they are regardless of content type
  // The content type is just a metadata tag for library filtering
  const folders = await dbAll(db,
    "SELECT path, managed, is_module FROM folders WHERE managed = 'manual' OR is_module = TRUE"
  );
  return folders.some(f => relPath.startsWith(f.path + '/') || relPath === f.path);
}

// ── Organise a single item ─────────────────────────────────

// Returns:
//   { moved: true, item }           — file was moved
//   { moved: false }                — already correct or skipped
//   { needsModuleName: true, ... }  — adventure module, needs prompt
export async function organiseItem(itemId, moduleName = null) {
  const db = await getDb();

  // Check auto-organise setting
  const setting = await dbGet(db, "SELECT value FROM settings WHERE key = 'library.auto_organise'");
  if (setting?.value !== 'true') return { moved: false, reason: 'auto_organise_off' };

  const item = await dbGet(db, 'SELECT * FROM library_items WHERE id = $1', [itemId]);
  if (!item) return { moved: false, reason: 'not_found' };

  // Don't move if inside a manually-managed folder
  if (await isManuallyManaged(db, item.path)) {
    return { moved: false, reason: 'manually_managed' };
  }

  const expected = getExpectedPath(item);
  if (!expected) return { moved: false, reason: 'insufficient_metadata' };

  // Adventure module — needs a module folder name
  if (expected.needsModuleName) {
    if (!moduleName) return { needsModuleName: true, system: expected.system, filename: expected.filename };
    const modPath = getModulePath(item, moduleName);
    // Create module folder in DB if it doesn't exist
    await ensureModuleFolder(db, `${expected.system}/Adventure Module/${safeSeg(moduleName)}`);
    const moved = await moveItem(db, item, modPath);
    return { moved: true, item: moved };
  }

  if (item.path === expected) return { moved: false, reason: 'already_correct' };

  const moved = await moveItem(db, item, expected);
  // Ensure destination folder exists in DB
  await ensureFolderInDb(db, dirname(expected));
  return { moved: true, item: moved };
}

// ── Ensure folder exists in DB ─────────────────────────────

async function ensureFolderInDb(db, relPath) {
  if (!relPath || relPath === '.') return;
  const existing = await dbGet(db, 'SELECT id FROM folders WHERE path = $1', [relPath]);
  if (existing) return existing.id;

  // Ensure parent exists first
  const parentPath = dirname(relPath);
  let parentId = null;
  if (parentPath && parentPath !== '.') {
    parentId = await ensureFolderInDb(db, parentPath);
  }

  const id = uuid();
  await dbRun(db,
    'INSERT INTO folders (id, path, name, parent_id, item_count, is_module, created_at) VALUES ($1,$2,$3,$4,$5,FALSE,$6) ON CONFLICT (path) DO NOTHING',
    [id, relPath, basename(relPath), parentId, 0, now()]
  );

  // Create the directory on disk too
  mkdirSync(join(LIBRARY_PATH, relPath), { recursive: true });
  return id;
}

async function ensureModuleFolder(db, relPath) {
  const id = await ensureFolderInDb(db, relPath);
  // Mark as module folder
  await dbRun(db, "UPDATE folders SET is_module=TRUE, managed='auto' WHERE path=$1", [relPath]);
  return id;
}

// ── Organise all items ─────────────────────────────────────

export async function organiseAll() {
  const db = await getDb();
  const items = await dbAll(db, `
    SELECT * FROM library_items
    WHERE system != '' AND system IS NOT NULL
      AND content_type != '' AND content_type IS NOT NULL
  `);

  const results = { moved: 0, skipped: 0, needsModule: [], errors: [] };

  for (const item of items) {
    try {
      // Skip manually managed
      if (await isManuallyManaged(db, item.path)) { results.skipped++; continue; }

      const expected = getExpectedPath(item);
      if (!expected) { results.skipped++; continue; }

      if (expected.needsModuleName) {
        results.needsModule.push({ id: item.id, title: item.title, path: item.path, system: expected.system });
        continue;
      }

      if (item.path === expected) { results.skipped++; continue; }

      await moveItem(db, item, expected);
      await ensureFolderInDb(db, dirname(expected));
      results.moved++;
    } catch (e) {
      logger.error('Organiser', 'Move failed', { id: item.id, path: item.path, error: e.message });
      results.errors.push({ id: item.id, title: item.title, error: e.message });
    }
  }

  logger.event('Organiser', 'Organise all complete', { moved: results.moved, skipped: results.skipped, needsModule: results.needsModule.length });
  return results;
}

// ── Get misplaced items ────────────────────────────────────

export async function getMisplacedItems() {
  const db = await getDb();
  const items = await dbAll(db, `
    SELECT * FROM library_items
    WHERE system != '' AND system IS NOT NULL
      AND content_type != '' AND content_type IS NOT NULL
  `);

  const misplaced = [];

  for (const item of items) {
    if (await isManuallyManaged(db, item.path)) continue;

    const expected = getExpectedPath(item);
    if (!expected || expected.needsModuleName) continue;
    if (item.path !== expected) {
      misplaced.push({
        id:            item.id,
        title:         item.title,
        current_path:  item.path,
        expected_path: expected,
        system:        item.system,
        content_type:  item.content_type,
      });
    }
  }

  return misplaced;
}

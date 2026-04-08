import { readdirSync, statSync, existsSync } from 'fs';
import { join, extname, basename, relative, dirname } from 'path';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/database.js';
import { LIBRARY_PATH, SUPPORTED_EXTENSIONS, FILE_TYPE_MAP } from '../config.js';
import { generateCover } from './coverService.js';

export async function scanLibrary() {
  console.log(`[Scanner] Starting library scan: ${LIBRARY_PATH}`);
  const db = getDb();

  if (!existsSync(LIBRARY_PATH)) {
    console.warn(`[Scanner] Library path does not exist: ${LIBRARY_PATH}`);
    return { added: 0, updated: 0, removed: 0 };
  }

  const foundPaths = new Set();
  const stats = { added: 0, updated: 0, removed: 0 };

  // Walk directory tree
  await walkDir(LIBRARY_PATH, db, foundPaths, stats);

  // Remove DB entries for files that no longer exist
  const allItems = db.prepare('SELECT id, path FROM library_items').all();
  for (const item of allItems) {
    const absPath = join(LIBRARY_PATH, item.path);
    if (!foundPaths.has(item.path) || !existsSync(absPath)) {
      db.prepare('DELETE FROM library_items WHERE id = ?').run(item.id);
      stats.removed++;
    }
  }

  // Rebuild folder counts
  rebuildFolders(db);

  console.log(`[Scanner] Done. Added: ${stats.added}, Updated: ${stats.updated}, Removed: ${stats.removed}`);
  return stats;
}

async function walkDir(dirPath, db, foundPaths, stats) {
  let entries;
  try {
    entries = readdirSync(dirPath);
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(dirPath, entry);
    let stat;
    try { stat = statSync(fullPath); } catch { continue; }

    if (stat.isDirectory()) {
      await walkDir(fullPath, db, foundPaths, stats);
    } else if (stat.isFile()) {
      const ext = extname(entry).slice(1).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

      const relPath = relative(LIBRARY_PATH, fullPath);
      foundPaths.add(relPath);

      const existing = db.prepare('SELECT id, file_size FROM library_items WHERE path = ?').get(relPath);

      if (!existing) {
        await addItem(db, fullPath, relPath, stat, ext);
        stats.added++;
      } else if (existing.file_size !== stat.size) {
        db.prepare('UPDATE library_items SET file_size = ?, updated_at = unixepoch() WHERE path = ?')
          .run(stat.size, relPath);
        stats.updated++;
      }
    }
  }
}

async function addItem(db, fullPath, relPath, stat, ext) {
  const id = uuid();
  const filename = basename(fullPath);
  const title = cleanTitle(filename, ext);
  const fileType = FILE_TYPE_MAP[ext] || 'other';

  let coverPath = null;
  try {
    coverPath = await generateCover(fullPath, id, fileType);
  } catch (e) {
    console.warn(`[Scanner] Cover generation failed for ${filename}:`, e.message);
  }

  db.prepare(`
    INSERT INTO library_items
      (id, path, filename, title, file_type, file_size, cover_path, metadata_source)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'filename')
  `).run(id, relPath, filename, title, fileType, stat.size, coverPath);
}

function cleanTitle(filename, ext) {
  return filename
    .replace(new RegExp(`\\.${ext}$`, 'i'), '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function rebuildFolders(db) {
  db.prepare('DELETE FROM folders').run();

  const items = db.prepare('SELECT path FROM library_items').all();
  const folderMap = new Map();

  for (const item of items) {
    let current = dirname(item.path);
    while (current && current !== '.') {
      if (!folderMap.has(current)) {
        folderMap.set(current, { count: 0, parent: dirname(current) });
      }
      folderMap.get(current).count++;
      current = dirname(current);
    }
    // root
    if (!folderMap.has('.')) folderMap.set('.', { count: 0, parent: null });
    folderMap.get('.').count++;
  }

  const insertFolder = db.prepare(
    'INSERT OR IGNORE INTO folders (id, path, name, parent_id, item_count) VALUES (?, ?, ?, ?, ?)'
  );

  // Insert root first
  const pathToId = new Map();
  const ordered = topologicalSort([...folderMap.entries()]);

  for (const [path, info] of ordered) {
    const id = uuid();
    const name = basename(path) || 'Library';
    const parentId = info.parent && info.parent !== '.' ? pathToId.get(info.parent) : null;
    insertFolder.run(id, path, name, parentId, info.count);
    pathToId.set(path, id);
  }
}

function topologicalSort(entries) {
  // Sort so parents always come before children
  return entries.sort(([a], [b]) => {
    const depthA = a.split('/').length;
    const depthB = b.split('/').length;
    return depthA - depthB;
  });
}

import { readdirSync, statSync, existsSync } from 'fs';
import { join, extname, basename, relative, dirname } from 'path';
import { v4 as uuid } from 'uuid';
import { getDb, dbGet, dbRun, dbAll } from '../db/database.js';
import { LIBRARY_PATH, SUPPORTED_EXTENSIONS, FILE_TYPE_MAP } from '../config.js';
import { generateCover, generatePlaceholderCover } from './coverService.js';
import { autoFetchMetadata } from './metadataService.js';
import { logger } from './logger.js';

const now = () => Math.floor(Date.now() / 1000);

export async function scanLibrary() {
  logger.event('Scanner', 'Library scan started', { path: LIBRARY_PATH });
  const db = await getDb();

  if (!existsSync(LIBRARY_PATH)) {
    logger.warn('Scanner', 'Library path does not exist', { path: LIBRARY_PATH });
    return { added: 0, updated: 0, removed: 0 };
  }

  const foundPaths = new Set();
  const stats = { added: 0, updated: 0, removed: 0 };

  await walkDir(LIBRARY_PATH, db, foundPaths, stats);

  const allItems = await dbAll(db, 'SELECT id, path FROM library_items');
  for (const item of allItems) {
    if (!foundPaths.has(item.path) || !existsSync(join(LIBRARY_PATH, item.path))) {
      await dbRun(db, 'DELETE FROM library_items WHERE id = $1', [item.id]);
      stats.removed++;
    }
  }

  await rebuildFolders(db);
  logger.event('Scanner', 'Library scan complete', stats);
  return stats;
}

async function walkDir(dirPath, db, foundPaths, stats) {
  let entries;
  try { entries = readdirSync(dirPath); } catch (e) {
    logger.warn('Scanner', 'Cannot read directory', { path: dirPath, error: e.message });
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

      const existing = await dbGet(db, 'SELECT id, file_size FROM library_items WHERE path = $1', [relPath]);
      if (!existing) {
        await addItem(db, fullPath, relPath, stat, ext);
        stats.added++;
      } else if (parseInt(existing.file_size) !== stat.size) {
        await dbRun(db, 'UPDATE library_items SET file_size=$1, updated_at=$2 WHERE path=$3', [stat.size, now(), relPath]);
        stats.updated++;
      }
    }
  }
}

async function addItem(db, fullPath, relPath, stat, ext) {
  const filename = basename(fullPath);
  const fileType = FILE_TYPE_MAP[ext] || 'other';

  // Check if a record with the same filename existed elsewhere (file was moved on disk)
  // If so, carry its metadata over instead of starting from scratch
  const orphan = await dbGet(db,
    'SELECT * FROM library_items WHERE filename = $1 AND path != $2',
    [filename, relPath]
  );

  if (orphan) {
    // Update the path in the existing record — keep all metadata
    await dbRun(db,
      'UPDATE library_items SET path=$1, file_size=$2, updated_at=$3 WHERE id=$4',
      [relPath, stat.size, now(), orphan.id]
    );
    logger.debug('Scanner', 'Moved item re-linked by filename', { from: orphan.path, to: relPath });
    return;
  }

  const id = uuid();
  const title = filename.replace(new RegExp(`\\.${ext}$`, 'i'), '').replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();

  let coverPath = null;
  try { coverPath = await generateCover(fullPath, id, fileType); }
  catch (e) { logger.warn('Scanner', 'Cover generation failed', { filename, error: e.message }); }

  await dbRun(db, `
    INSERT INTO library_items
      (id, path, filename, title, file_type, file_size, cover_path, metadata_source, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,'filename',$8,$8)
  `, [id, relPath, filename, title, fileType, stat.size, coverPath, now()]);

  // Auto-fetch metadata in background — non-blocking, only for PDFs and CBZs
  if (fileType === 'pdf' || fileType === 'cbz') {
    setImmediate(async () => {
      await autoFetchMetadata(id, title, relPath).catch(() => {});
      // After metadata fetch, generate placeholder if we still have no cover
      if (fileType === 'pdf') {
        const db = await getDb();
        const item = await dbGet(db, 'SELECT cover_path FROM library_items WHERE id = $1', [id]).catch(() => null);
        if (item && !item.cover_path) {
          const placeholder = await generatePlaceholderCover(id, title).catch(() => null);
          if (placeholder) {
            await dbRun(db, 'UPDATE library_items SET cover_path = $1 WHERE id = $2', [placeholder, id]).catch(() => {});
          }
        }
      }
    });
  }
}

async function rebuildFolders(db) {
  // Build item counts from library_items
  const items = await dbAll(db, 'SELECT path FROM library_items');
  const folderCounts = new Map();

  for (const item of items) {
    let current = dirname(item.path);
    while (current && current !== '.') {
      folderCounts.set(current, (folderCounts.get(current) || 0) + 1);
      current = dirname(current);
    }
    folderCounts.set('.', (folderCounts.get('.') || 0) + 1);
  }

  // Update item_count for folders that exist in DB
  const existingFolders = await dbAll(db, 'SELECT id, path FROM folders');
  const existingPaths = new Set(existingFolders.map(f => f.path));

  for (const folder of existingFolders) {
    const count = folderCounts.get(folder.path) || 0;
    await dbRun(db, 'UPDATE folders SET item_count = $1 WHERE id = $2', [count, folder.id]);
  }

  // Insert new folders that have items but aren't in DB yet
  const pathToId = new Map(existingFolders.map(f => [f.path, f.id]));
  const newPaths = [...folderCounts.keys()]
    .filter(p => !existingPaths.has(p))
    .sort((a, b) => a.split('/').length - b.split('/').length);

  for (const path of newPaths) {
    const id = uuid();
    const name = basename(path) || 'Library';
    const parentPath = dirname(path);
    const parentId = parentPath && parentPath !== '.' ? pathToId.get(parentPath) : null;
    await dbRun(db,
      `INSERT INTO folders (id, path, name, parent_id, item_count, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (path) DO UPDATE SET
         name = EXCLUDED.name,
         parent_id = EXCLUDED.parent_id,
         item_count = EXCLUDED.item_count`,
      [id, path, name, parentId, folderCounts.get(path) || 0, now()]
    );
    // Re-read the actual id in case it already existed
    const existing = await dbGet(db, 'SELECT id FROM folders WHERE path = $1', [path]);
    if (existing) pathToId.set(path, existing.id);
    pathToId.set(path, id);
  }

  // Remove DB folders whose directories no longer exist on disk
  // Sort by path depth DESC so children are deleted before parents
  const staleFolders = existingFolders
    .filter(f => f.path !== '.' && !existsSync(join(LIBRARY_PATH, f.path)))
    .sort((a, b) => b.path.split('/').length - a.path.split('/').length);

  for (const folder of staleFolders) {
    try {
      await dbRun(db, 'DELETE FROM folders WHERE id = $1', [folder.id]);
    } catch (e) {
      // If FK still fails, null out parent_id references first then retry
      await dbRun(db, 'UPDATE folders SET parent_id = NULL WHERE parent_id = $1', [folder.id]);
      await dbRun(db, 'DELETE FROM folders WHERE id = $1', [folder.id]);
    }
  }
}

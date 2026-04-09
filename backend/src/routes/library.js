import { Router } from 'express';
import { createReadStream, statSync, existsSync } from 'fs';
import { join, extname } from 'path';
import mime from 'mime-types';
import { getDb, dbGet, dbRun, dbAll } from '../db/database.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { LIBRARY_PATH } from '../config.js';
import { fetchMetadataByTitle, fetchMetadataByIsbn, applyMetadata, downloadCover } from '../services/metadataService.js';
import { scanLibrary } from '../services/libraryScanner.js';

const router = Router();

// GET /api/library/items
router.get('/items', requireAuth, async (req, res) => {
  try {
    const { q, system, content_type, file_type, folder, page = 1, limit = 48, sort = 'title' } = req.query;
    const validSorts = { title: 'title', created: 'created_at DESC', size: 'file_size DESC', year: 'year DESC' };
    const orderBy = validSorts[sort] || 'title';

    const conditions = ['1=1'];
    const params = [];
    let pi = 1;

    if (q) {
      conditions.push(`(title ILIKE $${pi} OR authors ILIKE $${pi+1} OR description ILIKE $${pi+2})`);
      params.push(`%${q}%`, `%${q}%`, `%${q}%`); pi += 3;
    }
    if (system)       { conditions.push(`system = $${pi++}`);       params.push(system); }
    if (content_type) { conditions.push(`content_type = $${pi++}`); params.push(content_type); }
    if (file_type)    { conditions.push(`file_type = $${pi++}`);    params.push(file_type); }
    if (folder)       { conditions.push(`path LIKE $${pi++}`);      params.push(`${folder}/%`); }

    const where = conditions.join(' AND ');
    const db = await getDb();

    const countRow = await dbGet(db, `SELECT COUNT(*) as n FROM library_items WHERE ${where}`, params);
    const total = parseInt(countRow.n);

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const items = await dbAll(db,
      `SELECT * FROM library_items WHERE ${where} ORDER BY ${orderBy} LIMIT $${pi} OFFSET $${pi+1}`,
      [...params, parseInt(limit), offset]
    );

    res.json({ items: items.map(parseItem), total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) });
  } catch (e) { console.error('[Library] Items:', e.message); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/library/items/:id
router.get('/items/:id', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    const item = await dbGet(db, 'SELECT * FROM library_items WHERE id = $1', [req.params.id]);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(parseItem(item));
  } catch (e) { console.error('[Library] Item:', e.message); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/library/items/:id/stream
router.get('/items/:id/stream', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    const item = await dbGet(db, 'SELECT path, filename, file_type FROM library_items WHERE id = $1', [req.params.id]);
    if (!item) return res.status(404).json({ error: 'Not found' });

    const filePath = join(LIBRARY_PATH, item.path);
    if (!existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });

    const stat = statSync(filePath);
    const mimeType = mime.lookup(filePath) || 'application/octet-stream';
    const rangeHeader = req.headers.range;

    if (rangeHeader) {
      const [startStr, endStr] = rangeHeader.replace('bytes=', '').split('-');
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : stat.size - 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': mimeType,
      });
      createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
        'Content-Disposition': `inline; filename="${encodeURIComponent(item.filename)}"`,
      });
      createReadStream(filePath).pipe(res);
    }
  } catch (e) { console.error('[Library] Stream:', e.message); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/library/folders
router.get('/folders', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    const folders = await dbAll(db, 'SELECT * FROM folders ORDER BY path');
    res.json(buildFolderTree(folders));
  } catch (e) { console.error('[Library] Folders:', e.message); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/library/filters
router.get('/filters', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    const [systems, contentTypes, fileTypes] = await Promise.all([
      dbAll(db, "SELECT DISTINCT system FROM library_items WHERE system != '' ORDER BY system"),
      dbAll(db, "SELECT DISTINCT content_type FROM library_items WHERE content_type != '' ORDER BY content_type"),
      dbAll(db, 'SELECT DISTINCT file_type FROM library_items ORDER BY file_type'),
    ]);
    res.json({ systems: systems.map(r => r.system), contentTypes: contentTypes.map(r => r.content_type), fileTypes: fileTypes.map(r => r.file_type) });
  } catch (e) { console.error('[Library] Filters:', e.message); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/library/items/:id/metadata/search
router.post('/items/:id/metadata/search', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const db = await getDb();
    const item = await dbGet(db, 'SELECT title FROM library_items WHERE id = $1', [req.params.id]);
    if (!item) return res.status(404).json({ error: 'Not found' });
    const results = await fetchMetadataByTitle(req.body.query || item.title);
    res.json(results);
  } catch (e) { console.error('[Library] Metadata search:', e.message); res.status(500).json({ error: 'Server error' }); }
});

// PUT /api/library/items/:id/metadata
router.put('/items/:id/metadata', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const updated = await applyMetadata(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(parseItem(updated));
  } catch (e) { console.error('[Library] Metadata update:', e.message); res.status(500).json({ error: 'Server error' }); }
});


// POST /api/library/items/:id/metadata/search-isbn
router.post('/items/:id/metadata/search-isbn', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { isbn } = req.body;
    if (!isbn) return res.status(400).json({ error: 'isbn required' });
    const results = await fetchMetadataByIsbn(isbn.replace(/[-\s]/g, ''));
    res.json(results);
  } catch (e) { console.error('[Library] ISBN search:', e.message); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/library/items/:id/cover/fetch — fetch cover from a URL
router.post('/items/:id/cover/fetch', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'url required' });
    const db = await getDb();
    const item = await dbGet(db, 'SELECT id FROM library_items WHERE id = $1', [req.params.id]);
    if (!item) return res.status(404).json({ error: 'Not found' });
    const coverPath = await downloadCover(url, item.id);
    if (!coverPath) return res.status(422).json({ error: 'Failed to download cover' });
    await dbRun(db, 'UPDATE library_items SET cover_path = $1, updated_at = $2 WHERE id = $3',
      [coverPath, Math.floor(Date.now()/1000), item.id]);
    res.json({ coverPath });
  } catch (e) { console.error('[Library] Cover fetch:', e.message); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/library/scan
router.post('/scan', requireAuth, requireRole('admin'), async (req, res) => {
  res.json({ message: 'Scan started' });
  scanLibrary().catch(e => console.error('[Scan] Error:', e));
});

// GET /api/library/stats
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    const stats = await dbGet(db, `
      SELECT
        COUNT(*)                                           AS total_items,
        COALESCE(SUM(file_size), 0)                       AS total_size,
        COUNT(DISTINCT NULLIF(system, ''))                AS total_systems,
        COUNT(CASE WHEN file_type = 'pdf'   THEN 1 END)  AS pdf_count,
        COUNT(CASE WHEN file_type = 'cbz'   THEN 1 END)  AS cbz_count,
        COUNT(CASE WHEN file_type = 'image' THEN 1 END)  AS image_count
      FROM library_items
    `);
    res.json({
      total_items:   parseInt(stats.total_items),
      total_size:    parseInt(stats.total_size),
      total_systems: parseInt(stats.total_systems),
      pdf_count:     parseInt(stats.pdf_count),
      cbz_count:     parseInt(stats.cbz_count),
      image_count:   parseInt(stats.image_count),
    });
  } catch (e) { console.error('[Library] Stats:', e.message); res.status(500).json({ error: 'Server error' }); }
});

function parseItem(item) {
  return {
    ...item,
    authors: tryParse(item.authors, []),
    tags:    tryParse(item.tags, []),
    file_size: parseInt(item.file_size) || 0,
  };
}

function tryParse(val, fallback) {
  try { return JSON.parse(val); } catch { return fallback; }
}

function buildFolderTree(folders) {
  const map = {};
  folders.forEach(f => { map[f.id] = { ...f, children: [] }; });
  const roots = [];
  folders.forEach(f => {
    if (f.parent_id && map[f.parent_id]) map[f.parent_id].children.push(map[f.id]);
    else roots.push(map[f.id]);
  });
  return roots;
}

export default router;

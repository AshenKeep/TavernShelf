import { Router } from 'express';
import { createReadStream, statSync, existsSync } from 'fs';
import { join, extname } from 'path';
import mime from 'mime-types';
import { getDb } from '../db/database.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { LIBRARY_PATH } from '../config.js';
import { fetchMetadataByTitle, applyMetadata } from '../services/metadataService.js';
import { scanLibrary } from '../services/libraryScanner.js';

const router = Router();

// GET /api/library/items
router.get('/items', requireAuth, (req, res) => {
  const db = getDb();
  const {
    q, system, content_type, file_type,
    folder, page = 1, limit = 48, sort = 'title'
  } = req.query;

  const validSorts = { title: 'title', created: 'created_at DESC', size: 'file_size DESC', year: 'year DESC' };
  const orderBy = validSorts[sort] || 'title';

  let sql = 'SELECT * FROM library_items WHERE 1=1';
  const params = [];

  if (q) {
    sql += ' AND (title LIKE ? OR authors LIKE ? OR description LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  if (system)       { sql += ' AND system = ?';       params.push(system); }
  if (content_type) { sql += ' AND content_type = ?'; params.push(content_type); }
  if (file_type)    { sql += ' AND file_type = ?';    params.push(file_type); }
  if (folder)       { sql += ' AND path LIKE ?';      params.push(`${folder}/%`); }

  const total = db.prepare(`SELECT COUNT(*) as n FROM (${sql})`).get(...params).n;

  sql += ` ORDER BY ${orderBy}`;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  sql += ' LIMIT ? OFFSET ?';
  params.push(parseInt(limit), offset);

  const items = db.prepare(sql).all(...params).map(parseItem);

  res.json({ items, total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) });
});

// GET /api/library/items/:id
router.get('/items/:id', requireAuth, (req, res) => {
  const db = getDb();
  const item = db.prepare('SELECT * FROM library_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(parseItem(item));
});

// GET /api/library/items/:id/stream  — stream the actual file
router.get('/items/:id/stream', requireAuth, (req, res) => {
  const db = getDb();
  const item = db.prepare('SELECT path, filename, file_type FROM library_items WHERE id = ?').get(req.params.id);
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
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
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
});

// GET /api/library/folders
router.get('/folders', requireAuth, (req, res) => {
  const db = getDb();
  const folders = db.prepare('SELECT * FROM folders ORDER BY path').all();
  res.json(buildFolderTree(folders));
});

// GET /api/library/filters  — unique values for filter dropdowns
router.get('/filters', requireAuth, (req, res) => {
  const db = getDb();
  const systems      = db.prepare("SELECT DISTINCT system FROM library_items WHERE system != '' ORDER BY system").all().map(r => r.system);
  const contentTypes = db.prepare("SELECT DISTINCT content_type FROM library_items WHERE content_type != '' ORDER BY content_type").all().map(r => r.content_type);
  const fileTypes    = db.prepare("SELECT DISTINCT file_type FROM library_items ORDER BY file_type").all().map(r => r.file_type);
  res.json({ systems, contentTypes, fileTypes });
});

// POST /api/library/items/:id/metadata/search
router.post('/items/:id/metadata/search', requireAuth, requireRole('admin'), async (req, res) => {
  const db = getDb();
  const item = db.prepare('SELECT title FROM library_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });

  const query = req.body.query || item.title;
  const results = await fetchMetadataByTitle(query);
  res.json(results);
});

// PUT /api/library/items/:id/metadata
router.put('/items/:id/metadata', requireAuth, requireRole('admin'), (req, res) => {
  const updated = applyMetadata(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(parseItem(updated));
});

// POST /api/library/scan  (admin only)
router.post('/scan', requireAuth, requireRole('admin'), async (req, res) => {
  res.json({ message: 'Scan started' });
  scanLibrary().catch(e => console.error('[Scan] Error:', e));
});

// GET /api/library/stats
router.get('/stats', requireAuth, (req, res) => {
  const db = getDb();
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_items,
      SUM(file_size) as total_size,
      COUNT(DISTINCT system) as total_systems,
      COUNT(CASE WHEN file_type = 'pdf' THEN 1 END) as pdf_count,
      COUNT(CASE WHEN file_type = 'cbz' THEN 1 END) as cbz_count,
      COUNT(CASE WHEN file_type = 'image' THEN 1 END) as image_count
    FROM library_items
  `).get();
  res.json(stats);
});

function parseItem(item) {
  return {
    ...item,
    authors: tryParse(item.authors, []),
    tags:    tryParse(item.tags, []),
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
    if (f.parent_id && map[f.parent_id]) {
      map[f.parent_id].children.push(map[f.id]);
    } else {
      roots.push(map[f.id]);
    }
  });
  return roots;
}

export default router;

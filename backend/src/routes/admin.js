import { Router } from 'express';
import multer from 'multer';
import { mkdirSync, existsSync, createReadStream } from 'fs';
import { join } from 'path';
import { getDb, dbAll, dbRun, dbGet } from '../db/database.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { logger, subscribeLogs, readRecentLogs, listLogFiles, getLogDir } from '../services/logger.js';
import { LIBRARY_PATH, JWT_SECRET } from '../config.js';
import { scanLibrary } from '../services/libraryScanner.js';
import jwt from 'jsonwebtoken';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const now = () => Math.floor(Date.now() / 1000);
const BACKUP_VERSION = 1;

// ── Backup ────────────────────────────────────────────────
router.get('/backup', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const db = await getDb();
    const [users, invites, items, folders, queue] = await Promise.all([
      dbAll(db, 'SELECT id, email, display_name, role, created_at, last_login FROM users'),
      dbAll(db, 'SELECT * FROM invite_tokens'),
      dbAll(db, 'SELECT * FROM library_items'),
      dbAll(db, 'SELECT * FROM folders'),
      dbAll(db, 'SELECT * FROM upload_queue'),
    ]);
    const backup = {
      version: BACKUP_VERSION, created_at: now(),
      created_at_iso: new Date().toISOString(), app: 'tavernshelf',
      tables: { users, invite_tokens: invites, library_items: items, folders, upload_queue: queue },
    };
    logger.event('Admin', 'Backup downloaded', { by: req.user.email, items: items.length });
    const filename = `tavernshelf-backup-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(backup);
  } catch (e) { logger.error('Admin', 'Backup error', { error: e.message }); res.status(500).json({ error: 'Backup failed' }); }
});

// ── Restore ───────────────────────────────────────────────
router.post('/restore', requireAuth, requireRole('admin'), upload.single('backup'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No backup file uploaded' });
  let backup;
  try { backup = JSON.parse(req.file.buffer.toString('utf8')); }
  catch { return res.status(400).json({ error: 'Invalid JSON file' }); }
  if (backup.app !== 'tavernshelf') return res.status(400).json({ error: 'Not a TavernShelf backup file' });
  if (!backup.tables) return res.status(400).json({ error: 'Backup file is missing data' });

  try {
    const db = await getDb();
    const { users, invite_tokens, library_items, folders } = backup.tables;

    if (users?.length) {
      await dbRun(db, 'DELETE FROM upload_queue');
      await dbRun(db, 'DELETE FROM invite_tokens');
      await dbRun(db, 'DELETE FROM library_items');
      await dbRun(db, 'DELETE FROM folders');
      await dbRun(db, 'DELETE FROM users');
      for (const u of users) {
        if (!u.password) continue;
        await dbRun(db,
          'INSERT INTO users (id, email, password, display_name, role, created_at, last_login) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING',
          [u.id, u.email, u.password, u.display_name, u.role, u.created_at || now(), u.last_login]
        );
      }
    }
    if (library_items?.length) {
      for (const item of library_items) {
        await dbRun(db, `
          INSERT INTO library_items (id,path,filename,title,authors,description,system,content_type,publisher,year,tags,cover_path,file_type,file_size,page_count,metadata_source,created_at,updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) ON CONFLICT (id) DO NOTHING
        `, [item.id,item.path,item.filename,item.title,item.authors||'[]',item.description||'',item.system||'',item.content_type||'',item.publisher||'',item.year,item.tags||'[]',item.cover_path,item.file_type,item.file_size||0,item.page_count,item.metadata_source||'filename',item.created_at||now(),item.updated_at||now()]);
      }
    }
    if (folders?.length) {
      for (const f of folders) {
        await dbRun(db, 'INSERT INTO folders (id,path,name,parent_id,item_count,created_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING',
          [f.id,f.path,f.name,f.parent_id,f.item_count||0,f.created_at||now()]);
      }
    }
    if (invite_tokens?.length) {
      for (const t of invite_tokens) {
        const creator = await dbGet(db, 'SELECT id FROM users WHERE id = $1', [t.created_by]);
        if (!creator) continue;
        await dbRun(db, 'INSERT INTO invite_tokens (token,created_by,role,used_by,used_at,expires_at,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (token) DO NOTHING',
          [t.token,t.created_by,t.role,t.used_by,t.used_at,t.expires_at,t.created_at||now()]);
      }
    }
    const counts = { users: users?.length||0, library_items: library_items?.length||0, folders: folders?.length||0 };
    logger.event('Admin', 'Restore complete', { by: req.user.email, ...counts });
    res.json({ message: 'Restore complete', counts });
  } catch (e) { logger.error('Admin', 'Restore error', { error: e.message }); res.status(500).json({ error: `Restore failed: ${e.message}` }); }
});

// ── Folder creation ───────────────────────────────────────
router.post('/folders', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { path: folderPath } = req.body;
    if (!folderPath) return res.status(400).json({ error: 'path is required' });

    // Sanitise — no traversal
    const safe = folderPath.replace(/\.\./g, '').replace(/\/+/g, '/').replace(/^\//, '');
    if (!safe) return res.status(400).json({ error: 'Invalid path' });

    const absPath = join(LIBRARY_PATH, safe);
    if (existsSync(absPath)) return res.status(409).json({ error: 'Folder already exists' });

    mkdirSync(absPath, { recursive: true });
    logger.event('Admin', 'Folder created', { path: safe, by: req.user.email });

    // Trigger rescan so the sidebar updates
    scanLibrary().catch(e => logger.error('Scanner', 'Post-folder-create scan failed', { error: e.message }));
    res.status(201).json({ message: 'Folder created', path: safe });
  } catch (e) { logger.error('Admin', 'Folder create error', { error: e.message }); res.status(500).json({ error: 'Server error' }); }
});

// ── Logs: list files ──────────────────────────────────────
router.get('/logs', requireAuth, requireRole('admin'), (req, res) => {
  res.json(listLogFiles());
});

// ── Logs: SSE live tail ───────────────────────────────────────────────
router.get('/logs/stream', async (req, res) => {
  // EventSource cannot set Authorization headers, so we accept token via query param
  const token = req.query.token || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).end();
  try {
    const user = jwt.verify(token, JWT_SECRET);
    if (user.role !== 'admin') return res.status(403).end();
  } catch { return res.status(401).end(); }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const recent = readRecentLogs(100);
  for (const line of recent) {
    res.write(`data: ${line}\n\n`);
  }

  const unsub = subscribeLogs((line) => {
    res.write(`data: ${line}\n\n`);
  });

  const ping = setInterval(() => res.write(': ping\n\n'), 15000);
  req.on('close', () => { unsub(); clearInterval(ping); });
});

// ── Logs: download a specific log file ───────────────────
router.get('/logs/:filename', requireAuth, requireRole('admin'), (req, res) => {
  const { filename } = req.params;
  if (!filename.match(/^tavernshelf-\d{4}-\d{2}-\d{2}\.log$/)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const filePath = join(getLogDir(), filename);
  if (!existsSync(filePath)) return res.status(404).json({ error: 'Log file not found' });
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'text/plain');
  createReadStream(filePath).pipe(res);
});

export default router;

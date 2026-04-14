import { Router } from 'express';
import multer from 'multer';
import { mkdirSync, existsSync, createReadStream } from 'fs';
import { join } from 'path';
import { getDb, dbAll, dbRun, dbGet } from '../db/database.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { logger, subscribeLogs, readRecentLogs, listLogFiles, getLogDir } from '../services/logger.js';
import { getEmailSettings, saveEmailSettings, testEmailConnection } from '../services/emailService.js';
import { LIBRARY_PATH, JWT_SECRET } from '../config.js';
import { scanLibrary } from '../services/libraryScanner.js';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
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


// ── User management ───────────────────────────────────────

// GET /api/admin/users
router.get('/users', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const db = await getDb();
    const users = await dbAll(db,
      'SELECT id, email, display_name, role, created_at, last_login FROM users ORDER BY created_at DESC'
    );
    res.json(users);
  } catch (e) { logger.error('Admin', 'List users error', { error: e.message }); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/admin/users — create user directly
router.post('/users', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { email, password, displayName, role = 'member' } = req.body;
    if (!email || !password || !displayName) return res.status(400).json({ error: 'email, password and displayName required' });
    if (!['member','uploader','admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const db = await getDb();
    const existing = await dbGet(db, 'SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const id = uuid();
    await dbRun(db,
      'INSERT INTO users (id, email, password, display_name, role, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
      [id, email.toLowerCase().trim(), bcrypt.hashSync(password, 12), displayName, role, Math.floor(Date.now()/1000)]
    );
    logger.event('Admin', 'User created', { email, role, by: req.user.email });
    res.status(201).json({ id, email, displayName, role });
  } catch (e) { logger.error('Admin', 'Create user error', { error: e.message }); res.status(500).json({ error: 'Server error' }); }
});

// PUT /api/admin/users/:id — update role or reset password
router.put('/users/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { role, password } = req.body;
    const db = await getDb();
    const user = await dbGet(db, 'SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (role) {
      if (!['member','uploader','admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
      await dbRun(db, 'UPDATE users SET role = $1 WHERE id = $2', [role, user.id]);
      logger.event('Admin', 'User role changed', { email: user.email, from: user.role, to: role, by: req.user.email });
    }
    if (password) {
      if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
      await dbRun(db, 'UPDATE users SET password = $1 WHERE id = $2', [bcrypt.hashSync(password, 12), user.id]);
      logger.event('Admin', 'User password reset', { email: user.email, by: req.user.email });
    }

    const updated = await dbGet(db, 'SELECT id, email, display_name, role, created_at, last_login FROM users WHERE id = $1', [user.id]);
    res.json(updated);
  } catch (e) { logger.error('Admin', 'Update user error', { error: e.message }); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' });
    const db = await getDb();
    const user = await dbGet(db, 'SELECT email FROM users WHERE id = $1', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    await dbRun(db, 'DELETE FROM users WHERE id = $1', [req.params.id]);
    logger.event('Admin', 'User deleted', { email: user.email, by: req.user.email });
    res.json({ message: 'User deleted' });
  } catch (e) { logger.error('Admin', 'Delete user error', { error: e.message }); res.status(500).json({ error: 'Server error' }); }
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

    // Insert folder directly into DB so it shows up in the upload dropdown immediately
    // even before any files are added to it
    const db = await getDb();
    const { v4: uuid } = await import('uuid');
    const segments = safe.split('/');
    let parentId = null;

    // Ensure all ancestor folders exist in DB too
    for (let i = 0; i < segments.length; i++) {
      const segPath = segments.slice(0, i + 1).join('/');
      const existing = await dbGet(db, 'SELECT id FROM folders WHERE path = $1', [segPath]);
      if (existing) {
        parentId = existing.id;
      } else {
        const id = uuid();
        await dbRun(db,
          'INSERT INTO folders (id, path, name, parent_id, item_count, created_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (path) DO NOTHING',
          [id, segPath, segments[i], parentId, 0, Math.floor(Date.now()/1000)]
        );
        parentId = id;
      }
    }

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
router.get('/logs/:filename', async (req, res) => {
  const token = req.query.token || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).end();
  try {
    const user = jwt.verify(token, JWT_SECRET);
    if (user.role !== 'admin') return res.status(403).end();
  } catch { return res.status(401).end(); }
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




// DELETE /api/admin/folders/:id — remove folder and all children from DB (not from disk)
router.delete('/folders/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const db = await getDb();
    const folder = await dbGet(db, 'SELECT * FROM folders WHERE id = $1', [req.params.id]);
    if (!folder) return res.status(404).json({ error: 'Folder not found' });

    // Delete all descendant folders first (bottom-up) to avoid FK violations
    // Find all folders whose path starts with this folder's path
    const descendants = await dbAll(db,
      "SELECT id, path FROM folders WHERE path LIKE $1 ORDER BY path DESC",
      [folder.path + '/%']
    );
    for (const desc of descendants) {
      await dbRun(db, 'DELETE FROM folders WHERE id = $1', [desc.id]);
    }
    // Now delete the folder itself
    await dbRun(db, 'DELETE FROM folders WHERE id = $1', [folder.id]);

    logger.event('Admin', 'Folder removed from DB', { path: folder.path, by: req.user.email });
    res.json({ message: 'Folder removed' });
  } catch (e) { logger.error('Admin', 'Folder delete error', { error: e.message }); res.status(500).json({ error: 'Server error' }); }
});

// ── General settings ──────────────────────────────────────

router.get('/settings', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const db = await getDb();
    const rows = await dbAll(db, 'SELECT key, value FROM settings');
    const settings = {};
    for (const row of rows) settings[row.key] = row.value;
    res.json(settings);
  } catch (e) { logger.error('Admin', 'Get settings error', { error: e.message }); res.status(500).json({ error: 'Server error' }); }
});

router.put('/settings', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const db = await getDb();
    for (const [key, value] of Object.entries(req.body)) {
      await dbRun(db,
        'INSERT INTO settings (key, value, updated_at) VALUES ($1,$2,$3) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=$3',
        [key, String(value), Math.floor(Date.now()/1000)]
      );
      // Apply log level change immediately without restart
      if (key === 'log.level') {
        setLogLevel(value);
        logger.info('Admin', `Log level set to ${value}`, { by: req.user.email });
      }
    }
    logger.event('Admin', 'Settings updated', { keys: Object.keys(req.body), by: req.user.email });
    res.json({ message: 'Settings saved', logLevel: getLogLevel() });
  } catch (e) { logger.error('Admin', 'Save settings error', { error: e.message }); res.status(500).json({ error: 'Server error' }); }
});

// ── Email settings ────────────────────────────────────────

router.get('/settings/email', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const settings = await getEmailSettings();
    // Never return the password
    const safe = { ...settings };
    if (safe.pass) safe.pass = '••••••••';
    res.json(safe);
  } catch (e) { logger.error('Admin', 'Get email settings error', { error: e.message }); res.status(500).json({ error: 'Server error' }); }
});

router.put('/settings/email', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { host, port, secure, user, pass, from, enabled } = req.body;
    const toSave = { host: host||'', port: port||'587', secure: secure?'true':'false', user: user||'', from: from||'', enabled: enabled?'true':'false' };
    // Only update password if a new one was provided (not the masked placeholder)
    if (pass && pass !== '••••••••') toSave.pass = pass;
    await saveEmailSettings(toSave);
    logger.event('Admin', 'Email settings updated', { by: req.user.email });
    res.json({ message: 'Email settings saved' });
  } catch (e) { logger.error('Admin', 'Save email settings error', { error: e.message }); res.status(500).json({ error: 'Server error' }); }
});

router.post('/settings/email/test', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    await testEmailConnection();
    logger.event('Admin', 'Email SMTP connection test passed', { by: req.user.email });
    res.json({ message: 'SMTP connection successful' });
  } catch (e) {
    logger.warn('Admin', 'Email SMTP test failed', { error: e.message });
    res.status(422).json({ error: `SMTP test failed: ${e.message}` });
  }
});

export default router;

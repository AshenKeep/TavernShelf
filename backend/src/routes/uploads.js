import { Router } from 'express';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import { join, extname } from 'path';
import { copyFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { getDb, dbGet, dbRun, dbAll } from '../db/database.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { UPLOADS_PATH, LIBRARY_PATH, SUPPORTED_EXTENSIONS, FILE_TYPE_MAP } from '../config.js';
import { scanLibrary } from '../services/libraryScanner.js';
import { logger } from '../services/logger.js';

mkdirSync(UPLOADS_PATH, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOADS_PATH,
  filename: (req, file, cb) => cb(null, `${uuid()}.${extname(file.originalname).slice(1).toLowerCase()}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = extname(file.originalname).slice(1).toLowerCase();
    SUPPORTED_EXTENSIONS.has(ext) ? cb(null, true) : cb(new Error(`Unsupported file type: .${ext}`));
  },
});

const router = Router();
const now = () => Math.floor(Date.now() / 1000);

router.post('/', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { targetFolder, title, authors, description, system, contentType, tags } = req.body;
  if (!targetFolder || !title) {
    unlinkSync(req.file.path);
    return res.status(400).json({ error: 'targetFolder and title are required' });
  }
  try {
    const ext = extname(req.file.originalname).slice(1).toLowerCase();
    const db = await getDb();
    const id = uuid();
    await dbRun(db, `
      INSERT INTO upload_queue
        (id, filename, original_name, target_folder, title, authors, description,
         system, content_type, tags, file_size, file_type, uploaded_by, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    `, [
      id, req.file.filename, req.file.originalname, targetFolder, title,
      authors ? JSON.stringify(JSON.parse(authors)) : '[]',
      description || '', system || '', contentType || '',
      tags ? JSON.stringify(JSON.parse(tags)) : '[]',
      req.file.size, FILE_TYPE_MAP[ext] || 'other', req.user.id, now(),
    ]);
    logger.event('Upload', 'File submitted for approval', { title, by: req.user.email, targetFolder, size: req.file.size });
    res.status(201).json({ id, message: 'File submitted for approval' });
  } catch (e) {
    logger.error('Upload', 'Submit failed', { error: e.message });
    try { unlinkSync(req.file.path); } catch {}
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const { status = 'pending' } = req.query;
    const db = await getDb();
    let sql = `
      SELECT uq.*, u.display_name as uploader_name, r.display_name as reviewer_name
      FROM upload_queue uq
      JOIN users u ON uq.uploaded_by = u.id
      LEFT JOIN users r ON uq.reviewed_by = r.id
      WHERE uq.status = $1
    `;
    const params = [status];
    if (req.user.role !== 'admin') { sql += ' AND uq.uploaded_by = $2'; params.push(req.user.id); }
    sql += ' ORDER BY uq.created_at DESC';
    res.json(await dbAll(db, sql, params));
  } catch (e) { logger.error('Upload', 'List error', { error: e.message }); res.status(500).json({ error: 'Server error' }); }
});

router.post('/:id/approve', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const db = await getDb();
    const item = await dbGet(db, 'SELECT * FROM upload_queue WHERE id = $1', [req.params.id]);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (item.status !== 'pending') return res.status(400).json({ error: 'Already reviewed' });

    const destFolder = join(LIBRARY_PATH, item.target_folder);
    mkdirSync(destFolder, { recursive: true });
    const safeFilename = item.original_name.replace(/[^a-zA-Z0-9._\-\s]/g, '_');
    // Use copy+delete instead of rename — rename fails across Docker volumes (EXDEV)
    const src = join(UPLOADS_PATH, item.filename);
    const dest = join(destFolder, safeFilename);
    copyFileSync(src, dest);
    unlinkSync(src);

    await dbRun(db,
      "UPDATE upload_queue SET status='approved', reviewed_by=$1, reviewed_at=$2 WHERE id=$3",
      [req.user.id, now(), item.id]
    );
    logger.event('Upload', 'Upload approved', { title: item.title, by: req.user.email, dest: item.target_folder });
    scanLibrary().catch(e => logger.error('Scanner', 'Post-approve scan failed', { error: e.message }));
    res.json({ message: 'Approved and added to library' });
  } catch (e) { logger.error('Upload', 'Approve error', { error: e.message }); res.status(500).json({ error: 'Server error' }); }
});

router.post('/:id/reject', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const db = await getDb();
    const item = await dbGet(db, 'SELECT * FROM upload_queue WHERE id = $1', [req.params.id]);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (item.status !== 'pending') return res.status(400).json({ error: 'Already reviewed' });

    try { if (existsSync(join(UPLOADS_PATH, item.filename))) unlinkSync(join(UPLOADS_PATH, item.filename)); } catch {}
    await dbRun(db,
      "UPDATE upload_queue SET status='rejected', reviewed_by=$1, reviewed_at=$2, reject_reason=$3 WHERE id=$4",
      [req.user.id, now(), req.body.reason || '', item.id]
    );
    logger.event('Upload', 'Upload rejected', { title: item.title, by: req.user.email, reason: req.body.reason });
    res.json({ message: 'Rejected' });
  } catch (e) { logger.error('Upload', 'Reject error', { error: e.message }); res.status(500).json({ error: 'Server error' }); }
});

export default router;

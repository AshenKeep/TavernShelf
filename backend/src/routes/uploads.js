import { Router } from 'express';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import { join, extname } from 'path';
import { renameSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { getDb } from '../db/database.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { UPLOADS_PATH, LIBRARY_PATH, SUPPORTED_EXTENSIONS, FILE_TYPE_MAP } from '../config.js';
import { generateCover } from '../services/coverService.js';
import { scanLibrary } from '../services/libraryScanner.js';

mkdirSync(UPLOADS_PATH, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOADS_PATH,
  filename: (req, file, cb) => {
    const id = uuid();
    const ext = extname(file.originalname).slice(1).toLowerCase();
    cb(null, `${id}.${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  fileFilter: (req, file, cb) => {
    const ext = extname(file.originalname).slice(1).toLowerCase();
    if (SUPPORTED_EXTENSIONS.has(ext)) cb(null, true);
    else cb(new Error(`Unsupported file type: .${ext}`));
  }
});

const router = Router();

// POST /api/uploads  — submit a file for approval
router.post('/', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const { targetFolder, title, authors, description, system, contentType, tags } = req.body;
  if (!targetFolder || !title) {
    unlinkSync(req.file.path);
    return res.status(400).json({ error: 'targetFolder and title are required' });
  }

  const ext = extname(req.file.originalname).slice(1).toLowerCase();
  const fileType = FILE_TYPE_MAP[ext] || 'other';

  const db = getDb();
  const id = uuid();

  db.prepare(`
    INSERT INTO upload_queue
      (id, filename, original_name, target_folder, title, authors, description,
       system, content_type, tags, file_size, file_type, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    req.file.filename,
    req.file.originalname,
    targetFolder,
    title,
    authors ? JSON.stringify(JSON.parse(authors)) : '[]',
    description || '',
    system || '',
    contentType || '',
    tags ? JSON.stringify(JSON.parse(tags)) : '[]',
    req.file.size,
    fileType,
    req.user.id
  );

  res.status(201).json({ id, message: 'File submitted for approval' });
});

// GET /api/uploads  — list queue (admin sees all, others see own)
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const { status = 'pending' } = req.query;

  let sql = `
    SELECT uq.*, u.display_name as uploader_name, r.display_name as reviewer_name
    FROM upload_queue uq
    JOIN users u ON uq.uploaded_by = u.id
    LEFT JOIN users r ON uq.reviewed_by = r.id
    WHERE uq.status = ?
  `;
  const params = [status];

  if (req.user.role !== 'admin') {
    sql += ' AND uq.uploaded_by = ?';
    params.push(req.user.id);
  }

  sql += ' ORDER BY uq.created_at DESC';
  const items = db.prepare(sql).all(...params);
  res.json(items);
});

// POST /api/uploads/:id/approve  (admin only)
router.post('/:id/approve', requireAuth, requireRole('admin'), async (req, res) => {
  const db = getDb();
  const item = db.prepare('SELECT * FROM upload_queue WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  if (item.status !== 'pending') return res.status(400).json({ error: 'Already reviewed' });

  // Move file to library
  const ext = extname(item.filename).slice(1).toLowerCase();
  const destFolder = join(LIBRARY_PATH, item.target_folder);

  try {
    mkdirSync(destFolder, { recursive: true });
    const safeFilename = item.original_name.replace(/[^a-zA-Z0-9._\-\s]/g, '_');
    const destPath = join(destFolder, safeFilename);
    const srcPath = join(UPLOADS_PATH, item.filename);

    renameSync(srcPath, destPath);

    db.prepare(`
      UPDATE upload_queue
      SET status = 'approved', reviewed_by = ?, reviewed_at = unixepoch()
      WHERE id = ?
    `).run(req.user.id, item.id);

    // Trigger re-scan to pick up new file
    scanLibrary().catch(e => console.error('[Upload Approve] Scan error:', e));

    res.json({ message: 'Approved and added to library' });
  } catch (e) {
    console.error('[Upload Approve] Error:', e);
    res.status(500).json({ error: 'Failed to move file to library' });
  }
});

// POST /api/uploads/:id/reject  (admin only)
router.post('/:id/reject', requireAuth, requireRole('admin'), (req, res) => {
  const db = getDb();
  const item = db.prepare('SELECT * FROM upload_queue WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  if (item.status !== 'pending') return res.status(400).json({ error: 'Already reviewed' });

  const { reason } = req.body;

  try {
    const srcPath = join(UPLOADS_PATH, item.filename);
    if (existsSync(srcPath)) unlinkSync(srcPath);
  } catch {}

  db.prepare(`
    UPDATE upload_queue
    SET status = 'rejected', reviewed_by = ?, reviewed_at = unixepoch(), reject_reason = ?
    WHERE id = ?
  `).run(req.user.id, reason || '', item.id);

  res.json({ message: 'Rejected' });
});

export default router;

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
  limits: { fileSize: (parseInt(process.env.MAX_UPLOAD_MB) || 5120) * 1024 * 1024 },
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

// PUT /api/uploads/:id — update a pending upload's metadata and target folder
router.put('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const db = await getDb();
    const item = await dbGet(db, 'SELECT * FROM upload_queue WHERE id = $1', [req.params.id]);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (item.status !== 'pending') return res.status(400).json({ error: 'Can only edit pending uploads' });

    const { title, authors, description, system, content_type, publisher, year, tags, target_folder } = req.body;

    await dbRun(db, `
      UPDATE upload_queue SET
        title         = COALESCE($1, title),
        authors       = COALESCE($2, authors),
        description   = COALESCE($3, description),
        system        = COALESCE($4, system),
        content_type  = COALESCE($5, content_type),
        publisher     = COALESCE($6, publisher),
        year          = $7,
        tags          = COALESCE($8, tags),
        target_folder = COALESCE($9, target_folder)
      WHERE id = $10
    `, [
      title         || null,
      authors       ? JSON.stringify(Array.isArray(authors) ? authors : authors.split(',').map(a => a.trim()).filter(Boolean)) : null,
      description   ?? null,
      system        || null,
      content_type  || null,
      publisher     || null,
      year          ? parseInt(year) : null,
      tags          ? JSON.stringify(Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim()).filter(Boolean)) : null,
      target_folder || null,
      req.params.id,
    ]);

    const updated = await dbGet(db, 'SELECT * FROM upload_queue WHERE id = $1', [req.params.id]);
    logger.event('Upload', 'Upload edited by admin', { id: req.params.id, by: req.user.email });
    res.json(updated);
  } catch (e) { logger.error('Upload', 'Edit error', { error: e.message }); res.status(500).json({ error: e.message }); }
});

// POST /api/uploads/bulk — upload multiple files with shared metadata
router.post('/bulk', requireAuth, upload.array('files', 50), async (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
  const { system, content_type, target_folder, title_prefix } = req.body;
  const db = await getDb();
  const results = [];
  for (const file of req.files) {
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const baseName = originalName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ').trim();
    const title = title_prefix ? `${title_prefix} - ${baseName}` : baseName;
    const id = uuid();
    const ext = extname(originalName).slice(1).toLowerCase();
    await dbRun(db, `
      INSERT INTO upload_queue
        (id, filename, original_name, target_folder, title, system, content_type,
         file_size, file_type, uploaded_by, status, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11)
    `, [id, file.filename, originalName, target_folder || '', title, system || '', content_type || '',
        file.size, ext, req.user.id, now()]);
    results.push({ id, filename: originalName, title });
  }
  logger.event('Upload', 'Bulk upload submitted', { count: req.files.length, by: req.user.email });
  res.json({ uploaded: results.length, items: results });
});

// POST /api/uploads/bulk-approve — approve multiple uploads at once
router.post('/bulk-approve', requireAuth, requireRole('admin'), async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids required' });

  const results = { approved: [], failed: [] };
  for (const id of ids) {
    try {
      const db = await getDb();
      const item = await dbGet(db, 'SELECT * FROM upload_queue WHERE id = $1', [id]);
      if (!item || item.status !== 'pending') { results.failed.push(id); continue; }

      const destFolder = join(LIBRARY_PATH, item.target_folder);
      mkdirSync(destFolder, { recursive: true });
      const safeFilename = item.original_name.replace(/[^a-zA-Z0-9._\-\s]/g, '_');
      const src  = join(UPLOADS_PATH, item.filename);
      const dest = join(destFolder, safeFilename);
      copyFileSync(src, dest);
      unlinkSync(src);

      await dbRun(db, "UPDATE upload_queue SET status='approved', reviewed_by=$1, reviewed_at=$2 WHERE id=$3",
        [req.user.id, now(), id]);

      const relPath  = join(item.target_folder, safeFilename).replace(/[\\]/g, '/');
      const ext      = item.filename.split('.').pop().toLowerCase();
      const { FILE_TYPE_MAP } = await import('../config.js');
      const fileType = FILE_TYPE_MAP[ext] || 'other';
      const itemId   = uuid();
      const existing = await dbGet(db, 'SELECT id FROM library_items WHERE path = $1', [relPath]);
      if (!existing) {
        await dbRun(db, `INSERT INTO library_items
          (id, path, filename, title, authors, description, system, content_type,
           tags, file_size, file_type, metadata_source, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'upload',$12,$12)`,
          [itemId, relPath, safeFilename, item.title, item.authors||'[]', item.description||'',
           item.system||'', item.content_type||'', item.tags||'[]', item.file_size, fileType, now()]);

        if (fileType === 'image') {
          const { generateCover } = await import('../services/coverService.js');
          const absPath = join(LIBRARY_PATH, relPath);
          setImmediate(async () => {
            try {
              const coverPath = await generateCover(absPath, itemId, 'image');
              if (coverPath) {
                const db2 = await getDb();
                await dbRun(db2, 'UPDATE library_items SET cover_path=$1 WHERE id=$2', [coverPath, itemId]);
              }
            } catch {}
          });
        }
      }
      results.approved.push(id);
    } catch (e) { logger.warn('Upload', 'Bulk approve item failed', { id, error: e.message }); results.failed.push(id); }
  }

  scanLibrary().catch(() => {});
  logger.event('Upload', 'Bulk approve', { approved: results.approved.length, failed: results.failed.length, by: req.user.email });
  res.json(results);
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
    logger.debug('Upload', 'Approving — file paths', {
      originalName: item.original_name,
      safeFilename,
      src,
      dest,
      destFolder,
      targetFolder: item.target_folder,
    });
    copyFileSync(src, dest);
    unlinkSync(src);

    await dbRun(db,
      "UPDATE upload_queue SET status='approved', reviewed_by=$1, reviewed_at=$2 WHERE id=$3",
      [req.user.id, now(), item.id]
    );

    // Insert directly into library_items using the queue's metadata so it's
    // never treated as an unknown file by the scanner. metadata_source='upload'
    // prevents autoFetchMetadata from overwriting what the uploader specified.
    const relPath = join(item.target_folder, safeFilename).replace(/\\/g, '/');
    const ext = item.filename.split('.').pop().toLowerCase();
    const { FILE_TYPE_MAP } = await import('../config.js');
    const fileType = FILE_TYPE_MAP[ext] || 'other';
    logger.debug('Upload', 'Inserting into library_items', {
      relPath, system: item.system, content_type: item.content_type,
      title: item.title, fileType,
    });
    const itemId = uuid();
    const existing = await dbGet(db, 'SELECT id FROM library_items WHERE path = $1', [relPath]);
    if (!existing) {
      await dbRun(db, `
        INSERT INTO library_items
          (id, path, filename, title, authors, description, system, content_type,
           tags, file_size, file_type, metadata_source, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'upload',$12,$12)
      `, [
        itemId, relPath, safeFilename,
        item.title,
        item.authors || '[]',
        item.description || '',
        item.system || '',
        item.content_type || '',
        item.tags || '[]',
        item.file_size,
        fileType,
        now(),
      ]);
    }

    // For image files: generate cover immediately rather than waiting for scanner
    // (scanner skips existing DB records so cover would never be generated otherwise)
    if (fileType === 'image' && itemId) {
      const { generateCover } = await import('../services/coverService.js');
      const { LIBRARY_PATH: LP } = await import('../config.js');
      const { join: pj } = await import('path');
      setImmediate(async () => {
        try {
          const coverPath = await generateCover(pj(LP, relPath), itemId, 'image');
          if (coverPath) {
            const db2 = await getDb();
            await dbRun(db2, 'UPDATE library_items SET cover_path=$1 WHERE id=$2', [coverPath, itemId]);
            logger.debug('Upload', 'Cover generated for image upload', { itemId, coverPath });
          }
        } catch (e) { logger.warn('Upload', 'Cover generation failed for image', { error: e.message }); }
      });
    }

    logger.event('Upload', 'Upload approved', { title: item.title, by: req.user.email, dest: item.target_folder });
    // Scan in background to pick up folder counts
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

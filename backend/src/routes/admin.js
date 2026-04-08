import { Router } from 'express';
import multer from 'multer';
import { getDb, dbAll, dbRun, dbGet } from '../db/database.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const now = () => Math.floor(Date.now() / 1000);

const BACKUP_VERSION = 1;

// GET /api/admin/backup — download a full metadata backup as JSON
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
      version: BACKUP_VERSION,
      created_at: now(),
      created_at_iso: new Date().toISOString(),
      app: 'tavernshelf',
      tables: { users, invite_tokens: invites, library_items: items, folders, upload_queue: queue },
    };

    const filename = `tavernshelf-backup-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(backup);
  } catch (e) {
    console.error('[Admin] Backup error:', e.message);
    res.status(500).json({ error: 'Backup failed' });
  }
});

// POST /api/admin/restore — restore from a backup JSON file
router.post('/restore', requireAuth, requireRole('admin'), upload.single('backup'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No backup file uploaded' });

  let backup;
  try {
    backup = JSON.parse(req.file.buffer.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON file' });
  }

  if (backup.app !== 'tavernshelf') return res.status(400).json({ error: 'Not a TavernShelf backup file' });
  if (!backup.tables) return res.status(400).json({ error: 'Backup file is missing data' });

  try {
    const db = await getDb();
    const { users, invite_tokens, library_items, folders, upload_queue } = backup.tables;

    // Restore in dependency order — users first, then everything that references them
    if (users?.length) {
      await dbRun(db, 'DELETE FROM upload_queue');
      await dbRun(db, 'DELETE FROM invite_tokens');
      await dbRun(db, 'DELETE FROM library_items');
      await dbRun(db, 'DELETE FROM folders');
      await dbRun(db, 'DELETE FROM users');

      for (const u of users) {
        // Users from backup don't have passwords (we strip them for safety)
        // Skip if no password field — they'll need to be re-invited
        if (!u.password) continue;
        await dbRun(db, `
          INSERT INTO users (id, email, password, display_name, role, created_at, last_login)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
          ON CONFLICT (id) DO NOTHING
        `, [u.id, u.email, u.password, u.display_name, u.role, u.created_at || now(), u.last_login]);
      }
    }

    if (library_items?.length) {
      for (const item of library_items) {
        await dbRun(db, `
          INSERT INTO library_items
            (id, path, filename, title, authors, description, system, content_type,
             publisher, year, tags, cover_path, file_type, file_size, page_count,
             metadata_source, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
          ON CONFLICT (id) DO NOTHING
        `, [
          item.id, item.path, item.filename, item.title,
          item.authors || '[]', item.description || '', item.system || '',
          item.content_type || '', item.publisher || '', item.year,
          item.tags || '[]', item.cover_path, item.file_type, item.file_size || 0,
          item.page_count, item.metadata_source || 'filename',
          item.created_at || now(), item.updated_at || now(),
        ]);
      }
    }

    if (folders?.length) {
      for (const f of folders) {
        await dbRun(db, `
          INSERT INTO folders (id, path, name, parent_id, item_count, created_at)
          VALUES ($1,$2,$3,$4,$5,$6)
          ON CONFLICT (id) DO NOTHING
        `, [f.id, f.path, f.name, f.parent_id, f.item_count || 0, f.created_at || now()]);
      }
    }

    if (invite_tokens?.length) {
      for (const t of invite_tokens) {
        const creator = await dbGet(db, 'SELECT id FROM users WHERE id = $1', [t.created_by]);
        if (!creator) continue;
        await dbRun(db, `
          INSERT INTO invite_tokens (token, created_by, role, used_by, used_at, expires_at, created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
          ON CONFLICT (token) DO NOTHING
        `, [t.token, t.created_by, t.role, t.used_by, t.used_at, t.expires_at, t.created_at || now()]);
      }
    }

    const counts = {
      users:         users?.length || 0,
      library_items: library_items?.length || 0,
      folders:       folders?.length || 0,
      invite_tokens: invite_tokens?.length || 0,
    };
    console.log('[Admin] Restore complete:', counts);
    res.json({ message: 'Restore complete', counts });
  } catch (e) {
    console.error('[Admin] Restore error:', e.message);
    res.status(500).json({ error: `Restore failed: ${e.message}` });
  }
});

export default router;

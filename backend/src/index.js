import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { json } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';

import { PORT, NODE_ENV, ADMIN_EMAIL, ADMIN_PASSWORD } from './config.js';
import { getDb } from './db/database.js';
import { scanLibrary } from './services/libraryScanner.js';

import authRoutes    from './routes/auth.js';
import libraryRoutes from './routes/library.js';
import uploadRoutes  from './routes/uploads.js';

const app = express();

// ── Security ──────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: true, credentials: true }));
app.use(json({ limit: '10mb' }));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
app.use('/api/', limiter);
app.use('/api/auth/', authLimiter);

// ── Routes ────────────────────────────────────────────────
app.use('/api/auth',    authRoutes);
app.use('/api/library', libraryRoutes);
app.use('/api/uploads', uploadRoutes);

// ── Health ────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '0.0.1', uptime: process.uptime() });
});

// ── 404 ───────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// ── Error handler ─────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large (max 500 MB)' });
  res.status(500).json({ error: NODE_ENV === 'development' ? err.message : 'Internal server error' });
});

// ── Seed admin & start ────────────────────────────────────
async function start() {
  const db = getDb();

  const existing = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
  if (!existing) {
    console.log('[Boot] Creating admin account:', ADMIN_EMAIL);
    db.prepare(
      'INSERT INTO users (id, email, password, display_name, role) VALUES (?, ?, ?, ?, ?)'
    ).run(uuid(), ADMIN_EMAIL, bcrypt.hashSync(ADMIN_PASSWORD, 12), 'Admin', 'admin');
  }

  app.listen(PORT, () => {
    console.log(`[TavernShelf] API v0.0.1 listening on :${PORT}`);
  });

  // Run initial scan after a short delay (give volumes time to mount)
  setTimeout(() => {
    scanLibrary().catch(e => console.error('[Boot] Initial scan failed:', e));
  }, 3000);
}

start().catch(e => {
  console.error('[Boot] Fatal error:', e);
  process.exit(1);
});

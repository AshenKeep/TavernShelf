import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { json } from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';

import { PORT, NODE_ENV, ADMIN_EMAIL, ADMIN_PASSWORD, TRUST_PROXY } from './config.js';
import { getDb } from './db/database.js';
import { scanLibrary } from './services/libraryScanner.js';

import authRoutes    from './routes/auth.js';
import libraryRoutes from './routes/library.js';
import uploadRoutes  from './routes/uploads.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();

// ── Proxy trust ───────────────────────────────────────────
// Enable when running behind nginx, Tailscale, Cloudflare, etc.
// Allows correct IP logging and HTTPS detection via X-Forwarded-* headers
if (TRUST_PROXY) {
  app.set('trust proxy', 1);
  console.log('[Boot] Proxy trust enabled');
}

// ── Security ──────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  // Allow PDF.js and JSZip to load from the app itself
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'", "'unsafe-eval'", "cdn.jsdelivr.net", "cdnjs.cloudflare.com"],
      workerSrc:  ["'self'", "blob:"],
      styleSrc:   ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
      fontSrc:    ["'self'", "fonts.gstatic.com"],
      imgSrc:     ["'self'", "data:", "blob:", "covers.openlibrary.org", "books.google.com"],
      connectSrc: ["'self'"],
      objectSrc:  ["'none'"],
    },
  },
}));

app.use(cors({ origin: true, credentials: true }));
app.use(json({ limit: '10mb' }));

// ── Rate limiting ─────────────────────────────────────────
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));
app.use('/api/auth/', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));

// ── API routes ────────────────────────────────────────────
app.use('/api/auth',    authRoutes);
app.use('/api/library', libraryRoutes);
app.use('/api/uploads', uploadRoutes);

// ── Health ────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '0.0.3', uptime: Math.floor(process.uptime()) });
});

// ── Serve built React frontend ────────────────────────────
const publicDir = join(__dirname, '..', 'public');
if (existsSync(publicDir)) {
  app.use(express.static(publicDir));
  // SPA fallback — any non-API route serves index.html
  app.get('*', (req, res) => {
    res.sendFile(join(publicDir, 'index.html'));
  });
} else {
  // Dev mode — no built frontend present
  app.get('/', (req, res) => {
    res.json({ message: 'TavernShelf API v0.0.3 — frontend not built yet. Run: cd frontend && npm run build' });
  });
}

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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[TavernShelf] v0.0.3 listening on :${PORT}`);
    console.log(`[TavernShelf] Library: ${process.env.LIBRARY_PATH}`);
  });

  // Initial scan — small delay to ensure DB is fully ready
  setTimeout(() => {
    scanLibrary().catch(e => console.error('[Boot] Initial scan failed:', e));
  }, 2000);
}

start().catch(e => {
  console.error('[Boot] Fatal error:', e);
  process.exit(1);
});

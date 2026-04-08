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
import { getDb, dbGet, dbRun } from './db/database.js';
import { scanLibrary } from './services/libraryScanner.js';

import authRoutes    from './routes/auth.js';
import libraryRoutes from './routes/library.js';
import uploadRoutes  from './routes/uploads.js';
import adminRoutes   from './routes/admin.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

if (TRUST_PROXY) {
  app.set('trust proxy', 1);
  console.log('[Boot] Proxy trust enabled');
}

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
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
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));
app.use('/api/auth/', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));

app.use('/api/auth',    authRoutes);
app.use('/api/library', libraryRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/admin',   adminRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '0.0.4', uptime: Math.floor(process.uptime()) });
});

const publicDir = join(__dirname, '..', 'public');
if (existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get('*', (req, res) => res.sendFile(join(publicDir, 'index.html')));
} else {
  app.get('/', (req, res) => res.json({ message: 'TavernShelf API v0.0.4 — run the frontend build' }));
}

app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large (max 500 MB)' });
  res.status(500).json({ error: NODE_ENV === 'development' ? err.message : 'Internal server error' });
});

async function start() {
  // Initialise DB and run migrations before accepting requests
  const db = await getDb();

  const existing = await dbGet(db, "SELECT id FROM users WHERE role = 'admin'");
  if (!existing) {
    console.log('[Boot] Creating admin account:', ADMIN_EMAIL);
    await dbRun(db,
      'INSERT INTO users (id, email, password, display_name, role, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
      [uuid(), ADMIN_EMAIL, bcrypt.hashSync(ADMIN_PASSWORD, 12), 'Admin', 'admin', Math.floor(Date.now() / 1000)]
    );
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[TavernShelf] v0.0.4 listening on :${PORT}`);
    console.log(`[TavernShelf] Library: ${process.env.LIBRARY_PATH}`);
    console.log(`[TavernShelf] DB engine: PGlite (embedded Postgres)`);
  });

  setTimeout(() => {
    scanLibrary().catch(e => console.error('[Boot] Initial scan failed:', e));
  }, 2000);
}

start().catch(e => {
  console.error('[Boot] Fatal error:', e);
  process.exit(1);
});

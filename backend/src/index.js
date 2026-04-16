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

import { PORT, NODE_ENV, ADMIN_EMAIL, ADMIN_PASSWORD, TRUST_PROXY, COVERS_PATH } from './config.js';
import { getDb, dbGet, dbRun } from './db/database.js';
import { scanLibrary } from './services/libraryScanner.js';
import { logger, setLogLevel } from './services/logger.js';

import authRoutes    from './routes/auth.js';
import libraryRoutes from './routes/library.js';
import uploadRoutes  from './routes/uploads.js';
import adminRoutes    from './routes/admin.js';
import campaignRoutes from './routes/campaigns.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

if (TRUST_PROXY) {
  app.set('trust proxy', 1);
  logger.info('Boot', 'Proxy trust enabled');
}

app.use(helmet({
  contentSecurityPolicy:     false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy:   false,
  crossOriginResourcePolicy: false,
  originAgentCluster:        false,
}));

app.use(cors({ origin: true, credentials: true }));
app.use(json({ limit: '10mb' }));

// HTTP request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level]('HTTP', `${req.method} ${req.path} ${res.statusCode}`, { ms, ip: req.ip });
  });
  next();
});

app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));
app.use('/api/auth/', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));

app.use('/api/auth',    authRoutes);
app.use('/api/library', libraryRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/admin',    adminRoutes);
app.use('/api/campaigns', campaignRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '0.1.5', uptime: Math.floor(process.uptime()) });
});

// Serve cover images from the covers volume
app.use('/covers', express.static(COVERS_PATH, {
  maxAge: '1d',
  immutable: false,
  fallthrough: false,
}));

// Serve built React frontend
const publicDir = join(__dirname, '..', 'public');
logger.info('Boot', `Frontend dir: ${publicDir} (exists: ${existsSync(publicDir)})`);

if (existsSync(publicDir)) {
  app.use(express.static(publicDir, { index: 'index.html' }));
  app.use((req, res) => res.sendFile(join(publicDir, 'index.html')));
} else {
  app.use((req, res) => res.json({ message: 'TavernShelf API v0.1.5 — frontend not built' }));
}

// Error handler
app.use((err, req, res, next) => {
  logger.error('HTTP', err.message, { path: req.path, stack: err.stack?.split('\n')[1]?.trim() });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `File too large (max ${process.env.MAX_UPLOAD_MB || 5120} MB)` });
  res.status(500).json({ error: NODE_ENV === 'development' ? err.message : 'Internal server error' });
});

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  logger.error('Process', 'Unhandled rejection', { reason: String(reason) });
});

process.on('uncaughtException', (err) => {
  logger.error('Process', 'Uncaught exception', { message: err.message });
});

async function start() {
  logger.info('Boot', 'TavernShelf v0.1.5 starting');

  // Restore log level from DB settings (persists across restarts)
  try {
    const { getDb, dbGet } = await import('./db/database.js');
    const db = await getDb();
    const lvl = await dbGet(db, "SELECT value FROM settings WHERE key='log.level'");
    if (lvl?.value) {
      setLogLevel(lvl.value);
      logger.info('Boot', `Log level restored: ${lvl.value}`);
    }
  } catch {}
  const db = await getDb();

  const existing = await dbGet(db, "SELECT id FROM users WHERE role = 'admin'");
  if (!existing) {
    logger.info('Boot', 'Creating admin account', { email: ADMIN_EMAIL });
    await dbRun(db,
      'INSERT INTO users (id, email, password, display_name, role, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
      [uuid(), ADMIN_EMAIL, bcrypt.hashSync(ADMIN_PASSWORD, 12), 'Admin', 'admin', Math.floor(Date.now() / 1000)]
    );
  }

  // Global error handler — catches multer errors (unsupported file type etc)
app.use((err, req, res, next) => {
  logger.error('Server', 'Unhandled error', { error: err.message, path: req.path });
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

app.listen(PORT, '0.0.0.0', () => {
    logger.info('Boot', `Listening on :${PORT}`, { library: process.env.LIBRARY_PATH, db: 'PGlite' });
    console.log(`[TavernShelf] v0.1.5 listening on :${PORT}`);
    console.log(`[TavernShelf] Library: ${process.env.LIBRARY_PATH}`);
  });

  setTimeout(() => {
    scanLibrary().catch(e => logger.error('Scanner', 'Initial scan failed', { error: e.message }));
  }, 2000);

  // Periodic rescan every 30 minutes to pick up external file system changes
  // (deletions, moves done outside TavernShelf)
  setInterval(() => {
    scanLibrary().catch(e => logger.error('Scanner', 'Periodic scan failed', { error: e.message }));
  }, 30 * 60 * 1000);
}

start().catch(e => {
  logger.error('Boot', 'Fatal error', { error: e.message });
  console.error('[Boot] Fatal error:', e);
  process.exit(1);
});

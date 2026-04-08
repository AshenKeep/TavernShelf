import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/database.js';
import { JWT_SECRET, JWT_EXPIRY } from '../config.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  db.prepare('UPDATE users SET last_login = unixepoch() WHERE id = ?').run(user.id);

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, displayName: user.display_name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );

  res.json({ token, user: { id: user.id, email: user.email, role: user.role, displayName: user.display_name } });
});

// POST /api/auth/register  (requires invite token)
router.post('/register', (req, res) => {
  const { email, password, displayName, inviteToken } = req.body;
  if (!email || !password || !displayName || !inviteToken) {
    return res.status(400).json({ error: 'All fields required' });
  }

  const db = getDb();
  const invite = db.prepare(
    'SELECT * FROM invite_tokens WHERE token = ? AND used_by IS NULL AND expires_at > unixepoch()'
  ).get(inviteToken);

  if (!invite) return res.status(400).json({ error: 'Invalid or expired invite token' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const id = uuid();
  const hashed = bcrypt.hashSync(password, 12);

  db.prepare(
    'INSERT INTO users (id, email, password, display_name, role) VALUES (?, ?, ?, ?, ?)'
  ).run(id, email.toLowerCase().trim(), hashed, displayName, invite.role);

  db.prepare(
    'UPDATE invite_tokens SET used_by = ?, used_at = unixepoch() WHERE token = ?'
  ).run(id, inviteToken);

  res.status(201).json({ message: 'Account created. You can now log in.' });
});

// POST /api/auth/invite  (admin only)
router.post('/invite', requireAuth, requireRole('admin'), (req, res) => {
  const { role = 'member', expiresInDays = 7 } = req.body;
  if (!['member', 'uploader'].includes(role)) {
    return res.status(400).json({ error: 'Role must be member or uploader' });
  }

  const token = uuid();
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInDays * 86400;
  const db = getDb();

  db.prepare(
    'INSERT INTO invite_tokens (token, created_by, role, expires_at) VALUES (?, ?, ?, ?)'
  ).run(token, req.user.id, role, expiresAt);

  res.json({ token, role, expiresAt });
});

// GET /api/auth/invites  (admin only)
router.get('/invites', requireAuth, requireRole('admin'), (req, res) => {
  const db = getDb();
  const invites = db.prepare(`
    SELECT it.*, u.display_name as used_by_name
    FROM invite_tokens it
    LEFT JOIN users u ON it.used_by = u.id
    ORDER BY it.created_at DESC
    LIMIT 50
  `).all();
  res.json(invites);
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, email, display_name, role, created_at, last_login FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

export default router;

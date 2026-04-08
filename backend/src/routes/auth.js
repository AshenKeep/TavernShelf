import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { getDb, dbGet, dbRun, dbAll } from '../db/database.js';
import { JWT_SECRET, JWT_EXPIRY } from '../config.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
const now = () => Math.floor(Date.now() / 1000);

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const db = await getDb();
    const user = await dbGet(db, 'SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    if (!bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Invalid credentials' });

    await dbRun(db, 'UPDATE users SET last_login = $1 WHERE id = $2', [now(), user.id]);

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, displayName: user.display_name },
      JWT_SECRET, { expiresIn: JWT_EXPIRY }
    );
    res.json({ token, user: { id: user.id, email: user.email, role: user.role, displayName: user.display_name } });
  } catch (e) { console.error('[Auth] Login:', e.message); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, displayName, inviteToken } = req.body;
    if (!email || !password || !displayName || !inviteToken)
      return res.status(400).json({ error: 'All fields required' });

    const db = await getDb();
    const invite = await dbGet(db,
      'SELECT * FROM invite_tokens WHERE token = $1 AND used_by IS NULL AND expires_at > $2',
      [inviteToken, now()]
    );
    if (!invite) return res.status(400).json({ error: 'Invalid or expired invite token' });

    const existing = await dbGet(db, 'SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const id = uuid();
    await dbRun(db,
      'INSERT INTO users (id, email, password, display_name, role, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
      [id, email.toLowerCase().trim(), bcrypt.hashSync(password, 12), displayName, invite.role, now()]
    );
    await dbRun(db, 'UPDATE invite_tokens SET used_by=$1, used_at=$2 WHERE token=$3', [id, now(), inviteToken]);
    res.status(201).json({ message: 'Account created. You can now log in.' });
  } catch (e) { console.error('[Auth] Register:', e.message); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/auth/invite (admin only)
router.post('/invite', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { role = 'member', expiresInDays = 7 } = req.body;
    if (!['member', 'uploader'].includes(role))
      return res.status(400).json({ error: 'Role must be member or uploader' });

    const token = uuid();
    const expiresAt = now() + expiresInDays * 86400;
    const db = await getDb();
    await dbRun(db,
      'INSERT INTO invite_tokens (token, created_by, role, expires_at, created_at) VALUES ($1,$2,$3,$4,$5)',
      [token, req.user.id, role, expiresAt, now()]
    );
    res.json({ token, role, expiresAt });
  } catch (e) { console.error('[Auth] Invite:', e.message); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/auth/invites (admin only)
router.get('/invites', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const db = await getDb();
    const invites = await dbAll(db, `
      SELECT it.*, u.display_name as used_by_name
      FROM invite_tokens it
      LEFT JOIN users u ON it.used_by = u.id
      ORDER BY it.created_at DESC LIMIT 50
    `);
    res.json(invites);
  } catch (e) { console.error('[Auth] Invites:', e.message); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    const user = await dbGet(db,
      'SELECT id, email, display_name, role, created_at, last_login FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (e) { console.error('[Auth] Me:', e.message); res.status(500).json({ error: 'Server error' }); }
});

export default router;

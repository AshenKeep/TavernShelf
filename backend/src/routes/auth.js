import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { getDb, dbGet, dbRun, dbAll } from '../db/database.js';
import { JWT_SECRET, JWT_EXPIRY } from '../config.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { logger } from '../services/logger.js';

const router = Router();
const now = () => Math.floor(Date.now() / 1000);

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const db = await getDb();
    const user = await dbGet(db, 'SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      logger.warn('Auth', 'Failed login attempt', { email });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await dbRun(db, 'UPDATE users SET last_login = $1 WHERE id = $2', [now(), user.id]);
    logger.event('Auth', 'User logged in', { email: user.email, role: user.role });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, displayName: user.display_name },
      JWT_SECRET, { expiresIn: JWT_EXPIRY }
    );
    res.json({ token, user: { id: user.id, email: user.email, role: user.role, displayName: user.display_name } });
  } catch (e) { logger.error('Auth', 'Login error', { error: e.message }); res.status(500).json({ error: 'Server error' }); }
});

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
    logger.event('Auth', 'New user registered', { email, role: invite.role });
    res.status(201).json({ message: 'Account created. You can now log in.' });
  } catch (e) { logger.error('Auth', 'Register error', { error: e.message }); res.status(500).json({ error: 'Server error' }); }
});

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
    logger.event('Auth', 'Invite token created', { by: req.user.email, role, expiresInDays });
    res.json({ token, role, expiresAt });
  } catch (e) { logger.error('Auth', 'Invite error', { error: e.message }); res.status(500).json({ error: 'Server error' }); }
});

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
  } catch (e) { logger.error('Auth', 'Invites list error', { error: e.message }); res.status(500).json({ error: 'Server error' }); }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    const user = await dbGet(db,
      'SELECT id, email, display_name, role, created_at, last_login FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (e) { logger.error('Auth', 'Me error', { error: e.message }); res.status(500).json({ error: 'Server error' }); }
});


// PUT /api/auth/credentials — change own email and/or password (admin only for now)
router.put('/credentials', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword, newEmail } = req.body;
    if (!currentPassword) return res.status(400).json({ error: 'Current password required' });
    if (!newPassword && !newEmail) return res.status(400).json({ error: 'Provide a new password or email' });

    const db = await getDb();
    const user = await dbGet(db, 'SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!bcrypt.compareSync(currentPassword, user.password)) {
      logger.warn('Auth', 'Credentials change failed — wrong current password', { email: user.email });
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    if (newEmail && newEmail !== user.email) {
      const existing = await dbGet(db, 'SELECT id FROM users WHERE email = $1 AND id != $2', [newEmail.toLowerCase().trim(), user.id]);
      if (existing) return res.status(409).json({ error: 'Email already in use' });
      await dbRun(db, 'UPDATE users SET email = $1 WHERE id = $2', [newEmail.toLowerCase().trim(), user.id]);
      logger.event('Auth', 'Email changed', { from: user.email, to: newEmail });
    }

    if (newPassword) {
      if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
      await dbRun(db, 'UPDATE users SET password = $1 WHERE id = $2', [bcrypt.hashSync(newPassword, 12), user.id]);
      logger.event('Auth', 'Password changed', { email: user.email });
    }

    res.json({ message: 'Credentials updated' });
  } catch (e) { logger.error('Auth', 'Credentials change error', { error: e.message }); res.status(500).json({ error: 'Server error' }); }
});

export default router;

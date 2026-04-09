import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import bcrypt from 'bcryptjs';
import { getDb, dbAll, dbGet, dbRun } from '../db/database.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { logger } from '../services/logger.js';
import { sendCampaignInviteEmail } from '../services/emailService.js';

const router = Router();
const now = () => Math.floor(Date.now() / 1000);

const ITEM_STATUSES = ['reading', 'completed', 'reference', 'wishlist'];
const MEMBER_ROLES  = ['viewer', 'collaborator'];

// ── Helpers ───────────────────────────────────────────────

// Get campaign and verify caller has access. Returns { campaign, myRole }
// myRole: 'owner' | 'collaborator' | 'viewer' | null (admins get 'owner' rights)
async function getCampaignAccess(db, campaignId, userId, userRole) {
  const campaign = await dbGet(db, 'SELECT * FROM campaigns WHERE id = $1', [campaignId]);
  if (!campaign) return null;

  if (userRole === 'admin') return { campaign, myRole: 'owner' };
  if (campaign.owner_id === userId) return { campaign, myRole: 'owner' };

  const member = await dbGet(db,
    'SELECT role FROM campaign_members WHERE campaign_id = $1 AND user_id = $2',
    [campaignId, userId]
  );
  if (!member) return null;
  return { campaign, myRole: member.role };
}

function parseCampaign(c) {
  return { ...c };
}

// GET /api/campaigns/item/:itemId — get all campaigns an item belongs to (for the user)
router.get('/item/:itemId', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    const memberships = await dbAll(db, `
      SELECT c.id, c.name, ci.status, ci.notes, ci.id as campaign_item_id,
             CASE WHEN c.owner_id = $1 THEN 'owner' ELSE cm.role END as my_role
      FROM campaign_items ci
      JOIN campaigns c ON ci.campaign_id = c.id
      LEFT JOIN campaign_members cm ON cm.campaign_id = c.id AND cm.user_id = $1
      WHERE ci.item_id = $2
        AND (c.owner_id = $1 OR cm.user_id = $1 OR $3 = 'admin')
      ORDER BY c.name
    `, [req.user.id, req.params.itemId, req.user.role]);
    res.json(memberships);
  } catch (e) { logger.error('Campaigns', 'Item memberships error', { error: e.message }); res.status(500).json({ error: 'Server error' }); }
});

function tryParse(val, fallback) {
  try { return JSON.parse(val); } catch { return fallback; }
}

// ── Campaign CRUD ─────────────────────────────────────────

// GET /api/campaigns — list campaigns the user owns or is invited to
router.get('/', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    let campaigns;

    if (req.user.role === 'admin') {
      campaigns = await dbAll(db, `
        SELECT c.*, u.display_name as owner_name,
          'owner' as my_role,
          (SELECT COUNT(*) FROM campaign_items ci WHERE ci.campaign_id = c.id) as item_count,
          (SELECT COUNT(*) FROM campaign_members cm WHERE cm.campaign_id = c.id) as member_count
        FROM campaigns c
        JOIN users u ON c.owner_id = u.id
        ORDER BY c.updated_at DESC
      `);
    } else {
      campaigns = await dbAll(db, `
        SELECT c.*, u.display_name as owner_name,
          CASE WHEN c.owner_id = $1 THEN 'owner' ELSE cm.role END as my_role,
          (SELECT COUNT(*) FROM campaign_items ci WHERE ci.campaign_id = c.id) as item_count,
          (SELECT COUNT(*) FROM campaign_members cm2 WHERE cm2.campaign_id = c.id) as member_count
        FROM campaigns c
        JOIN users u ON c.owner_id = u.id
        LEFT JOIN campaign_members cm ON cm.campaign_id = c.id AND cm.user_id = $1
        WHERE c.owner_id = $1 OR cm.user_id = $1
        ORDER BY c.updated_at DESC
      `, [req.user.id]);
    }
    res.json(campaigns.map(c => ({ ...c, item_count: parseInt(c.item_count), member_count: parseInt(c.member_count) })));
  } catch (e) { logger.error('Campaigns', 'List error', { error: e.message }); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/campaigns — create campaign
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, description = '' } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

    const db = await getDb();
    const id = uuid();
    await dbRun(db,
      'INSERT INTO campaigns (id, name, description, owner_id, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$5)',
      [id, name.trim(), description, req.user.id, now()]
    );
    logger.event('Campaigns', 'Campaign created', { name, by: req.user.email });
    const campaign = await dbGet(db, 'SELECT * FROM campaigns WHERE id = $1', [id]);
    res.status(201).json({ ...campaign, my_role: 'owner', item_count: 0, member_count: 0 });
  } catch (e) { logger.error('Campaigns', 'Create error', { error: e.message }); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/campaigns/:id — get campaign detail
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    const access = await getCampaignAccess(db, req.params.id, req.user.id, req.user.role);
    if (!access) return res.status(404).json({ error: 'Campaign not found' });

    const { campaign, myRole } = access;

    const [members, items] = await Promise.all([
      dbAll(db, `
        SELECT cm.role, cm.invited_at, u.id as user_id, u.display_name, u.email
        FROM campaign_members cm
        JOIN users u ON cm.user_id = u.id
        WHERE cm.campaign_id = $1
        ORDER BY cm.invited_at ASC
      `, [campaign.id]),
      dbAll(db, `
        SELECT ci.*, li.title, li.authors, li.cover_path, li.file_type, li.file_size,
               li.system, li.content_type, li.updated_at as item_updated_at,
               u.display_name as added_by_name
        FROM campaign_items ci
        JOIN library_items li ON ci.item_id = li.id
        JOIN users u ON ci.added_by = u.id
        WHERE ci.campaign_id = $1
        ORDER BY ci.added_at DESC
      `, [campaign.id]),
    ]);

    const owner = await dbGet(db, 'SELECT id, display_name, email FROM users WHERE id = $1', [campaign.owner_id]);

    res.json({
      ...campaign,
      my_role: myRole,
      owner,
      members,
      items: items.map(i => ({
        ...i,
        authors: tryParse(i.authors, []),
      })),
    });
  } catch (e) { logger.error('Campaigns', 'Get error', { error: e.message }); res.status(500).json({ error: 'Server error' }); }
});

// PUT /api/campaigns/:id — update campaign name/description (owner only)
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    const access = await getCampaignAccess(db, req.params.id, req.user.id, req.user.role);
    if (!access) return res.status(404).json({ error: 'Campaign not found' });
    if (access.myRole !== 'owner') return res.status(403).json({ error: 'Only the campaign owner can edit it' });

    const { name, description } = req.body;
    if (name) await dbRun(db, 'UPDATE campaigns SET name=$1, updated_at=$2 WHERE id=$3', [name.trim(), now(), req.params.id]);
    if (description !== undefined) await dbRun(db, 'UPDATE campaigns SET description=$1, updated_at=$2 WHERE id=$3', [description, now(), req.params.id]);

    const updated = await dbGet(db, 'SELECT * FROM campaigns WHERE id = $1', [req.params.id]);
    res.json(updated);
  } catch (e) { logger.error('Campaigns', 'Update error', { error: e.message }); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/campaigns/:id (owner only)
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    const access = await getCampaignAccess(db, req.params.id, req.user.id, req.user.role);
    if (!access) return res.status(404).json({ error: 'Campaign not found' });
    if (access.myRole !== 'owner') return res.status(403).json({ error: 'Only the campaign owner can delete it' });

    await dbRun(db, 'DELETE FROM campaigns WHERE id = $1', [req.params.id]);
    logger.event('Campaigns', 'Campaign deleted', { name: access.campaign.name, by: req.user.email });
    res.json({ message: 'Campaign deleted' });
  } catch (e) { logger.error('Campaigns', 'Delete error', { error: e.message }); res.status(500).json({ error: 'Server error' }); }
});

// ── Members ───────────────────────────────────────────────

// POST /api/campaigns/:id/members — invite user by email (owner only)
// If the user doesn't exist yet, creates an invite token and sends an email
router.post('/:id/members', requireAuth, async (req, res) => {
  try {
    const { email, role = 'viewer' } = req.body;
    if (!email) return res.status(400).json({ error: 'email is required' });
    if (!MEMBER_ROLES.includes(role)) return res.status(400).json({ error: 'role must be viewer or collaborator' });

    const db = await getDb();
    const access = await getCampaignAccess(db, req.params.id, req.user.id, req.user.role);
    if (!access) return res.status(404).json({ error: 'Campaign not found' });
    if (access.myRole !== 'owner') return res.status(403).json({ error: 'Only the owner can invite members' });

    const cleanEmail = email.toLowerCase().trim();
    let invitee = await dbGet(db, 'SELECT id, display_name, email FROM users WHERE email = $1', [cleanEmail]);

    if (!invitee) {
      // User doesn't exist — create an invite token and send email
      // Store campaign info in the token so we can add them on registration
      const token = uuid();
      const expiresAt = now() + 7 * 86400;
      await dbRun(db,
        'INSERT INTO invite_tokens (token, created_by, role, expires_at, created_at) VALUES ($1,$2,$3,$4,$5)',
        [token, req.user.id, 'member', expiresAt, now()]
      );

      // Store campaign invite details so registration can complete it
      await dbRun(db,
        'INSERT INTO settings (key, value, updated_at) VALUES ($1,$2,$3) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=$3',
        [`pending_campaign_invite.${token}`, JSON.stringify({ campaignId: req.params.id, role, email: cleanEmail }), now()]
      );

      const baseUrl = req.headers.origin || `http://localhost:${process.env.PORT || 3000}`;
      const inviteUrl = `${baseUrl}/register?invite=${token}`;
      const sent = await sendCampaignInviteEmail({
        to: cleanEmail,
        inviteUrl,
        invitedBy: req.user.displayName || req.user.email,
        campaignName: access.campaign.name,
        role,
        isNewUser: true,
      });

      logger.event('Campaigns', 'Campaign invite sent to new user', { campaign: access.campaign.name, email: cleanEmail, role, emailSent: sent });
      return res.status(201).json({ pending: true, email: cleanEmail, role, emailSent: sent, message: sent ? 'Invite email sent' : 'Invite created (email not configured)' });
    }

    if (invitee.id === req.user.id) return res.status(400).json({ error: 'You are already the owner' });

    const existing = await dbGet(db, 'SELECT role FROM campaign_members WHERE campaign_id=$1 AND user_id=$2', [req.params.id, invitee.id]);
    if (existing) return res.status(409).json({ error: 'User is already a member' });

    await dbRun(db,
      'INSERT INTO campaign_members (campaign_id, user_id, role, invited_at) VALUES ($1,$2,$3,$4)',
      [req.params.id, invitee.id, role, now()]
    );

    // Send notification email to existing user
    const baseUrl = req.headers.origin || `http://localhost:${process.env.PORT || 3000}`;
    const sent = await sendCampaignInviteEmail({
      to: cleanEmail,
      inviteUrl: `${baseUrl}/campaigns/${req.params.id}`,
      invitedBy: req.user.displayName || req.user.email,
      campaignName: access.campaign.name,
      role,
      isNewUser: false,
    });

    logger.event('Campaigns', 'Member invited', { campaign: access.campaign.name, invitee: email, role });
    res.status(201).json({ user_id: invitee.id, display_name: invitee.display_name, email: invitee.email, role, emailSent: sent });
  } catch (e) { logger.error('Campaigns', 'Invite error', { error: e.message }); res.status(500).json({ error: 'Server error' }); }
});

// PUT /api/campaigns/:id/members/:userId — change member role (owner only)
router.put('/:id/members/:userId', requireAuth, async (req, res) => {
  try {
    const { role } = req.body;
    if (!MEMBER_ROLES.includes(role)) return res.status(400).json({ error: 'role must be viewer or collaborator' });

    const db = await getDb();
    const access = await getCampaignAccess(db, req.params.id, req.user.id, req.user.role);
    if (!access) return res.status(404).json({ error: 'Campaign not found' });
    if (access.myRole !== 'owner') return res.status(403).json({ error: 'Only the owner can change roles' });

    await dbRun(db, 'UPDATE campaign_members SET role=$1 WHERE campaign_id=$2 AND user_id=$3', [role, req.params.id, req.params.userId]);
    res.json({ message: 'Role updated' });
  } catch (e) { logger.error('Campaigns', 'Role change error', { error: e.message }); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/campaigns/:id/members/:userId (owner only)
router.delete('/:id/members/:userId', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    const access = await getCampaignAccess(db, req.params.id, req.user.id, req.user.role);
    if (!access) return res.status(404).json({ error: 'Campaign not found' });
    if (access.myRole !== 'owner') return res.status(403).json({ error: 'Only the owner can remove members' });

    await dbRun(db, 'DELETE FROM campaign_members WHERE campaign_id=$1 AND user_id=$2', [req.params.id, req.params.userId]);
    res.json({ message: 'Member removed' });
  } catch (e) { logger.error('Campaigns', 'Remove member error', { error: e.message }); res.status(500).json({ error: 'Server error' }); }
});

// ── Campaign items ─────────────────────────────────────────

// GET /api/campaigns/:id/items — list items (member access)
router.get('/:id/items', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    const access = await getCampaignAccess(db, req.params.id, req.user.id, req.user.role);
    if (!access) return res.status(404).json({ error: 'Campaign not found' });

    const items = await dbAll(db, `
      SELECT ci.*, li.title, li.authors, li.cover_path, li.file_type, li.file_size,
             li.system, li.content_type, li.updated_at as item_updated_at,
             u.display_name as added_by_name
      FROM campaign_items ci
      JOIN library_items li ON ci.item_id = li.id
      JOIN users u ON ci.added_by = u.id
      WHERE ci.campaign_id = $1
      ORDER BY ci.added_at DESC
    `, [req.params.id]);

    res.json(items.map(i => ({ ...i, authors: tryParse(i.authors, []) })));
  } catch (e) { logger.error('Campaigns', 'Items list error', { error: e.message }); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/campaigns/:id/items — add item (owner or collaborator)
router.post('/:id/items', requireAuth, async (req, res) => {
  try {
    const { itemId, status = 'reference', notes = '' } = req.body;
    if (!itemId) return res.status(400).json({ error: 'itemId is required' });
    if (!ITEM_STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of: ${ITEM_STATUSES.join(', ')}` });

    const db = await getDb();
    const access = await getCampaignAccess(db, req.params.id, req.user.id, req.user.role);
    if (!access) return res.status(404).json({ error: 'Campaign not found' });
    if (access.myRole === 'viewer') return res.status(403).json({ error: 'Viewers cannot add items' });

    const libItem = await dbGet(db, 'SELECT id, title FROM library_items WHERE id = $1', [itemId]);
    if (!libItem) return res.status(404).json({ error: 'Library item not found' });

    const existing = await dbGet(db, 'SELECT id FROM campaign_items WHERE campaign_id=$1 AND item_id=$2', [req.params.id, itemId]);
    if (existing) return res.status(409).json({ error: 'Item already in campaign' });

    const id = uuid();
    await dbRun(db,
      'INSERT INTO campaign_items (id, campaign_id, item_id, status, notes, added_by, added_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$7)',
      [id, req.params.id, itemId, status, notes, req.user.id, now()]
    );
    // Touch campaign updated_at
    await dbRun(db, 'UPDATE campaigns SET updated_at=$1 WHERE id=$2', [now(), req.params.id]);
    logger.event('Campaigns', 'Item added to campaign', { campaign: access.campaign.name, item: libItem.title });
    res.status(201).json({ id, campaign_id: req.params.id, item_id: itemId, status, notes });
  } catch (e) { logger.error('Campaigns', 'Add item error', { error: e.message }); res.status(500).json({ error: 'Server error' }); }
});

// PUT /api/campaigns/:id/items/:itemId — update status/notes (owner or collaborator)
router.put('/:id/items/:itemId', requireAuth, async (req, res) => {
  try {
    const { status, notes } = req.body;
    if (status && !ITEM_STATUSES.includes(status)) return res.status(400).json({ error: `Invalid status` });

    const db = await getDb();
    const access = await getCampaignAccess(db, req.params.id, req.user.id, req.user.role);
    if (!access) return res.status(404).json({ error: 'Campaign not found' });
    if (access.myRole === 'viewer') return res.status(403).json({ error: 'Viewers cannot edit items' });

    const ci = await dbGet(db, 'SELECT id FROM campaign_items WHERE campaign_id=$1 AND item_id=$2', [req.params.id, req.params.itemId]);
    if (!ci) return res.status(404).json({ error: 'Item not in campaign' });

    if (status !== undefined) await dbRun(db, 'UPDATE campaign_items SET status=$1, updated_at=$2 WHERE id=$3', [status, now(), ci.id]);
    if (notes !== undefined)  await dbRun(db, 'UPDATE campaign_items SET notes=$1, updated_at=$2 WHERE id=$3', [notes, now(), ci.id]);

    await dbRun(db, 'UPDATE campaigns SET updated_at=$1 WHERE id=$2', [now(), req.params.id]);
    res.json({ message: 'Updated' });
  } catch (e) { logger.error('Campaigns', 'Update item error', { error: e.message }); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/campaigns/:id/items/:itemId (owner or collaborator)
router.delete('/:id/items/:itemId', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    const access = await getCampaignAccess(db, req.params.id, req.user.id, req.user.role);
    if (!access) return res.status(404).json({ error: 'Campaign not found' });
    if (access.myRole === 'viewer') return res.status(403).json({ error: 'Viewers cannot remove items' });

    await dbRun(db, 'DELETE FROM campaign_items WHERE campaign_id=$1 AND item_id=$2', [req.params.id, req.params.itemId]);
    await dbRun(db, 'UPDATE campaigns SET updated_at=$1 WHERE id=$2', [now(), req.params.id]);
    res.json({ message: 'Item removed from campaign' });
  } catch (e) { logger.error('Campaigns', 'Remove item error', { error: e.message }); res.status(500).json({ error: 'Server error' }); }
});


export default router;

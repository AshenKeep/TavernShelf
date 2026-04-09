import nodemailer from 'nodemailer';
import { getDb, dbGet, dbRun } from '../db/database.js';
import { logger } from './logger.js';

const now = () => Math.floor(Date.now() / 1000);

// ── Settings helpers ───────────────────────────────────────

export async function getEmailSettings() {
  const db = await getDb();
  const rows = await db.query(
    "SELECT key, value FROM settings WHERE key LIKE 'email.%'"
  );
  const settings = {};
  for (const row of rows.rows) {
    settings[row.key.replace('email.', '')] = row.value;
  }
  return settings; // { host, port, secure, user, pass, from, enabled }
}

export async function saveEmailSettings(settings) {
  const db = await getDb();
  for (const [key, value] of Object.entries(settings)) {
    await dbRun(db,
      'INSERT INTO settings (key, value, updated_at) VALUES ($1,$2,$3) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=$3',
      [`email.${key}`, String(value), now()]
    );
  }
}

// ── Transporter factory ────────────────────────────────────

async function createTransporter() {
  const s = await getEmailSettings();
  if (s.enabled !== 'true') return null;
  if (!s.host || !s.user || !s.pass) return null;

  return nodemailer.createTransport({
    host:   s.host,
    port:   parseInt(s.port || '587'),
    secure: s.secure === 'true',
    auth:   { user: s.user, pass: s.pass },
    tls:    { rejectUnauthorized: false },
  });
}

// ── Send helpers ───────────────────────────────────────────

export async function sendEmail({ to, subject, html, text }) {
  try {
    const transporter = await createTransporter();
    if (!transporter) {
      logger.warn('Email', 'Email not sent — SMTP not configured or disabled', { to, subject });
      return false;
    }

    const s = await getEmailSettings();
    const from = s.from || s.user;

    await transporter.sendMail({ from, to, subject, html, text });
    logger.event('Email', 'Email sent', { to, subject });
    return true;
  } catch (e) {
    logger.error('Email', 'Send failed', { to, subject, error: e.message });
    return false;
  }
}

export async function testEmailConnection() {
  const transporter = await createTransporter();
  if (!transporter) throw new Error('SMTP not configured or disabled');
  await transporter.verify();
  return true;
}

// ── Email templates ────────────────────────────────────────

export async function sendUserInviteEmail({ to, inviteUrl, invitedBy, role }) {
  const subject = `You've been invited to TavernShelf`;
  const html = `
    <div style="font-family: Georgia, serif; max-width: 500px; margin: 0 auto; color: #e8e0cc; background: #1c1916; padding: 32px; border-radius: 8px; border: 1px solid rgba(200,136,42,0.3);">
      <h1 style="font-size: 22px; color: #e8aa48; margin-bottom: 8px;">TavernShelf</h1>
      <p style="color: #b8a888; margin-bottom: 24px;">Your TTRPG Digital Library</p>
      <p style="margin-bottom: 16px;"><strong style="color: #e8e0cc;">${invitedBy}</strong> has invited you to join TavernShelf as a <strong style="color: #e8aa48;">${role}</strong>.</p>
      <p style="margin-bottom: 24px; color: #b8a888;">Click the link below to create your account:</p>
      <a href="${inviteUrl}" style="display: inline-block; background: #7a5218; color: #e8e0cc; padding: 12px 24px; border-radius: 4px; text-decoration: none; font-weight: 500; border: 1px solid #c8882a;">
        Create Account
      </a>
      <p style="margin-top: 24px; font-size: 12px; color: #4a3e30;">This invite expires in 7 days. If you weren't expecting this, you can ignore this email.</p>
    </div>
  `;
  const text = `${invitedBy} has invited you to TavernShelf as a ${role}.\n\nCreate your account: ${inviteUrl}\n\nThis invite expires in 7 days.`;
  return sendEmail({ to, subject, html, text });
}

export async function sendCampaignInviteEmail({ to, inviteUrl, invitedBy, campaignName, role, isNewUser }) {
  const subject = isNewUser
    ? `You've been invited to TavernShelf — Campaign: ${campaignName}`
    : `You've been invited to campaign: ${campaignName}`;

  const html = `
    <div style="font-family: Georgia, serif; max-width: 500px; margin: 0 auto; color: #e8e0cc; background: #1c1916; padding: 32px; border-radius: 8px; border: 1px solid rgba(200,136,42,0.3);">
      <h1 style="font-size: 22px; color: #e8aa48; margin-bottom: 8px;">TavernShelf</h1>
      <p style="color: #b8a888; margin-bottom: 24px;">Your TTRPG Digital Library</p>
      <p style="margin-bottom: 16px;"><strong style="color: #e8e0cc;">${invitedBy}</strong> has invited you to the campaign <strong style="color: #e8aa48;">${campaignName}</strong> as a <strong>${role}</strong>.</p>
      ${isNewUser
        ? `<p style="margin-bottom: 24px; color: #b8a888;">You'll need to create a TavernShelf account first. Click below to get started:</p>`
        : `<p style="margin-bottom: 24px; color: #b8a888;">Click below to view the campaign:</p>`
      }
      <a href="${inviteUrl}" style="display: inline-block; background: #7a5218; color: #e8e0cc; padding: 12px 24px; border-radius: 4px; text-decoration: none; font-weight: 500; border: 1px solid #c8882a;">
        ${isNewUser ? 'Create Account & Join Campaign' : 'View Campaign'}
      </a>
      <p style="margin-top: 24px; font-size: 12px; color: #4a3e30;">If you weren't expecting this, you can ignore this email.</p>
    </div>
  `;
  const text = `${invitedBy} has invited you to campaign "${campaignName}" as a ${role}.\n\n${isNewUser ? 'Create your account and join:' : 'View campaign:'} ${inviteUrl}`;
  return sendEmail({ to, subject, html, text });
}

import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi.js';

function formatSize(b) {
  if (!b) return '—';
  if (b < 1024*1024) return `${(b/1024).toFixed(0)} KB`;
  return `${(b/1024/1024).toFixed(1)} MB`;
}

function formatDate(unix) {
  if (!unix) return '—';
  return new Date(unix * 1000).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' });
}

export default function AdminPage() {
  const { get, post } = useApi();
  const [tab, setTab] = useState('queue');

  const [queue, setQueue]     = useState([]);
  const [users, setUsers]     = useState([]);
  const [invites, setInvites] = useState([]);
  const [stats, setStats]     = useState(null);

  const [inviteRole, setInviteRole]     = useState('member');
  const [inviteExpiry, setInviteExpiry] = useState(7);
  const [newInvite, setNewInvite]       = useState(null);
  const [rejectId, setRejectId]         = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [scanning, setScanning]         = useState(false);
  const [scanMsg, setScanMsg]           = useState('');

  const loadQueue   = () => get('/uploads?status=pending').then(setQueue).catch(() => {});
  const loadUsers   = () => get('/auth/me').then(() => {}).catch(() => {}); // just a placeholder; full user list would need an admin endpoint
  const loadInvites = () => get('/auth/invites').then(setInvites).catch(() => {});
  const loadStats   = () => get('/library/stats').then(setStats).catch(() => {});

  useEffect(() => { loadQueue(); loadStats(); }, []);
  useEffect(() => { if (tab === 'invites') loadInvites(); }, [tab]);

  const approve = async (id) => {
    await post(`/uploads/${id}/approve`, {});
    loadQueue();
  };

  const reject = async () => {
    await post(`/uploads/${rejectId}/reject`, { reason: rejectReason });
    setRejectId(null); setRejectReason('');
    loadQueue();
  };

  const createInvite = async () => {
    const inv = await post('/auth/invite', { role: inviteRole, expiresInDays: inviteExpiry });
    setNewInvite(inv);
    loadInvites();
  };

  const triggerScan = async () => {
    setScanning(true); setScanMsg('');
    try {
      await post('/library/scan', {});
      setScanMsg('Scan started — check server logs for progress.');
    } catch (e) {
      setScanMsg(`Error: ${e.message}`);
    } finally {
      setScanning(false);
    }
  };

  const registerUrl = (token) => `${window.location.origin}/register?invite=${token}`;

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--text-0)', marginBottom: 20 }}>Admin Panel</h1>

      {/* Stats */}
      {stats && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          {[
            { label: 'Total Items', value: stats.total_items },
            { label: 'PDFs',        value: stats.pdf_count },
            { label: 'Comics',      value: stats.cbz_count },
            { label: 'Images',      value: stats.image_count },
            { label: 'Pending',     value: queue.length },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 16px' }}>
              <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-0)', fontFamily: 'var(--font-display)' }}>{s.value ?? '—'}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
        {[['queue','Upload Queue'], ['invites','Invites'], ['library','Library']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', border: 'none',
            background: 'transparent',
            borderBottom: tab === key ? '2px solid var(--purple)' : '2px solid transparent',
            color: tab === key ? 'var(--text-0)' : 'var(--text-2)', marginBottom: -1, transition: 'all 0.1s',
          }}>
            {label}
            {key === 'queue' && queue.length > 0 && (
              <span className="badge badge-gold" style={{ marginLeft: 8, fontSize: 10 }}>{queue.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Upload Queue */}
      {tab === 'queue' && (
        queue.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }}>No pending uploads 🎉</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {queue.map(item => (
              <div key={item.id} className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 500, color: 'var(--text-0)', marginBottom: 4 }}>{item.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>
                      {item.original_name} · {formatSize(item.file_size)} · {item.file_type.toUpperCase()}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                      📁 {item.target_folder}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                      Submitted by <strong style={{ color: 'var(--text-2)' }}>{item.uploader_name}</strong> · {formatDate(item.created_at)}
                    </div>
                    {item.system && <span className="badge badge-purple" style={{ marginTop: 6 }}>{item.system}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-sm btn-primary" onClick={() => approve(item.id)}>✓ Approve</button>
                    <button className="btn btn-sm btn-danger" onClick={() => { setRejectId(item.id); setRejectReason(''); }}>✗ Reject</button>
                  </div>
                </div>

                {rejectId === item.id && (
                  <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                    <input placeholder="Reason for rejection (optional)" value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)} style={{ flex: 1 }} />
                    <button className="btn btn-sm btn-danger" onClick={reject}>Confirm</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => setRejectId(null)}>Cancel</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {/* Invites */}
      {tab === 'invites' && (
        <div>
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--text-0)', marginBottom: 16, fontSize: 15 }}>Generate Invite Link</h3>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ minWidth: 130 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>Role</label>
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} style={{ width: 'auto' }}>
                  <option value="member">Member (read-only)</option>
                  <option value="uploader">Uploader (can submit files)</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>Expires in (days)</label>
                <input type="number" value={inviteExpiry} min={1} max={30}
                  onChange={e => setInviteExpiry(parseInt(e.target.value))}
                  style={{ width: 80 }} />
              </div>
              <button className="btn btn-primary" onClick={createInvite}>Generate</button>
            </div>

            {newInvite && (
              <div style={{ marginTop: 16, background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>Share this link with your campaign member:</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input readOnly value={registerUrl(newInvite.token)} style={{ flex: 1, fontSize: 12, fontFamily: 'monospace' }} />
                  <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(registerUrl(newInvite.token))}>
                    Copy
                  </button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
                  Role: <strong style={{ color: 'var(--text-2)' }}>{newInvite.role}</strong> · Expires: {formatDate(newInvite.expiresAt)}
                </div>
              </div>
            )}
          </div>

          {/* Invite history */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {invites.map(inv => (
              <div key={inv.token} style={{ display: 'flex', gap: 12, padding: '10px 14px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, alignItems: 'center', fontSize: 13 }}>
                <code style={{ flex: 1, fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inv.token}</code>
                <span className={`badge ${inv.used_by ? 'badge-green' : 'badge-gray'}`}>
                  {inv.used_by ? `Used by ${inv.used_by_name}` : inv.role}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{formatDate(inv.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Library management */}
      {tab === 'library' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ padding: 20 }}>
            <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--text-0)', marginBottom: 8, fontSize: 15 }}>Library Scanner</h3>
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 14 }}>
              Re-scans your library folder for new, modified, or removed files. The library is also scanned automatically on startup.
            </p>
            <button className="btn btn-primary" onClick={triggerScan} disabled={scanning}>
              {scanning ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Scanning…</> : '↺ Trigger Scan'}
            </button>
            {scanMsg && <div style={{ marginTop: 10, fontSize: 13, color: 'var(--green-hi)' }}>{scanMsg}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

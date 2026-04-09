import { useState, useEffect, useRef } from 'react';
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

const LEVEL_COLORS = {
  ERROR: '#c03030', WARN: '#c88820', INFO: '#6a9a6a', EVENT: '#8a8aaa',
};

function LogLine({ raw }) {
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return <div style={{ fontSize: 11, color: '#666', fontFamily: 'monospace', padding: '1px 0' }}>{raw}</div>; }
  const color = LEVEL_COLORS[parsed.level] || '#888';
  return (
    <div style={{ display: 'flex', gap: 10, padding: '2px 0', fontSize: 11, fontFamily: 'monospace', borderBottom: '1px solid rgba(180,140,80,0.06)', lineHeight: 1.5 }}>
      <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>{parsed.ts?.slice(11,19)}</span>
      <span style={{ color, flexShrink: 0, minWidth: 40 }}>{parsed.level}</span>
      <span style={{ color: 'var(--amber)', flexShrink: 0, minWidth: 70 }}>{parsed.category}</span>
      <span style={{ color: 'var(--text-1)', flex: 1 }}>{parsed.message}
        {parsed.meta && Object.keys(parsed.meta).length > 0 && (
          <span style={{ color: 'var(--text-3)', marginLeft: 8 }}>
            {Object.entries(parsed.meta).map(([k,v]) => `${k}=${JSON.stringify(v)}`).join(' ')}
          </span>
        )}
      </span>
    </div>
  );
}

function LogsTab({ token }) {
  const { get } = useApi();
  const [logFiles, setLogFiles] = useState([]);
  const [lines, setLines] = useState([]);
  const [connected, setConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef(null);
  const esRef = useRef(null);

  useEffect(() => {
    get('/admin/logs').then(setLogFiles).catch(() => {});
  }, []);

  useEffect(() => {
    if (esRef.current) esRef.current.close();

    const url = `/api/admin/logs/stream`;
    const es = new EventSource(url + `?token=${token}`);
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (e) => {
      if (!e.data || e.data === ': ping') return;
      setLines(prev => [...prev.slice(-500), e.data]);
    };

    return () => es.close();
  }, [token]);

  useEffect(() => {
    if (autoScroll && bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [lines, autoScroll]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Status bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: connected ? 'var(--green-hi)' : 'var(--red-hi)' }} />
          <span style={{ color: 'var(--text-2)' }}>{connected ? 'Live' : 'Disconnected'}</span>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} />
          Auto-scroll
        </label>
        <button className="btn btn-ghost btn-sm" onClick={() => setLines([])}>Clear</button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Download:</span>
          {logFiles.map(f => (
            <a key={f.filename} href={`/api/admin/logs/${f.filename}`}
              style={{ fontSize: 11, color: 'var(--amber)', textDecoration: 'underline' }}>
              {f.date}
            </a>
          ))}
        </div>
      </div>

      {/* Log window */}
      <div style={{
        background: 'var(--bg-0)', border: '1px solid var(--border)', borderRadius: 6,
        padding: 12, height: 460, overflowY: 'auto', fontFamily: 'monospace',
      }}>
        {lines.length === 0 ? (
          <div style={{ color: 'var(--text-3)', fontSize: 12, textAlign: 'center', paddingTop: 40 }}>
            {connected ? 'Waiting for events…' : 'Connecting…'}
          </div>
        ) : (
          lines.map((line, i) => <LogLine key={i} raw={line} />)
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { get, post, token } = useApi();
  const [tab, setTab] = useState('queue');

  const [queue, setQueue]     = useState([]);
  const [invites, setInvites] = useState([]);
  const [stats, setStats]     = useState(null);
  const [inviteRole, setInviteRole]     = useState('member');
  const [inviteExpiry, setInviteExpiry] = useState(7);
  const [newInvite, setNewInvite]       = useState(null);
  const [rejectId, setRejectId]         = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [scanning, setScanning]         = useState(false);
  const [scanMsg, setScanMsg]           = useState('');
  const [restoring, setRestoring]       = useState(false);
  const [restoreMsg, setRestoreMsg]     = useState('');
  const [restoreError, setRestoreError] = useState('');
  const restoreFileRef = useRef(null);

  const loadQueue   = () => get('/uploads?status=pending').then(setQueue).catch(() => {});
  const loadInvites = () => get('/auth/invites').then(setInvites).catch(() => {});
  const loadStats   = () => get('/library/stats').then(setStats).catch(() => {});

  useEffect(() => { loadQueue(); loadStats(); }, []);
  useEffect(() => { if (tab === 'invites') loadInvites(); }, [tab]);

  const approve = async (id) => { await post(`/uploads/${id}/approve`, {}); loadQueue(); };
  const reject  = async () => {
    await post(`/uploads/${rejectId}/reject`, { reason: rejectReason });
    setRejectId(null); setRejectReason(''); loadQueue();
  };
  const createInvite = async () => {
    const inv = await post('/auth/invite', { role: inviteRole, expiresInDays: inviteExpiry });
    setNewInvite(inv); loadInvites();
  };
  const triggerScan = async () => {
    setScanning(true); setScanMsg('');
    try { await post('/library/scan', {}); setScanMsg('Scan started.'); }
    catch (e) { setScanMsg(`Error: ${e.message}`); }
    finally { setScanning(false); }
  };
  const handleBackup = () => {
    fetch('/api/admin/backup', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        const filename = r.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1]
          || `tavernshelf-backup-${new Date().toISOString().slice(0,10)}.json`;
        return r.blob().then(blob => ({ blob, filename }));
      })
      .then(({ blob, filename }) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
      }).catch(e => console.error('Backup failed:', e));
  };
  const handleRestore = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoring(true); setRestoreMsg(''); setRestoreError('');
    const fd = new FormData();
    fd.append('backup', file);
    try {
      const res = await fetch('/api/admin/restore', {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRestoreMsg(`Restore complete — ${data.counts.library_items} items, ${data.counts.users} users restored.`);
    } catch (e) { setRestoreError(`Restore failed: ${e.message}`); }
    finally { setRestoring(false); if (restoreFileRef.current) restoreFileRef.current.value = ''; }
  };

  const registerUrl = (t) => `${window.location.origin}/register?invite=${t}`;

  const TABS = [
    ['queue',   'Upload Queue'],
    ['invites', 'Invites'],
    ['library', 'Library'],
    ['backup',  'Backup & Restore'],
    ['logs',    'Logs'],
  ];

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--text-0)', marginBottom: 20 }}>Admin Panel</h1>

      {stats && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          {[['Total Items',stats.total_items],['PDFs',stats.pdf_count],['Comics',stats.cbz_count],['Images',stats.image_count],['Pending',queue.length]].map(([l,v]) => (
            <div key={l} style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 16px' }}>
              <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{l}</div>
              <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-0)', fontFamily: 'var(--font-display)' }}>{v ?? '—'}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 2, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '8px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer', border: 'none',
            background: 'transparent',
            borderBottom: tab === key ? '2px solid var(--amber)' : '2px solid transparent',
            color: tab === key ? 'var(--text-0)' : 'var(--text-2)', marginBottom: -1, transition: 'all 0.1s',
          }}>
            {label}
            {key === 'queue' && queue.length > 0 && (
              <span className="badge badge-amber" style={{ marginLeft: 6, fontSize: 10 }}>{queue.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'queue' && (
        queue.length === 0
          ? <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }}>No pending uploads</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {queue.map(item => (
                <div key={item.id} className="card" style={{ padding: 16 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontWeight: 500, color: 'var(--text-0)', marginBottom: 4 }}>{item.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>{item.original_name} · {formatSize(item.file_size)} · {item.file_type?.toUpperCase()}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-2)' }}>📁 {item.target_folder}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>By <strong style={{ color: 'var(--text-2)' }}>{item.uploader_name}</strong> · {formatDate(item.created_at)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-sm btn-primary" onClick={() => approve(item.id)}>✓ Approve</button>
                      <button className="btn btn-sm btn-danger" onClick={() => { setRejectId(item.id); setRejectReason(''); }}>✗ Reject</button>
                    </div>
                  </div>
                  {rejectId === item.id && (
                    <div style={{ marginTop: 12, display: 'flex', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                      <input placeholder="Reason (optional)" value={rejectReason} onChange={e => setRejectReason(e.target.value)} style={{ flex: 1 }} />
                      <button className="btn btn-sm btn-danger" onClick={reject}>Confirm</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => setRejectId(null)}>Cancel</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
      )}

      {tab === 'invites' && (
        <div>
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--text-0)', marginBottom: 16, fontSize: 15 }}>Generate Invite Link</h3>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>Role</label>
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} style={{ width: 'auto' }}>
                  <option value="member">Member</option>
                  <option value="uploader">Uploader</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>Expires (days)</label>
                <input type="number" value={inviteExpiry} min={1} max={30} onChange={e => setInviteExpiry(parseInt(e.target.value))} style={{ width: 70 }} />
              </div>
              <button className="btn btn-primary" onClick={createInvite}>Generate</button>
            </div>
            {newInvite && (
              <div style={{ marginTop: 16, background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>Share this link:</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input readOnly value={registerUrl(newInvite.token)} style={{ flex: 1, fontSize: 11, fontFamily: 'monospace' }} />
                  <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(registerUrl(newInvite.token))}>Copy</button>
                </div>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {invites.map(inv => (
              <div key={inv.token} style={{ display: 'flex', gap: 12, padding: '10px 14px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, alignItems: 'center', fontSize: 13 }}>
                <code style={{ flex: 1, fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inv.token}</code>
                <span className={`badge ${inv.used_by ? 'badge-green' : 'badge-gray'}`}>{inv.used_by ? `Used by ${inv.used_by_name}` : inv.role}</span>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{formatDate(inv.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'library' && (
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--text-0)', marginBottom: 8, fontSize: 15 }}>Library Scanner</h3>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 14 }}>Re-scans your library folder. Runs automatically on startup.</p>
          <button className="btn btn-primary" onClick={triggerScan} disabled={scanning}>
            {scanning ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Scanning…</> : '↺ Trigger Scan'}
          </button>
          {scanMsg && <div style={{ marginTop: 10, fontSize: 13, color: 'var(--green-hi)' }}>{scanMsg}</div>}
        </div>
      )}

      {tab === 'backup' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ padding: 20 }}>
            <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--text-0)', marginBottom: 8, fontSize: 15 }}>Backup</h3>
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16, lineHeight: 1.6 }}>
              Downloads all library metadata, user accounts, and settings as a portable JSON file. Cover thumbnails are regenerated automatically.
            </p>
            <button className="btn btn-primary" onClick={handleBackup}>↓ Download Backup</button>
          </div>
          <div className="card" style={{ padding: 20 }}>
            <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--text-0)', marginBottom: 8, fontSize: 15 }}>Restore</h3>
            <div style={{ background: 'rgba(146,32,32,0.12)', border: '1px solid rgba(146,32,32,0.28)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: 'var(--red-hi)' }}>
              ⚠ This will overwrite all existing metadata. Library files on disk are not affected.
            </div>
            <input ref={restoreFileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleRestore} />
            <button className="btn btn-ghost" onClick={() => restoreFileRef.current?.click()} disabled={restoring}>
              {restoring ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Restoring…</> : '↑ Select Backup File'}
            </button>
            {restoreMsg   && <div style={{ marginTop: 12, fontSize: 13, color: 'var(--green-hi)' }}>{restoreMsg}</div>}
            {restoreError && <div style={{ marginTop: 12, fontSize: 13, color: 'var(--red-hi)' }}>{restoreError}</div>}
          </div>
        </div>
      )}

      {tab === 'logs' && <LogsTab token={token} />}
    </div>
  );
}

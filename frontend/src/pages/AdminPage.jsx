import { useState, useEffect, useRef } from 'react';
import { useApi } from '../hooks/useApi.js';
import { appEvents } from '../context/AuthContext.jsx';

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
            <a key={f.filename} href={`/api/admin/logs/${f.filename}?token=${token}`}
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





function OrganisationTab() {
  const { get, post, put } = useApi();
  const [settings, setSettings]     = useState({ auto_organise: false, setup_complete: false });
  const [misplaced, setMisplaced]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [organising, setOrganising] = useState(false);
  const [movingId, setMovingId]     = useState(null);
  const [results, setResults]       = useState(null);
  const [error, setError]           = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [s, m] = await Promise.all([
        get('/library/organiser-settings'),
        get('/library/misplaced'),
      ]);
      setSettings(s);
      setMisplaced(m);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const toggleAutoOrganise = async () => {
    const next = !settings.auto_organise;
    await put('/library/organiser-settings', { auto_organise: next });
    setSettings(s => ({ ...s, auto_organise: next }));
  };

  const organiseAll = async () => {
    setOrganising(true); setResults(null); setError('');
    try {
      const r = await post('/library/organise', {});
      setResults(r);
      await load();
    } catch (e) { setError(e.message); }
    finally { setOrganising(false); }
  };

  const moveOne = async (item) => {
    setMovingId(item.id);
    try {
      await post(`/library/items/${item.id}/organise`, {});
      setMisplaced(prev => prev.filter(i => i.id !== item.id));
    } catch (e) { setError(e.message); }
    finally { setMovingId(null); }
  };

  const resetSetup = async () => {
    await put('/library/organiser-settings', { setup_complete: false });
    window.location.reload();
  };

  if (loading) return <div style={{ padding: 40, color: 'var(--text-3)', textAlign: 'center' }}>Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && <div style={{ fontSize: 13, color: 'var(--red-hi)', padding: '8px 12px', background: 'rgba(138,30,30,0.12)', border: '1px solid rgba(138,30,30,0.3)', borderRadius: 6 }}>{error}</div>}

      {/* Settings card */}
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--text-0)', marginBottom: 14, fontSize: 15 }}>
          Auto-Organisation
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16, lineHeight: 1.6 }}>
          When enabled, saving metadata with a System and Content Type will automatically move the file to the correct folder. Files in manually managed folders are never moved.
        </p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-1)', cursor: 'pointer' }}>
            <input type="checkbox" checked={settings.auto_organise} onChange={toggleAutoOrganise} />
            Auto-organise on metadata save
          </label>
          <button className="btn btn-primary btn-sm" onClick={organiseAll} disabled={organising}>
            {organising ? <><span className="spinner" style={{ width: 12, height: 12 }}/> Organising…</> : '↺ Organise All Now'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={resetSetup} title="Show setup wizard again">
            ↺ Re-run Setup Wizard
          </button>
        </div>
        {results && (
          <div style={{ marginTop: 14, fontSize: 13 }}>
            <span style={{ color: 'var(--green-hi)', marginRight: 16 }}>✓ {results.moved} moved</span>
            {results.skipped > 0 && <span style={{ color: 'var(--amber-hi)', marginRight: 16 }}>⚠ {results.skipped} skipped</span>}
            {results.errors?.length > 0 && <span style={{ color: 'var(--red-hi)' }}>✗ {results.errors.length} errors</span>}
          </div>
        )}
      </div>

      {/* Misplaced items */}
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--text-0)', marginBottom: 6, fontSize: 15 }}>
          Misplaced Files
          {misplaced.length > 0 && <span className="badge badge-amber" style={{ marginLeft: 8, fontSize: 11 }}>{misplaced.length}</span>}
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 14, lineHeight: 1.6 }}>
          Files whose current location doesn't match their metadata. Files in manually managed folders are excluded.
        </p>

        {misplaced.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)', fontSize: 13 }}>
            ✓ All files are in their correct locations
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {misplaced.map(item => (
              <div key={item.id} style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--text-0)', marginBottom: 4 }}>{item.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>
                      <span style={{ color: 'var(--red-hi)' }}>Current: </span>{item.current_path}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                      <span style={{ color: 'var(--green-hi)' }}>Should be: </span>{item.expected_path}
                    </div>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => moveOne(item)} disabled={movingId === item.id} style={{ flexShrink: 0 }}>
                    {movingId === item.id ? <span className="spinner" style={{ width: 12, height: 12 }}/> : '→ Move'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


function OrganisationTab() {
  const { get, put, post } = useApi();
  const [settings, setSettings]       = useState({});
  const [misplaced, setMisplaced]     = useState([]);
  const [folders, setFolders]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [organising, setOrganising]   = useState(false);
  const [movingId, setMovingId]       = useState(null);
  const [msg, setMsg]                 = useState('');
  const [err, setErr]                 = useState('');

  const load = async () => {
    const [s, m, f] = await Promise.all([
      get('/admin/settings').catch(() => ({})),
      get('/library/misplaced').catch(() => []),
      get('/library/folders').catch(() => []),
    ]);
    setSettings(s);
    setMisplaced(m);
    // Flatten folder tree
    const flat = [];
    const flatten = (nodes) => nodes.forEach(n => { flat.push(n); flatten(n.children || []); });
    flatten(f);
    setFolders(flat);
  };

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const toggleAutoOrganise = async (val) => {
    await put('/admin/settings', { 'library.auto_organise': val ? 'true' : 'false' });
    setSettings(s => ({ ...s, 'library.auto_organise': val ? 'true' : 'false' }));
    setMsg(val ? 'Auto-organise enabled' : 'Auto-organise disabled');
  };

  const organiseAll = async () => {
    setOrganising(true); setMsg(''); setErr('');
    try {
      await post('/library/organise-all', {});
      setMsg('Organising in background — refresh in a moment');
      setTimeout(() => load(), 3000);
    } catch (e) { setErr(e.message); }
    finally { setOrganising(false); }
  };

  const moveItem = async (item) => {
    setMovingId(item.id); setMsg(''); setErr('');
    try {
      await post(`/library/items/${item.id}/organise`, {});
      setMisplaced(prev => prev.filter(i => i.id !== item.id));
      setMsg(`Moved: ${item.title}`);
    } catch (e) { setErr(e.message); }
    finally { setMovingId(null); }
  };

  const updateFolder = async (folderId, changes) => {
    const updated = await put(`/library/folders/${folderId}`, changes);
    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, ...updated } : f));
  };

  const autoOrganise = settings['library.auto_organise'] === 'true';

  if (loading) return <div style={{ padding: 40, color: 'var(--text-3)', textAlign: 'center' }}>Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Auto-organise toggle */}
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--text-0)', marginBottom: 8, fontSize: 15 }}>Auto-Organise</h3>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16, lineHeight: 1.6 }}>
          When enabled, saving metadata automatically moves the file to the correct folder based on its System and Content Type.
        </p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--text-1)', cursor: 'pointer' }}>
            <input type="checkbox" checked={autoOrganise} onChange={e => toggleAutoOrganise(e.target.checked)} />
            Enable auto-organise
          </label>
          <button className="btn btn-ghost btn-sm" onClick={organiseAll} disabled={organising}>
            {organising ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Organising…</> : '↺ Organise All Now'}
          </button>
        </div>
        {msg && <div style={{ fontSize: 13, color: 'var(--green-hi)', marginTop: 10 }}>✓ {msg}</div>}
        {err && <div style={{ fontSize: 13, color: 'var(--red-hi)', marginTop: 10 }}>✗ {err}</div>}
      </div>

      {/* Misplaced items */}
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--text-0)', marginBottom: 8, fontSize: 15 }}>
          Misplaced Files
          {misplaced.length > 0 && <span className="badge badge-amber" style={{ marginLeft: 8, fontSize: 11 }}>{misplaced.length}</span>}
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 14, lineHeight: 1.6 }}>
          Files whose location on disk doesn't match their metadata.
        </p>
        {misplaced.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--green-hi)' }}>✓ All files are in the correct location</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {misplaced.map(item => (
              <div key={item.id} style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontWeight: 500, color: 'var(--text-0)', fontSize: 13, marginBottom: 6 }}>{item.title}</div>
                <div style={{ fontSize: 11, fontFamily: 'monospace', marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-3)' }}>Current: </span>
                  <span style={{ color: 'var(--red-hi)' }}>{item.current_path}</span>
                </div>
                <div style={{ fontSize: 11, fontFamily: 'monospace', marginBottom: 10 }}>
                  <span style={{ color: 'var(--text-3)' }}>Should be: </span>
                  <span style={{ color: 'var(--green-hi)' }}>{item.expected_path}</span>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => moveItem(item)} disabled={movingId === item.id}>
                  {movingId === item.id ? <span className="spinner" style={{ width: 12, height: 12 }} /> : '→ Move to correct location'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Folder management */}
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--text-0)', marginBottom: 8, fontSize: 15 }}>Folder Settings</h3>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 14, lineHeight: 1.6 }}>
          Mark folders as Module folders and set how they are managed.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflow: 'auto' }}>
          {folders.map(f => (
            <div key={f.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
              background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12,
            }}>
              <span style={{ flex: 1, color: 'var(--text-1)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.path}
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', flexShrink: 0 }}>
                <input type="checkbox" checked={!!f.is_module}
                  onChange={e => updateFolder(f.id, { is_module: e.target.checked })} />
                <span style={{ color: 'var(--text-2)' }}>Module</span>
              </label>
              {f.is_module && (
                <select value={f.managed || 'auto'} onChange={e => updateFolder(f.id, { managed: e.target.value })}
                  style={{ width: 'auto', fontSize: 11, padding: '2px 6px' }}>
                  <option value="auto">Auto</option>
                  <option value="manual">Manual</option>
                </select>
              )}
              <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>{f.item_count}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

function EmailTab() {
  const { get, post, put } = useApi();
  const [form, setForm] = useState({ host:'', port:'587', secure:false, user:'', pass:'', from:'', enabled:false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg]         = useState('');
  const [err, setErr]         = useState('');
  const [testMsg, setTestMsg] = useState('');
  const [testErr, setTestErr] = useState('');

  useEffect(() => {
    get('/admin/settings/email').then(s => {
      setForm(f => ({
        ...f,
        host:    s.host    || '',
        port:    s.port    || '587',
        secure:  s.secure  === 'true',
        user:    s.user    || '',
        pass:    s.pass    || '',
        from:    s.from    || '',
        enabled: s.enabled === 'true',
      }));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true); setMsg(''); setErr('');
    try {
      await put('/admin/settings/email', { ...form, secure: form.secure, enabled: form.enabled });
      setMsg('Settings saved');
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const test = async () => {
    setTesting(true); setTestMsg(''); setTestErr('');
    try {
      const r = await post('/admin/settings/email/test', {});
      setTestMsg(r.message);
    } catch (e) { setTestErr(e.message); }
    finally { setTesting(false); }
  };

  const f = k => e => setForm(p => ({...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value}));

  if (loading) return <div style={{ padding:40, color:'var(--text-3)', textAlign:'center' }}>Loading…</div>;

  return (
    <div style={{ maxWidth:520 }}>
      <div className="card" style={{ padding:24 }}>
        <h3 style={{ fontFamily:'var(--font-display)', color:'var(--text-0)', marginBottom:6, fontSize:16 }}>SMTP Email Settings</h3>
        <p style={{ fontSize:13, color:'var(--text-2)', marginBottom:20, lineHeight:1.6 }}>
          Used for sending user invites and campaign email invitations.
        </p>
        <form onSubmit={save} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <label style={{ display:'flex', alignItems:'center', gap:10, fontSize:13, color:'var(--text-1)', cursor:'pointer' }}>
            <input type="checkbox" checked={form.enabled} onChange={f('enabled')} />
            Enable email sending
          </label>
          {[
            ['host',   'SMTP Host',     'text',     'smtp.example.com'],
            ['port',   'SMTP Port',     'number',   '587'],
            ['user',   'Username',      'email',    'you@example.com'],
            ['pass',   'Password',      'password', '••••••••'],
            ['from',   'From Address',  'email',    'tavernshelf@example.com'],
          ].map(([key, label, type, placeholder]) => (
            <div key={key}>
              <label style={{ display:'block', fontSize:12, color:'var(--text-2)', marginBottom:5 }}>{label}</label>
              <input type={type} value={form[key]} onChange={f(key)} placeholder={placeholder} autoComplete="off" />
            </div>
          ))}
          <label style={{ display:'flex', alignItems:'center', gap:10, fontSize:13, color:'var(--text-1)', cursor:'pointer' }}>
            <input type="checkbox" checked={form.secure} onChange={f('secure')} />
            Use TLS/SSL (port 465)
          </label>
          {err && <div style={{ fontSize:13, color:'var(--red-hi)', padding:'8px 12px', background:'rgba(138,30,30,0.12)', border:'1px solid rgba(138,30,30,0.3)', borderRadius:6 }}>{err}</div>}
          {msg && <div style={{ fontSize:13, color:'var(--green-hi)', padding:'8px 12px', background:'rgba(36,80,42,0.15)', border:'1px solid rgba(36,80,42,0.3)', borderRadius:6 }}>{msg}</div>}
          <div style={{ display:'flex', gap:8 }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spinner" style={{ width:14, height:14 }}/> : 'Save Settings'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={test} disabled={testing}>
              {testing ? <span className="spinner" style={{ width:14, height:14 }}/> : 'Test Connection'}
            </button>
          </div>
          {testMsg && <div style={{ fontSize:13, color:'var(--green-hi)' }}>✓ {testMsg}</div>}
          {testErr && <div style={{ fontSize:13, color:'var(--red-hi)' }}>✗ {testErr}</div>}
        </form>
      </div>
    </div>
  );
}

function UsersTab() {
  const { get, post, put, del } = useApi();
  const { user: currentUser } = useApi();
  const [users, setUsers] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', displayName: '', role: 'member' });
  const [editId, setEditId] = useState(null);
  const [editRole, setEditRole] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const { token } = useApi();
  const loadUsers = () => get('/admin/users').then(setUsers).catch(() => {});
  useEffect(() => { loadUsers(); }, []);

  const createUser = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await post('/admin/users', form);
      setMsg(`User ${form.email} created`);
      setForm({ email: '', password: '', displayName: '', role: 'member' });
      setShowCreate(false);
      loadUsers();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const saveEdit = async (id) => {
    setSaving(true); setError('');
    try {
      const body = {};
      if (editRole) body.role = editRole;
      if (editPassword) body.password = editPassword;
      await put(`/admin/users/${id}`, body);
      setEditId(null); setEditRole(''); setEditPassword('');
      loadUsers();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const deleteUser = async (id, email) => {
    if (!confirm(`Delete user ${email}? This cannot be undone.`)) return;
    try {
      await del(`/admin/users/${id}`);
      loadUsers();
    } catch (e) { setError(e.message); }
  };

  const ROLES = ['member','uploader','admin'];
  const ROLE_BADGE = { admin: 'badge-amber', uploader: 'badge-green', member: 'badge-gray' };

  return (
    <div>
      {msg && <div style={{ fontSize: 13, color: 'var(--green-hi)', marginBottom: 16, padding: '8px 12px', background: 'rgba(36,80,42,0.15)', border: '1px solid rgba(36,80,42,0.3)', borderRadius: 6 }}>{msg}</div>}
      {error && <div style={{ fontSize: 13, color: 'var(--red-hi)', marginBottom: 16, padding: '8px 12px', background: 'rgba(138,30,30,0.12)', border: '1px solid rgba(138,30,30,0.3)', borderRadius: 6 }}>{error}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{users.length} user{users.length !== 1 ? 's' : ''}</span>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(s => !s)}>
          {showCreate ? 'Cancel' : '+ New User'}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={createUser} className="card" style={{ padding: 20, marginBottom: 16 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--text-0)', marginBottom: 16, fontSize: 15 }}>Create User</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div><label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>Display Name</label><input value={form.displayName} required onChange={e => setForm(f => ({...f, displayName: e.target.value}))} /></div>
            <div><label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>Email</label><input type="email" value={form.email} required onChange={e => setForm(f => ({...f, email: e.target.value}))} /></div>
            <div><label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>Password</label><input type="password" value={form.password} required minLength={8} onChange={e => setForm(f => ({...f, password: e.target.value}))} /></div>
            <div><label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>Role</label>
              <select value={form.role} onChange={e => setForm(f => ({...f, role: e.target.value}))}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
            {saving ? <span className="spinner" style={{ width: 12, height: 12 }} /> : 'Create User'}
          </button>
        </form>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {users.map(u => (
          <div key={u.id} className="card" style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, color: 'var(--text-0)', fontSize: 14 }}>{u.display_name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{u.email}</div>
              </div>
              <span className={`badge ${ROLE_BADGE[u.role] || 'badge-gray'}`}>{u.role}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-ghost btn-sm"
                  onClick={() => { setEditId(editId === u.id ? null : u.id); setEditRole(u.role); setEditPassword(''); }}>
                  Edit
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => deleteUser(u.id, u.email)}>Delete</button>
              </div>
            </div>

            {editId === u.id && (
              <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 12, alignItems: 'flex-end' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>Role</label>
                  <select value={editRole} onChange={e => setEditRole(e.target.value)} style={{ width: 'auto' }}>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>New Password (optional)</label>
                  <input type="password" value={editPassword} placeholder="Leave blank to keep current"
                    onChange={e => setEditPassword(e.target.value)} style={{ width: 200 }} />
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => saveEdit(u.id)} disabled={saving}>Save</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>Cancel</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsTab() {
  const { post, put } = useApi();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '', newEmail: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setMsg(''); setErr('');
    if (form.newPassword && form.newPassword !== form.confirmPassword) {
      return setErr('New passwords do not match');
    }
    if (form.newPassword && form.newPassword.length < 8) {
      return setErr('Password must be at least 8 characters');
    }
    if (!form.newPassword && !form.newEmail) {
      return setErr('Enter a new email or new password');
    }
    setSaving(true);
    try {
      const body = { currentPassword: form.currentPassword };
      if (form.newPassword) body.newPassword = form.newPassword;
      if (form.newEmail)    body.newEmail    = form.newEmail;
      await put('/auth/credentials', body);
      setMsg('Credentials updated successfully');
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '', newEmail: '' });
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 480 }}>
      <div className="card" style={{ padding: 24 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--text-0)', marginBottom: 6, fontSize: 16 }}>
          Change Login Credentials
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20, lineHeight: 1.6 }}>
          Update your admin email or password. Current password is required to confirm changes.
        </p>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            { key: 'newEmail',         label: 'New Email (optional)',    type: 'email',    placeholder: 'Leave blank to keep current' },
            { key: 'currentPassword',  label: 'Current Password',        type: 'password', placeholder: '••••••••', required: true },
            { key: 'newPassword',      label: 'New Password (optional)', type: 'password', placeholder: 'Min 8 characters' },
            { key: 'confirmPassword',  label: 'Confirm New Password',    type: 'password', placeholder: 'Repeat new password' },
          ].map(({ key, label, type, placeholder, required }) => (
            <div key={key}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>{label}</label>
              <input type={type} placeholder={placeholder} value={form[key]} required={required}
                onChange={f(key)} autoComplete="off" />
            </div>
          ))}
          {err && <div style={{ fontSize: 13, color: 'var(--red-hi)', padding: '8px 12px', background: 'rgba(138,30,30,0.12)', border: '1px solid rgba(138,30,30,0.25)', borderRadius: 6 }}>{err}</div>}
          {msg && <div style={{ fontSize: 13, color: 'var(--green-hi)', padding: '8px 12px', background: 'rgba(36,80,42,0.15)', border: '1px solid rgba(36,80,42,0.3)', borderRadius: 6 }}>{msg}</div>}
          <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }} disabled={saving}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { get, post, put, token } = useApi();
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
  const [editingUpload, setEditingUpload] = useState(null); // id of upload being edited
  const [uploadEditForm, setUploadEditForm] = useState({});
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

  const approve = async (id) => { await post(`/uploads/${id}/approve`, {}); loadQueue(); appEvents.emit('uploadReviewed'); };
  const saveUploadEdit = async (id) => {
    const form = uploadEditForm;
    await put(`/uploads/${id}`, {
      title:        form.title,
      authors:      form.authors?.split(',').map(a => a.trim()).filter(Boolean),
      description:  form.description,
      system:       form.system,
      content_type: form.content_type,
      publisher:    form.publisher,
      year:         form.year ? parseInt(form.year) : null,
      tags:         form.tags?.split(',').map(t => t.trim()).filter(Boolean),
    });
    loadQueue();
    setEditingUpload(null);
  };
  const reject  = async () => {
    await post(`/uploads/${rejectId}/reject`, { reason: rejectReason });
    setRejectId(null); setRejectReason(''); loadQueue(); appEvents.emit('uploadReviewed');
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
    ['organisation', 'Organisation'],
    ['backup',  'Backup & Restore'],
    ['logs',    'Logs'],
    ['users',    'Users'],
    ['settings', 'Settings'],
    ['email',    'Email'],
    ['organisation', 'Organisation'],
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
                      <button className="btn btn-sm btn-ghost" onClick={() => {
                        setEditingUpload(editingUpload === item.id ? null : item.id);
                        setUploadEditForm({ title: item.title, authors: (JSON.parse(item.authors||'[]')).join(', '), description: item.description||'', system: item.system||'', content_type: item.content_type||'', publisher: item.publisher||'', year: item.year||'', tags: (JSON.parse(item.tags||'[]')).join(', ') });
                      }}>✎ Edit</button>
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
                  {editingUpload === item.id && (
                    <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                        {[['title','Title'],['authors','Authors (comma-sep)'],['system','System'],['content_type','Content Type'],['publisher','Publisher'],['year','Year'],['tags','Tags (comma-sep)']].map(([k,label]) => (
                          <div key={k}>
                            <label style={{ display:'block', fontSize:11, color:'var(--text-3)', marginBottom:3 }}>{label}</label>
                            <input value={uploadEditForm[k]||''} onChange={e => setUploadEditForm(f=>({...f,[k]:e.target.value}))} style={{ fontSize:12 }} />
                          </div>
                        ))}
                        <div style={{ gridColumn:'1/-1' }}>
                          <label style={{ display:'block', fontSize:11, color:'var(--text-3)', marginBottom:3 }}>Description</label>
                          <textarea value={uploadEditForm.description||''} rows={2} style={{ resize:'vertical', fontSize:12 }} onChange={e => setUploadEditForm(f=>({...f,description:e.target.value}))} />
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:8 }}>
                        <button className="btn btn-primary btn-sm" onClick={() => saveUploadEdit(item.id)}>Save Changes</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditingUpload(null)}>Cancel</button>
                      </div>
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

      {tab === 'organisation' && <OrganisationTab />}

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
      {tab === 'users' && <UsersTab />}

      {tab === 'settings' && <SettingsTab />}
      {tab === 'email' && <EmailTab />}
      {tab === 'organisation' && <OrganisationTab />}

    </div>
  );
}

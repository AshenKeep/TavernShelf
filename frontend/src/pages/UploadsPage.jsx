import { useState, useEffect, useRef } from 'react';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';

const TTRPG_SYSTEMS = ['D&D 5e','D&D 5.5e','D&D 3.5e','D&D 4e','OSE','Pathfinder 1e','Pathfinder 2e','Call of Cthulhu','Shadowrun','Starfinder','Forbidden Lands','Savage Worlds','Year Zero Engine','GURPS','FATE Core','Blades in the Dark','Cairn','Mothership','Mörk Borg','Other'];
const CONTENT_TYPES = ['Core Rulebook','Supplement','Adventure Module','Sourcebook','Bestiary','Campaign Setting','Magic Items','Pregen Characters','Battle Maps','Tokens','Encounter','Quick Reference','System Reference','Other'];

function formatSize(b) {
  if (b < 1024*1024) return `${(b/1024).toFixed(0)} KB`;
  return `${(b/1024/1024).toFixed(1)} MB`;
}

function StatusBadge({ status }) {
  const map = {
    pending:  { cls: 'badge-gold',   label: 'Pending' },
    approved: { cls: 'badge-green',  label: 'Approved' },
    rejected: { cls: 'badge-red',    label: 'Rejected' },
  };
  const { cls, label } = map[status] || { cls: 'badge-gray', label: status };
  return <span className={`badge ${cls}`}>{label}</span>;
}

export default function UploadsPage() {
  const { post, get } = useApi();
  const { isAdmin }   = useAuth();
  const fileRef       = useRef(null);

  const [tab, setTab]           = useState('submit');
  const [folders, setFolders]   = useState([]);
  const [queue, setQueue]       = useState([]);
  const [qStatus, setQStatus]   = useState('pending');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress]   = useState(0);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');

  const [form, setForm] = useState({
    title: '', authors: '', description: '', system: '',
    contentType: '', tags: '', targetFolder: '',
  });
  const [file, setFile] = useState(null);

  useEffect(() => {
    get('/library/folders').then(f => {
      const flat = [];
      const flatten = (nodes, depth = 0) => nodes.forEach(n => { flat.push({ ...n, depth }); flatten(n.children || [], depth + 1); });
      flatten(f);
      setFolders(flat);
    }).catch(() => {});
  }, []);

  const loadQueue = () => {
    get(`/uploads?status=${qStatus}`).then(setQueue).catch(() => {});
  };

  useEffect(() => { if (tab === 'queue') loadQueue(); }, [tab, qStatus]);

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    if (!form.title) setForm(prev => ({ ...prev, title: f.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ') }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return setError('Please select a file');
    if (!form.targetFolder) return setError('Please select a target folder');

    setError(''); setSuccess(''); setUploading(true); setProgress(0);

    const fd = new FormData();
    fd.append('file', file);
    Object.entries(form).forEach(([k, v]) => {
      if (k === 'authors') fd.append('authors', JSON.stringify(v.split(',').map(a => a.trim()).filter(Boolean)));
      else if (k === 'tags') fd.append('tags', JSON.stringify(v.split(',').map(t => t.trim()).filter(Boolean)));
      else if (k === 'contentType') fd.append('contentType', v);
      else fd.append(k, v);
    });

    try {
      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(Math.round(e.loaded / e.total * 100)); };
      await new Promise((resolve, reject) => {
        xhr.onload  = () => xhr.status < 300 ? resolve() : reject(new Error(JSON.parse(xhr.responseText).error));
        xhr.onerror = () => reject(new Error('Upload failed'));
        xhr.open('POST', '/api/uploads');
        xhr.setRequestHeader('Authorization', `Bearer ${localStorage.getItem('ts_token')}`);
        xhr.send(fd);
      });

      setSuccess('File submitted for admin approval!');
      setFile(null); fileRef.current.value = '';
      setForm({ title: '', authors: '', description: '', system: '', contentType: '', tags: '', targetFolder: form.targetFolder });
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false); setProgress(0);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--text-0)', marginBottom: 20 }}>
        Uploads
      </h1>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {[['submit','Submit File'], ['queue','My Queue']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', border: 'none',
            background: 'transparent', borderBottom: tab === key ? '2px solid var(--amber)' : '2px solid transparent',
            color: tab === key ? 'var(--text-0)' : 'var(--text-2)', marginBottom: -1, transition: 'all 0.1s',
          }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'submit' && (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* File drop zone */}
          <div style={{
            border: `2px dashed ${file ? 'var(--amber)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-lg)', padding: 32, textAlign: 'center',
            background: file ? 'rgba(139,107,200,0.06)' : 'var(--bg-2)',
            transition: 'all 0.15s', cursor: 'pointer',
          }} onClick={() => fileRef.current?.click()}>
            <input ref={fileRef} type="file" style={{ display: 'none' }}
              accept=".pdf,.cbz,.cbr,.jpg,.jpeg,.png,.gif,.webp"
              onChange={handleFileChange} />
            {file ? (
              <div>
                <div style={{ fontSize: 20, marginBottom: 8 }}>📄</div>
                <div style={{ fontWeight: 500, color: 'var(--text-0)', fontSize: 14 }}>{file.name}</div>
                <div style={{ color: 'var(--text-3)', fontSize: 12, marginTop: 4 }}>{formatSize(file.size)}</div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📤</div>
                <div style={{ color: 'var(--text-2)', fontSize: 14 }}>Click to select a file</div>
                <div style={{ color: 'var(--text-3)', fontSize: 12, marginTop: 4 }}>PDF, CBZ, CBR, JPG, PNG, GIF, WEBP — max 500 MB</div>
              </div>
            )}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>Target Folder *</label>
            <select value={form.targetFolder} required onChange={e => setForm(f => ({ ...f, targetFolder: e.target.value }))}>
              <option value="">— Select a folder —</option>
              {folders.map(f => <option key={f.id} value={f.path}>{'  '.repeat(f.depth)}{f.name}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>Title *</label>
            <input value={form.title} required onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>Game System</label>
              <select value={form.system} onChange={e => setForm(f => ({ ...f, system: e.target.value }))}>
                <option value="">— None —</option>
                {TTRPG_SYSTEMS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>Content Type</label>
              <select value={form.contentType} onChange={e => setForm(f => ({ ...f, contentType: e.target.value }))}>
                <option value="">— None —</option>
                {CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>Authors (comma-separated)</label>
            <input value={form.authors} onChange={e => setForm(f => ({ ...f, authors: e.target.value }))} placeholder="Gary Gygax, Dave Arneson" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>Description</label>
            <textarea value={form.description} rows={3} style={{ resize: 'vertical' }} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>Tags (comma-separated)</label>
            <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="dungeon, one-shot, horror" />
          </div>

          {error   && <div style={{ background: 'rgba(168,50,50,0.12)', border: '1px solid rgba(168,50,50,0.3)', borderRadius: 8, padding: '10px 14px', color: 'var(--red-hi)', fontSize: 13 }}>{error}</div>}
          {success && <div style={{ background: 'rgba(42,122,74,0.12)',  border: '1px solid rgba(42,122,74,0.3)',  borderRadius: 8, padding: '10px 14px', color: 'var(--green-hi)', fontSize: 13 }}>{success}</div>}

          {uploading && (
            <div style={{ background: 'var(--bg-3)', borderRadius: 8, overflow: 'hidden', height: 6 }}>
              <div style={{ width: `${progress}%`, height: '100%', background: 'var(--amber)', transition: 'width 0.2s' }} />
            </div>
          )}

          <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }} disabled={uploading}>
            {uploading ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Uploading {progress}%</> : 'Submit for Approval'}
          </button>
        </form>
      )}

      {tab === 'queue' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {['pending','approved','rejected'].map(s => (
              <button key={s} className={`btn btn-sm ${qStatus === s ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setQStatus(s)}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {queue.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }}>No {qStatus} submissions</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {queue.map(item => (
                <div key={item.id} className="card" style={{ padding: '14px 16px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, color: 'var(--text-0)', marginBottom: 4 }}>{item.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                      {item.original_name} · {formatSize(item.file_size)} · {item.target_folder}
                    </div>
                    {item.reject_reason && (
                      <div style={{ fontSize: 12, color: 'var(--red-hi)', marginTop: 4 }}>Reason: {item.reject_reason}</div>
                    )}
                  </div>
                  <StatusBadge status={item.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';

const TTRPG_SYSTEMS = ['D&D 5e','D&D 5.5e','D&D 3.5e','D&D 4e','OSE','Pathfinder 1e','Pathfinder 2e','Call of Cthulhu','Shadowrun','Starfinder','Forbidden Lands','Savage Worlds','Year Zero Engine','GURPS','FATE Core','Blades in the Dark','Cairn','Mothership','Mörk Borg','Other'];
const CONTENT_TYPES = ['Core Rulebook','Supplement','Adventure Module','Sourcebook','Bestiary','Campaign Setting','Magic Items','Pregen Characters','Battle Maps','Tokens','Encounter','Quick Reference','System Reference','Other'];

function formatSize(b) {
  if (!b) return '—';
  if (b < 1024*1024) return `${(b/1024).toFixed(0)} KB`;
  return `${(b/1024/1024).toFixed(1)} MB`;
}

function StatusBadge({ status }) {
  const map = {
    pending:  { cls: 'badge-gold',  label: 'Pending' },
    approved: { cls: 'badge-green', label: 'Approved' },
    rejected: { cls: 'badge-red',   label: 'Rejected' },
  };
  const { cls, label } = map[status] || { cls: 'badge-gray', label: status };
  return <span className={`badge ${cls}`}>{label}</span>;
}

// Folder picker — shows tree with visual indentation
function FolderPicker({ folders, value, onChange, placeholder = '— Select a folder —', extraOption = null }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ fontFamily: 'monospace', fontSize: 13 }}>
      <option value="">{placeholder}</option>
      {extraOption && (
        <option value={extraOption.value}>{extraOption.label}</option>
      )}
      {folders.map(f => (
        <option key={f.id} value={f.path}>
          {'↪ '.repeat(f.depth)}{f.name}{f.item_count > 0 ? ` (${f.item_count})` : ''}
        </option>
      ))}
    </select>
  );
}

export default function UploadsPage() {
  const { post, get } = useApi();
  const { isAdmin }   = useAuth();
  const fileRef       = useRef(null);

  const [tab, setTab]           = useState('submit');
  const [folders, setFolders]   = useState([]);        // flat list with depth
  const [moduleFolders, setModuleFolders] = useState([]); // is_module=true only
  const [queue, setQueue]       = useState([]);
  const [qStatus, setQStatus]   = useState('pending');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress]   = useState(0);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');
  const [suggestion, setSuggestion] = useState(null); // matched suggestion from rules

  const [form, setForm] = useState({
    system:          '',
    contentType:     '',
    // Adventure Module fields
    moduleMode:      'existing', // 'existing' | 'new'
    moduleName:      '',         // new module name (when moduleMode='new')
    moduleFolder:    '',         // selected existing module path (when moduleMode='existing')
    // For non-module content placed inside a module
    inModule:        false,
    inModuleFolder:  '',         // which module folder
    inModuleSubfolder: '',       // optional subfolder within that module
    // Destination + details
    targetFolder:    '',
    title:           '',
    authors:         '',
    description:     '',
    tags:            '',
  });
  const [file, setFile] = useState(null);

  const isAdventureModule = form.contentType === 'Adventure Module';

  // Load folders flat with depth
  useEffect(() => {
    get('/library/folders').then(tree => {
      const flat = [];
      const flatten = (nodes, depth = 0) => nodes.forEach(n => {
        flat.push({ ...n, depth });
        flatten(n.children || [], depth + 1);
      });
      flatten(tree);
      setFolders(flat);
      setModuleFolders(flat.filter(f => f.is_module));
    }).catch(() => {});
  }, []);

  // Subfolders of the chosen inModule folder (one level deep)
  const inModuleSubfolders = form.inModuleFolder
    ? folders.filter(f =>
        f.path.startsWith(form.inModuleFolder + '/') &&
        f.path.split('/').length === form.inModuleFolder.split('/').length + 1
      )
    : [];

  // Auto-compute targetFolder from all the selections
  useEffect(() => {
    if (!form.system || !form.contentType) return;

    let suggested;

    if (form.inModule && form.inModuleFolder) {
      // Non-module content going into a module subfolder
      suggested = form.inModuleSubfolder || form.inModuleFolder;

    } else if (isAdventureModule) {
      if (form.moduleMode === 'existing' && form.moduleFolder) {
        suggested = form.moduleFolder;
      } else if (form.moduleMode === 'new' && form.moduleName.trim()) {
        suggested = `${form.system}/Adventure Module/${form.moduleName.trim()}`;
      } else {
        return; // not enough info yet
      }

    } else {
      suggested = `${form.system}/${form.contentType}`;
    }

    // Prefer exact existing folder (case-insensitive)
    const match = folders.find(f => f.path.toLowerCase() === suggested.toLowerCase());
    setForm(prev => ({ ...prev, targetFolder: match ? match.path : suggested }));

  }, [
    form.system, form.contentType,
    form.moduleMode, form.moduleName, form.moduleFolder,
    form.inModule, form.inModuleFolder, form.inModuleSubfolder,
    folders,
  ]);

  const loadQueue = () => get(`/uploads?status=${qStatus}`).then(setQueue).catch(() => {});
  useEffect(() => { if (tab === 'queue') loadQueue(); }, [tab, qStatus]);

  const handleFileChange = async (e) => {
    const picked = e.target.files[0];
    if (!picked) return;
    setFile(picked);
    const titleFromFilename = picked.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    setForm(prev => ({ ...prev, title: prev.title || titleFromFilename }));

    // Check upload suggestions
    try {
      const match = await post('/admin/upload-suggestions/match', { filename: picked.name });
      if (match.system || match.content_type || match.folder_id) {
        setSuggestion(match);
        setForm(prev => ({
          ...prev,
          system:      match.system      || prev.system,
          contentType: match.content_type || prev.contentType,
        }));
      }
    } catch {} // non-fatal — suggestions are optional
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file)              return setError('Please select a file');
    if (!form.targetFolder) return setError('Could not determine target folder — complete Step 1 first');

    setError(''); setSuccess(''); setUploading(true); setProgress(0);

    const fd = new FormData();
    fd.append('file', file);
    fd.append('title', form.title);
    fd.append('authors', JSON.stringify(form.authors.split(',').map(a => a.trim()).filter(Boolean)));
    fd.append('description', form.description);
    fd.append('system', form.system);
    fd.append('contentType', form.contentType);
    fd.append('tags', JSON.stringify(form.tags.split(',').map(t => t.trim()).filter(Boolean)));
    fd.append('targetFolder', form.targetFolder);

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
      setForm(p => ({ ...p, title: '', authors: '', description: '', tags: '', moduleName: '', inModuleSubfolder: '' }));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false); setProgress(0);
    }
  };

  const f  = k => e => setForm(p => ({ ...p, [k]: e.target.value }));
  const fb = k => e => setForm(p => ({ ...p, [k]: e.target.checked }));

  // Filter folders for the target dropdown — exclude module internals if not inModule
  const targetFolderOptions = folders;

  // Check if suggested path already exists
  const targetExists = form.targetFolder && folders.some(fo => fo.path.toLowerCase() === form.targetFolder.toLowerCase());

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--text-0)', marginBottom: 20 }}>
        Uploads
      </h1>

      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
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

          {/* File picker */}
          <div style={{
            border: `2px dashed ${file ? 'var(--amber)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-lg)', padding: 32, textAlign: 'center',
            background: file ? 'rgba(200,136,42,0.06)' : 'var(--bg-2)', cursor: 'pointer',
          }} onClick={() => fileRef.current?.click()}>
            <input ref={fileRef} type="file" style={{ display: 'none' }}
              accept=".pdf,.cbz,.cbr,.jpg,.jpeg,.png,.gif,.webp" onChange={handleFileChange} />
            {file ? (
              <>
                <div style={{ fontSize: 20, marginBottom: 8 }}>📄</div>
                <div style={{ fontWeight: 500, color: 'var(--text-0)', fontSize: 14 }}>{file.name}</div>
                <div style={{ color: 'var(--text-3)', fontSize: 12, marginTop: 4 }}>{formatSize(file.size)}</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📤</div>
                <div style={{ color: 'var(--text-2)', fontSize: 14 }}>Click to select a file</div>
                <div style={{ color: 'var(--text-3)', fontSize: 12, marginTop: 4 }}>PDF, CBZ, CBR, JPG, PNG</div>
              </>
            )}
          </div>

          {/* ── Step 1: Classify ── */}
          <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
              1 — Classify
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>Game System *</label>
                <select value={form.system} onChange={f('system')} required>
                  <option value="">— Select system —</option>
                  {TTRPG_SYSTEMS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>Content Type *</label>
                <select value={form.contentType} onChange={e => {
                  setForm(p => ({ ...p, contentType: e.target.value, inModule: false, inModuleFolder: '', inModuleSubfolder: '', moduleName: '', moduleFolder: '', moduleMode: 'existing' }));
                }} required>
                  <option value="">— Select type —</option>
                  {CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {/* ── Adventure Module sub-section ── */}
            {isAdventureModule && form.system && (
              <div style={{ marginTop: 14 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 8 }}>Module Folder *</label>

                {/* Toggle existing / new */}
                <div style={{ display: 'flex', gap: 0, marginBottom: 10, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)', width: 'fit-content' }}>
                  {['existing','new'].map(mode => (
                    <button key={mode} type="button"
                      onClick={() => setForm(p => ({ ...p, moduleMode: mode, moduleName: '', moduleFolder: '' }))}
                      style={{
                        padding: '6px 16px', fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer',
                        background: form.moduleMode === mode ? 'var(--amber-dim)' : 'var(--bg-3)',
                        color: form.moduleMode === mode ? 'var(--text-0)' : 'var(--text-2)',
                        borderRight: mode === 'existing' ? '1px solid var(--border)' : 'none',
                      }}>
                      {mode === 'existing' ? '📁 Existing' : '✦ New'}
                    </button>
                  ))}
                </div>

                {form.moduleMode === 'existing' ? (
                  moduleFolders.filter(m => !form.system || m.path.startsWith(form.system + '/')).length > 0 ? (
                    <select value={form.moduleFolder} onChange={f('moduleFolder')} required={isAdventureModule && form.moduleMode === 'existing'}>
                      <option value="">— Select existing module —</option>
                      {moduleFolders
                        .filter(m => !form.system || m.path.toLowerCase().startsWith(form.system.toLowerCase() + '/'))
                        .map(m => <option key={m.id} value={m.path}>{m.path} {m.item_count > 0 ? `(${m.item_count})` : ''}</option>)
                      }
                    </select>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '8px 0' }}>
                      No module folders yet for {form.system || 'this system'} — switch to "New" to create one.
                    </div>
                  )
                ) : (
                  <>
                    <input value={form.moduleName} onChange={f('moduleName')}
                      placeholder="e.g. Curse of Strahd"
                      required={isAdventureModule && form.moduleMode === 'new'} />
                    {form.moduleName.trim() && (
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4, fontFamily: 'monospace' }}>
                        → {form.system}/Adventure Module/{form.moduleName.trim()}/
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Non-module content placed inside a module ── */}
            {!isAdventureModule && form.contentType && moduleFolders.length > 0 && (
              <div style={{ marginTop: 14, padding: '12px 14px', background: 'var(--bg-3)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-1)', cursor: 'pointer', userSelect: 'none' }}>
                  <input type="checkbox" checked={form.inModule} onChange={fb('inModule')} />
                  This file belongs inside an Adventure Module folder
                </label>

                {form.inModule && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>Which module? *</label>
                      <select value={form.inModuleFolder}
                        onChange={e => setForm(p => ({ ...p, inModuleFolder: e.target.value, inModuleSubfolder: '' }))}
                        required={form.inModule}>
                        <option value="">— Select module —</option>
                        {moduleFolders.map(mf => (
                          <option key={mf.id} value={mf.path}>{mf.path}</option>
                        ))}
                      </select>
                    </div>

                    {form.inModuleFolder && (
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>
                          Subfolder
                          <span style={{ color: 'var(--text-3)', fontWeight: 400, marginLeft: 6 }}>optional</span>
                        </label>
                        {inModuleSubfolders.length > 0 ? (
                          <select value={form.inModuleSubfolder} onChange={f('inModuleSubfolder')}>
                            <option value="">— Module root —</option>
                            {inModuleSubfolders.map(sf => (
                              <option key={sf.id} value={sf.path}>{'·  '.repeat(sf.depth)}{sf.name}</option>
                            ))}
                          </select>
                        ) : (
                          <div style={{ fontSize: 11, color: 'var(--text-3)', padding: '6px 0' }}>
                            No subfolders — file goes to module root. Create subfolders in File Explorer.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Step 2: Destination ── */}
          <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
              2 — Destination
            </div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>
              Target Folder *
            </label>
            <FolderPicker
              folders={targetFolderOptions}
              value={form.targetFolder}
              onChange={val => setForm(p => ({ ...p, targetFolder: val }))}
              extraOption={form.targetFolder && !targetExists
                ? { value: form.targetFolder, label: `${form.targetFolder} ✦ new folder` }
                : null}
            />
            {form.targetFolder && (
              <div style={{ fontSize: 11, marginTop: 6, fontFamily: 'monospace', color: targetExists ? 'var(--green-hi)' : 'var(--amber-hi)' }}>
                {targetExists ? '✓ existing folder' : '✦ will create new folder'} → {form.targetFolder}/
              </div>
            )}
            {form.inModule && form.contentType && (
              <div style={{ fontSize: 12, color: 'var(--amber-hi)', marginTop: 8 }}>
                ⚔ File stays in module folder — "{form.contentType}" is used as a tag for library filtering only.
              </div>
            )}
          </div>

          {/* ── Step 3: Details ── */}
          <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
              3 — Details
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>Title *</label>
                <input value={form.title} required onChange={f('title')} placeholder="Book or file title" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>
                  Authors <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(comma-separated)</span>
                </label>
                <input value={form.authors} onChange={f('authors')} placeholder="Gary Gygax, Dave Arneson" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>Description</label>
                <textarea value={form.description} rows={3} style={{ resize: 'vertical' }} onChange={f('description')} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>
                  Tags <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(comma-separated)</span>
                </label>
                <input value={form.tags} onChange={f('tags')} placeholder="dungeon, one-shot, horror" />
              </div>
            </div>
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

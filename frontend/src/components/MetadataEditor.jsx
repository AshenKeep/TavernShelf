import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi.js';
import ModuleFolderModal from './ModuleFolderModal.jsx';

const TTRPG_SYSTEMS = ['D&D 5e','D&D 5.5e','D&D 3.5e','D&D 4e','OSE','Pathfinder 1e','Pathfinder 2e','Call of Cthulhu','Shadowrun','Starfinder','Forbidden Lands','Savage Worlds','Year Zero Engine','GURPS','FATE Core','Blades in the Dark','Cairn','Mothership','Mörk Borg','Other'];
const CONTENT_TYPES = ['Core Rulebook','Supplement','Adventure Module','Sourcebook','Bestiary','Campaign Setting','Magic Items','Pregen Characters','Battle Maps','Tokens','Encounter','Quick Reference','System Reference','Other'];

const LOCKABLE_FIELDS = ['title','authors','description','publisher','year','tags','system','contentType','cover'];

// Compare DB value vs file value — returns 'match' | 'differs' | 'absent'
function compareField(dbVal, fileVal) {
  if (fileVal == null || fileVal === '' || (Array.isArray(fileVal) && !fileVal.length)) return 'absent';
  const db = Array.isArray(dbVal) ? dbVal.join(', ') : String(dbVal || '');
  const file = Array.isArray(fileVal) ? fileVal.join(', ') : String(fileVal || '');
  return db.trim().toLowerCase() === file.trim().toLowerCase() ? 'match' : 'differs';
}

const STATUS_COLORS = {
  match:  'var(--green-hi)',
  differs:'var(--amber-hi)',
  absent: 'var(--text-3)',
};
const STATUS_LABELS = {
  match:  '✓ matches file',
  differs:'≠ differs from file',
  absent: '— not in file',
};

function LockButton({ locked, onToggle }) {
  return (
    <button onClick={onToggle} title={locked ? 'Locked — auto-fetch cannot change this field' : 'Unlocked — auto-fetch may overwrite this field'}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', fontSize: 13,
        color: locked ? 'var(--amber)' : 'var(--text-3)', lineHeight: 1, flexShrink: 0 }}>
      {locked ? '🔒' : '🔓'}
    </button>
  );
}

function FieldStatus({ status }) {
  if (!status) return null;
  return (
    <span style={{ fontSize: 10, color: STATUS_COLORS[status], marginLeft: 6, letterSpacing: '0.03em' }}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export default function MetadataEditor({ item, onClose, onSave }) {
  const { get, post, put } = useApi();

  const [form, setForm] = useState({
    title:       item.title       || '',
    authors:     (item.authors || []).join(', '),
    description: item.description || '',
    publisher:   item.publisher   || '',
    year:        item.year        || '',
    system:      item.system      || '',
    contentType: item.content_type|| '',
    tags:        (item.tags || []).join(', '),
    isbn:        item.isbn || '',
  });

  const [lockedFields, setLockedFields] = useState(item.locked_fields || []);
  const [fileMetadata, setFileMetadata] = useState(null);
  const [fileMetaLoading, setFileMetaLoading] = useState(false);
  const [fileMetaError, setFileMetaError]   = useState('');

  const [searchQuery, setSearchQuery]     = useState(item.title);
  const [isbnQuery, setIsbnQuery]         = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching]         = useState(false);
  const [activeSearch, setActiveSearch]   = useState('title');

  const [coverUrl, setCoverUrl]           = useState('');
  const [coverFetched, setCoverFetched]   = useState(null);
  const [fetchingCover, setFetchingCover]   = useState(false);
  const [extractingCover, setExtractingCover] = useState(false);

  const [saving, setSaving]               = useState(false);
  const [moduleModal, setModuleModal]     = useState(null); // { itemId, system }
  const [writing, setWriting]             = useState(false);
  const [writeMsg, setWriteMsg]           = useState('');
  const [writeError, setWriteError]       = useState('');
  const [error, setError]                 = useState('');
  const [moduleFolders, setModuleFolders]   = useState([]);
  const [affiliatedModules, setAffiliatedModules] = useState([]); // folder_id strings
  const [savingModules, setSavingModules]       = useState(false);
  const [inModule, setInModule]                 = useState(false);
  const [moveModuleId, setMoveModuleId]         = useState('');
  const [moveSubfolderId, setMoveSubfolderId]   = useState('');
  const [movingToModule, setMovingToModule]     = useState(false);
  const [allFolders, setAllFolders]             = useState([]);

  const canWriteToFile = ['pdf','cbz'].includes(item.file_type);

  // Detect if this item is inside a module folder
  const [currentModulePath, setCurrentModulePath] = useState(null);

  useEffect(() => {
    get('/library/folders').then(tree => {
      const flat = [];
      const flatten = (nodes) => nodes.forEach(n => { flat.push(n); flatten(n.children || []); });
      flatten(tree);
      setAllFolders(flat);
      const modules = flat.filter(f => f.is_module);
      setModuleFolders(modules);
      // Check if item.path starts with any module folder path
      const inModule = modules.find(m => item.path.startsWith(m.path + '/') || item.path === m.path);
      setCurrentModulePath(inModule?.path || null);
    }).catch(() => {});
    // Load existing affiliations
    get(`/library/items/${item.id}/modules`).then(rows => {
      setAffiliatedModules(rows.map(r => r.id));
    }).catch(() => {});
  }, [item.id]);

  // Load file metadata on mount
  useEffect(() => {
    if (!canWriteToFile) return;
    setFileMetaLoading(true);
    get(`/library/items/${item.id}/metadata/file`)
      .then(data => setFileMetadata(data))
      .catch(e => setFileMetaError(e.message))
      .finally(() => setFileMetaLoading(false));
  }, [item.id]);

  const toggleLock = async (field) => {
    const next = lockedFields.includes(field)
      ? lockedFields.filter(f => f !== field)
      : [...lockedFields, field];
    setLockedFields(next);
    try {
      await put(`/library/items/${item.id}/locked-fields`, { lockedFields: next });
    } catch (e) { console.error('Lock save failed:', e.message); }
  };

  const [searchRan, setSearchRan] = useState(false);

  const handleSearch = async () => {
    setSearching(true); setError(''); setSearchRan(false);
    try {
      const results = activeSearch === 'isbn' && isbnQuery
        ? await post(`/library/items/${item.id}/metadata/search-isbn`, { isbn: isbnQuery })
        : await post(`/library/items/${item.id}/metadata/search`, { query: searchQuery });
      setSearchResults(Array.isArray(results) ? results : []);
      setSearchRan(true);
    } catch (e) { setError('Search failed: ' + e.message); }
    finally { setSearching(false); }
  };

  const applyResult = (result) => {
    setForm(f => ({
      ...f,
      title:       lockedFields.includes('title')       ? f.title       : (result.title || f.title),
      authors:     lockedFields.includes('authors')     ? f.authors     : ((result.authors||[]).join(', ') || f.authors),
      description: lockedFields.includes('description') ? f.description : (result.description || f.description),
      publisher:   lockedFields.includes('publisher')   ? f.publisher   : (result.publisher || f.publisher),
      year:        lockedFields.includes('year')        ? f.year        : (result.year || f.year),
      tags:        lockedFields.includes('tags')        ? f.tags
        : [...new Set([...f.tags.split(',').map(t=>t.trim()), ...(result.tags||[])].filter(Boolean))].join(', '),
    }));
    if (result.coverUrl && !lockedFields.includes('cover')) setCoverUrl(result.coverUrl);
    setSearchResults([]); setSearchRan(false);
  };

  const handleExtractCover = async () => {
    setExtractingCover(true); setError('');
    try {
      const result = await post(`/library/items/${item.id}/cover/extract`);
      if (result?.coverPath) setCoverFetched(result.coverPath);
    } catch (e) { setError(`Cover extraction failed: ${e.message}`); }
    finally { setExtractingCover(false); }
  };

  const handleFetchCover = async () => {
    if (!coverUrl) return;
    setFetchingCover(true); setError('');
    try {
      const result = await post(`/library/items/${item.id}/cover/fetch`, { url: coverUrl });
      if (result?.coverPath) { item.cover_path = result.coverPath; setCoverFetched(result.coverPath); }
    } catch (e) { setError(`Cover fetch failed: ${e.message}`); }
    finally { setFetchingCover(false); }
  };

  const moveToModule = async () => {
    if (!moveModuleId) return;
    const targetFolder = moveSubfolderId || moduleFolders.find(m => m.id === moveModuleId)?.path;
    if (!targetFolder) return;
    setMovingToModule(true); setError('');
    try {
      await post(`/library/items/${item.id}/move`, { targetFolder });
      // Also affiliate with the module
      const newAffiliations = [...new Set([...affiliatedModules, moveModuleId])];
      await put(`/library/items/${item.id}/modules`, { folderIds: newAffiliations });
      window.location.reload();
    } catch (e) { setError(e.message); setMovingToModule(false); }
  };

  const saveModules = async () => {
    setSavingModules(true);
    try {
      await put(`/library/items/${item.id}/modules`, { folderIds: affiliatedModules });
    } catch (e) { setError(e.message); }
    finally { setSavingModules(false); }
  };

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      // Save module affiliations in parallel
      saveModules().catch(() => {});
      const updated = await put(`/library/items/${item.id}/metadata`, {
        title:       form.title,
        authors:     form.authors.split(',').map(a=>a.trim()).filter(Boolean),
        description: form.description,
        publisher:   form.publisher,
        year:        form.year ? parseInt(form.year) : null,
        system:      form.system,
        contentType: form.contentType,
        tags:        form.tags.split(',').map(t=>t.trim()).filter(Boolean),
        coverUrl:    coverUrl || null,
        isbn:        form.isbn || null,
        source:      'manual',
      });
      if (updated.needsModuleName) {
        setModuleModal({ itemId: item.id, system: updated.system || form.system });
        setSaving(false);
        return;
      }
      onSave(updated);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleWriteToFile = async () => {
    setWriting(true); setWriteMsg(''); setWriteError('');
    try {
      await post(`/library/items/${item.id}/metadata/write`, {});
      setWriteMsg('Metadata written to file successfully');
      // Reload file metadata to reflect changes
      const data = await get(`/library/items/${item.id}/metadata/file`);
      setFileMetadata(data);
    } catch (e) { setWriteError(e.message); }
    finally { setWriting(false); }
  };

  // Compute match status for each field
  const fm = fileMetadata?.metadata;
  const status = fm ? {
    title:       compareField(form.title,       fm.title),
    authors:     compareField(form.authors,      (fm.authors||[]).join(', ')),
    description: compareField(form.description, fm.description),
    publisher:   compareField(form.publisher,   fm.publisher),
    year:        compareField(form.year,         fm.year),
    tags:        compareField(form.tags,         (fm.tags||[]).join(', ')),
  } : {};

  const f = (k) => (e) => setForm(p => ({...p, [k]: e.target.value}));

  return (
    <>
    <div style={{
      position:'fixed', inset:0, zIndex:100,
      background:'rgba(0,0,0,0.82)', backdropFilter:'blur(4px)',
      display:'flex', alignItems:'center', justifyContent:'center', padding:24, overflowY:'auto',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="card" style={{ width:'100%', maxWidth:700, maxHeight:'92vh', overflow:'auto', padding:28 }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <h2 style={{ fontFamily:'var(--font-display)', fontSize:18, color:'var(--text-0)' }}>Edit Metadata</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {/* File metadata panel */}
        {canWriteToFile && (
          <div style={{ background:'var(--bg-3)', border:'1px solid var(--border)', borderRadius:10, padding:14, marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
              <span style={{ fontSize:11, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.07em', flex:1 }}>
                File Metadata ({item.file_type.toUpperCase()})
              </span>
              <div style={{ display:'flex', gap:12, fontSize:10 }}>
                {[['match','var(--green-hi)','✓ match'],['differs','var(--amber-hi)','≠ differs'],['absent','var(--text-3)','— absent']].map(([s,c,l]) => (
                  <span key={s} style={{ color:c }}>{l}</span>
                ))}
              </div>
            </div>
            {fileMetaLoading && <div style={{ fontSize:12, color:'var(--text-3)' }}>Reading file…</div>}
            {fileMetaError  && <div style={{ fontSize:12, color:'var(--red-hi)' }}>{fileMetaError}</div>}
            {fm && !fileMetaLoading && (
              <div style={{ display:'flex', flexWrap:'wrap', gap:'4px 16px', fontSize:11, color:'var(--text-2)' }}>
                {[
                  ['Title',   fm.title],
                  ['Authors', (fm.authors||[]).join(', ')],
                  ['Publisher', fm.publisher],
                  ['Year',    fm.year],
                  ['Tags',    (fm.tags||[]).slice(0,4).join(', ')],
                ].map(([label, val]) => (
                  <span key={label} style={{ color:'var(--text-3)' }}>
                    <strong style={{ color:'var(--text-2)' }}>{label}:</strong> {val || <em style={{ opacity:0.5 }}>—</em>}
                  </span>
                ))}
              </div>
            )}
            {!fm && !fileMetaLoading && !fileMetaError && (
              <div style={{ fontSize:12, color:'var(--text-3)' }}>No embedded metadata found in file</div>
            )}

            {/* Write to file */}
            <div style={{ marginTop:12, display:'flex', alignItems:'center', gap:10, borderTop:'1px solid var(--border)', paddingTop:12 }}>
              <button className="btn btn-ghost btn-sm" onClick={handleWriteToFile} disabled={writing}>
                {writing ? <><span className="spinner" style={{ width:12, height:12 }} /> Writing…</> : '↓ Write DB Metadata to File'}
              </button>
              {writeMsg   && <span style={{ fontSize:12, color:'var(--green-hi)' }}>✓ {writeMsg}</span>}
              {writeError && <span style={{ fontSize:12, color:'var(--red-hi)' }}>✗ {writeError}</span>}
            </div>
          </div>
        )}

        {/* Search */}
        <div style={{ background:'var(--bg-3)', border:'1px solid var(--border)', borderRadius:10, padding:14, marginBottom:16 }}>
          <div style={{ fontSize:11, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>
            Fetch from OpenLibrary / Google Books
          </div>
          <div style={{ display:'flex', gap:4, marginBottom:8 }}>
            {[['title','By Title'],['isbn','By ISBN']].map(([key,label]) => (
              <button key={key} className={`btn btn-sm ${activeSearch===key?'btn-primary':'btn-ghost'}`}
                onClick={() => setActiveSearch(key)}>{label}</button>
            ))}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            {activeSearch==='title'
              ? <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Search by title…" onKeyDown={e=>e.key==='Enter'&&handleSearch()}/>
              : <input value={isbnQuery}   onChange={e=>setIsbnQuery(e.target.value)}   placeholder="ISBN-10 or ISBN-13…" onKeyDown={e=>e.key==='Enter'&&handleSearch()}/>
            }
            <button className="btn btn-primary btn-sm" onClick={handleSearch} disabled={searching} style={{ flexShrink:0 }}>
              {searching ? <span className="spinner" style={{ width:13, height:13 }}/> : 'Search'}
            </button>
          </div>
          {searchRan && searchResults.length === 0 && !searching && (
            <div style={{ marginTop:8, fontSize:12, color:'var(--text-3)', padding:'6px 0' }}>
              No results found — try a different search term or check the book title
            </div>
          )}
          {searchResults.length > 0 && (
            <div style={{ marginTop:10, display:'flex', flexDirection:'column', gap:6, maxHeight:220, overflow:'auto' }}>
              {searchResults.map((r,i) => (
                <div key={i} style={{ display:'flex', gap:10, background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', cursor:'pointer', transition:'border-color 0.1s' }}
                  onMouseEnter={e=>e.currentTarget.style.borderColor='var(--amber)'}
                  onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}
                  onClick={()=>applyResult(r)}>
                  {r.coverUrl && <img src={r.coverUrl} alt="" style={{ width:32, height:46, objectFit:'cover', borderRadius:2, flexShrink:0 }}/>}
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontWeight:500, fontSize:13, color:'var(--text-0)' }}>{r.title}</div>
                    {r.authors?.length>0 && <div style={{ fontSize:12, color:'var(--text-2)' }}>{r.authors.join(', ')}</div>}
                    <div style={{ fontSize:11, color:'var(--text-3)', marginTop:2 }}>{r.source}{r.year&&` · ${r.year}`}{r.publisher&&` · ${r.publisher}`}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cover URL */}
        <div style={{ marginBottom:14 }}>
          <div style={{ display:'flex', alignItems:'center', marginBottom:6 }}>
            <label style={{ fontSize:12, color:'var(--text-2)', flex:1 }}>Cover Image URL</label>
            <LockButton locked={lockedFields.includes('cover')} onToggle={()=>toggleLock('cover')}/>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
            <div style={{ flex:1 }}>
              <div style={{ display:'flex', gap:8 }}>
                <input value={coverUrl} onChange={e=>setCoverUrl(e.target.value)} placeholder="https://… (auto-filled from search results)"/>
                <button className="btn btn-ghost btn-sm" onClick={handleFetchCover} disabled={fetchingCover||!coverUrl} style={{ flexShrink:0 }}>
                  {fetchingCover ? <span className="spinner" style={{ width:12, height:12 }}/> : 'Apply'}
                </button>
              </div>
              {canWriteToFile && (
                <div style={{ marginTop:6, display:'flex', alignItems:'center', gap:8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={handleExtractCover} disabled={extractingCover}>
                    {extractingCover
                      ? <><span className="spinner" style={{ width:11, height:11 }}/> Extracting…</>
                      : '📄 Extract from file'}
                  </button>
                  <span style={{ fontSize:11, color:'var(--text-3)' }}>
                    {item.file_type === 'pdf' ? 'Use first page of PDF as cover' : 'Use first image of CBZ as cover'}
                  </span>
                </div>
              )}
              {coverFetched && <div style={{ fontSize:11, color:'var(--green-hi)', marginTop:4 }}>✓ Cover applied</div>}
            </div>
            {(coverFetched||item.cover_path) && (
              <img src={coverFetched ? `${coverFetched}?v=${Date.now()}` : `${item.cover_path}?v=${item.updated_at||0}`} alt="preview"
                style={{ width:36, height:52, objectFit:'cover', borderRadius:2, border:'1px solid var(--border)', flexShrink:0 }}
                onError={e=>e.target.style.display='none'}/>
            )}
          </div>
        </div>

        {error && (
          <div style={{ background:'rgba(138,30,30,0.12)', border:'1px solid rgba(138,30,30,0.3)', borderRadius:8, padding:'10px 14px', marginBottom:14, color:'var(--red-hi)', fontSize:13 }}>
            {error}
          </div>
        )}

        {/* ── Module panel ── */}
        <div style={{ background:'var(--bg-2)', border:'1px solid var(--border-md)', borderRadius:10, padding:16, marginBottom:14 }}>
          <div style={{ fontSize:11, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>File Location</div>

          {/* Current path */}
          <div style={{ display:'flex', gap:8, alignItems:'flex-start', marginBottom:12, padding:'6px 8px', background:'var(--bg-3)', borderRadius:6 }}>
            <span style={{ color:'var(--text-3)', fontSize:11, flexShrink:0, paddingTop:1 }}>Path</span>
            <span style={{ fontFamily:'monospace', color:'var(--text-2)', fontSize:11, wordBreak:'break-all', flex:1 }}>{item.path}</span>
          </div>

          {/* If already physically in a module — show it with change/remove options */}
          {currentModulePath ? (
            <div style={{ marginBottom: moduleFolders.filter(m => m.path !== currentModulePath).length > 0 ? 12 : 0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', background:'rgba(200,136,42,0.08)', border:'1px solid rgba(200,136,42,0.25)', borderRadius:7, marginBottom:8 }}>
                <span style={{ fontSize:13 }}>⚔</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, color:'var(--amber-hi)', fontWeight:500 }}>In module: {moduleFolders.find(m => m.path === currentModulePath)?.name || currentModulePath}</div>
                  <div style={{ fontSize:10, color:'var(--text-3)', marginTop:2 }}>Content type is a tag — file physically lives here</div>
                </div>
              </div>
              {/* Change module or move out */}
              <div style={{ paddingLeft:8, display:'flex', flexDirection:'column', gap:8 }}>
                <label style={{ display:'block', fontSize:12, color:'var(--text-2)', marginBottom:5 }}>Move to a different module or folder</label>

                {/* Step 1: pick destination module or library folder */}
                <select value={moveModuleId} onChange={e => { setMoveModuleId(e.target.value); setMoveSubfolderId(''); }}
                  style={{ fontFamily:'monospace', fontSize:12 }}>
                  <option value="">— Select destination —</option>
                  <optgroup label="Module Folders">
                    {moduleFolders.filter(m => m.path !== currentModulePath).map(m => (
                      <option key={m.id} value={m.id}>{m.path}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Library Folders (move out of module)">
                    {allFolders.filter(f => !moduleFolders.some(m => f.path === m.path || f.path.startsWith(m.path + '/'))).map(f => (
                      <option key={f.id} value={'folder:' + f.path}>{f.path}</option>
                    ))}
                  </optgroup>
                </select>

                {/* Step 2: if a module is selected, show its subfolders */}
                {moveModuleId && !moveModuleId.startsWith('folder:') && (() => {
                  const selectedMod = moduleFolders.find(m => m.id === moveModuleId);
                  const subs = selectedMod
                    ? allFolders.filter(f =>
                        f.path.startsWith(selectedMod.path + '/') &&
                        f.path.split('/').length === selectedMod.path.split('/').length + 1
                      )
                    : [];
                  return subs.length > 0 ? (
                    <select value={moveSubfolderId} onChange={e => setMoveSubfolderId(e.target.value)}
                      style={{ fontFamily:'monospace', fontSize:12 }}>
                      <option value="">— Module root —</option>
                      {subs.map(sf => <option key={sf.id} value={sf.path}>{sf.path}</option>)}
                    </select>
                  ) : null;
                })()}

                {/* Destination preview */}
                {moveModuleId && (
                  <div style={{ fontSize:11, fontFamily:'monospace', color:'var(--amber-hi)' }}>
                    → {moveModuleId.startsWith('folder:')
                        ? moveModuleId.replace('folder:', '')
                        : (moveSubfolderId || moduleFolders.find(m => m.id === moveModuleId)?.path)}/
                  </div>
                )}

                <button type="button" className="btn btn-primary btn-sm" style={{ alignSelf:'flex-start' }}
                  disabled={!moveModuleId || movingToModule}
                  onClick={async () => {
                    setMovingToModule(true); setError('');
                    try {
                      let targetFolder;
                      if (moveModuleId.startsWith('folder:')) {
                        targetFolder = moveModuleId.replace('folder:', '');
                      } else {
                        targetFolder = moveSubfolderId || moduleFolders.find(m => m.id === moveModuleId)?.path;
                      }
                      await post(`/library/items/${item.id}/move`, { targetFolder });
                      window.location.reload();
                    } catch(e) { setError(e.message); setMovingToModule(false); }
                  }}>
                  {movingToModule ? <span className="spinner" style={{ width:12, height:12 }}/> : 'Move'}
                </button>
              </div>
            </div>
          ) : (
            /* Not in a module — offer to move it into one */
            <div>
              <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:'var(--text-1)', cursor:'pointer', marginBottom: inModule ? 12 : 0 }}>
                <input type="checkbox" checked={inModule} onChange={e => { setInModule(e.target.checked); setMoveModuleId(''); setMoveSubfolderId(''); }} />
                <span style={{ fontWeight:500 }}>This file belongs inside an Adventure Module folder</span>
              </label>

              {inModule && (
                <div style={{ display:'flex', flexDirection:'column', gap:10, marginTop:4, paddingLeft:24 }}>
                  {moduleFolders.length === 0 ? (
                    <div style={{ fontSize:12, color:'var(--text-3)' }}>
                      No module folders yet —{' '}
                      <a href="/files" style={{ color:'var(--amber-hi)', textDecoration:'underline' }}>create one in File Explorer</a>
                      {' '}first.
                    </div>
                  ) : (
                    <>
                      <div>
                        <label style={{ display:'block', fontSize:12, color:'var(--text-2)', marginBottom:5 }}>
                          Which module? *
                          {form.system && <span style={{ color:'var(--text-3)', marginLeft:6, fontWeight:400 }}>(filtered by {form.system})</span>}
                        </label>
                        <select value={moveModuleId}
                          onChange={e => { setMoveModuleId(e.target.value); setMoveSubfolderId(''); }}
                          style={{ fontFamily:'monospace', fontSize:12 }}>
                          <option value="">— Select module —</option>
                          {moduleFolders
                            .filter(m => !form.system || m.path.toLowerCase().startsWith(form.system.toLowerCase() + '/'))
                            .map(m => <option key={m.id} value={m.id}>{m.path}</option>)
                          }
                        </select>
                      </div>

                      {moveModuleId && (() => {
                        const selectedModule = moduleFolders.find(m => m.id === moveModuleId);
                        const subfolders = selectedModule
                          ? allFolders.filter(f => f.path.startsWith(selectedModule.path + '/') && f.path.split('/').length === selectedModule.path.split('/').length + 1)
                          : [];
                        return (
                          <div>
                            <label style={{ display:'block', fontSize:12, color:'var(--text-2)', marginBottom:5 }}>
                              Subfolder <span style={{ color:'var(--text-3)', fontWeight:400 }}>optional</span>
                            </label>
                            {subfolders.length > 0 ? (
                              <select value={moveSubfolderId} onChange={e => setMoveSubfolderId(e.target.value)} style={{ fontFamily:'monospace', fontSize:12 }}>
                                <option value="">— Module root —</option>
                                {subfolders.map(sf => <option key={sf.id} value={sf.path}>{sf.name}</option>)}
                              </select>
                            ) : (
                              <div style={{ fontSize:11, color:'var(--text-3)' }}>No subfolders — file will go to module root</div>
                            )}
                          </div>
                        );
                      })()}

                      {moveModuleId && (
                        <>
                          <div style={{ fontSize:11, color:'var(--text-3)', fontFamily:'monospace', padding:'4px 0' }}>
                            → {moveSubfolderId || moduleFolders.find(m => m.id === moveModuleId)?.path}/
                          </div>
                          <button type="button" className="btn btn-primary btn-sm" style={{ alignSelf:'flex-start' }}
                            disabled={movingToModule}
                            onClick={moveToModule}>
                            {movingToModule
                              ? <><span className="spinner" style={{ width:12, height:12 }} /> Moving…</>
                              : '⚔ Move into module'}
                          </button>
                          <div style={{ fontSize:11, color:'var(--text-3)' }}>
                            The file will be physically moved. Content type ("{form.contentType}") stays as a tag so it appears in both the module view and the content type tab.
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Affiliated modules — always shown if module folders exist */}
          {moduleFolders.filter(m => m.path !== currentModulePath).length > 0 && (
            <div style={{ marginTop:currentModulePath || inModule ? 14 : 8, borderTop: currentModulePath || inModule ? '1px solid var(--border)' : 'none', paddingTop: currentModulePath || inModule ? 12 : 0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                <span style={{ fontSize:12, color:'var(--text-2)', fontWeight:500 }}>Also show in modules</span>
                <span style={{ fontSize:11, color:'var(--text-3)' }}>file stays where it is — display tag only</span>
                {affiliatedModules.length > 0 && (
                  <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft:'auto', fontSize:11 }}
                    disabled={savingModules} onClick={saveModules}>
                    {savingModules ? <span className="spinner" style={{ width:10, height:10 }} /> : 'Save affiliations'}
                  </button>
                )}
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                {moduleFolders.filter(m => m.path !== currentModulePath).map(mf => {
                  const isAffiliated = affiliatedModules.includes(mf.id);
                  return (
                    <label key={mf.id} style={{
                      display:'flex', alignItems:'center', gap:8, padding:'6px 8px',
                      borderRadius:6, cursor:'pointer',
                      background: isAffiliated ? 'rgba(200,136,42,0.08)' : 'transparent',
                      border:`1px solid ${isAffiliated ? 'rgba(200,136,42,0.2)' : 'transparent'}`,
                    }}>
                      <input type="checkbox" checked={isAffiliated}
                        onChange={() => toggleAffiliation(mf.id)} />
                      <span style={{ fontSize:12, color: isAffiliated ? 'var(--amber-hi)' : 'var(--text-2)' }}>{mf.name}</span>
                      <span style={{ fontSize:10, color:'var(--text-3)', fontFamily:'monospace' }}>{mf.path}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Form fields */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

          {/* Title */}
          <div>
            <div style={{ display:'flex', alignItems:'center', marginBottom:5 }}>
              <label style={{ fontSize:12, color:'var(--text-2)', flex:1 }}>Title</label>
              <FieldStatus status={status.title}/>
              <LockButton locked={lockedFields.includes('title')} onToggle={()=>toggleLock('title')}/>
            </div>
            <input value={form.title} onChange={f('title')} style={{ borderColor: status.title==='differs' ? 'rgba(200,136,42,0.4)' : '' }}/>
          </div>

          {/* Authors */}
          <div>
            <div style={{ display:'flex', alignItems:'center', marginBottom:5 }}>
              <label style={{ fontSize:12, color:'var(--text-2)', flex:1 }}>Authors <span style={{ color:'var(--text-3)' }}>(comma-separated)</span></label>
              <FieldStatus status={status.authors}/>
              <LockButton locked={lockedFields.includes('authors')} onToggle={()=>toggleLock('authors')}/>
            </div>
            <input value={form.authors} onChange={f('authors')} placeholder="e.g. Gary Gygax, Dave Arneson"
              style={{ borderColor: status.authors==='differs' ? 'rgba(200,136,42,0.4)' : '' }}/>
          </div>

          {/* 2-col row */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            {/* System */}
            <div>
              <div style={{ display:'flex', alignItems:'center', marginBottom:5 }}>
                <label style={{ fontSize:12, color:'var(--text-2)', flex:1 }}>Game System</label>
                <LockButton locked={lockedFields.includes('system')} onToggle={()=>toggleLock('system')}/>
              </div>
              <select value={form.system} onChange={f('system')}>
                <option value="">— None —</option>
                {TTRPG_SYSTEMS.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {/* Content type */}
            <div>
              <div style={{ display:'flex', alignItems:'center', marginBottom:5 }}>
                <label style={{ fontSize:12, color:'var(--text-2)', flex:1 }}>Content Type</label>
                <LockButton locked={lockedFields.includes('contentType')} onToggle={()=>toggleLock('contentType')}/>
              </div>
              <select value={form.contentType} onChange={f('contentType')}>
                <option value="">— None —</option>
                {CONTENT_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {/* Publisher */}
            <div>
              <div style={{ display:'flex', alignItems:'center', marginBottom:5 }}>
                <label style={{ fontSize:12, color:'var(--text-2)', flex:1 }}>Publisher</label>
                <FieldStatus status={status.publisher}/>
                <LockButton locked={lockedFields.includes('publisher')} onToggle={()=>toggleLock('publisher')}/>
              </div>
              <input value={form.publisher} onChange={f('publisher')}
                style={{ borderColor: status.publisher==='differs' ? 'rgba(200,136,42,0.4)' : '' }}/>
            </div>
            {/* Year */}
            <div>
              <div style={{ display:'flex', alignItems:'center', marginBottom:5 }}>
                <label style={{ fontSize:12, color:'var(--text-2)', flex:1 }}>Year</label>
                <FieldStatus status={status.year}/>
                <LockButton locked={lockedFields.includes('year')} onToggle={()=>toggleLock('year')}/>
              </div>
              <input type="number" value={form.year} min="1970" max="2030" onChange={f('year')}
                style={{ borderColor: status.year==='differs' ? 'rgba(200,136,42,0.4)' : '' }}/>
            </div>
            {/* ISBN */}
            <div style={{ gridColumn:'1/-1' }}>
              <div style={{ display:'flex', alignItems:'center', marginBottom:5 }}>
                <label style={{ fontSize:12, color:'var(--text-2)', flex:1 }}>ISBN</label>
              </div>
              <input value={form.isbn} onChange={f('isbn')} placeholder="ISBN-10 or ISBN-13" style={{ fontFamily:'monospace' }}/>
            </div>


          </div>

          {/* Description */}
          <div>
            <div style={{ display:'flex', alignItems:'center', marginBottom:5 }}>
              <label style={{ fontSize:12, color:'var(--text-2)', flex:1 }}>Description</label>
              <FieldStatus status={status.description}/>
              <LockButton locked={lockedFields.includes('description')} onToggle={()=>toggleLock('description')}/>
            </div>
            <textarea value={form.description} rows={4} style={{ resize:'vertical', borderColor: status.description==='differs' ? 'rgba(200,136,42,0.4)' : '' }}
              onChange={f('description')}/>
          </div>

          {/* Tags */}
          <div>
            <div style={{ display:'flex', alignItems:'center', marginBottom:5 }}>
              <label style={{ fontSize:12, color:'var(--text-2)', flex:1 }}>Tags <span style={{ color:'var(--text-3)' }}>(comma-separated)</span></label>
              <FieldStatus status={status.tags}/>
              <LockButton locked={lockedFields.includes('tags')} onToggle={()=>toggleLock('tags')}/>
            </div>
            <input value={form.tags} onChange={f('tags')} placeholder="e.g. horror, dungeon, one-shot"
              style={{ borderColor: status.tags==='differs' ? 'rgba(200,136,42,0.4)' : '' }}/>
          </div>

        </div>

        {/* Footer */}
        <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:24, paddingTop:16, borderTop:'1px solid var(--border)' }}>
          <div style={{ fontSize:11, color:'var(--text-3)', alignSelf:'center', flex:1 }}>
            {lockedFields.length > 0 && `🔒 ${lockedFields.length} field${lockedFields.length>1?'s':''} locked`}
          </div>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner" style={{ width:14, height:14 }}/> : 'Save to DB'}
          </button>
        </div>

      </div>
    </div>
    {moduleModal && (
      <ModuleFolderModal
        itemId={moduleModal.itemId}
        system={moduleModal.system}
        onClose={() => setModuleModal(null)}
        onMoved={(updated) => { setModuleModal(null); onSave(updated); }}
      />
    )}
    </>
  );
}

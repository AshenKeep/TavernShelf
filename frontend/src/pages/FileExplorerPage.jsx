import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';

const Icon = ({ d, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const FOLDER_ICON = 'M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z';
const FILE_ICON   = 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z';
const PLUS_ICON   = 'M12 5v14M5 12h14';
const TRASH_ICON  = 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6';
const SETTINGS_ICON = 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z';

function FolderRow({ folder, depth, isAdmin, onCreateChild, onDelete, onToggleModule, onNavigate, navigate }) {
  const [open, setOpen]         = useState(depth === 0);
  const [editingModule, setEditingModule] = useState(false);
  const hasChildren = folder.children?.length > 0;

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: `5px 8px 5px ${8 + depth * 18}px`,
        borderRadius: 4, cursor: 'pointer',
        transition: 'background 0.1s',
      }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-3)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        {/* Expand/collapse */}
        <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-3)', width: 16, flexShrink: 0, fontSize: 10 }}>
          {hasChildren ? (open ? '▾' : '▸') : ' '}
        </button>

        {/* Folder icon + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}
          onClick={() => navigate(`/?folder=${encodeURIComponent(folder.path)}`)}>
          <Icon d={FOLDER_ICON} size={13} style={{ color: folder.is_module ? 'var(--amber)' : 'var(--text-3)', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {folder.name}
          </span>
          {folder.is_module && (
            <span style={{ fontSize: 9, color: 'var(--amber)', background: 'rgba(200,136,42,0.15)', padding: '1px 5px', borderRadius: 99, flexShrink: 0 }}>MODULE</span>
          )}
          {folder.managed === 'manual' && (
            <span style={{ fontSize: 9, color: 'var(--stone-hi)', flexShrink: 0 }}>🔒</span>
          )}
        </div>

        {/* Item count */}
        <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0, minWidth: 24, textAlign: 'right' }}>
          {folder.item_count || 0}
        </span>

        {/* Admin controls */}
        {isAdmin && (
          <div style={{ display: 'flex', gap: 2, flexShrink: 0, opacity: 0 }}
            className="_folder-controls"
            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
            onMouseLeave={e => e.currentTarget.style.opacity = '0'}
          >
            <button title="Add subfolder" onClick={e => { e.stopPropagation(); onCreateChild(folder.path); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: 'var(--amber)', fontSize: 12, borderRadius: 3 }}>+</button>
            <button title={folder.is_module ? 'Unmark as module' : 'Mark as module'}
              onClick={e => { e.stopPropagation(); onToggleModule(folder); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', fontSize: 10, color: folder.is_module ? 'var(--amber)' : 'var(--text-3)', borderRadius: 3 }}>⚔</button>
            <button title="Delete folder" onClick={e => { e.stopPropagation(); onDelete(folder); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: 'var(--red-hi)', fontSize: 11, borderRadius: 3 }}>✕</button>
          </div>
        )}
      </div>

      {/* Items inside this folder */}
      {open && folder.items?.map(item => (
        <div key={item.id} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: `4px 8px 4px ${8 + (depth + 1) * 18}px`,
          cursor: 'pointer', borderRadius: 4,
        }}
          onClick={() => navigate(`/item/${item.id}`)}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-3)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <span style={{ width: 16, flexShrink: 0 }} />
          <Icon d={FILE_ICON} size={12} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {item.title || item.filename}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-3)', flexShrink: 0 }}>{item.file_type?.toUpperCase()}</span>
        </div>
      ))}

      {/* Children */}
      {open && hasChildren && (
        <div>
          {folder.children.map(child => (
            <FolderRow key={child.id} folder={child} depth={depth + 1}
              isAdmin={isAdmin} onCreateChild={onCreateChild} onDelete={onDelete}
              onToggleModule={onToggleModule} onNavigate={onNavigate} navigate={navigate} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FileExplorerPage() {
  const { get, post, put, del } = useApi();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const [tree, setTree]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [createModal, setCreateModal] = useState(null);
  const [createName, setCreateName]   = useState('');
  const [isModule, setIsModule]       = useState(false);
  const [creating, setCreating]       = useState(false);
  const [error, setError]             = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const load = () => {
    setLoading(true);
    get('/library/folders').then(setTree).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const createFolder = async (e) => {
    e.preventDefault();
    if (!createName.trim()) return;
    setCreating(true); setError('');
    try {
      const path = createModal ? `${createModal}/${createName.trim()}` : createName.trim();
      await post('/admin/folders', { path });
      if (isModule) {
        // Find the new folder and mark it
        const updated = await get('/library/folders');
        const flat = flattenTree(updated);
        const newFolder = flat.find(f => f.path === path);
        if (newFolder) await put(`/library/folders/${newFolder.id}`, { is_module: true, managed: 'auto' });
      }
      load();
      setCreateModal(null);
      setCreateName('');
      setIsModule(false);
    } catch (e) { setError(e.message); }
    finally { setCreating(false); }
  };

  const toggleModule = async (folder) => {
    await put(`/library/folders/${folder.id}`, {
      is_module: !folder.is_module,
      managed: !folder.is_module ? 'auto' : null,
    });
    load();
  };

  const deleteFolder = async (folder) => {
    if (!deleteConfirm || deleteConfirm.id !== folder.id) {
      setDeleteConfirm(folder);
      return;
    }
    try {
      await del(`/admin/folders/${folder.id}`);
      load();
    } catch (e) { setError(e.message); }
    setDeleteConfirm(null);
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--text-0)', flex: 1 }}>
          File Explorer
        </h1>
        {isAdmin && (
          <button className="btn btn-primary btn-sm" onClick={() => { setCreateModal(''); setCreateName(''); setIsModule(false); }}>
            + New Folder
          </button>
        )}
      </div>

      {error && (
        <div style={{ background: 'rgba(138,30,30,0.12)', border: '1px solid rgba(138,30,30,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: 'var(--red-hi)', fontSize: 13 }}>
          {error} <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: 'var(--red-hi)', cursor: 'pointer', marginLeft: 8 }}>✕</button>
        </div>
      )}

      {deleteConfirm && (
        <div style={{ background: 'rgba(138,30,30,0.12)', border: '1px solid rgba(138,30,30,0.3)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--red-hi)', flex: 1 }}>Delete <strong>{deleteConfirm.name}</strong>? This removes the folder from the database only — files on disk are not deleted.</span>
          <button className="btn btn-danger btn-sm" onClick={() => deleteFolder(deleteConfirm)}>Confirm Delete</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setDeleteConfirm(null)}>Cancel</button>
        </div>
      )}

      {/* Admin controls legend */}
      {isAdmin && (
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14, display: 'flex', gap: 14 }}>
          <span>Hover a folder to see controls:</span>
          <span style={{ color: 'var(--amber)' }}>+ add subfolder</span>
          <span>⚔ toggle module</span>
          <span style={{ color: 'var(--red-hi)' }}>✕ remove from DB</span>
          <span>Click folder name → view books</span>
        </div>
      )}

      <div className="card" style={{ overflow: 'hidden' }}>
        <style>{`._folder-controls { transition: opacity 0.1s; } div:hover > ._folder-controls { opacity: 1 !important; }`}</style>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <div className="spinner" />
          </div>
        ) : tree.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>No folders yet — trigger a scan or add files to your library</div>
        ) : (
          <div style={{ padding: '8px 4px' }}>
            {tree.map(folder => (
              <FolderRow key={folder.id} folder={folder} depth={0}
                isAdmin={isAdmin} onCreateChild={(path) => { setCreateModal(path); setCreateName(''); setIsModule(false); }}
                onDelete={deleteFolder} onToggleModule={toggleModule} onNavigate={() => {}} navigate={navigate} />
            ))}
          </div>
        )}
      </div>

      {/* Create folder modal */}
      {createModal !== null && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }} onClick={e => e.target === e.currentTarget && setCreateModal(null)}>
          <div className="card" style={{ width: '100%', maxWidth: 400, padding: 24 }}>
            <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--text-0)', marginBottom: 12, fontSize: 16 }}>
              New Folder
            </h3>
            {createModal && (
              <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12, fontFamily: 'monospace' }}>
                Inside: {createModal}/
              </p>
            )}
            <form onSubmit={createFolder} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input autoFocus placeholder="Folder name" value={createName} onChange={e => setCreateName(e.target.value)} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-1)', cursor: 'pointer' }}>
                <input type="checkbox" checked={isModule} onChange={e => setIsModule(e.target.checked)} />
                Mark as Adventure Module folder
              </label>
              {isModule && (
                <div style={{ fontSize: 12, color: 'var(--text-3)', background: 'var(--bg-3)', padding: '8px 12px', borderRadius: 6 }}>
                  This folder will be treated as a campaign module container. Files inside won't be auto-moved unless set to Auto mode.
                </div>
              )}
              {error && <div style={{ fontSize: 12, color: 'var(--red-hi)' }}>{error}</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCreateModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={creating || !createName.trim()}>
                  {creating ? <span className="spinner" style={{ width: 12, height: 12 }} /> : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function flattenTree(nodes, acc = []) {
  for (const n of nodes) { acc.push(n); if (n.children?.length) flattenTree(n.children, acc); }
  return acc;
}

import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth, appEvents } from '../context/AuthContext.jsx';
import { useApi } from '../hooks/useApi.js';

const VERSION = '0.1.2';

const Icon = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const ICONS = {
  library: 'M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 014 17V5a2 2 0 012-2h14a2 2 0 012 2v12',
  upload:  'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12',
  admin:   'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  logout:  'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  folder:   'M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z',
  campaign: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  menu:    'M3 12h18M3 6h18M3 18h18',
  plus:    'M12 5v14M5 12h14',
};

// TavernShelf logo SVG — shield with shelves and tankard
function Logo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 120" fill="none">
      <path d="M50 5 L95 5 L95 65 Q72 95 50 105 Q28 95 5 65 L5 5 Z" fill="#3d2410" stroke="#c8a050" strokeWidth="2"/>
      <line x1="10" y1="42" x2="90" y2="42" stroke="#7a5228" strokeWidth="2"/>
      <line x1="10" y1="62" x2="90" y2="62" stroke="#7a5228" strokeWidth="2"/>
      {[14,24,33,42,51,60,69,78].map((x,i) => (
        <rect key={i} x={x} y={i%2===0?26:24} width={8} height={i%2===0?16:18} rx="1"
          fill={['#8b2020','#c88820','#284880','#386040','#702880','#8b2020','#c88820','#284880'][i]}/>
      ))}
      {[14,23,32,42,51,60,70,79].map((x,i) => (
        <rect key={i} x={x} y={i%2===0?46:44} width={8} height={i%2===0?16:18} rx="1"
          fill={['#386040','#8b2020','#c88820','#702880','#284880','#386040','#8b2020','#c88820'][i]}/>
      ))}
      <rect x="35" y="70" width="30" height="24" rx="2" fill="#7a5228"/>
      <rect x="35" y="70" width="30" height="5" rx="1" fill="#5a3a18"/>
      <path d="M65 75 Q78 75 78 83 Q78 91 65 91" fill="none" stroke="#5a3a18" strokeWidth="5" strokeLinecap="round"/>
      <ellipse cx="50" cy="70" rx="15" ry="4" fill="#d4c890"/>
    </svg>
  );
}

function FolderNode({ folder, activeFolder, onSelect, onCreateChild, isAdmin, depth = 0 }) {
  const [open, setOpen] = useState(depth === 0);
  return (
    <li style={{ listStyle: 'none', paddingLeft: depth > 0 ? 10 : 0 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '3px 6px', borderRadius: 4, cursor: 'pointer',
        color: activeFolder === folder.path ? 'var(--amber-hi)' : 'var(--text-2)',
        background: activeFolder === folder.path ? 'rgba(200,136,42,0.12)' : 'transparent',
        fontSize: 13,
      }}>
        <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}
          onClick={() => { onSelect(folder.path); if (folder.children?.length) setOpen(o => !o); }}>
          <Icon d={ICONS.folder} size={12} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</span>
          {folder.is_module && <span style={{ fontSize: 9, color: 'var(--amber)', background: 'rgba(200,136,42,0.15)', padding: '0 4px', borderRadius: 3, flexShrink: 0 }}>M</span>}
          {folder.managed === 'manual' && <span style={{ fontSize: 9, color: 'var(--stone-hi)', flexShrink: 0 }}>🔒</span>}
          <span style={{ fontSize: 10, color: 'var(--text-3)', flexShrink: 0 }}>{folder.item_count}</span>
        </span>
        {isAdmin && (
          <button title="Create subfolder" onClick={e => { e.stopPropagation(); onCreateChild(folder.path); }}
            style={{ opacity: 0, padding: '1px 3px', borderRadius: 3, fontSize: 14, color: 'var(--amber)', lineHeight: 1 }}
            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
            onMouseLeave={e => e.currentTarget.style.opacity = '0'}
            className="_folder-add-btn">+</button>
        )}
      </div>
      {open && folder.children?.length > 0 && (
        <ul style={{ paddingLeft: 0 }}>
          {folder.children.map(c => (
            <FolderNode key={c.id} folder={c} activeFolder={activeFolder} onSelect={onSelect}
              onCreateChild={onCreateChild} isAdmin={isAdmin} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

function CreateFolderModal({ parentPath, onClose, onCreated }) {
  const { post } = useApi();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true); setError('');
    try {
      const path = parentPath ? `${parentPath}/${name.trim()}` : name.trim();
      await post('/admin/folders', { path });
      onCreated();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="card" style={{ width: '100%', maxWidth: 360, padding: 24 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--text-0)', marginBottom: 6, fontSize: 16 }}>
          New Folder
        </h3>
        {parentPath && (
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>Inside: {parentPath}</p>
        )}
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input autoFocus placeholder="Folder name" value={name}
            onChange={e => setName(e.target.value)} />
          {error && <div style={{ fontSize: 12, color: 'var(--red-hi)' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={loading || !name.trim()}>
              {loading ? <span className="spinner" style={{ width: 12, height: 12 }} /> : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Layout() {
  const { user, logout, isAdmin } = useAuth();
  const { get } = useApi();
  const navigate = useNavigate();
  const [folders, setFolders] = useState([]);
  const [activeFolder, setActiveFolder] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [scanning, setScanning]         = useState(false);
  const [campaigns, setCampaigns] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [createModal, setCreateModal] = useState(null); // null | parentPath string

  const loadFolders = () => get('/library/folders').then(setFolders).catch(() => {});
  const loadPending = () => { if (isAdmin) get('/uploads?status=pending').then(q => setPendingCount(q.length)).catch(() => {}); };
  const loadCampaigns = () => get('/campaigns').then(setCampaigns).catch(() => {});
  const syncLibrary = async () => {
    setScanning(true);
    try {
      await post('/library/scan', {});
      // Reload folders after a short delay to let scan finish
      setTimeout(() => { loadFolders(); setScanning(false); }, 3000);
    } catch { setScanning(false); }
  };

  useEffect(() => {
    loadFolders();
    loadPending();
    loadCampaigns();
    const unsub1 = appEvents.on('uploadReviewed', loadPending);
    const unsub2 = appEvents.on('campaignUpdated', loadCampaigns);
    return () => { unsub1(); unsub2(); };
  }, [isAdmin]);

  const handleFolderSelect = (path) => {
    const next = path === activeFolder ? null : path;
    setActiveFolder(next);
    navigate(next ? `/?folder=${encodeURIComponent(path)}` : '/');
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Add hover style for folder + buttons */}
      <style>{`._folder-add-btn:hover { opacity: 1 !important; background: rgba(200,136,42,0.15); }`}</style>

      {/* Sidebar */}
      <aside style={{
        width: sidebarOpen ? 'var(--sidebar-w)' : 0,
        minWidth: sidebarOpen ? 'var(--sidebar-w)' : 0,
        overflow: 'hidden', flexShrink: 0,
        background: 'var(--bg-1)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        transition: 'width 0.2s, min-width 0.2s',
      }}>
        {/* Logo */}
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Logo size={36} />
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--text-0)', letterSpacing: '0.04em' }}>
                TavernShelf
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.06em' }}>
                {user?.display_name}
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ padding: '10px 10px 0', flexShrink: 0 }}>
          {[
            { to: '/',        label: 'Library',  icon: ICONS.library },
            { to: '/uploads', label: 'Uploads',  icon: ICONS.upload, badge: pendingCount > 0 ? pendingCount : null },
            { to: '/campaigns', label: 'Campaigns', icon: ICONS.campaign },
    ...(isAdmin ? [{ to: '/admin', label: 'Admin', icon: ICONS.admin }] : []),
          ].map(item => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '7px 10px', borderRadius: 6, marginBottom: 2,
              color: isActive ? 'var(--text-0)' : 'var(--text-2)',
              background: isActive ? 'var(--bg-3)' : 'transparent',
              borderLeft: isActive ? '2px solid var(--amber)' : '2px solid transparent',
              fontSize: 13, fontWeight: 500, transition: 'all 0.1s',
            })}>
              <Icon d={item.icon} size={14} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge && <span className="badge badge-amber" style={{ fontSize: 10, padding: '1px 6px' }}>{item.badge}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Folder tree */}
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 10px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, paddingLeft: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.08em', textTransform: 'uppercase', flex: 1 }}>
              Folders
            </span>
            {isAdmin && (
              <button title="Create top-level folder" onClick={() => setCreateModal('')}
                className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', fontSize: 16 }}>+</button>
            )}
          </div>
          <ul style={{ listStyle: 'none' }}>
            {folders.map(f => (
              <FolderNode key={f.id} folder={f} activeFolder={activeFolder}
                onSelect={handleFolderSelect} onCreateChild={setCreateModal}
                isAdmin={isAdmin} depth={0} />
            ))}
          </ul>
        </div>

        {/* Campaign list */}
        {campaigns.length > 0 && (
          <div style={{ padding: '0 10px 10px', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6, paddingLeft: 6 }}>
              Campaigns
            </div>
            {campaigns.slice(0, 8).map(c => (
              <NavLink key={c.id} to={`/campaigns/${c.id}`} style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 6px', borderRadius: 4, marginBottom: 1, fontSize: 12,
                color: isActive ? 'var(--text-0)' : 'var(--text-2)',
                background: isActive ? 'var(--bg-3)' : 'transparent',
                textDecoration: 'none', overflow: 'hidden',
              })}>
                <Icon d={ICONS.campaign} size={11} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{c.name}</span>
              </NavLink>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ padding: '10px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 6, paddingLeft: 4, letterSpacing: '0.06em' }}>
            v{VERSION}
          </div>
          <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', gap: 8, fontSize: 13 }}
            onClick={logout}>
            <Icon d={ICONS.logout} size={14} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{
          height: 'var(--topbar-h)', minHeight: 'var(--topbar-h)',
          background: 'var(--bg-1)', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12, flexShrink: 0,
        }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setSidebarOpen(o => !o)}>
            <Icon d={ICONS.menu} size={16} />
          </button>
        </header>
        <main style={{ flex: 1, overflow: 'auto' }}>
          <Outlet />
        </main>
      </div>

      {/* Create folder modal */}
      {createModal !== null && (
        <CreateFolderModal
          parentPath={createModal}
          onClose={() => setCreateModal(null)}
          onCreated={loadFolders}
        />
      )}
    </div>
  );
}

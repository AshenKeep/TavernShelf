import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useApi } from '../hooks/useApi.js';

const Icon = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const ICONS = {
  library:  'M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 014 17V5a2 2 0 012-2h14a2 2 0 012 2v12',
  upload:   'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12',
  admin:    'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  logout:   'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  chevron:  'M9 18l6-6-6-6',
  folder:   'M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z',
  menu:     'M3 12h18M3 6h18M3 18h18',
  sword:    'M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M2 22l5-5',
};

function FolderTree({ folders, activeFolder, onSelect, depth = 0 }) {
  const [open, setOpen] = useState(depth === 0);
  if (!folders?.length) return null;
  return (
    <ul style={{ listStyle: 'none', paddingLeft: depth > 0 ? 12 : 0 }}>
      {folders.map(f => (
        <li key={f.id}>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 8px', borderRadius: 6, cursor: 'pointer',
              color: activeFolder === f.path ? 'var(--purple-hi)' : 'var(--text-2)',
              background: activeFolder === f.path ? 'rgba(139,107,200,0.12)' : 'transparent',
              fontSize: 13,
            }}
            onClick={() => { onSelect(f.path); if (f.children?.length) setOpen(o => !o); }}
          >
            <Icon d={ICONS.folder} size={13} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {f.name}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{f.item_count}</span>
          </div>
          {open && f.children?.length > 0 && (
            <FolderTree folders={f.children} activeFolder={activeFolder} onSelect={onSelect} depth={depth + 1} />
          )}
        </li>
      ))}
    </ul>
  );
}

export default function Layout() {
  const { user, logout, isAdmin } = useAuth();
  const { get } = useApi();
  const navigate = useNavigate();
  const [folders, setFolders] = useState([]);
  const [activeFolder, setActiveFolder] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    get('/library/folders').then(setFolders).catch(() => {});
    if (isAdmin) {
      get('/uploads?status=pending').then(q => setPendingCount(q.length)).catch(() => {});
    }
  }, [isAdmin]);

  const handleFolderSelect = (path) => {
    setActiveFolder(path === activeFolder ? null : path);
    navigate(`/?folder=${encodeURIComponent(path)}`);
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <aside style={{
        width: sidebarOpen ? 'var(--sidebar-w)' : 0,
        minWidth: sidebarOpen ? 'var(--sidebar-w)' : 0,
        overflow: 'hidden',
        background: 'var(--bg-1)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        transition: 'width 0.2s, min-width 0.2s',
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon d={ICONS.sword} size={20} style={{ color: 'var(--purple)' }} />
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, color: 'var(--text-0)', letterSpacing: '0.03em' }}>
              TavernShelf
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4, paddingLeft: 30 }}>
            {user?.display_name}
          </div>
        </div>

        {/* Nav */}
        <nav style={{ padding: '12px 12px 0', flexShrink: 0 }}>
          {[
            { to: '/',        label: 'Library',  icon: ICONS.library },
            { to: '/uploads', label: 'Uploads',  icon: ICONS.upload,
              badge: pendingCount > 0 ? pendingCount : null },
            ...(isAdmin ? [{ to: '/admin', label: 'Admin', icon: ICONS.admin }] : []),
          ].map(item => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px', borderRadius: 8, marginBottom: 2,
              color: isActive ? 'var(--text-0)' : 'var(--text-2)',
              background: isActive ? 'var(--bg-3)' : 'transparent',
              fontSize: 13, fontWeight: 500, transition: 'all 0.1s',
            })}>
              <Icon d={item.icon} size={15} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge && (
                <span className="badge badge-gold" style={{ fontSize: 10, padding: '1px 6px' }}>
                  {item.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Folder tree */}
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 12px 0' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, paddingLeft: 8 }}>
            Folders
          </div>
          <FolderTree folders={folders} activeFolder={activeFolder} onSelect={handleFolderSelect} />
        </div>

        {/* Footer */}
        <div style={{ padding: 12, borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', gap: 8, fontSize: 13 }}
            onClick={logout}>
            <Icon d={ICONS.logout} size={14} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Topbar */}
        <header style={{
          height: 'var(--topbar-h)', minHeight: 'var(--topbar-h)',
          background: 'var(--bg-1)', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12, flexShrink: 0,
        }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setSidebarOpen(o => !o)}>
            <Icon d={ICONS.menu} size={16} />
          </button>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--text-3)', letterSpacing: '0.05em' }}>
            v0.0.1
          </span>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, overflow: 'auto' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

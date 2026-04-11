import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth, appEvents } from '../context/AuthContext.jsx';
import { useApi } from '../hooks/useApi.js';

const VERSION = '0.1.3';

const Icon = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const ICONS = {
  search:   'M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z',
  upload:   'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12',
  admin:    'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  logout:   'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  folder:   'M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z',
  campaign: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  menu:     'M3 12h18M3 6h18M3 18h18',
  library:  'M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 014 17V5a2 2 0 012-2h14a2 2 0 012 2v12',
  user:     'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
  chevron:  'M6 9l6 6 6-6',
};

// TavernShelf logo SVG
function Logo({ size = 28 }) {
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 100 120" fill="none">
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

export default function Layout() {
  const { user, logout, isAdmin } = useAuth();
  const { get, post } = useApi();
  const navigate  = useNavigate();
  const location  = useLocation();

  const [systems, setSystems]         = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [scanning, setScanning]       = useState(false);

  useEffect(() => {
    get('/library/filters').then(f => setSystems(f.systems || [])).catch(() => {});
    if (isAdmin) get('/uploads?status=pending').then(q => setPendingCount(q.length)).catch(() => {});
    const unsub = appEvents.on('uploadReviewed', () => {
      if (isAdmin) get('/uploads?status=pending').then(q => setPendingCount(q.length)).catch(() => {});
    });
    return unsub;
  }, [user?.id, isAdmin]);

  const syncLibrary = async () => {
    setScanning(true);
    try {
      await post('/library/scan', {});
      setTimeout(() => {
        get('/library/filters').then(f => setSystems(f.systems || [])).catch(() => {});
        setScanning(false);
      }, 3000);
    } catch { setScanning(false); }
  };

  // Close user menu on outside click
  useEffect(() => {
    const handler = (e) => {
      if (!e.target.closest('._user-menu-root')) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

      {/* ── Top bar ── */}
      <header style={{
        height: 'var(--topbar-h)', flexShrink: 0,
        background: 'var(--bg-1)', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 0, padding: '0 12px', zIndex: 50,
      }}>

        {/* Logo + name */}
        <button onClick={() => navigate('/')} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer', marginRight: 8, flexShrink: 0 }}>
          <Logo size={26} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--amber-hi)', letterSpacing: '0.02em' }}>TavernShelf</span>
        </button>

        {/* System dropdown */}
        <div style={{ position: 'relative', marginRight: 4, flexShrink: 0 }}>
          <select
            value=""
            onChange={e => { if (e.target.value) navigate(`/?system=${encodeURIComponent(e.target.value)}`); else navigate('/'); e.target.value = ''; }}
            style={{
              background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6,
              color: 'var(--text-1)', padding: '5px 28px 5px 10px', fontSize: 13,
              appearance: 'none', cursor: 'pointer', width: 'auto', minWidth: 120,
            }}>
            <option value="">All Systems</option>
            {systems.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <Icon d={ICONS.chevron} size={12} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-3)' }} />
        </div>

        {/* Nav tabs */}
        <nav style={{ display: 'flex', alignItems: 'stretch', height: '100%', marginRight: 'auto', gap: 2 }}>
          {[
            { to: '/', label: 'Library', exact: true },
            { to: '/files', label: 'Files' },
          ].map(item => (
            <NavLink key={item.to} to={item.to} end={item.exact}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', padding: '0 14px',
                fontSize: 13, fontWeight: 500, textDecoration: 'none',
                color: isActive ? 'var(--text-0)' : 'var(--text-2)',
                borderBottom: isActive ? '2px solid var(--amber)' : '2px solid transparent',
                transition: 'all 0.15s',
              })}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Right side actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>

          {/* Search */}
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/search')} title="Search">
            <Icon d={ICONS.search} size={15} />
          </button>

          {/* Sync */}
          <button className="btn btn-ghost btn-sm" onClick={syncLibrary} disabled={scanning} title="Sync library">
            <span style={{ fontSize: 14, display: 'inline-block', transform: scanning ? 'none' : undefined, animation: scanning ? 'spin 0.7s linear infinite' : undefined }}>↺</span>
          </button>

          {/* Campaigns */}
          <button className={`btn btn-sm ${isActive('/campaigns') ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => navigate('/campaigns')}
            style={{ gap: 5 }}>
            <Icon d={ICONS.campaign} size={13} />
            Campaigns
          </button>

          {/* Uploads */}
          <button className={`btn btn-sm ${isActive('/uploads') ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => navigate('/uploads')} title="Uploads" style={{ position: 'relative' }}>
            <Icon d={ICONS.upload} size={14} />
            {pendingCount > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -4, background: 'var(--amber)', color: '#0c0b0a', borderRadius: 99, fontSize: 9, fontWeight: 700, padding: '1px 4px', minWidth: 14, textAlign: 'center' }}>
                {pendingCount}
              </span>
            )}
          </button>

          {/* Admin */}
          {isAdmin && (
            <button className={`btn btn-sm ${isActive('/admin') ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => navigate('/admin')} title="Admin">
              <Icon d={ICONS.admin} size={14} />
            </button>
          )}

          {/* User menu */}
          <div className="_user-menu-root" style={{ position: 'relative' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setUserMenuOpen(o => !o)}
              style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Icon d={ICONS.user} size={14} />
              <span style={{ fontSize: 12, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.display_name || user?.email}</span>
            </button>
            {userMenuOpen && (
              <div style={{
                position: 'absolute', right: 0, top: '100%', marginTop: 4,
                background: 'var(--bg-2)', border: '1px solid var(--border-md)',
                borderRadius: 8, padding: 6, minWidth: 160, zIndex: 100,
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              }}>
                <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--text-3)', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
                  {user?.email}<br />
                  <span style={{ color: 'var(--amber)', fontSize: 10 }}>{user?.role}</span>
                </div>
                <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'flex-start', border: 'none' }}
                  onClick={() => { logout(); setUserMenuOpen(false); }}>
                  <Icon d={ICONS.logout} size={13} /> Sign out
                </button>
                <div style={{ padding: '4px 10px 2px', fontSize: 10, color: 'var(--text-3)' }}>v{VERSION}</div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Page content ── */}
      <main style={{ flex: 1, overflow: 'auto' }}>
        <Outlet />
      </main>
    </div>
  );
}

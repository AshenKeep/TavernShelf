import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import BookCard from '../components/BookCard.jsx';

const Icon = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const SEARCH_ICON = 'M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z';
const FILTER_ICON = 'M22 3H2l8 9.46V19l4 2v-8.54L22 3z';
const GRID_ICON   = 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z';

export default function LibraryPage() {
  const { get } = useApi();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems]     = useState([]);
  const [total, setTotal]     = useState(0);
  const [pages, setPages]     = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ systems: [], contentTypes: [], fileTypes: [] });
  const [stats, setStats]     = useState(null);

  const q            = searchParams.get('q') || '';
  const system       = searchParams.get('system') || '';
  const content_type = searchParams.get('content_type') || '';
  const file_type    = searchParams.get('file_type') || '';
  const folder       = searchParams.get('folder') || '';
  const page         = parseInt(searchParams.get('page') || '1');
  const sort         = searchParams.get('sort') || 'title';

  const searchRef   = useRef(null);
  const debounceRef = useRef(null);

  const updateParam = (key, val) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (val) next.set(key, val); else next.delete(key);
      next.delete('page');
      return next;
    });
  };

  useEffect(() => {
    get('/library/filters').then(setFilters).catch(() => {});
    get('/library/stats').then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = { page, sort };
    if (q)            params.q            = q;
    if (system)       params.system       = system;
    if (content_type) params.content_type = content_type;
    if (file_type)    params.file_type    = file_type;
    if (folder)       params.folder       = folder;

    get('/library/items', params)
      .then(data => { setItems(data.items); setTotal(data.total); setPages(data.pages); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [q, system, content_type, file_type, folder, page, sort]);

  const handleSearch = (val) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => updateParam('q', val), 300);
  };

  return (
    <div style={{ padding: 24 }}>
      {/* Stats bar */}
      {stats && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'Total Items', value: stats.total_items },
            { label: 'PDFs',   value: stats.pdf_count },
            { label: 'Comics', value: stats.cbz_count },
            { label: 'Images', value: stats.image_count },
            { label: 'Systems', value: stats.total_systems },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</span>
              <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-0)', fontFamily: 'var(--font-display)' }}>{s.value ?? '—'}</span>
            </div>
          ))}
        </div>
      )}

      {/* Search + filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
          <Icon d={SEARCH_ICON} size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
          <input
            ref={searchRef}
            placeholder="Search titles, authors, descriptions…"
            defaultValue={q}
            onChange={e => handleSearch(e.target.value)}
            style={{ paddingLeft: 34 }}
          />
        </div>

        <select value={system} onChange={e => updateParam('system', e.target.value)} style={{ width: 'auto', minWidth: 130 }}>
          <option value="">All Systems</option>
          {filters.systems.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select value={content_type} onChange={e => updateParam('content_type', e.target.value)} style={{ width: 'auto', minWidth: 130 }}>
          <option value="">All Types</option>
          {filters.contentTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <select value={file_type} onChange={e => updateParam('file_type', e.target.value)} style={{ width: 'auto', minWidth: 100 }}>
          <option value="">All Formats</option>
          {filters.fileTypes.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
        </select>

        <select value={sort} onChange={e => updateParam('sort', e.target.value)} style={{ width: 'auto', minWidth: 120 }}>
          <option value="title">A → Z</option>
          <option value="created">Recently Added</option>
          <option value="size">Largest First</option>
          <option value="year">By Year</option>
        </select>
      </div>

      {/* Active filters */}
      {(q || system || content_type || file_type || folder) && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{total} result{total !== 1 ? 's' : ''}</span>
          {[
            q            && { label: `"${q}"`,       key: 'q' },
            system       && { label: system,          key: 'system' },
            content_type && { label: content_type,    key: 'content_type' },
            file_type    && { label: file_type.toUpperCase(), key: 'file_type' },
            folder       && { label: `📁 ${folder}`, key: 'folder' },
          ].filter(Boolean).map(f => (
            <span key={f.key} className="badge badge-purple" style={{ cursor: 'pointer', gap: 4 }}
              onClick={() => updateParam(f.key, '')}>
              {f.label} ×
            </span>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={() => setSearchParams({})}>Clear all</button>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
          <div className="spinner" style={{ width: 32, height: 32 }} />
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-3)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📚</div>
          <div style={{ fontSize: 18, fontFamily: 'var(--font-display)', color: 'var(--text-2)', marginBottom: 8 }}>No items found</div>
          <div style={{ fontSize: 14 }}>{q ? 'Try a different search' : 'The library is empty — add files to your library folder'}</div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: 16,
        }}>
          {items.map(item => <BookCard key={item.id} item={item} />)}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 32, paddingBottom: 24 }}>
          {Array.from({ length: pages }, (_, i) => i + 1).map(p => (
            <button key={p} className={`btn btn-sm ${p === page ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setSearchParams(prev => { const n = new URLSearchParams(prev); n.set('page', p); return n; })}>
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

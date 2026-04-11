import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import BookCard from '../components/BookCard.jsx';

export default function SearchPage() {
  const { get } = useApi();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const inputRef = useRef(null);

  const q            = searchParams.get('q') || '';
  const system       = searchParams.get('system') || '';
  const content_type = searchParams.get('content_type') || '';
  const file_type    = searchParams.get('file_type') || '';
  const page         = parseInt(searchParams.get('page') || '1');
  const sort         = searchParams.get('sort') || 'title';

  const [items, setItems]     = useState([]);
  const [total, setTotal]     = useState(0);
  const [pages, setPages]     = useState(1);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ systems: [], contentTypes: [], fileTypes: [] });
  const [draft, setDraft]     = useState(q);
  const debounceRef           = useRef(null);

  useEffect(() => {
    get('/library/filters').then(setFilters).catch(() => {});
    if (inputRef.current) inputRef.current.focus();
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = { page, sort };
    if (q)            params.q            = q;
    if (system)       params.system       = system;
    if (content_type) params.content_type = content_type;
    if (file_type)    params.file_type    = file_type;
    get('/library/items', params)
      .then(data => { setItems(data.items); setTotal(data.total); setPages(data.pages); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [q, system, content_type, file_type, page, sort]);

  const updateParam = (key, val) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (val) next.set(key, val); else next.delete(key);
      next.delete('page');
      return next;
    });
  };

  const handleInput = (val) => {
    setDraft(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => updateParam('q', val), 300);
  };

  const hasFilters = q || system || content_type || file_type;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px' }}>

      {/* Search bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>←</button>
        <div style={{ flex: 1, position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none', fontSize: 16 }}>🔍</span>
          <input
            ref={inputRef}
            value={draft}
            onChange={e => handleInput(e.target.value)}
            placeholder="Search titles, authors, descriptions…"
            style={{ paddingLeft: 36, fontSize: 16 }}
          />
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <select value={system} onChange={e => updateParam('system', e.target.value)} style={{ width: 'auto', minWidth: 130, fontSize: 13 }}>
          <option value="">All Systems</option>
          {filters.systems.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={content_type} onChange={e => updateParam('content_type', e.target.value)} style={{ width: 'auto', minWidth: 130, fontSize: 13 }}>
          <option value="">All Types</option>
          {filters.contentTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={file_type} onChange={e => updateParam('file_type', e.target.value)} style={{ width: 'auto', minWidth: 100, fontSize: 13 }}>
          <option value="">All Formats</option>
          {filters.fileTypes.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
        </select>
        <select value={sort} onChange={e => updateParam('sort', e.target.value)} style={{ width: 'auto', minWidth: 120, fontSize: 13 }}>
          <option value="title">A → Z</option>
          <option value="created">Recently Added</option>
          <option value="size">Largest First</option>
          <option value="year">By Year</option>
        </select>
        {hasFilters && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setDraft(''); setSearchParams({}); }}>
            Clear all
          </button>
        )}
      </div>

      {/* Results count */}
      {hasFilters && !loading && (
        <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16 }}>
          {total} result{total !== 1 ? 's' : ''} {q ? `for "${q}"` : ''}
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
          <div className="spinner" style={{ width: 32, height: 32 }} />
        </div>
      ) : !hasFilters ? (
        <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-3)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 16, color: 'var(--text-2)' }}>Search your library</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Type a title, author, or description</div>
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-3)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📚</div>
          <div style={{ fontSize: 16, color: 'var(--text-2)' }}>No results found</div>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
            {items.map(item => <BookCard key={item.id} item={item} />)}
          </div>
          {pages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 32, paddingBottom: 24 }}>
              {Array.from({ length: Math.min(pages, 10) }, (_, i) => i + 1).map(p => (
                <button key={p} className={`btn btn-sm ${p === page ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setSearchParams(prev => { const n = new URLSearchParams(prev); n.set('page', p); return n; })}>
                  {p}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

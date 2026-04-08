import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import MetadataEditor from '../components/MetadataEditor.jsx';

const Icon = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(unix) {
  return new Date(unix * 1000).toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function ItemPage() {
  const { id }     = useParams();
  const { get }    = useApi();
  const { isAdmin } = useAuth();
  const navigate   = useNavigate();
  const [item, setItem]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    get(`/library/items/${id}`)
      .then(setItem)
      .catch(() => navigate('/'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
      <div className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  );

  if (!item) return null;

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 20 }} onClick={() => navigate(-1)}>
        <Icon d="M19 12H5M12 5l-7 7 7 7" size={14} /> Back
      </button>

      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
        {/* Cover */}
        <div style={{ flexShrink: 0 }}>
          <div style={{
            width: 200, aspectRatio: '2/3',
            background: 'var(--bg-3)', borderRadius: 'var(--radius-lg)',
            overflow: 'hidden', border: '1px solid var(--border)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
          }}>
            {item.cover_path ? (
              <img src={item.cover_path} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, color: 'var(--text-3)' }}>⚔</div>
            )}
          </div>

          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: 14 }}
            onClick={() => navigate(`/read/${item.id}`)}
          >
            <Icon d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" size={15} />
            Read
          </button>

          {isAdmin && (
            <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
              onClick={() => setEditing(true)}>
              <Icon d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" size={14} />
              Edit Metadata
            </button>
          )}
        </div>

        {/* Details */}
        <div style={{ flex: 1, minWidth: 260 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--text-0)', marginBottom: 8, lineHeight: 1.2 }}>
            {item.title}
          </h1>

          {item.authors?.length > 0 && (
            <p style={{ color: 'var(--text-2)', marginBottom: 12, fontSize: 15 }}>
              by {item.authors.join(', ')}
            </p>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            {item.system       && <span className="badge badge-purple">{item.system}</span>}
            {item.content_type && <span className="badge badge-gold">{item.content_type}</span>}
            {item.year         && <span className="badge badge-gray">{item.year}</span>}
            <span className="badge badge-gray">{item.file_type.toUpperCase()}</span>
          </div>

          {item.description && (
            <p style={{ color: 'var(--text-1)', lineHeight: 1.7, marginBottom: 20, fontFamily: 'var(--font-body)', fontSize: 16 }}>
              {item.description}
            </p>
          )}

          {item.tags?.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
              {item.tags.map(t => (
                <span key={t} className="badge badge-gray">{t}</span>
              ))}
            </div>
          )}

          {/* Meta table */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            {[
              { label: 'Publisher',  value: item.publisher },
              { label: 'File Size',  value: formatSize(item.file_size) },
              { label: 'Pages',      value: item.page_count },
              { label: 'Added',      value: formatDate(item.created_at) },
              { label: 'Source',     value: item.metadata_source },
              { label: 'Path',       value: item.path },
            ].filter(r => r.value).map(row => (
              <div key={row.label} style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <span style={{ color: 'var(--text-3)', minWidth: 80, flexShrink: 0 }}>{row.label}</span>
                <span style={{ color: 'var(--text-1)', wordBreak: 'break-all' }}>{String(row.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Metadata editor modal */}
      {editing && (
        <MetadataEditor item={item} onClose={() => setEditing(false)} onSave={updated => { setItem(updated); setEditing(false); }} />
      )}
    </div>
  );
}

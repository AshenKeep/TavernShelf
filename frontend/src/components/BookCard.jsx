import { useNavigate } from 'react-router-dom';

const FILE_TYPE_COLORS = {
  pdf:   { bg: 'rgba(168,50,50,0.18)',    color: '#c84848' },
  cbz:   { bg: 'rgba(42,122,74,0.18)',    color: '#3da866' },
  image: { bg: 'rgba(201,146,42,0.18)',   color: '#e8b44a' },
};

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function BookCard({ item }) {
  const navigate = useNavigate();
  const colors   = FILE_TYPE_COLORS[item.file_type] || FILE_TYPE_COLORS.pdf;

  return (
    <div
      onClick={() => navigate(`/item/${item.id}`)}
      style={{
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        background: 'var(--bg-2)',
        border: '1px solid var(--border)',
        transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-3px)';
        e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(139,120,200,0.25)';
        e.currentTarget.style.borderColor = 'var(--border-md)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = '';
        e.currentTarget.style.boxShadow = '';
        e.currentTarget.style.borderColor = 'var(--border)';
      }}
    >
      {/* Cover */}
      <div style={{
        aspectRatio: '2/3',
        background: 'var(--bg-3)',
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0,
      }}>
        {item.cover_path ? (
          <img
            src={`${item.cover_path}?v=${item.updated_at || 0}`}
            alt={item.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            loading="lazy"
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-3)', fontSize: 32,
            backgroundImage: 'linear-gradient(135deg, var(--bg-3) 0%, var(--bg-4) 100%)',
          }}>
            ⚔
          </div>
        )}

        {/* File type badge */}
        <span style={{
          position: 'absolute', top: 8, right: 8,
          background: colors.bg, color: colors.color,
          fontSize: 10, fontWeight: 600, padding: '2px 7px',
          borderRadius: 99, textTransform: 'uppercase', letterSpacing: '0.05em',
          backdropFilter: 'blur(4px)',
        }}>
          {item.file_type}
        </span>
      </div>

      {/* Info */}
      <div style={{ padding: '10px 12px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{
          fontSize: 13, fontWeight: 500, color: 'var(--text-0)',
          overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          lineHeight: 1.3,
        }}>
          {item.title}
        </div>

        {item.authors?.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.authors.join(', ')}
          </div>
        )}

        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingTop: 6 }}>
          {item.system && (
            <span className="badge badge-purple" style={{ fontSize: 10 }}>{item.system}</span>
          )}
          {item.content_type && (
            <span className="badge badge-gray" style={{ fontSize: 10 }}>{item.content_type}</span>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-3)' }}>{formatSize(item.file_size)}</span>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { useApi } from '../hooks/useApi.js';

const STATUS_OPTIONS = [
  { value: 'reference', label: 'Reference' },
  { value: 'reading',   label: 'Reading'   },
  { value: 'completed', label: 'Completed' },
  { value: 'wishlist',  label: 'Wishlist'  },
];

const STATUS_COLORS = {
  reading:   'var(--amber-hi)',
  completed: 'var(--green-hi)',
  reference: 'var(--stone-hi)',
  wishlist:  '#8888cc',
};

export default function AddToCampaign({ item, onClose }) {
  const { get, post, put, del } = useApi();
  const [campaigns, setCampaigns]     = useState([]);
  const [memberships, setMemberships] = useState([]); // campaigns this item is already in
  const [loading, setLoading]         = useState(true);
  const [adding, setAdding]           = useState(null); // campaign id being added to
  const [error, setError]             = useState('');
  const ref = useRef(null);

  useEffect(() => {
    Promise.all([
      get('/campaigns'),
      get(`/campaigns/item/${item.id}`),
    ]).then(([all, mine]) => {
      setCampaigns(all.filter(c => c.my_role === 'owner' || c.my_role === 'collaborator'));
      setMemberships(mine);
    }).catch(e => setError(e.message))
    .finally(() => setLoading(false));
  }, [item.id]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const isMember = (campaignId) => memberships.find(m => m.id === campaignId);

  const toggleCampaign = async (campaign) => {
    const existing = isMember(campaign.id);
    setAdding(campaign.id);
    setError('');
    try {
      if (existing) {
        await del(`/campaigns/${campaign.id}/items/${item.id}`);
        setMemberships(prev => prev.filter(m => m.id !== campaign.id));
      } else {
        await post(`/campaigns/${campaign.id}/items`, { itemId: item.id, status: 'reference' });
        setMemberships(prev => [...prev, { id: campaign.id, name: campaign.name, status: 'reference', notes: '' }]);
      }
    } catch (e) { setError(e.message); }
    finally { setAdding(null); }
  };

  const updateStatus = async (campaignId, status) => {
    try {
      await put(`/campaigns/${campaignId}/items/${item.id}`, { status });
      setMemberships(prev => prev.map(m => m.id === campaignId ? { ...m, status } : m));
    } catch (e) { setError(e.message); }
  };

  return (
    <div ref={ref} style={{
      position: 'absolute', top: '100%', right: 0, zIndex: 50,
      background: 'var(--bg-2)', border: '1px solid var(--border-md)',
      borderRadius: 10, padding: 14, minWidth: 260, maxWidth: 320,
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
        Add to Campaign
      </div>

      {loading && <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: 12 }}>Loading…</div>}
      {error   && <div style={{ fontSize: 12, color: 'var(--red-hi)', marginBottom: 8 }}>{error}</div>}

      {!loading && campaigns.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>No campaigns where you can add items</div>
      )}

      {!loading && campaigns.map(c => {
        const membership = isMember(c.id);
        const isAdding   = adding === c.id;
        return (
          <div key={c.id} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 0', borderBottom: '1px solid var(--border)',
          }}>
            <button onClick={() => toggleCampaign(c)} disabled={!!adding}
              style={{
                width: 20, height: 20, borderRadius: 4, flexShrink: 0, cursor: 'pointer',
                background: membership ? 'var(--amber-dim)' : 'var(--bg-3)',
                border: `1px solid ${membership ? 'var(--amber)' : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, color: 'var(--text-0)',
              }}>
              {isAdding ? <span className="spinner" style={{ width: 10, height: 10 }}/> : membership ? '✓' : ''}
            </button>
            <span style={{ flex: 1, fontSize: 13, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.name}
            </span>
            {membership && (
              <select value={membership.status} onChange={e => updateStatus(c.id, e.target.value)}
                style={{ width: 'auto', fontSize: 11, padding: '2px 6px', color: STATUS_COLORS[membership.status] || 'var(--text-1)' }}>
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            )}
          </div>
        );
      })}
    </div>
  );
}

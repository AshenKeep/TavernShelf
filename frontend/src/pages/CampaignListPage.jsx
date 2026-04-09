import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';

function formatDate(unix) {
  return new Date(unix * 1000).toLocaleDateString('en-AU', { dateStyle: 'medium' });
}

const ROLE_BADGE = {
  owner:        { bg: 'rgba(200,136,42,0.18)',  color: 'var(--amber-hi)' },
  collaborator: { bg: 'rgba(36,80,42,0.25)',    color: 'var(--green-hi)' },
  viewer:       { bg: 'rgba(255,255,255,0.06)', color: 'var(--text-2)'   },
};

export default function CampaignListPage() {
  const { get, post } = useApi();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm]           = useState({ name: '', description: '' });
  const [creating, setCreating]   = useState(false);
  const [error, setError]         = useState('');

  const load = () => get('/campaigns').then(setCampaigns).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setCreating(true); setError('');
    try {
      const c = await post('/campaigns', form);
      setCampaigns(prev => [c, ...prev]);
      setForm({ name: '', description: '' });
      setShowCreate(false);
      navigate(`/campaigns/${c.id}`);
    } catch (e) { setError(e.message); }
    finally { setCreating(false); }
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
      <div className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  );

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--text-0)', flex: 1 }}>
          Campaigns
        </h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(s => !s)}>
          {showCreate ? 'Cancel' : '+ New Campaign'}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={create} className="card" style={{ padding: 20, marginBottom: 24 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--text-0)', marginBottom: 16, fontSize: 15 }}>New Campaign</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 5 }}>Name</label>
              <input autoFocus required value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="e.g. Curse of Strahd" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 5 }}>Description (optional)</label>
              <textarea rows={2} value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} placeholder="What's this campaign about?" style={{ resize: 'vertical' }} />
            </div>
            {error && <div style={{ fontSize: 13, color: 'var(--red-hi)' }}>{error}</div>}
            <div>
              <button type="submit" className="btn btn-primary btn-sm" disabled={creating || !form.name.trim()}>
                {creating ? <span className="spinner" style={{ width: 12, height: 12 }} /> : 'Create Campaign'}
              </button>
            </div>
          </div>
        </form>
      )}

      {campaigns.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-3)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚔</div>
          <div style={{ fontSize: 15, marginBottom: 6, color: 'var(--text-2)' }}>No campaigns yet</div>
          <div style={{ fontSize: 13 }}>Create a campaign to organise your books</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {campaigns.map(c => {
            const role = c.my_role || 'owner';
            const rb = ROLE_BADGE[role] || ROLE_BADGE.viewer;
            return (
              <div key={c.id} className="card" style={{ padding: '16px 20px', cursor: 'pointer', transition: 'border-color 0.15s' }}
                onClick={() => navigate(`/campaigns/${c.id}`)}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-md)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--text-0)', fontWeight: 600 }}>{c.name}</span>
                      <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 99, background: rb.bg, color: rb.color }}>{role}</span>
                    </div>
                    {c.description && <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 6 }}>{c.description}</div>}
                    <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-3)' }}>
                      <span>📚 {c.item_count} item{c.item_count !== 1 ? 's' : ''}</span>
                      <span>👥 {c.member_count} member{c.member_count !== 1 ? 's' : ''}</span>
                      <span>By {c.owner_name}</span>
                      <span>{formatDate(c.updated_at)}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

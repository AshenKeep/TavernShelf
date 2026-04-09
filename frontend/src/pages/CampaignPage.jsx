import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';

const STATUS_META = {
  reading:   { label: 'Reading',   color: 'var(--amber-hi)',  bg: 'rgba(200,136,42,0.18)' },
  completed: { label: 'Completed', color: 'var(--green-hi)',  bg: 'rgba(36,80,42,0.25)'   },
  reference: { label: 'Reference', color: 'var(--stone-hi)',  bg: 'rgba(255,255,255,0.08)' },
  wishlist:  { label: 'Wishlist',  color: '#8888cc',          bg: 'rgba(80,80,160,0.18)'  },
};

const MEMBER_ROLE_BADGE = {
  owner:        { color: 'var(--amber-hi)', bg: 'rgba(200,136,42,0.18)' },
  collaborator: { color: 'var(--green-hi)', bg: 'rgba(36,80,42,0.25)'   },
  viewer:       { color: 'var(--text-2)',   bg: 'rgba(255,255,255,0.06)' },
};

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.reference;
  return <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 99, background: m.bg, color: m.color }}>{m.label}</span>;
}

function formatDate(unix) {
  return new Date(unix * 1000).toLocaleDateString('en-AU', { dateStyle: 'short' });
}

function formatSize(b) {
  if (!b) return '';
  if (b < 1024*1024) return `${(b/1024).toFixed(0)} KB`;
  return `${(b/1024/1024).toFixed(1)} MB`;
}

export default function CampaignPage() {
  const { id }     = useParams();
  const { get, post, put, del } = useApi();
  const { user }   = useAuth();
  const navigate   = useNavigate();

  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState('items');
  const [statusFilter, setStatusFilter] = useState('all');

  // Edit campaign
  const [editing, setEditing]   = useState(false);
  const [editForm, setEditForm] = useState({ name: '', description: '' });

  // Invite member
  const [inviteEmail, setInviteEmail]   = useState('');
  const [inviteRole, setInviteRole]     = useState('viewer');
  const [inviting, setInviting]         = useState(false);
  const [inviteError, setInviteError]   = useState('');

  // Edit item
  const [editingItem, setEditingItem]   = useState(null); // item_id
  const [itemStatus, setItemStatus]     = useState('');
  const [itemNotes, setItemNotes]       = useState('');
  const [savingItem, setSavingItem]     = useState(false);

  const [error, setError] = useState('');

  const load = () => get(`/campaigns/${id}`)
    .then(data => { setCampaign(data); setEditForm({ name: data.name, description: data.description || '' }); })
    .catch(() => navigate('/campaigns'))
    .finally(() => setLoading(false));

  useEffect(() => { load(); }, [id]);

  const myRole = campaign?.my_role || 'viewer';
  const isOwner = myRole === 'owner';
  const canEdit = myRole === 'owner' || myRole === 'collaborator';

  const saveEdit = async () => {
    try {
      await put(`/campaigns/${id}`, editForm);
      setCampaign(c => ({ ...c, ...editForm }));
      setEditing(false);
    } catch (e) { setError(e.message); }
  };

  const deleteCampaign = async () => {
    if (!confirm(`Delete campaign "${campaign.name}"? This cannot be undone.`)) return;
    try { await del(`/campaigns/${id}`); navigate('/campaigns'); }
    catch (e) { setError(e.message); }
  };

  const inviteMember = async (e) => {
    e.preventDefault();
    setInviting(true); setInviteError('');
    try {
      const member = await post(`/campaigns/${id}/members`, { email: inviteEmail, role: inviteRole });
      setCampaign(c => ({ ...c, members: [...(c.members||[]), member] }));
      setInviteEmail('');
    } catch (e) { setInviteError(e.message); }
    finally { setInviting(false); }
  };

  const removeMember = async (userId) => {
    try {
      await del(`/campaigns/${id}/members/${userId}`);
      setCampaign(c => ({ ...c, members: c.members.filter(m => m.user_id !== userId) }));
    } catch (e) { setError(e.message); }
  };

  const changeMemberRole = async (userId, role) => {
    try {
      await put(`/campaigns/${id}/members/${userId}`, { role });
      setCampaign(c => ({ ...c, members: c.members.map(m => m.user_id === userId ? { ...m, role } : m) }));
    } catch (e) { setError(e.message); }
  };

  const startEditItem = (item) => {
    setEditingItem(item.item_id);
    setItemStatus(item.status);
    setItemNotes(item.notes || '');
  };

  const saveItem = async (itemId) => {
    setSavingItem(true);
    try {
      await put(`/campaigns/${id}/items/${itemId}`, { status: itemStatus, notes: itemNotes });
      setCampaign(c => ({
        ...c,
        items: c.items.map(i => i.item_id === itemId ? { ...i, status: itemStatus, notes: itemNotes } : i),
      }));
      setEditingItem(null);
    } catch (e) { setError(e.message); }
    finally { setSavingItem(false); }
  };

  const removeItem = async (itemId) => {
    try {
      await del(`/campaigns/${id}/items/${itemId}`);
      setCampaign(c => ({ ...c, items: c.items.filter(i => i.item_id !== itemId) }));
    } catch (e) { setError(e.message); }
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
      <div className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  );

  if (!campaign) return null;

  const filteredItems = statusFilter === 'all'
    ? campaign.items
    : campaign.items.filter(i => i.status === statusFilter);

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text-3)' }}>
        <Link to="/campaigns" style={{ color: 'var(--amber)', textDecoration: 'none' }}>Campaigns</Link>
        <span style={{ margin: '0 8px' }}>›</span>
        <span style={{ color: 'var(--text-1)' }}>{campaign.name}</span>
      </div>

      {error && (
        <div style={{ background: 'rgba(138,30,30,0.12)', border: '1px solid rgba(138,30,30,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: 'var(--red-hi)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Header */}
      {editing ? (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input value={editForm.name} onChange={e => setEditForm(f => ({...f, name: e.target.value}))} style={{ fontSize: 18, fontFamily: 'var(--font-display)' }} />
            <textarea rows={2} value={editForm.description} onChange={e => setEditForm(f => ({...f, description: e.target.value}))} placeholder="Description…" style={{ resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={saveEdit}>Save</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--text-0)', marginBottom: 4 }}>{campaign.name}</h1>
              {campaign.description && <p style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 6 }}>{campaign.description}</p>}
              <div style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', gap: 14 }}>
                <span>Owner: <strong style={{ color: 'var(--text-2)' }}>{campaign.owner?.display_name}</strong></span>
                <span>📚 {campaign.items?.length || 0} items</span>
                <span>👥 {campaign.members?.length || 0} members</span>
                <span style={{ background: MEMBER_ROLE_BADGE[myRole]?.bg, color: MEMBER_ROLE_BADGE[myRole]?.color, padding: '1px 8px', borderRadius: 99, fontSize: 10, fontWeight: 500 }}>{myRole}</span>
              </div>
            </div>
            {isOwner && (
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>Edit</button>
                <button className="btn btn-danger btn-sm" onClick={deleteCampaign}>Delete</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        {[['items','📚 Items'],['members','👥 Members']].map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)} style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', border: 'none',
            background: 'transparent', marginBottom: -1, transition: 'all 0.1s',
            borderBottom: activeTab === key ? '2px solid var(--amber)' : '2px solid transparent',
            color: activeTab === key ? 'var(--text-0)' : 'var(--text-2)',
          }}>{label}</button>
        ))}
      </div>

      {/* Items tab */}
      {activeTab === 'items' && (
        <div>
          {/* Status filter */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            {['all', ...Object.keys(STATUS_META)].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-ghost'}`}>
                {s === 'all' ? 'All' : STATUS_META[s].label}
                {s !== 'all' && <span style={{ opacity: 0.7, marginLeft: 4 }}>
                  ({campaign.items.filter(i => i.status === s).length})
                </span>}
              </button>
            ))}
          </div>

          {filteredItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }}>
              {campaign.items.length === 0 ? 'No items yet — add books from the library' : 'No items with this status'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredItems.map(item => (
                <div key={item.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', gap: 0 }}>
                    {/* Cover thumbnail */}
                    <div style={{ width: 54, flexShrink: 0, background: 'var(--bg-3)' }}>
                      {item.cover_path
                        ? <img src={`${item.cover_path}?v=${item.item_updated_at||0}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: 'var(--text-3)', minHeight: 72 }}>⚔</div>
                      }
                    </div>
                    {/* Info */}
                    <div style={{ flex: 1, padding: '10px 14px', minWidth: 0 }}>
                      {editingItem === item.item_id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <select value={itemStatus} onChange={e => setItemStatus(e.target.value)} style={{ width: 'auto' }}>
                              {Object.entries(STATUS_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
                            </select>
                          </div>
                          <textarea value={itemNotes} onChange={e => setItemNotes(e.target.value)} rows={2} placeholder="Notes…" style={{ resize: 'vertical', fontSize: 13 }} />
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-primary btn-sm" onClick={() => saveItem(item.item_id)} disabled={savingItem}>
                              {savingItem ? <span className="spinner" style={{ width: 12, height: 12 }}/> : 'Save'}
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditingItem(null)}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <Link to={`/item/${item.item_id}`} style={{ fontWeight: 500, fontSize: 14, color: 'var(--text-0)', textDecoration: 'none' }}
                                onMouseEnter={e => e.target.style.color = 'var(--amber-hi)'}
                                onMouseLeave={e => e.target.style.color = 'var(--text-0)'}>
                                {item.title}
                              </Link>
                              {item.authors?.length > 0 && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{item.authors.join(', ')}</div>}
                              {item.notes && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4, fontStyle: 'italic' }}>"{item.notes}"</div>}
                            </div>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                              <StatusBadge status={item.status} />
                              {canEdit && <>
                                <button className="btn btn-ghost btn-sm" onClick={() => startEditItem(item)}>Edit</button>
                                <button className="btn btn-danger btn-sm" onClick={() => removeItem(item.item_id)}>✕</button>
                              </>}
                            </div>
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
                            {item.system && <span style={{ marginRight: 8 }}>{item.system}</span>}
                            {item.content_type && <span style={{ marginRight: 8 }}>{item.content_type}</span>}
                            <span>Added by {item.added_by_name} · {formatDate(item.added_at)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Members tab */}
      {activeTab === 'members' && (
        <div>
          {/* Owner row */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Owner</div>
            <div className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, color: 'var(--text-0)', fontSize: 14 }}>{campaign.owner?.display_name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{campaign.owner?.email}</div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 99, ...MEMBER_ROLE_BADGE.owner }}>owner</span>
            </div>
          </div>

          {/* Invited members */}
          {campaign.members?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Members</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {campaign.members.map(m => (
                  <div key={m.user_id} className="card" style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, color: 'var(--text-0)', fontSize: 14 }}>{m.display_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{m.email}</div>
                    </div>
                    {isOwner ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <select value={m.role} onChange={e => changeMemberRole(m.user_id, e.target.value)} style={{ width: 'auto', fontSize: 12, padding: '4px 8px' }}>
                          <option value="viewer">Viewer</option>
                          <option value="collaborator">Collaborator</option>
                        </select>
                        <button className="btn btn-danger btn-sm" onClick={() => removeMember(m.user_id)}>Remove</button>
                      </div>
                    ) : (
                      <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 99, ...MEMBER_ROLE_BADGE[m.role] }}>{m.role}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Invite form */}
          {isOwner && (
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-0)', marginBottom: 12 }}>Invite a member</div>
              <form onSubmit={inviteMember} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>Email</label>
                  <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="user@example.com" required />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>Role</label>
                  <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} style={{ width: 'auto' }}>
                    <option value="viewer">Viewer — can view only</option>
                    <option value="collaborator">Collaborator — can add/edit items</option>
                  </select>
                </div>
                <button type="submit" className="btn btn-primary btn-sm" disabled={inviting}>
                  {inviting ? <span className="spinner" style={{ width: 12, height: 12 }}/> : 'Invite'}
                </button>
              </form>
              {inviteError && <div style={{ fontSize: 12, color: 'var(--red-hi)', marginTop: 8 }}>{inviteError}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import BookCard from '../components/BookCard.jsx';

const Icon = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const SORT_ICON = 'M3 6h18M7 12h10M11 18h2';

// Content type card shown on the overview
function ContentTypeCard({ ct, system, onClick }) {
  const covers = (ct.covers || []).slice(0, 4);
  return (
    <div onClick={onClick} style={{
      background: 'var(--bg-2)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', overflow: 'hidden', cursor: 'pointer',
      transition: 'transform 0.15s, border-color 0.15s, box-shadow 0.15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = 'var(--border-md)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.4)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = ''; }}
    >
      {/* Cover strip */}
      <div style={{ display: 'flex', height: 90, background: 'var(--bg-3)', overflow: 'hidden' }}>
        {covers.length > 0 ? covers.map((c, i) => (
          <img key={i} src={c} alt="" style={{ flex: 1, objectFit: 'cover', borderRight: i < covers.length - 1 ? '1px solid var(--bg-0)' : 'none' }} />
        )) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, color: 'var(--text-3)' }}>⚔</div>
        )}
      </div>
      {/* Info */}
      <div style={{ padding: '12px 14px' }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-0)', marginBottom: 2 }}>{ct.content_type}</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{ct.item_count} item{ct.item_count !== 1 ? 's' : ''}</div>
      </div>
    </div>
  );
}

// Module folder card — with cover collage
function ModuleCard({ folder, onClick }) {
  const covers = (folder.covers || []).slice(0, 4);
  return (
    <div onClick={onClick} style={{
      background: 'var(--bg-2)', border: '1px solid rgba(200,136,42,0.25)',
      borderRadius: 'var(--radius-lg)', overflow: 'hidden', cursor: 'pointer',
      transition: 'all 0.15s', display: 'flex', flexDirection: 'column',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--amber)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.4)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(200,136,42,0.25)'; e.currentTarget.style.boxShadow = ''; }}
    >
      {/* Cover collage */}
      <div style={{ height: 120, background: 'var(--bg-3)', display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {covers.length === 0 && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, color: 'var(--text-3)' }}>⚔</div>
        )}
        {covers.length === 1 && (
          <img src={covers[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
        {covers.length === 2 && covers.map((c, i) => (
          <img key={i} src={`${c}?v=${folder.updated_at||folder.id}`} alt="" style={{ flex: 1, height: '100%', objectFit: 'cover', borderLeft: i > 0 ? '1px solid var(--bg-0)' : 'none' }} />
        ))}
        {covers.length >= 3 && (
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', height: '100%' }}>
            {covers.slice(0, 4).map((c, i) => (
              <img key={i} src={`${c}?v=${folder.updated_at||folder.id}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderLeft: i % 2 === 1 ? '1px solid var(--bg-0)' : 'none', borderTop: i >= 2 ? '1px solid var(--bg-0)' : 'none' }} />
            ))}
          </div>
        )}
        {/* Module badge overlay */}
        <div style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', borderRadius: 4, padding: '2px 7px', fontSize: 10, fontWeight: 600, color: 'var(--amber)', border: '1px solid rgba(200,136,42,0.4)' }}>
          MODULE
        </div>
      </div>
      {/* Info */}
      <div style={{ padding: '10px 14px' }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-0)', marginBottom: 2 }}>{folder.name}</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{folder.item_count || 0} file{(folder.item_count || 0) !== 1 ? 's' : ''}</div>
      </div>
    </div>
  );
}

export default function LibraryPage() {
  const { get } = useApi();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL params
  const system          = searchParams.get('system') || '';
  const content_type    = searchParams.get('content_type') || '';
  const folder          = searchParams.get('folder') || '';
  const module_folder_id = searchParams.get('module_folder_id') || '';
  const parent_module    = searchParams.get('parent_module') || '';
  const page            = parseInt(searchParams.get('page') || '1');
  const sort            = searchParams.get('sort') || 'title';

  // Overview data
  const [overview, setOverview]   = useState(null);
  const [ovLoading, setOvLoading] = useState(true);

  // Grid data (when drilled into content type)
  const [items, setItems]         = useState([]);
  const [subfolders, setSubfolders] = useState([]);
  const [total, setTotal]         = useState(0);
  const [pages, setPages]         = useState(1);
  const [gridLoading, setGridLoading] = useState(false);

  // Active tab: 'overview' | content_type string | 'modules' | 'all'
  const unsorted = searchParams.get('unsorted') === '1';
  const activeTab = unsorted ? 'unsorted' : (module_folder_id ? 'module' : (content_type || folder || 'overview'));

  const updateParam = (key, val) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (val) next.set(key, val); else next.delete(key);
      next.delete('page');
      // Clearing content_type or folder goes back to overview
      return next;
    });
  };

  // Load overview
  useEffect(() => {
    setOvLoading(true);
    const params = system ? { system } : {};
    get('/library/overview', params)
      .then(setOverview)
      .catch(() => {})
      .finally(() => setOvLoading(false));
  }, [system]);

  // Load grid when drilled in
  useEffect(() => {
    if (activeTab === 'overview') return;
    setGridLoading(true);
    const params = { page, sort };
    if (system)            params.system            = system;
    if (content_type)     params.content_type     = content_type;
    if (folder)           params.folder           = folder;
    if (unsorted)         params.unsorted         = '1';
    if (module_folder_id) params.module_folder_id = module_folder_id;

    get('/library/items', params)
      .then(data => { setItems(data.items); setTotal(data.total); setPages(data.pages); setSubfolders(data.subfolders || []); })
      .catch(() => {})
      .finally(() => setGridLoading(false));
  }, [system, content_type, folder, page, sort, unsorted, module_folder_id]);

  const drillInto = (ct) => updateParam('content_type', ct);
  const drillIntoFolder = (path, moduleId) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('content_type'); next.delete('folder'); next.delete('unsorted');
      if (moduleId) { next.set('module_folder_id', moduleId); }
      else { next.set('folder', path); }
      next.delete('page');
      return next;
    });
  };
  const backToOverview = () => {
    setSearchParams(prev => {
      const n = new URLSearchParams(prev);
      const parentModule = n.get('parent_module');
      n.delete('content_type'); n.delete('folder'); n.delete('unsorted'); n.delete('module_folder_id'); n.delete('parent_module');
      if (parentModule) {
        // Go back to the parent module, not all the way to overview
        n.set('content_type', 'Adventure Module');
        n.set('module_folder_id', parentModule);
      }
      return n;
    });
  };

  // Tabs from overview content types
  const hasModules = (overview?.moduleFolders?.length > 0) ||
    (overview?.systems?.flatMap(s => s.contentTypes).some(ct => ct.content_type === 'Adventure Module'));

  const contentTypeOrder = ['Core Rulebook', 'Supplement', 'Sourcebook', 'Bestiary', 'Campaign Setting', 'Magic Items'];

  const allContentTypes = system
    ? (overview?.systems?.find(s => s.system === system)?.contentTypes || [])
    : (overview?.systems?.flatMap(s => s.contentTypes.map(ct => ({ ...ct, system: s.system }))) || []);

  // Deduplicate and sort content types for tabs
  const uniqueTypes = [...new Map(allContentTypes.map(ct => [ct.content_type, ct])).values()]
    .sort((a, b) => {
      const ai = contentTypeOrder.indexOf(a.content_type);
      const bi = contentTypeOrder.indexOf(b.content_type);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return b.item_count - a.item_count;
    });

  const nonModuleTypes = uniqueTypes.filter(ct => ct.content_type !== 'Adventure Module');
  const showAllTab = nonModuleTypes.length > 4;
  const tabTypes = nonModuleTypes.slice(0, 4);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Sub-navigation tabs */}
      <div style={{
        background: 'var(--bg-1)', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'stretch', padding: '0 24px', gap: 2, flexShrink: 0,
        overflowX: 'auto',
      }}>
        {/* Overview tab */}
        <TabButton active={activeTab === 'overview'} onClick={backToOverview}>Overview</TabButton>

        {/* Content type tabs (top 4) */}
        {tabTypes.map(ct => (
          <TabButton key={ct.content_type}
            active={activeTab === ct.content_type}
            onClick={() => drillInto(ct.content_type)}>
            {ct.content_type}
            <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 4 }}>{ct.item_count}</span>
          </TabButton>
        ))}

        {/* More dropdown if >4 types */}
        {showAllTab && (
          <div style={{ position: 'relative', display: 'flex', alignItems: 'stretch' }}>
            <MoreTab
              types={nonModuleTypes.slice(4)}
              activeTab={activeTab}
              onSelect={drillInto}
            />
          </div>
        )}

        {/* Modules tab */}
        {hasModules && (
          <TabButton
            active={activeTab === 'Adventure Module' || activeTab === 'module' || !!parent_module}
            onClick={() => drillInto('Adventure Module')}>
            ⚔ Modules
            <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 4 }}>
              {uniqueTypes.find(ct => ct.content_type === 'Adventure Module')?.item_count || 0}
            </span>
          </TabButton>
        )}

        {/* Unsorted indicator */}
        {overview?.unsortedCount > 0 && (
          <TabButton
            active={searchParams.get('unsorted') === '1'}
            onClick={() => {
              const isOn = searchParams.get('unsorted') === '1';
              setSearchParams(prev => {
                const next = new URLSearchParams(prev);
                if (isOn) { next.delete('unsorted'); next.delete('content_type'); }
                else { next.set('unsorted', '1'); next.delete('content_type'); next.delete('folder'); }
                return next;
              });
            }}
            style={{ color: 'var(--amber-hi)' }}>
            ⚠ Unsorted ({overview.unsortedCount})
          </TabButton>
        )}
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>

        {/* System title */}
        {system && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--text-0)' }}>{system}</h1>
            <button className="btn btn-ghost btn-sm" onClick={() => updateParam('system', '')}>✕ All Systems</button>
          </div>
        )}

        {/* Overview grid */}
        {activeTab === 'overview' && (
          <>
            {ovLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
                <div className="spinner" style={{ width: 36, height: 36 }} />
              </div>
            ) : overview?.systems?.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-3)' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📚</div>
                <div style={{ fontSize: 18, fontFamily: 'var(--font-display)', color: 'var(--text-2)', marginBottom: 8 }}>Library is empty</div>
                <div>Add files to your library folder and trigger a scan</div>
              </div>
            ) : (
              <>
                {/* Per-system sections when viewing all */}
                {!system && overview?.systems?.map(sys => (
                  <div key={sys.system} style={{ marginBottom: 36 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, color: 'var(--text-0)' }}>{sys.system}</h2>
                      <button className="btn btn-ghost btn-sm" onClick={() => updateParam('system', sys.system)} style={{ fontSize: 11 }}>
                        Browse →
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                      {sys.contentTypes.filter(ct => ct.content_type !== 'Adventure Module').slice(0, 6).map(ct => (
                        <ContentTypeCard key={ct.content_type} ct={ct} system={sys.system}
                          onClick={() => { updateParam('system', sys.system); drillInto(ct.content_type); }} />
                      ))}
                      {sys.contentTypes.some(ct => ct.content_type === 'Adventure Module') && (
                        <ContentTypeCard
                          ct={{ content_type: 'Adventure Module', item_count: sys.contentTypes.find(ct => ct.content_type === 'Adventure Module')?.item_count || 0, covers: [] }}
                          system={sys.system}
                          onClick={() => { updateParam('system', sys.system); drillInto('Adventure Module'); }} />
                      )}
                    </div>
                  </div>
                ))}

                {/* Single system view */}
                {system && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                    {allContentTypes.filter(ct => ct.content_type !== 'Adventure Module').map(ct => (
                      <ContentTypeCard key={ct.content_type} ct={ct} system={system}
                        onClick={() => drillInto(ct.content_type)} />
                    ))}
                    {hasModules && (
                      <div style={{ display: 'grid', gridColumn: '1/-1', marginTop: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 10, fontFamily: 'var(--font-display)' }}>
                          Adventure Modules
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                          {overview.moduleFolders.map(f => (
                            <ModuleCard key={f.id} folder={f} onClick={() => drillIntoFolder(f.path, f.id)} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* Drilled-in grid view */}
        {activeTab !== 'overview' && (
          <>
            {/* Breadcrumb + sort */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
              <button className="btn btn-ghost btn-sm" onClick={backToOverview}>
                {searchParams.get('parent_module') ? '← Module' : '← Overview'}
              </button>
              {system && <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{system}</span>}
              {system && content_type && <span style={{ color: 'var(--text-3)' }}>›</span>}
              {content_type && <span style={{ fontSize: 13, color: 'var(--text-1)' }}>{content_type}</span>}
              {(module_folder_id || parent_module) && (
                <span style={{ fontSize: 13, color: 'var(--amber-hi)' }}>
                  ⚔ {overview?.moduleFolders?.find(f => f.id === (module_folder_id || parent_module))?.name || 'Module'}
                </span>
              )}
              {(module_folder_id || parent_module) && folder && <span style={{ color: 'var(--text-3)' }}>›</span>}
              {folder && <span style={{ fontSize: 13, color: 'var(--text-1)' }}>{folder.split('/').pop()}</span>}
              {unsorted && <span style={{ fontSize: 13, color: 'var(--amber-hi)' }}>⚠ Unsorted</span>}
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)' }}>{total} item{total !== 1 ? 's' : ''}</span>
              <select value={sort} onChange={e => updateParam('sort', e.target.value)} style={{ width: 'auto', fontSize: 12 }}>
                <option value="title">A → Z</option>
                <option value="created">Recently Added</option>
                <option value="size">Largest First</option>
                <option value="year">By Year</option>
              </select>
            </div>

            {/* Adventure Module tab: only show folder cards, no book grid */}
            {content_type === 'Adventure Module' ? (
              overview?.moduleFolders?.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
                  {overview.moduleFolders.map(f => (
                    <ModuleCard key={f.id} folder={f} onClick={() => drillIntoFolder(f.path, f.id)} />
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>⚔</div>
                  <div style={{ fontSize: 16, color: 'var(--text-2)' }}>No module folders yet</div>
                  <div style={{ fontSize: 13, marginTop: 6 }}>Create module folders in the File Explorer tab</div>
                </div>
              )
            ) : gridLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
                <div className="spinner" style={{ width: 32, height: 32 }} />
              </div>
            ) : (subfolders.length > 0 || items.length === 0) && !gridLoading && subfolders.length > 0 ? (
              <>
                {/* Subfolders inside module */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Folders</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: items.length > 0 ? 24 : 0 }}>
                    {subfolders.map(sf => (
                      <div key={sf.id} onClick={() => {
                        setSearchParams(prev => {
                          const n = new URLSearchParams(prev);
                          // Switch to folder-only nav — module_folder_id branch ignores folder param
                          // Keep parent_module so back button can return to the module
                          const currentModuleId = n.get('module_folder_id');
                          n.set('folder', sf.path);
                          n.delete('module_folder_id');
                          if (currentModuleId) n.set('parent_module', currentModuleId);
                          return n;
                        });
                      }} style={{
                        background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8,
                        overflow: 'hidden', cursor: 'pointer', transition: 'all 0.15s',
                      }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--amber)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                      >
                        {/* Mini collage */}
                        <div style={{ height: 80, background: 'var(--bg-3)', display: 'flex', overflow: 'hidden', position: 'relative' }}>
                          {(sf.covers||[]).length === 0 && (
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: 'var(--text-3)' }}>📁</div>
                          )}
                          {(sf.covers||[]).length === 1 && (
                            <img src={sf.covers[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          )}
                          {(sf.covers||[]).length >= 2 && (
                            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', height: '100%' }}>
                              {sf.covers.slice(0,2).map((c,i) => (
                                <img key={i} src={c} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderLeft: i > 0 ? '1px solid var(--bg-0)' : 'none' }} />
                              ))}
                            </div>
                          )}
                        </div>
                        <div style={{ padding: '8px 10px' }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-0)' }}>{sf.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{sf.item_count} file{sf.item_count !== 1 ? 's' : ''}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Items below subfolders */}
                {items.length > 0 && (
                  <>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Files</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
                      {items.map(item => <BookCard key={item.id} item={item} affiliated={!!item.is_affiliated && !item.in_folder} />)}
                    </div>
                  </>
                )}
              </>
            ) : items.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📚</div>
                <div style={{ fontSize: 16, color: 'var(--text-2)' }}>No items here</div>
              </div>
            ) : (
              <>
                {/* Legend for module view */}
                {module_folder_id && items.some(i => i.is_affiliated) && (
                  <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 11, color: 'var(--text-3)', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 500, color: 'var(--text-2)' }}>Key:</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 12, height: 12, borderRadius: 2, background: 'var(--bg-2)', border: '1px solid var(--border)', display: 'inline-block' }} />
                      In module folder
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 12, height: 12, borderRadius: 2, background: 'rgba(200,136,42,0.06)', border: '1px solid rgba(200,136,42,0.35)', borderLeft: '3px solid var(--amber)', display: 'inline-block' }} />
                      Affiliated — lives elsewhere
                    </span>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
                  {items.map(item => <BookCard key={item.id} item={item} affiliated={!!item.is_affiliated && !item.in_folder} />)}
                </div>
              </>
            )}

            {/* Pagination */}
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
    </div>
  );
}

function TabButton({ active, onClick, children, style = {} }) {
  return (
    <button onClick={onClick} style={{
      background: 'none', border: 'none', padding: '0 14px', height: '100%',
      fontSize: 13, fontWeight: 500, cursor: 'pointer',
      color: active ? 'var(--text-0)' : 'var(--text-2)',
      borderBottom: active ? '2px solid var(--amber)' : '2px solid transparent',
      transition: 'all 0.15s', whiteSpace: 'nowrap', flexShrink: 0,
      ...style,
    }}>
      {children}
    </button>
  );
}

function MoreTab({ types, activeTab, onSelect }) {
  const [open, setOpen] = useState(false);
  const hasActive = types.some(t => t.content_type === activeTab);

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'stretch' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        background: 'none', border: 'none', padding: '0 12px', height: '100%',
        fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
        color: hasActive ? 'var(--text-0)' : 'var(--text-2)',
        borderBottom: hasActive ? '2px solid var(--amber)' : '2px solid transparent',
      }}>
        More ▾
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 100, marginTop: 4,
          background: 'var(--bg-2)', border: '1px solid var(--border-md)', borderRadius: 8,
          padding: 6, minWidth: 180, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          {types.map(t => (
            <button key={t.content_type} onClick={() => { onSelect(t.content_type); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '7px 12px', borderRadius: 4, background: 'none', border: 'none',
                fontSize: 13, cursor: 'pointer', textAlign: 'left',
                color: activeTab === t.content_type ? 'var(--amber-hi)' : 'var(--text-1)',
                backgroundColor: activeTab === t.content_type ? 'rgba(200,136,42,0.1)' : 'transparent',
              }}>
              {t.content_type}
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)' }}>{t.item_count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

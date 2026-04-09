import { useState } from 'react';
import { useApi } from '../hooks/useApi.js';

const TTRPG_SYSTEMS = ['D&D 5e','D&D 3.5e','D&D 4e','OSE','Pathfinder 1e','Pathfinder 2e','Call of Cthulhu','Shadowrun','Starfinder','Forbidden Lands','Savage Worlds','Year Zero Engine','GURPS','FATE Core','Blades in the Dark','Cairn','Mothership','Mörk Borg','Other'];
const CONTENT_TYPES = ['Core Rulebook','Supplement','Adventure Module','Sourcebook','Bestiary','Campaign Setting','Pregen Characters','Battle Maps','Tokens','Encounter','Quick Reference','System Reference','Other'];

export default function MetadataEditor({ item, onClose, onSave }) {
  const { post, put } = useApi();
  const [form, setForm] = useState({
    title:       item.title       || '',
    authors:     (item.authors || []).join(', '),
    description: item.description || '',
    publisher:   item.publisher   || '',
    year:        item.year        || '',
    system:      item.system      || '',
    contentType: item.content_type|| '',
    tags:        (item.tags || []).join(', '),
  });
  const [searchQuery, setSearchQuery]     = useState(item.title);
  const [isbnQuery, setIsbnQuery]         = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching]         = useState(false);
  const [coverUrl, setCoverUrl]           = useState('');
  const [fetchingCover, setFetchingCover] = useState(false);
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState('');
  const [activeSearch, setActiveSearch]   = useState('title'); // 'title' | 'isbn'

  const handleSearch = async () => {
    setSearching(true); setError('');
    try {
      let results;
      if (activeSearch === 'isbn' && isbnQuery) {
        results = await post(`/library/items/${item.id}/metadata/search-isbn`, { isbn: isbnQuery });
      } else {
        results = await post(`/library/items/${item.id}/metadata/search`, { query: searchQuery });
      }
      setSearchResults(results);
    } catch (e) { setError(e.message); }
    finally { setSearching(false); }
  };

  const applyResult = (result) => {
    setForm(f => ({
      ...f,
      title:       result.title || f.title,
      authors:     (result.authors || []).join(', ') || f.authors,
      description: result.description || f.description,
      publisher:   result.publisher || f.publisher,
      year:        result.year || f.year,
      tags:        [...new Set([...f.tags.split(',').map(t => t.trim()), ...(result.tags || [])].filter(Boolean))].join(', '),
    }));
    if (result.coverUrl) setCoverUrl(result.coverUrl);
    setSearchResults([]);
  };

  const handleFetchCover = async () => {
    if (!coverUrl) return;
    setFetchingCover(true); setError('');
    try {
      await post(`/library/items/${item.id}/cover/fetch`, { url: coverUrl });
    } catch (e) { setError(`Cover fetch failed: ${e.message}`); }
    finally { setFetchingCover(false); }
  };

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      const updated = await put(`/library/items/${item.id}/metadata`, {
        title:       form.title,
        authors:     form.authors.split(',').map(a => a.trim()).filter(Boolean),
        description: form.description,
        publisher:   form.publisher,
        year:        form.year ? parseInt(form.year) : null,
        system:      form.system,
        contentType: form.contentType,
        tags:        form.tags.split(',').map(t => t.trim()).filter(Boolean),
        coverUrl:    coverUrl || null,
        source:      'manual',
      });
      onSave(updated);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="card" style={{ width: '100%', maxWidth: 660, maxHeight: '90vh', overflow: 'auto', padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--text-0)' }}>Edit Metadata</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {/* Search section */}
        <div style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
            Fetch from OpenLibrary / Google Books
          </div>

          {/* Search type toggle */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            {[['title','By Title'],['isbn','By ISBN']].map(([key, label]) => (
              <button key={key} className={`btn btn-sm ${activeSearch === key ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setActiveSearch(key)}>{label}</button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {activeSearch === 'title' ? (
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by title…" onKeyDown={e => e.key === 'Enter' && handleSearch()} />
            ) : (
              <input value={isbnQuery} onChange={e => setIsbnQuery(e.target.value)}
                placeholder="ISBN-10 or ISBN-13…" onKeyDown={e => e.key === 'Enter' && handleSearch()} />
            )}
            <button className="btn btn-primary btn-sm" onClick={handleSearch} disabled={searching} style={{ flexShrink: 0 }}>
              {searching ? <span className="spinner" style={{ width: 13, height: 13 }} /> : 'Search'}
            </button>
          </div>

          {searchResults.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflow: 'auto' }}>
              {searchResults.map((r, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 12,
                  background: 'var(--bg-2)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '10px 12px', cursor: 'pointer', transition: 'border-color 0.1s',
                }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--amber)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                  onClick={() => applyResult(r)}>
                  {r.coverUrl && (
                    <img src={r.coverUrl} alt="" style={{ width: 36, height: 52, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }} />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--text-0)' }}>{r.title}</div>
                    {r.authors?.length > 0 && <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{r.authors.join(', ')}</div>}
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                      {r.source} {r.year && `· ${r.year}`} {r.publisher && `· ${r.publisher}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cover URL field */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>
            Cover Image URL <span style={{ color: 'var(--text-3)' }}>(auto-filled from search results, or paste your own)</span>
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={coverUrl} onChange={e => setCoverUrl(e.target.value)} placeholder="https://…" />
            <button className="btn btn-ghost btn-sm" onClick={handleFetchCover} disabled={fetchingCover || !coverUrl} style={{ flexShrink: 0 }}>
              {fetchingCover ? <span className="spinner" style={{ width: 12, height: 12 }} /> : 'Apply'}
            </button>
          </div>
        </div>

        {error && (
          <div style={{ background: 'rgba(138,30,30,0.12)', border: '1px solid rgba(138,30,30,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: 'var(--red-hi)', fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Metadata form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Title"><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></Field>
          <Field label="Authors (comma-separated)"><input value={form.authors} onChange={e => setForm(f => ({ ...f, authors: e.target.value }))} placeholder="e.g. Gary Gygax, Dave Arneson" /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Game System">
              <select value={form.system} onChange={e => setForm(f => ({ ...f, system: e.target.value }))}>
                <option value="">— None —</option>
                {TTRPG_SYSTEMS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Content Type">
              <select value={form.contentType} onChange={e => setForm(f => ({ ...f, contentType: e.target.value }))}>
                <option value="">— None —</option>
                {CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Publisher"><input value={form.publisher} onChange={e => setForm(f => ({ ...f, publisher: e.target.value }))} /></Field>
            <Field label="Year"><input type="number" value={form.year} min="1970" max="2030" onChange={e => setForm(f => ({ ...f, year: e.target.value }))} /></Field>
          </div>
          <Field label="Description"><textarea value={form.description} rows={4} style={{ resize: 'vertical' }} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></Field>
          <Field label="Tags (comma-separated)"><input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="e.g. horror, dungeon, one-shot" /></Field>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Save Metadata'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

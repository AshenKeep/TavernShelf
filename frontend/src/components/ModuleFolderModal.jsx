import { useState } from 'react';
import { useApi } from '../hooks/useApi.js';

export default function ModuleFolderModal({ itemId, system, onClose, onMoved }) {
  const { post } = useApi();
  const [name, setName]       = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true); setError('');
    try {
      const updated = await post(`/library/items/${itemId}/confirm-module`, { moduleName: name.trim() });
      onMoved(updated);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="card" style={{ width: '100%', maxWidth: 400, padding: 24 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--text-0)', marginBottom: 8, fontSize: 16 }}>
          Create Module Folder
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16, lineHeight: 1.6 }}>
          This is an Adventure Module for <strong style={{ color: 'var(--amber-hi)' }}>{system}</strong>.
          What should the module folder be called?
        </p>
        <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 16, fontFamily: 'monospace' }}>
          → {system}/Adventure Module/<span style={{ color: 'var(--amber)' }}>{name || 'Folder Name'}</span>/
        </p>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            autoFocus
            placeholder="e.g. Curse of Strahd"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          {error && <div style={{ fontSize: 12, color: 'var(--red-hi)' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Skip for now</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !name.trim()}>
              {saving ? <span className="spinner" style={{ width: 12, height: 12 }} /> : 'Create & Move'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

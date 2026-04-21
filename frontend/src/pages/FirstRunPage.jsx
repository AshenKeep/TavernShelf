import { useState } from 'react';

export default function FirstRunPage({ onComplete }) {
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [confirm,     setConfirm]     = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState('');

  const handleSubmit = async () => {
    setError('');
    if (!email || !password) return setError('Email and password are required');
    if (password.length < 8)  return setError('Password must be at least 8 characters');
    if (password !== confirm)  return setError('Passwords do not match');

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName: displayName || 'Admin' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onComplete();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-0)', padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>⚔</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--amber-hi)', margin: 0 }}>
            TavernShelf
          </h1>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 6 }}>First-run setup</div>
        </div>

        <div className="card" style={{ padding: 28 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--text-0)', marginBottom: 6 }}>
            Create your admin account
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 24 }}>
            This is a one-time setup. No environment variables needed — your credentials are stored securely in the database.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 5 }}>Email *</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 5 }}>Display Name</label>
              <input
                value={displayName} onChange={e => setDisplayName(e.target.value)}
                placeholder="Admin"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 5 }}>Password * <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(min 8 characters)</span></label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 5 }}>Confirm Password *</label>
              <input
                type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              />
            </div>

            {error && (
              <div style={{ padding: '10px 14px', background: 'rgba(168,50,50,0.12)', border: '1px solid rgba(168,50,50,0.3)', borderRadius: 8, color: 'var(--red-hi)', fontSize: 13 }}>
                {error}
              </div>
            )}

            <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting} style={{ marginTop: 4 }}>
              {submitting ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Creating account…</> : 'Create Admin Account'}
            </button>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--text-3)' }}>
          You can change your password anytime in Admin → Settings
        </div>
      </div>
    </div>
  );
}

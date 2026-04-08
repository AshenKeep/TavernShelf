import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL || '/api';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({
    email: '', password: '', displayName: '',
    inviteToken: params.get('invite') || '',
  });
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-0)' }}>
      <div className="card" style={{ padding: 32, maxWidth: 360, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⚔️</div>
        <h2 style={{ fontFamily: 'var(--font-display)', color: 'var(--text-0)', marginBottom: 12 }}>Welcome to the Tavern</h2>
        <p style={{ color: 'var(--text-2)', marginBottom: 24, fontSize: 14 }}>Your account has been created.</p>
        <button className="btn btn-primary" onClick={() => navigate('/login')}>Sign in</button>
      </div>
    </div>
  );

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-0)',
      backgroundImage: 'radial-gradient(ellipse at 50% 0%, rgba(107,79,160,0.15) 0%, transparent 70%)',
    }}>
      <div style={{ width: '100%', maxWidth: 380, padding: '0 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, color: 'var(--text-0)', letterSpacing: '0.04em', marginBottom: 8 }}>
            TavernShelf
          </h1>
          <p style={{ color: 'var(--text-3)', fontSize: 14 }}>Create your account</p>
        </div>

        <div className="card" style={{ padding: 28 }}>
          {error && (
            <div style={{ background: 'rgba(168,50,50,0.12)', border: '1px solid rgba(168,50,50,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: 'var(--red-hi)', fontSize: 13 }}>
              {error}
            </div>
          )}

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { key: 'displayName', label: 'Display Name',   type: 'text',     placeholder: 'Gandalf the Grey' },
              { key: 'email',       label: 'Email',          type: 'email',    placeholder: 'you@example.com' },
              { key: 'password',    label: 'Password',       type: 'password', placeholder: '••••••••' },
              { key: 'inviteToken', label: 'Invite Token',   type: 'text',     placeholder: 'xxxxxxxx-xxxx-...' },
            ].map(({ key, label, type, placeholder }) => (
              <div key={key}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>{label}</label>
                <input type={type} placeholder={placeholder} value={form[key]} required
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
              </div>
            ))}
            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
              disabled={loading}>
              {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Create Account'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text-3)' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: 'var(--purple-hi)' }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

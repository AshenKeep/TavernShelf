import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await login(form.email, form.password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-0)',
      backgroundImage: 'radial-gradient(ellipse at 50% 0%, rgba(107,79,160,0.15) 0%, transparent 70%)',
    }}>
      <div style={{ width: '100%', maxWidth: 380, padding: '0 24px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, color: 'var(--text-0)', letterSpacing: '0.04em', marginBottom: 8 }}>
            TavernShelf
          </h1>
          <p style={{ color: 'var(--text-3)', fontSize: 14 }}>Your TTRPG digital library</p>
        </div>

        <div className="card" style={{ padding: 28 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--text-0)', marginBottom: 24, textAlign: 'center' }}>
            Sign In
          </h2>

          {error && (
            <div style={{ background: 'rgba(168,50,50,0.12)', border: '1px solid rgba(168,50,50,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: 'var(--red-hi)', fontSize: 13 }}>
              {error}
            </div>
          )}

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>Email</label>
              <input type="email" placeholder="you@example.com" value={form.email} required
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>Password</label>
              <input type="password" placeholder="••••••••" value={form.password} required
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
              disabled={loading}>
              {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Sign in'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text-3)' }}>
            Have an invite?{' '}
            <Link to="/register" style={{ color: 'var(--amber-hi)' }}>Create account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

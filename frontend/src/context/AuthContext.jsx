import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const API = '/api';
const AuthContext = createContext(null);

// Simple event bus for cross-component communication
const eventBus = {
  listeners: {},
  on(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = new Set();
    this.listeners[event].add(fn);
    return () => this.listeners[event].delete(fn);
  },
  emit(event, data) {
    (this.listeners[event] || new Set()).forEach(fn => fn(data));
  },
};

export const appEvents = eventBus;

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [token, setToken]     = useState(() => localStorage.getItem('ts_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(u => setUser(u))
      .catch(() => { localStorage.removeItem('ts_token'); setToken(null); })
      .finally(() => setLoading(false));
  }, [token]);

  const login = useCallback(async (email, password) => {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    localStorage.setItem('ts_token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('ts_token');
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, isAdmin: user?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

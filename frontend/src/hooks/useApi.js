import { useAuth } from '../context/AuthContext.jsx';

const BASE = import.meta.env.VITE_API_URL || '/api';

export function useApi() {
  const { token, logout } = useAuth();

  const apiFetch = async (path, options = {}) => {
    const headers = {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }

    const res = await fetch(`${BASE}${path}`, { ...options, headers });

    if (res.status === 401) { logout(); throw new Error('Session expired'); }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Request failed');
    }
    if (res.status === 204) return null;
    return res.json();
  };

  const get    = (path, params) => {
    const url = params ? `${path}?${new URLSearchParams(params)}` : path;
    return apiFetch(url);
  };
  const post   = (path, body) => apiFetch(path, { method: 'POST',   body: body instanceof FormData ? body : JSON.stringify(body) });
  const put    = (path, body) => apiFetch(path, { method: 'PUT',    body: JSON.stringify(body) });
  const del    = (path)       => apiFetch(path, { method: 'DELETE' });

  const streamUrl = (itemId) => `${BASE}/library/items/${itemId}/stream`;

  return { get, post, put, del, streamUrl, token };
}

import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config.js';

export function requireAuth(req, res, next) {
  // Accept token from Authorization header OR ?token= query param
  // (query param needed for browser-native requests like <img src> that can't set headers)
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : (req.query.token || null);
  if (!token) return res.status(401).json({ error: 'Unauthorised' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorised' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

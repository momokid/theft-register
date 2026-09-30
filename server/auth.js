import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { pool } from './db.js';
import { audit } from './audit.js';

const COOKIE_NAME = 'token';
const TOKEN_TTL = '8h';
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

// Dummy hash so a login with an unknown email still runs a bcrypt compare,
// keeping response timing the same whether or not the email exists.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: TOKEN_TTL_MS,
  };
}

export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again later.' },
});

export function checkOrigin(req, res, next) {
  const mutating = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method);
  if (!mutating) return next();
  if (req.get('Origin') !== process.env.APP_ORIGIN) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

export async function login(req, res) {
  const { email, password } = req.validated;
  const [rows] = await pool.query(
    'SELECT id, name, email, password_hash, is_admin, is_active FROM users WHERE email = ?',
    [email]
  );
  const user = rows[0];
  const hash = user ? user.password_hash : DUMMY_HASH;
  const ok = await bcrypt.compare(password, hash);

  if (!user || !ok || !user.is_active) {
    await audit(pool, { action: 'login_failed', meta: { email }, ip: req.ip });
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: TOKEN_TTL });
  res.cookie(COOKIE_NAME, token, cookieOptions());
  await audit(pool, { userId: user.id, action: 'login', ip: req.ip });
  res.json({ user: { id: user.id, name: user.name, email: user.email, is_admin: !!user.is_admin } });
}

export async function logout(req, res) {
  res.clearCookie(COOKIE_NAME, cookieOptions());
  if (req.user) await audit(pool, { userId: req.user.id, action: 'logout', ip: req.ip });
  res.status(204).end();
}

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const [rows] = await pool.query(
      'SELECT id, name, email, is_admin, is_active FROM users WHERE id = ?',
      [payload.sub]
    );
    const user = rows[0];
    if (!user || !user.is_active) return res.status(401).json({ error: 'Unauthorized' });
    req.user = { id: user.id, name: user.name, email: user.email, is_admin: !!user.is_admin };
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'Forbidden' });
  next();
}

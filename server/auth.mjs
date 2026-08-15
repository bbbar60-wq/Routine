/**
 * Authentication: scrypt password hashing, opaque session tokens stored as
 * SHA-256 digests, and a session-bound CSRF token (double submit).
 */
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
  createHmac,
} from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { get, run, nowIso } from './db.mjs';
import { unauthorized, forbidden, setCookie, clearCookie, parseCookies } from './http.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.ROUTINE_DATA_DIR || join(__dirname, '..', 'data');

export const SESSION_COOKIE = 'rt_session';
export const CSRF_COOKIE = 'rt_csrf';
const SESSION_DAYS = 30;

/* ---------------- server secret ---------------- */

function loadSecret() {
  if (process.env.ROUTINE_SECRET) return Buffer.from(process.env.ROUTINE_SECRET, 'utf8');
  mkdirSync(DATA_DIR, { recursive: true });
  const file = join(DATA_DIR, '.secret');
  if (existsSync(file)) return Buffer.from(readFileSync(file, 'utf8').trim(), 'hex');
  const secret = randomBytes(32);
  writeFileSync(file, secret.toString('hex'), { mode: 0o600 });
  return secret;
}
const SECRET = loadSecret();

/* ---------------- passwords ---------------- */

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(password) {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('hex')}$${key.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, saltHex, keyHex] = stored.split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(keyHex, 'hex');
    const actual = scryptSync(password, salt, expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
      maxmem: 64 * 1024 * 1024,
    });
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/* ---------------- sessions ---------------- */

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

export function csrfFor(sessionId) {
  return createHmac('sha256', SECRET).update(`csrf:${sessionId}`).digest('hex');
}

export function createSession(res, userId, userAgent, { secure = false } = {}) {
  const id = randomBytes(18).toString('hex');
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);

  run(
    `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`,
    id,
    userId,
    sha256(token),
    nowIso(),
    expires.toISOString(),
    (userAgent || '').slice(0, 300)
  );

  const maxAge = SESSION_DAYS * 86400;
  setCookie(res, SESSION_COOKIE, `${id}.${token}`, {
    httpOnly: true,
    sameSite: 'Lax',
    secure,
    maxAge,
  });
  // Readable by the client so it can echo it back in a header.
  setCookie(res, CSRF_COOKIE, csrfFor(id), {
    httpOnly: false,
    sameSite: 'Lax',
    secure,
    maxAge,
  });
  return id;
}

export function destroySession(req, res) {
  const raw = parseCookies(req)[SESSION_COOKIE];
  if (raw) {
    const [id] = raw.split('.');
    if (id) run('DELETE FROM sessions WHERE id = ?', id);
  }
  clearCookie(res, SESSION_COOKIE);
  clearCookie(res, CSRF_COOKIE);
}

/** Returns the signed-in user, or null. */
export function currentUser(req) {
  const raw = parseCookies(req)[SESSION_COOKIE];
  if (!raw) return null;
  const dot = raw.indexOf('.');
  if (dot < 0) return null;
  const id = raw.slice(0, dot);
  const token = raw.slice(dot + 1);

  const session = get('SELECT * FROM sessions WHERE id = ?', id);
  if (!session) return null;

  if (new Date(session.expires_at).getTime() < Date.now()) {
    run('DELETE FROM sessions WHERE id = ?', id);
    return null;
  }

  const a = Buffer.from(session.token_hash, 'hex');
  const b = Buffer.from(sha256(token), 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const user = get('SELECT id, email, name, settings, created_at FROM users WHERE id = ?', session.user_id);
  if (!user) return null;
  return { ...user, sessionId: id };
}

export function requireUser(req) {
  const user = currentUser(req);
  if (!user) throw unauthorized();
  return user;
}

/**
 * CSRF: every state-changing request must echo the session-bound token in a
 * header. A cross-site form post cannot set custom headers, and an attacker
 * cannot read the cookie to learn the value.
 */
export function requireCsrf(req, user) {
  const sent = req.headers['x-csrf-token'];
  if (!sent) throw forbidden('Missing CSRF token');
  const expected = csrfFor(user.sessionId);
  const a = Buffer.from(String(sent));
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw forbidden('Bad CSRF token');
}

export function purgeExpiredSessions() {
  run('DELETE FROM sessions WHERE expires_at < ?', nowIso());
}

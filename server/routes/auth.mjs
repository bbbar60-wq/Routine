import { get, run, nowIso } from '../db.mjs';
import { readJson, badRequest, unauthorized, rateLimit, clientIp, tooMany } from '../http.mjs';
import { hashPassword, verifyPassword, createSession, destroySession } from '../auth.mjs';
import { validate, f } from '../validate.mjs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DEFAULT_SETTINGS = {
  theme: 'dark',
  calendar: 'both',      // gregorian | jalali | both
  weekStart: 6,          // 0 Sun … 6 Sat — Saturday matches the Iranian week
  currency: 'IRT',
  units: 'metric',
  dailyFocusGoalMin: 240,
  waterGoalMl: 2500,
  sleepGoalHours: 7.5,
};

function publicUser(u) {
  let settings = DEFAULT_SETTINGS;
  try {
    settings = { ...DEFAULT_SETTINGS, ...JSON.parse(u.settings || '{}') };
  } catch { /* keep defaults */ }
  return { id: u.id, email: u.email, name: u.name, createdAt: u.created_at, settings };
}

export default function registerAuth(api) {
  /* ---------------- who am I ---------------- */
  api.get('/api/auth/me', ({ user }) => {
    const full = get('SELECT * FROM users WHERE id = ?', user.id);
    return { user: publicUser(full) };
  });

  /* ---------------- sign up ----------------
   * Open only while the instance has no owner. After that the app is
   * single-tenant unless ROUTINE_ALLOW_SIGNUP is set explicitly.
   */
  api.get('/api/auth/status', () => {
    const { c } = get('SELECT COUNT(*) AS c FROM users');
    return { needsSetup: c === 0, signupOpen: c === 0 || process.env.ROUTINE_ALLOW_SIGNUP === '1' };
  }, { auth: false });

  api.post('/api/auth/register', async ({ req, res }) => {
    const gate = rateLimit(`register:${clientIp(req)}`, { limit: 5, windowMs: 3600_000 });
    if (!gate.ok) throw tooMany('Too many sign-up attempts. Try again later.');

    const { c } = get('SELECT COUNT(*) AS c FROM users');
    if (c > 0 && process.env.ROUTINE_ALLOW_SIGNUP !== '1') {
      throw badRequest('This instance already has an owner.');
    }

    const body = await readJson(req);
    const data = validate(body, {
      email: f.str({ required: true, max: 200 }),
      name: f.str({ required: true, min: 1, max: 80 }),
      password: f.str({ required: true, min: 8, max: 200 }),
    });

    if (!EMAIL_RE.test(data.email)) throw badRequest('That email address does not look right');
    if (get('SELECT id FROM users WHERE email = ?', data.email)) {
      throw badRequest('An account with that email already exists');
    }

    const { lastInsertRowid } = run(
      'INSERT INTO users (email, name, password_hash, settings, created_at) VALUES (?, ?, ?, ?, ?)',
      data.email,
      data.name,
      hashPassword(data.password),
      JSON.stringify(DEFAULT_SETTINGS),
      nowIso()
    );

    createSession(res, lastInsertRowid, req.headers['user-agent']);
    const full = get('SELECT * FROM users WHERE id = ?', lastInsertRowid);
    return { user: publicUser(full) };
  }, { auth: false });

  /* ---------------- sign in ---------------- */
  api.post('/api/auth/login', async ({ req, res }) => {
    const ip = clientIp(req);
    const gate = rateLimit(`login:${ip}`, { limit: 10, windowMs: 15 * 60_000 });
    if (!gate.ok) throw tooMany(`Too many sign-in attempts. Try again in ${gate.retryAfterSec}s.`);

    const body = await readJson(req);
    const data = validate(body, {
      email: f.str({ required: true, max: 200 }),
      password: f.str({ required: true, max: 200 }),
    });

    const user = get('SELECT * FROM users WHERE email = ?', data.email);
    // Always run a verification so a missing account and a wrong password
    // take the same amount of time.
    const reference = user?.password_hash || hashPassword('placeholder-timing-equaliser');
    const ok = verifyPassword(data.password, reference);
    if (!user || !ok) throw unauthorized('Email or password is incorrect');

    createSession(res, user.id, req.headers['user-agent']);
    return { user: publicUser(user) };
  }, { auth: false });

  /* ---------------- sign out ----------------
   * Authenticated so the CSRF check applies: a third-party page must not be
   * able to log the user out.
   */
  api.post('/api/auth/logout', ({ req, res }) => {
    destroySession(req, res);
    return { ok: true };
  });

  /* ---------------- profile & settings ---------------- */
  api.patch('/api/auth/profile', async ({ req, user }) => {
    const body = await readJson(req);
    const data = validate(body, {
      name: f.str({ min: 1, max: 80 }),
      email: f.str({ max: 200 }),
    }, { partial: true });

    if (data.email) {
      if (!EMAIL_RE.test(data.email)) throw badRequest('That email address does not look right');
      const clash = get('SELECT id FROM users WHERE email = ? AND id != ?', data.email, user.id);
      if (clash) throw badRequest('Another account already uses that email');
    }
    if (data.name) run('UPDATE users SET name = ? WHERE id = ?', data.name, user.id);
    if (data.email) run('UPDATE users SET email = ? WHERE id = ?', data.email, user.id);

    return { user: publicUser(get('SELECT * FROM users WHERE id = ?', user.id)) };
  });

  api.put('/api/auth/settings', async ({ req, user }) => {
    const body = await readJson(req);
    const data = validate(body, {
      theme: f.enum(['dark', 'light', 'system']),
      calendar: f.enum(['gregorian', 'jalali', 'both']),
      weekStart: f.int({ min: 0, max: 6 }),
      currency: f.enum(['IRT', 'IRR', 'USD', 'EUR']),
      units: f.enum(['metric', 'imperial']),
      dailyFocusGoalMin: f.int({ min: 0, max: 1440 }),
      waterGoalMl: f.int({ min: 0, max: 10000 }),
      sleepGoalHours: f.num({ min: 0, max: 16 }),
    }, { partial: true });

    const current = publicUser(get('SELECT * FROM users WHERE id = ?', user.id)).settings;
    const merged = { ...current, ...data };
    run('UPDATE users SET settings = ? WHERE id = ?', JSON.stringify(merged), user.id);
    return { settings: merged };
  });

  api.post('/api/auth/password', async ({ req, user }) => {
    const body = await readJson(req);
    const data = validate(body, {
      currentPassword: f.str({ required: true, max: 200 }),
      newPassword: f.str({ required: true, min: 8, max: 200 }),
    });

    const full = get('SELECT * FROM users WHERE id = ?', user.id);
    if (!verifyPassword(data.currentPassword, full.password_hash)) {
      throw badRequest('Current password is incorrect');
    }
    run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(data.newPassword), user.id);
    // Every other session is invalidated; this one stays alive.
    run('DELETE FROM sessions WHERE user_id = ? AND id != ?', user.id, user.sessionId);
    return { ok: true };
  });
}

export { DEFAULT_SETTINGS, publicUser };

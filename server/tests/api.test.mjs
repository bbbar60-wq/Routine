/**
 * End-to-end API checks against a live server.
 *   npm start          (in one shell)
 *   node --test server/tests/api.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.ROUTINE_BASE || 'http://127.0.0.1:5181';
const EMAIL = process.env.SEED_EMAIL || 'rezabz2005@gmail.com';
const PASSWORD = process.env.SEED_PASSWORD || 'routine2026';

let cookies = '';
let csrf = '';

function remember(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const c of raw) {
    const [pair] = c.split(';');
    const [k, v] = pair.split('=');
    if (k === 'rt_csrf') csrf = decodeURIComponent(v);
  }
  if (raw.length) {
    const jar = new Map(cookies ? cookies.split('; ').map((c) => c.split('=')) : []);
    for (const c of raw) {
      const [k, v] = c.split(';')[0].split('=');
      jar.set(k, v);
    }
    cookies = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookies ? { Cookie: cookies } : {}),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  remember(res);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  return { status: res.status, body: json, text };
}

test('unauthenticated requests are rejected', async () => {
  const res = await call('GET', '/api/dashboard');
  assert.equal(res.status, 401);
});

test('sign in', async () => {
  const bad = await call('POST', '/api/auth/login', { email: EMAIL, password: 'wrong-password' });
  assert.equal(bad.status, 401);

  const res = await call('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.email, EMAIL);
  assert.ok(csrf, 'CSRF cookie was issued');
});

test('CSRF is enforced on writes', async () => {
  const res = await fetch(`${BASE}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookies },
    body: JSON.stringify({ title: 'no csrf' }),
  });
  assert.equal(res.status, 403);
});

test('dashboard returns a full payload', async () => {
  const res = await call('GET', '/api/dashboard');
  assert.equal(res.status, 200);
  const d = res.body;
  for (const key of ['date', 'habits', 'tasks', 'focus', 'momentum', 'goals', 'training', 'habitsSummary']) {
    assert.ok(key in d, `dashboard has ${key}`);
  }
  assert.equal(d.momentum.length, 7);
  // Shape only — the suite must pass against an empty account too, not just
  // a seeded one.
  assert.ok(Array.isArray(d.habits));
  assert.ok(Array.isArray(d.tasks));
  assert.equal(typeof d.focus.todayMinutes, 'number');
});

test('read endpoints all respond', async () => {
  const paths = [
    '/api/projects', '/api/tasks', '/api/habits', '/api/focus',
    '/api/workouts', '/api/workouts/records', '/api/sports', '/api/health',
    '/api/learning', '/api/finance', '/api/goals', '/api/journal',
    '/api/analytics?days=90', '/api/export',
  ];
  for (const p of paths) {
    const res = await call('GET', p);
    assert.equal(res.status, 200, `${p} -> ${res.status} ${res.text?.slice(0, 120)}`);
  }
});

test('task lifecycle', async () => {
  const created = await call('POST', '/api/tasks', {
    title: 'Test task from suite', domain: 'work', priority: 1, due_date: '2026-08-20',
  });
  assert.equal(created.status, 200);
  const id = created.body.task.id;

  const done = await call('PATCH', `/api/tasks/${id}`, { status: 'done' });
  assert.equal(done.status, 200);
  assert.equal(done.body.task.status, 'done');
  assert.ok(done.body.task.completed_at, 'completed_at is stamped');

  const reopened = await call('PATCH', `/api/tasks/${id}`, { status: 'todo' });
  assert.equal(reopened.body.task.completed_at, null, 'completed_at is cleared again');

  assert.equal((await call('DELETE', `/api/tasks/${id}`)).status, 200);
  assert.equal((await call('PATCH', `/api/tasks/${id}`, { title: 'gone' })).status, 404);
});

test('habit logging moves the streak', async () => {
  // Own fixture, so this works on a freshly wiped account.
  const created = await call('POST', '/api/habits', { name: 'Suite habit', cadence: 'daily' });
  assert.equal(created.status, 200);
  const id = created.body.habit.id;

  const today = (await call('GET', '/api/habits')).body.to;

  const on = await call('PUT', `/api/habits/${id}/log`, { date: today, done: true });
  assert.equal(on.status, 200);
  assert.equal(on.body.done, true);
  assert.equal(on.body.streak, 1, 'logging today starts a streak');

  const off = await call('PUT', `/api/habits/${id}/log`, { date: today, done: false });
  assert.equal(off.body.done, false);
  assert.equal(off.body.streak, 0, 'un-logging takes it back');

  // Future dates are not loggable.
  const future = await call('PUT', `/api/habits/${id}/log`, { date: '2099-01-01', done: true });
  assert.equal(future.status, 400);

  assert.equal((await call('DELETE', `/api/habits/${id}`)).status, 200);
});

test('focus timer start / stop', async () => {
  await call('POST', '/api/focus/cancel');
  const started = await call('POST', '/api/focus/start', { domain: 'research', label: 'suite check', kind: 'deep' });
  assert.equal(started.status, 200);
  assert.equal(started.body.session.ended_at, null);

  const running = await call('GET', '/api/focus');
  assert.ok(running.body.running, 'a running session is reported');

  const stopped = await call('POST', '/api/focus/stop', { notes: 'done' });
  assert.equal(stopped.status, 200);
  assert.ok(stopped.body.session.ended_at);
  await call('DELETE', `/api/focus/${stopped.body.session.id}`);
});

test('workout round-trip keeps nested sets', async () => {
  const created = await call('POST', '/api/workouts', {
    date: '2026-08-14', kind: 'Push', title: 'Suite workout', duration_min: 60,
    exercises: [
      { name: 'Bench Press', muscle: 'chest', sets: [{ reps: 8, weight_kg: 70 }, { reps: 6, weight_kg: 75 }] },
      { name: 'Cable Fly', muscle: 'chest', sets: [{ reps: 12, weight_kg: 20 }] },
    ],
  });
  assert.equal(created.status, 200);
  const w = created.body.workout;
  assert.equal(w.exercises.length, 2);
  assert.equal(w.exercises[0].sets.length, 2);
  assert.equal(w.volume, 8 * 70 + 6 * 75 + 12 * 20);

  const updated = await call('PUT', `/api/workouts/${w.id}`, {
    date: '2026-08-14', kind: 'Push', title: 'Suite workout v2', duration_min: 65,
    exercises: [{ name: 'Bench Press', muscle: 'chest', sets: [{ reps: 5, weight_kg: 80 }] }],
  });
  assert.equal(updated.body.workout.exercises.length, 1, 'replaced, not appended');

  assert.equal((await call('DELETE', `/api/workouts/${w.id}`)).status, 200);
});

test('health upsert is idempotent per day', async () => {
  const a = await call('PUT', '/api/health/2026-08-10', { sleep_hours: 7.5, mood: 4 });
  assert.equal(a.status, 200);
  const b = await call('PUT', '/api/health/2026-08-10', { water_ml: 2000 });
  assert.equal(b.body.log.sleep_hours, 7.5, 'earlier fields survive a partial update');
  assert.equal(b.body.log.water_ml, 2000);
});

test('validation rejects bad input', async () => {
  assert.equal((await call('POST', '/api/tasks', { title: '' })).status, 400);
  assert.equal((await call('POST', '/api/tasks', { title: 'x', priority: 99 })).status, 400);
  assert.equal((await call('POST', '/api/sports', { date: 'not-a-date', sport: 'Run' })).status, 400);
  assert.equal((await call('PUT', '/api/health/2026-13-45', {})).status, 400);
  assert.equal((await call('POST', '/api/transactions', { date: '2026-08-01', category: 'food', amount: -5 })).status, 400);
});

test('cross-user access is impossible', async () => {
  // id 999999 belongs to nobody; ownership check must 404 rather than leak.
  assert.equal((await call('PATCH', '/api/projects/999999', { name: 'hack' })).status, 404);
  assert.equal((await call('DELETE', '/api/goals/999999')).status, 404);
});

test('sign out clears the session', async () => {
  assert.equal((await call('POST', '/api/auth/logout')).status, 200);
  cookies = '';
  csrf = '';
  assert.equal((await call('GET', '/api/dashboard')).status, 401);
});

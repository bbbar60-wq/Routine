import { all, get, run, tx, nowIso } from '../db.mjs';
import { readJson, badRequest, notFound } from '../http.mjs';
import { validate, f, buildUpdate, requireId } from '../validate.mjs';
import { todayIso, addDays } from '../lib/dates.mjs';
import { DOMAINS, owned } from './core.mjs';

/** Epley one-rep-max estimate — the standard field formula. */
export const e1rm = (weight, reps) => (reps > 0 ? weight * (1 + reps / 30) : 0);

export default function registerBody(api) {
  /* ========================= FOCUS SESSIONS ========================= */

  api.get('/api/focus', ({ user, query }) => {
    const from = query.from || addDays(todayIso(), -29);
    const to = query.to || todayIso();
    const sessions = all(
      `SELECT fs.*, p.name AS project_name, t.title AS task_title
         FROM focus_sessions fs
         LEFT JOIN projects p ON p.id = fs.project_id
         LEFT JOIN tasks t    ON t.id = fs.task_id
        WHERE fs.user_id = ? AND fs.date BETWEEN ? AND ?
        ORDER BY fs.started_at DESC LIMIT 500`,
      user.id, from, to
    );
    const running = get(
      `SELECT fs.*, p.name AS project_name, t.title AS task_title
         FROM focus_sessions fs
         LEFT JOIN projects p ON p.id = fs.project_id
         LEFT JOIN tasks t    ON t.id = fs.task_id
        WHERE fs.user_id = ? AND fs.ended_at IS NULL
        ORDER BY fs.started_at DESC LIMIT 1`,
      user.id
    );
    return { from, to, sessions, running: running || null };
  });

  /** Start a live timer. Any timer already running is closed out first. */
  api.post('/api/focus/start', async ({ req, user }) => {
    const data = validate(await readJson(req), {
      project_id: f.int({ nullable: true }),
      task_id: f.int({ nullable: true }),
      domain: f.enum(DOMAINS, { default: 'work' }),
      label: f.str({ default: '', max: 200 }),
      kind: f.enum(['deep', 'admin', 'meeting', 'break'], { default: 'deep' }),
    });
    if (data.project_id) owned('projects', data.project_id, user.id);
    if (data.task_id) owned('tasks', data.task_id, user.id);

    const startedAt = nowIso();
    const id = tx(() => {
      const open = get('SELECT * FROM focus_sessions WHERE user_id = ? AND ended_at IS NULL', user.id);
      if (open) {
        const mins = Math.max(0, Math.round((Date.now() - new Date(open.started_at).getTime()) / 60000));
        run('UPDATE focus_sessions SET ended_at = ?, duration_min = ? WHERE id = ?', startedAt, mins, open.id);
      }
      return run(
        `INSERT INTO focus_sessions (user_id, project_id, task_id, domain, label, date, started_at, kind)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        user.id, data.project_id, data.task_id, data.domain, data.label, todayIso(), startedAt, data.kind
      ).lastInsertRowid;
    });
    return { session: get('SELECT * FROM focus_sessions WHERE id = ?', id) };
  });

  api.post('/api/focus/stop', async ({ req, user }) => {
    const body = await readJson(req);
    const open = get('SELECT * FROM focus_sessions WHERE user_id = ? AND ended_at IS NULL ORDER BY started_at DESC', user.id);
    if (!open) throw badRequest('No timer is running');
    const endedAt = nowIso();
    const mins = Math.max(0, Math.round((new Date(endedAt) - new Date(open.started_at)) / 60000));
    run(
      'UPDATE focus_sessions SET ended_at = ?, duration_min = ?, notes = ? WHERE id = ?',
      endedAt, mins, typeof body.notes === 'string' ? body.notes.slice(0, 2000) : open.notes, open.id
    );
    return { session: get('SELECT * FROM focus_sessions WHERE id = ?', open.id) };
  });

  api.post('/api/focus/cancel', ({ user }) => {
    const open = get('SELECT * FROM focus_sessions WHERE user_id = ? AND ended_at IS NULL', user.id);
    if (open) run('DELETE FROM focus_sessions WHERE id = ? AND user_id = ?', open.id, user.id);
    return { ok: true };
  });

  /** Manual entry, for time spent away from the app. */
  api.post('/api/focus', async ({ req, user }) => {
    const data = validate(await readJson(req), {
      project_id: f.int({ nullable: true }),
      task_id: f.int({ nullable: true }),
      domain: f.enum(DOMAINS, { default: 'work' }),
      label: f.str({ default: '', max: 200 }),
      date: f.date({ required: true }),
      duration_min: f.int({ required: true, min: 1, max: 1440 }),
      kind: f.enum(['deep', 'admin', 'meeting', 'break'], { default: 'deep' }),
      notes: f.str({ default: '', max: 2000 }),
    });
    if (data.project_id) owned('projects', data.project_id, user.id);
    const startedAt = `${data.date}T09:00:00.000Z`;
    const endedAt = new Date(new Date(startedAt).getTime() + data.duration_min * 60000).toISOString();
    const { lastInsertRowid } = run(
      `INSERT INTO focus_sessions (user_id, project_id, task_id, domain, label, date, started_at, ended_at, duration_min, kind, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      user.id, data.project_id, data.task_id, data.domain, data.label, data.date,
      startedAt, endedAt, data.duration_min, data.kind, data.notes
    );
    return { session: get('SELECT * FROM focus_sessions WHERE id = ?', lastInsertRowid) };
  });

  api.del('/api/focus/:id', ({ params, user }) => {
    const id = requireId(params.id);
    owned('focus_sessions', id, user.id);
    run('DELETE FROM focus_sessions WHERE id = ? AND user_id = ?', id, user.id);
    return { ok: true };
  });

  /* ============================ WORKOUTS ============================ */

  function hydrateWorkout(workout) {
    const exercises = all('SELECT * FROM exercises WHERE workout_id = ? ORDER BY order_idx, id', workout.id);
    const ids = exercises.map((e) => e.id);
    const sets = ids.length
      ? all(
          `SELECT * FROM sets WHERE exercise_id IN (${ids.map(() => '?').join(',')}) ORDER BY set_idx, id`,
          ...ids
        )
      : [];
    const byExercise = new Map();
    for (const s of sets) {
      if (!byExercise.has(s.exercise_id)) byExercise.set(s.exercise_id, []);
      byExercise.get(s.exercise_id).push({ ...s, is_warmup: !!s.is_warmup });
    }
    const withSets = exercises.map((e) => {
      const list = byExercise.get(e.id) || [];
      const working = list.filter((s) => !s.is_warmup);
      return {
        ...e,
        sets: list,
        volume: working.reduce((sum, s) => sum + s.reps * s.weight_kg, 0),
        topSet: working.reduce((best, s) => (e1rm(s.weight_kg, s.reps) > e1rm(best?.weight_kg ?? 0, best?.reps ?? 0) ? s : best), null),
      };
    });
    return {
      ...workout,
      exercises: withSets,
      volume: withSets.reduce((sum, e) => sum + e.volume, 0),
      set_count: withSets.reduce((sum, e) => sum + e.sets.filter((s) => !s.is_warmup).length, 0),
    };
  }

  api.get('/api/workouts', ({ user, query }) => {
    const from = query.from || addDays(todayIso(), -120);
    const to = query.to || todayIso();
    const workouts = all(
      'SELECT * FROM workouts WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date DESC, id DESC LIMIT 300',
      user.id, from, to
    );
    return { from, to, workouts: workouts.map(hydrateWorkout) };
  });

  /** Best estimated 1RM per lift. Registered before `/:id` so it wins the match. */
  api.get('/api/workouts/records', ({ user }) => {
    const rows = all(
      `SELECT e.name, s.reps, s.weight_kg, w.date
         FROM sets s
         JOIN exercises e ON e.id = s.exercise_id
         JOIN workouts  w ON w.id = e.workout_id
        WHERE s.user_id = ? AND s.is_warmup = 0 AND s.reps > 0 AND s.weight_kg > 0`,
      user.id
    );
    const best = new Map();
    for (const r of rows) {
      const est = e1rm(r.weight_kg, r.reps);
      const cur = best.get(r.name);
      if (!cur || est > cur.e1rm) best.set(r.name, { ...r, e1rm: Math.round(est * 10) / 10 });
    }
    return {
      records: [...best.entries()]
        .map(([name, r]) => ({ name, ...r }))
        .sort((a, b) => b.e1rm - a.e1rm),
    };
  });

  api.get('/api/workouts/:id', ({ params, user }) => {
    const id = requireId(params.id);
    return { workout: hydrateWorkout(owned('workouts', id, user.id)) };
  });

  /**
   * Create or replace a whole workout in one transaction — the UI edits a
   * session as a single document, so a partial save is never valid.
   */
  async function saveWorkout(req, user, existingId = null) {
    const body = await readJson(req);
    const head = validate(body, {
      date: f.date({ required: true }),
      kind: f.str({ default: 'push', max: 40 }),
      title: f.str({ default: '', max: 120 }),
      duration_min: f.int({ default: 0, min: 0, max: 600 }),
      rpe: f.num({ nullable: true, min: 1, max: 10 }),
      notes: f.str({ default: '', max: 2000 }),
    });

    if (!Array.isArray(body.exercises)) throw badRequest('"exercises" must be an array');
    const exercises = body.exercises.map((raw, index) => {
      const ex = validate(raw ?? {}, {
        name: f.str({ required: true, min: 1, max: 120 }),
        muscle: f.str({ default: '', max: 40 }),
      });
      if (!Array.isArray(raw.sets)) throw badRequest(`Exercise "${ex.name}" needs a sets array`);
      const sets = raw.sets.map((s) =>
        validate(s ?? {}, {
          reps: f.int({ default: 0, min: 0, max: 1000 }),
          weight_kg: f.num({ default: 0, min: 0, max: 1000 }),
          rpe: f.num({ nullable: true, min: 1, max: 10 }),
          is_warmup: f.bool({ default: 0 }),
        })
      );
      return { ...ex, order_idx: index, sets };
    });

    return tx(() => {
      let workoutId = existingId;
      if (workoutId) {
        run(
          'UPDATE workouts SET date = ?, kind = ?, title = ?, duration_min = ?, rpe = ?, notes = ? WHERE id = ? AND user_id = ?',
          head.date, head.kind, head.title, head.duration_min, head.rpe, head.notes, workoutId, user.id
        );
        run('DELETE FROM exercises WHERE workout_id = ? AND user_id = ?', workoutId, user.id);
      } else {
        workoutId = run(
          `INSERT INTO workouts (user_id, date, kind, title, duration_min, rpe, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          user.id, head.date, head.kind, head.title, head.duration_min, head.rpe, head.notes, nowIso()
        ).lastInsertRowid;
      }

      for (const ex of exercises) {
        const exId = run(
          'INSERT INTO exercises (user_id, workout_id, name, muscle, order_idx) VALUES (?, ?, ?, ?, ?)',
          user.id, workoutId, ex.name, ex.muscle, ex.order_idx
        ).lastInsertRowid;
        ex.sets.forEach((s, i) => {
          run(
            'INSERT INTO sets (user_id, exercise_id, set_idx, reps, weight_kg, rpe, is_warmup) VALUES (?, ?, ?, ?, ?, ?, ?)',
            user.id, exId, i + 1, s.reps, s.weight_kg, s.rpe, s.is_warmup
          );
        });
      }
      return workoutId;
    });
  }

  api.post('/api/workouts', async ({ req, user }) => {
    const id = await saveWorkout(req, user);
    return { workout: hydrateWorkout(get('SELECT * FROM workouts WHERE id = ?', id)) };
  });

  api.put('/api/workouts/:id', async ({ req, params, user }) => {
    const id = requireId(params.id);
    owned('workouts', id, user.id);
    await saveWorkout(req, user, id);
    return { workout: hydrateWorkout(get('SELECT * FROM workouts WHERE id = ?', id)) };
  });

  api.del('/api/workouts/:id', ({ params, user }) => {
    const id = requireId(params.id);
    owned('workouts', id, user.id);
    run('DELETE FROM workouts WHERE id = ? AND user_id = ?', id, user.id);
    return { ok: true };
  });

  /* ============================= SPORTS ============================= */

  const sportSchema = {
    date: f.date({ required: true }),
    sport: f.str({ required: true, min: 1, max: 60 }),
    duration_min: f.int({ default: 0, min: 0, max: 1440 }),
    distance_km: f.num({ nullable: true, min: 0, max: 1000 }),
    intensity: f.int({ default: 3, min: 1, max: 5 }),
    calories: f.int({ nullable: true, min: 0, max: 20000 }),
    notes: f.str({ default: '', max: 2000 }),
  };

  api.get('/api/sports', ({ user, query }) => {
    const from = query.from || addDays(todayIso(), -180);
    const to = query.to || todayIso();
    return {
      from, to,
      sessions: all(
        'SELECT * FROM sport_sessions WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date DESC, id DESC LIMIT 400',
        user.id, from, to
      ),
    };
  });

  api.post('/api/sports', async ({ req, user }) => {
    const d = validate(await readJson(req), sportSchema);
    const { lastInsertRowid } = run(
      `INSERT INTO sport_sessions (user_id, date, sport, duration_min, distance_km, intensity, calories, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      user.id, d.date, d.sport, d.duration_min, d.distance_km, d.intensity, d.calories, d.notes
    );
    return { session: get('SELECT * FROM sport_sessions WHERE id = ?', lastInsertRowid) };
  });

  api.patch('/api/sports/:id', async ({ req, params, user }) => {
    const id = requireId(params.id);
    owned('sport_sessions', id, user.id);
    const d = validate(await readJson(req), sportSchema, { partial: true });
    const { clause, params: values } = buildUpdate(d, Object.keys(sportSchema));
    run(`UPDATE sport_sessions SET ${clause} WHERE id = ? AND user_id = ?`, ...values, id, user.id);
    return { session: get('SELECT * FROM sport_sessions WHERE id = ?', id) };
  });

  api.del('/api/sports/:id', ({ params, user }) => {
    const id = requireId(params.id);
    owned('sport_sessions', id, user.id);
    run('DELETE FROM sport_sessions WHERE id = ? AND user_id = ?', id, user.id);
    return { ok: true };
  });

  /* ============================= HEALTH ============================= */

  api.get('/api/health', ({ user, query }) => {
    const from = query.from || addDays(todayIso(), -89);
    const to = query.to || todayIso();
    return {
      from, to,
      logs: all(
        'SELECT * FROM health_logs WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date DESC',
        user.id, from, to
      ),
      today: get('SELECT * FROM health_logs WHERE user_id = ? AND date = ?', user.id, todayIso()) || null,
    };
  });

  /** One row per day — upsert so the day form can be saved repeatedly. */
  api.put('/api/health/:date', async ({ req, params, user }) => {
    const date = validate({ date: params.date }, { date: f.date({ required: true }) }).date;
    const d = validate(await readJson(req), {
      sleep_hours: f.num({ nullable: true, min: 0, max: 24 }),
      sleep_quality: f.int({ nullable: true, min: 1, max: 5 }),
      bed_time: f.time({ nullable: true }),
      wake_time: f.time({ nullable: true }),
      weight_kg: f.num({ nullable: true, min: 20, max: 400 }),
      body_fat: f.num({ nullable: true, min: 1, max: 70 }),
      water_ml: f.int({ nullable: true, min: 0, max: 20000 }),
      steps: f.int({ nullable: true, min: 0, max: 200000 }),
      mood: f.int({ nullable: true, min: 1, max: 5 }),
      energy: f.int({ nullable: true, min: 1, max: 5 }),
      stress: f.int({ nullable: true, min: 1, max: 5 }),
      notes: f.str({ default: '', max: 2000 }),
    }, { partial: true });

    const existing = get('SELECT * FROM health_logs WHERE user_id = ? AND date = ?', user.id, date);
    if (!existing) {
      run('INSERT INTO health_logs (user_id, date) VALUES (?, ?)', user.id, date);
    }
    if (Object.keys(d).length) {
      const { clause, params: values } = buildUpdate(d, [
        'sleep_hours', 'sleep_quality', 'bed_time', 'wake_time', 'weight_kg', 'body_fat',
        'water_ml', 'steps', 'mood', 'energy', 'stress', 'notes',
      ]);
      run(`UPDATE health_logs SET ${clause} WHERE user_id = ? AND date = ?`, ...values, user.id, date);
    }
    return { log: get('SELECT * FROM health_logs WHERE user_id = ? AND date = ?', user.id, date) };
  });

  api.del('/api/health/:date', ({ params, user }) => {
    const date = validate({ date: params.date }, { date: f.date({ required: true }) }).date;
    const existing = get('SELECT id FROM health_logs WHERE user_id = ? AND date = ?', user.id, date);
    if (!existing) throw notFound();
    run('DELETE FROM health_logs WHERE user_id = ? AND date = ?', user.id, date);
    return { ok: true };
  });
}

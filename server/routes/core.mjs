import { all, get, run, tx, nowIso } from '../db.mjs';
import { readJson, notFound, badRequest } from '../http.mjs';
import { validate, f, buildUpdate, requireId } from '../validate.mjs';
import { todayIso, addDays, weekdayOf, startOfWeek } from '../lib/dates.mjs';

export const DOMAINS = ['work', 'research', 'fitness', 'sports', 'health', 'learning', 'finance', 'personal'];

/** Fetch a row that must belong to the signed-in user. */
export function owned(table, id, userId) {
  const rec = get(`SELECT * FROM ${table} WHERE id = ? AND user_id = ?`, id, userId);
  if (!rec) throw notFound();
  return rec;
}

/* ------------------------------------------------------------------ *
 * Habit streaks
 * ------------------------------------------------------------------ */

/**
 * A streak counts *scheduled* days only, so skipping a Sunday on a
 * weekday-only habit does not break it. Weekly habits count whole weeks that
 * hit their target.
 */
export function computeStreaks(habit, logs, today = todayIso()) {
  const done = new Set(logs.filter((l) => l.done).map((l) => l.date));

  if (habit.cadence === 'weekly') {
    const perWeek = new Map();
    for (const date of done) {
      const key = startOfWeek(date);
      perWeek.set(key, (perWeek.get(key) || 0) + 1);
    }
    const target = Math.max(1, habit.target_per_week);
    let current = 0;
    let cursor = startOfWeek(today);
    // The in-flight week only breaks a streak once it is over.
    if ((perWeek.get(cursor) || 0) < target) cursor = addDays(cursor, -7);
    while ((perWeek.get(cursor) || 0) >= target) { current += 1; cursor = addDays(cursor, -7); }

    const weeks = [...perWeek.keys()].sort();
    let longest = 0;
    let runLen = 0;
    let prev = null;
    for (const w of weeks) {
      if ((perWeek.get(w) || 0) < target) { runLen = 0; prev = w; continue; }
      runLen = prev && addDays(prev, 7) === w ? runLen + 1 : 1;
      longest = Math.max(longest, runLen);
      prev = w;
    }
    return { current, longest, scheduledToday: true };
  }

  const weekdays = new Set(String(habit.weekdays || '0,1,2,3,4,5,6').split(',').map(Number));
  const scheduled = (date) => habit.cadence === 'daily' || weekdays.has(weekdayOf(date));

  let current = 0;
  let cursor = today;
  // Today not being logged yet shouldn't zero out a live streak.
  if (scheduled(cursor) && !done.has(cursor)) cursor = addDays(cursor, -1);
  let guard = 0;
  while (guard++ < 3650) {
    if (!scheduled(cursor)) { cursor = addDays(cursor, -1); continue; }
    if (!done.has(cursor)) break;
    current += 1;
    cursor = addDays(cursor, -1);
  }

  const sorted = [...done].sort();
  let longest = 0;
  let runLen = 0;
  let prev = null;
  for (const date of sorted) {
    if (prev) {
      let step = addDays(prev, 1);
      let contiguous = true;
      let hops = 0;
      while (step < date && hops++ < 400) {
        if (scheduled(step)) { contiguous = false; break; }
        step = addDays(step, 1);
      }
      runLen = contiguous ? runLen + 1 : 1;
    } else {
      runLen = 1;
    }
    longest = Math.max(longest, runLen);
    prev = date;
  }

  return { current, longest, scheduledToday: scheduled(today) };
}

/* ------------------------------------------------------------------ *
 * Routes
 * ------------------------------------------------------------------ */

export default function registerCore(api) {
  /* ============================ PROJECTS ============================ */

  api.get('/api/projects', ({ user, query }) => {
    const includeArchived = query.archived === '1';
    const projects = all(
      `SELECT p.*,
              (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id)                        AS task_count,
              (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done')  AS task_done,
              (SELECT COALESCE(SUM(fs.duration_min),0) FROM focus_sessions fs
                 WHERE fs.project_id = p.id)                                                  AS minutes_total
         FROM projects p
        WHERE p.user_id = ? ${includeArchived ? '' : "AND p.status != 'archived'"}
        ORDER BY p.sort, p.created_at DESC`,
      user.id
    );
    return { projects };
  });

  api.post('/api/projects', async ({ req, user }) => {
    const data = validate(await readJson(req), {
      name: f.str({ required: true, min: 1, max: 120 }),
      domain: f.enum(DOMAINS, { default: 'work' }),
      status: f.enum(['active', 'paused', 'done', 'archived'], { default: 'active' }),
      description: f.str({ default: '', max: 2000 }),
      deadline: f.date({ nullable: true }),
      sort: f.int({ default: 0 }),
    });
    const { lastInsertRowid } = run(
      `INSERT INTO projects (user_id, name, domain, status, description, deadline, sort, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      user.id, data.name, data.domain, data.status, data.description, data.deadline, data.sort, nowIso()
    );
    return { project: get('SELECT * FROM projects WHERE id = ?', lastInsertRowid) };
  });

  api.patch('/api/projects/:id', async ({ req, params, user }) => {
    const id = requireId(params.id);
    owned('projects', id, user.id);
    const data = validate(await readJson(req), {
      name: f.str({ min: 1, max: 120 }),
      domain: f.enum(DOMAINS),
      status: f.enum(['active', 'paused', 'done', 'archived']),
      description: f.str({ max: 2000 }),
      deadline: f.date({ nullable: true }),
      sort: f.int(),
    }, { partial: true });
    const { clause, params: values } = buildUpdate(data, ['name', 'domain', 'status', 'description', 'deadline', 'sort']);
    run(`UPDATE projects SET ${clause} WHERE id = ? AND user_id = ?`, ...values, id, user.id);
    return { project: get('SELECT * FROM projects WHERE id = ?', id) };
  });

  api.del('/api/projects/:id', ({ params, user }) => {
    const id = requireId(params.id);
    owned('projects', id, user.id);
    run('DELETE FROM projects WHERE id = ? AND user_id = ?', id, user.id);
    return { ok: true };
  });

  /* ============================== TASKS ============================= */

  api.get('/api/tasks', ({ user, query }) => {
    const where = ['t.user_id = ?'];
    const args = [user.id];

    if (query.status && query.status !== 'all') { where.push('t.status = ?'); args.push(query.status); }
    if (query.project) { where.push('t.project_id = ?'); args.push(requireId(query.project, 'project')); }
    if (query.domain) { where.push('t.domain = ?'); args.push(query.domain); }
    // "Due" means still owed — a finished task is never outstanding, whatever
    // its due date says.
    if (query.due === 'today') {
      where.push("t.due_date <= ? AND t.status != 'done'");
      args.push(todayIso());
    }
    if (query.due === 'week') {
      where.push("t.due_date <= ? AND t.status != 'done'");
      args.push(addDays(todayIso(), 7));
    }
    if (query.search) { where.push('(t.title LIKE ? OR t.notes LIKE ?)'); args.push(`%${query.search}%`, `%${query.search}%`); }

    const tasks = all(
      `SELECT t.*, p.name AS project_name, p.domain AS project_domain
         FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
        WHERE ${where.join(' AND ')}
        ORDER BY CASE t.status WHEN 'doing' THEN 0 WHEN 'todo' THEN 1 ELSE 2 END,
                 t.due_date IS NULL, t.due_date, t.priority, t.sort, t.id DESC
        LIMIT 500`,
      ...args
    );
    return { tasks };
  });

  const taskSchema = {
    title: f.str({ required: true, min: 1, max: 300 }),
    notes: f.str({ default: '', max: 5000 }),
    project_id: f.int({ nullable: true }),
    domain: f.enum(DOMAINS, { default: 'work' }),
    priority: f.int({ default: 2, min: 1, max: 4 }),
    status: f.enum(['todo', 'doing', 'done'], { default: 'todo' }),
    due_date: f.date({ nullable: true }),
    estimate_min: f.int({ nullable: true, min: 0, max: 10000 }),
    sort: f.int({ default: 0 }),
  };

  api.post('/api/tasks', async ({ req, user }) => {
    const data = validate(await readJson(req), taskSchema);
    if (data.project_id) owned('projects', data.project_id, user.id);
    const { lastInsertRowid } = run(
      `INSERT INTO tasks (user_id, project_id, title, notes, domain, priority, status, due_date, estimate_min, sort, completed_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      user.id, data.project_id, data.title, data.notes, data.domain, data.priority,
      data.status, data.due_date, data.estimate_min, data.sort,
      data.status === 'done' ? nowIso() : null, nowIso()
    );
    return { task: get('SELECT * FROM tasks WHERE id = ?', lastInsertRowid) };
  });

  api.patch('/api/tasks/:id', async ({ req, params, user }) => {
    const id = requireId(params.id);
    const before = owned('tasks', id, user.id);
    const data = validate(await readJson(req), { ...taskSchema, title: f.str({ min: 1, max: 300 }) }, { partial: true });
    if (data.project_id) owned('projects', data.project_id, user.id);

    // Keep completed_at in step with status, both ways.
    if (data.status && data.status !== before.status) {
      data.completed_at = data.status === 'done' ? nowIso() : null;
    }
    const { clause, params: values } = buildUpdate(data, [
      'title', 'notes', 'project_id', 'domain', 'priority', 'status', 'due_date', 'estimate_min', 'sort', 'completed_at',
    ]);
    run(`UPDATE tasks SET ${clause} WHERE id = ? AND user_id = ?`, ...values, id, user.id);
    return { task: get('SELECT * FROM tasks WHERE id = ?', id) };
  });

  api.del('/api/tasks/:id', ({ params, user }) => {
    const id = requireId(params.id);
    owned('tasks', id, user.id);
    run('DELETE FROM tasks WHERE id = ? AND user_id = ?', id, user.id);
    return { ok: true };
  });

  /* ============================= HABITS ============================= */

  api.get('/api/habits', ({ user, query }) => {
    const from = query.from || addDays(todayIso(), -370);
    const to = query.to || todayIso();
    const habits = all(
      `SELECT * FROM habits WHERE user_id = ? ${query.archived === '1' ? '' : 'AND archived = 0'}
        ORDER BY sort, id`,
      user.id
    );
    const logs = all(
      `SELECT hl.* FROM habit_logs hl WHERE hl.user_id = ? AND hl.date BETWEEN ? AND ?`,
      user.id, from, to
    );

    const byHabit = new Map();
    for (const log of logs) {
      if (!byHabit.has(log.habit_id)) byHabit.set(log.habit_id, []);
      byHabit.get(log.habit_id).push(log);
    }

    const today = todayIso();
    return {
      from, to,
      habits: habits.map((h) => {
        const hLogs = byHabit.get(h.id) || [];
        const streaks = computeStreaks(h, hLogs, today);
        const windowStart = addDays(today, -29);
        const last30 = hLogs.filter((l) => l.done && l.date >= windowStart).length;
        return {
          ...h,
          weekdays: String(h.weekdays).split(',').map(Number),
          logs: hLogs.map((l) => ({ date: l.date, value: l.value, done: !!l.done, note: l.note })),
          todayLog: hLogs.find((l) => l.date === today) || null,
          streak: streaks.current,
          longestStreak: streaks.longest,
          scheduledToday: streaks.scheduledToday,
          last30,
        };
      }),
    };
  });

  const habitSchema = {
    name: f.str({ required: true, min: 1, max: 120 }),
    domain: f.enum(DOMAINS, { default: 'personal' }),
    cadence: f.enum(['daily', 'weekdays', 'weekly'], { default: 'daily' }),
    target_per_week: f.int({ default: 7, min: 1, max: 21 }),
    weekdays: f.str({ default: '0,1,2,3,4,5,6', max: 40 }),
    unit: f.str({ default: '', max: 20 }),
    target_value: f.num({ nullable: true, min: 0 }),
    archived: f.bool({ default: 0 }),
    sort: f.int({ default: 0 }),
  };

  api.post('/api/habits', async ({ req, user }) => {
    const data = validate(await readJson(req), habitSchema);
    const { lastInsertRowid } = run(
      `INSERT INTO habits (user_id, name, domain, cadence, target_per_week, weekdays, unit, target_value, archived, sort, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      user.id, data.name, data.domain, data.cadence, data.target_per_week, data.weekdays,
      data.unit, data.target_value, data.archived, data.sort, nowIso()
    );
    return { habit: get('SELECT * FROM habits WHERE id = ?', lastInsertRowid) };
  });

  api.patch('/api/habits/:id', async ({ req, params, user }) => {
    const id = requireId(params.id);
    owned('habits', id, user.id);
    const data = validate(await readJson(req), { ...habitSchema, name: f.str({ min: 1, max: 120 }) }, { partial: true });
    const { clause, params: values } = buildUpdate(data, [
      'name', 'domain', 'cadence', 'target_per_week', 'weekdays', 'unit', 'target_value', 'archived', 'sort',
    ]);
    run(`UPDATE habits SET ${clause} WHERE id = ? AND user_id = ?`, ...values, id, user.id);
    return { habit: get('SELECT * FROM habits WHERE id = ?', id) };
  });

  api.del('/api/habits/:id', ({ params, user }) => {
    const id = requireId(params.id);
    owned('habits', id, user.id);
    run('DELETE FROM habits WHERE id = ? AND user_id = ?', id, user.id);
    return { ok: true };
  });

  /** Toggle or set a single day. Sending done:false removes the log. */
  api.put('/api/habits/:id/log', async ({ req, params, user }) => {
    const id = requireId(params.id);
    const habit = owned('habits', id, user.id);
    const data = validate(await readJson(req), {
      date: f.date({ required: true }),
      done: f.bool({ default: 1 }),
      value: f.num({ default: 1, min: 0 }),
      note: f.str({ default: '', max: 500 }),
    });
    if (data.date > todayIso()) throw badRequest('Cannot log a habit in the future');

    if (!data.done) {
      run('DELETE FROM habit_logs WHERE habit_id = ? AND date = ? AND user_id = ?', id, data.date, user.id);
    } else {
      run(
        `INSERT INTO habit_logs (user_id, habit_id, date, value, done, note) VALUES (?, ?, ?, ?, 1, ?)
         ON CONFLICT(habit_id, date) DO UPDATE SET value = excluded.value, done = 1, note = excluded.note`,
        user.id, id, data.date, data.value, data.note
      );
    }

    const logs = all('SELECT * FROM habit_logs WHERE habit_id = ? AND user_id = ?', id, user.id);
    const streaks = computeStreaks(habit, logs);
    return {
      date: data.date,
      done: !!data.done,
      streak: streaks.current,
      longestStreak: streaks.longest,
    };
  });

  /** Reorder in one shot after a drag. */
  api.put('/api/habits/reorder', async ({ req, user }) => {
    const body = await readJson(req);
    if (!Array.isArray(body.ids)) throw badRequest('"ids" must be an array');
    tx(() => {
      body.ids.forEach((raw, index) => {
        run('UPDATE habits SET sort = ? WHERE id = ? AND user_id = ?', index, requireId(raw), user.id);
      });
    });
    return { ok: true };
  });
}

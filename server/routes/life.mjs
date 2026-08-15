import { all, get, run, nowIso } from '../db.mjs';
import { readJson, badRequest } from '../http.mjs';
import { validate, f, buildUpdate, requireId } from '../validate.mjs';
import { todayIso, addDays, monthKey } from '../lib/dates.mjs';
import { DOMAINS, owned } from './core.mjs';

export const EXPENSE_CATEGORIES = [
  'housing', 'food', 'transport', 'health', 'education', 'gym',
  'software', 'hardware', 'entertainment', 'family', 'savings', 'other',
];
export const INCOME_CATEGORIES = ['salary', 'freelance', 'client', 'scholarship', 'investment', 'gift', 'other'];

export default function registerLife(api) {
  /* ============================ COURSES ============================= */

  const courseSchema = {
    title: f.str({ required: true, min: 1, max: 200 }),
    provider: f.str({ default: '', max: 120 }),
    status: f.enum(['planned', 'active', 'paused', 'done'], { default: 'active' }),
    progress: f.num({ default: 0, min: 0 }),
    total_units: f.int({ default: 100, min: 1, max: 100000 }),
    unit_label: f.str({ default: 'lessons', max: 30 }),
    target_date: f.date({ nullable: true }),
    notes: f.str({ default: '', max: 4000 }),
  };

  api.get('/api/learning', ({ user, query }) => {
    const from = query.from || addDays(todayIso(), -89);
    const to = query.to || todayIso();
    return {
      from, to,
      courses: all('SELECT * FROM courses WHERE user_id = ? ORDER BY status, id DESC', user.id),
      sessions: all(
        `SELECT ss.*, c.title AS course_title FROM study_sessions ss
           LEFT JOIN courses c ON c.id = ss.course_id
          WHERE ss.user_id = ? AND ss.date BETWEEN ? AND ?
          ORDER BY ss.date DESC, ss.id DESC LIMIT 400`,
        user.id, from, to
      ),
      readings: all('SELECT * FROM readings WHERE user_id = ? ORDER BY status, id DESC LIMIT 300', user.id),
    };
  });

  api.post('/api/courses', async ({ req, user }) => {
    const d = validate(await readJson(req), courseSchema);
    const { lastInsertRowid } = run(
      `INSERT INTO courses (user_id, title, provider, status, progress, total_units, unit_label, target_date, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      user.id, d.title, d.provider, d.status, d.progress, d.total_units, d.unit_label, d.target_date, d.notes, nowIso()
    );
    return { course: get('SELECT * FROM courses WHERE id = ?', lastInsertRowid) };
  });

  api.patch('/api/courses/:id', async ({ req, params, user }) => {
    const id = requireId(params.id);
    owned('courses', id, user.id);
    const d = validate(await readJson(req), { ...courseSchema, title: f.str({ min: 1, max: 200 }) }, { partial: true });
    const { clause, params: values } = buildUpdate(d, Object.keys(courseSchema));
    run(`UPDATE courses SET ${clause} WHERE id = ? AND user_id = ?`, ...values, id, user.id);
    return { course: get('SELECT * FROM courses WHERE id = ?', id) };
  });

  api.del('/api/courses/:id', ({ params, user }) => {
    const id = requireId(params.id);
    owned('courses', id, user.id);
    run('DELETE FROM courses WHERE id = ? AND user_id = ?', id, user.id);
    return { ok: true };
  });

  /* ========================= STUDY SESSIONS ========================= */

  api.post('/api/study', async ({ req, user }) => {
    const d = validate(await readJson(req), {
      course_id: f.int({ nullable: true }),
      date: f.date({ required: true }),
      minutes: f.int({ required: true, min: 1, max: 1440 }),
      topic: f.str({ default: '', max: 200 }),
      notes: f.str({ default: '', max: 4000 }),
    });
    if (d.course_id) owned('courses', d.course_id, user.id);
    const { lastInsertRowid } = run(
      'INSERT INTO study_sessions (user_id, course_id, date, minutes, topic, notes) VALUES (?, ?, ?, ?, ?, ?)',
      user.id, d.course_id, d.date, d.minutes, d.topic, d.notes
    );
    return { session: get('SELECT * FROM study_sessions WHERE id = ?', lastInsertRowid) };
  });

  api.del('/api/study/:id', ({ params, user }) => {
    const id = requireId(params.id);
    owned('study_sessions', id, user.id);
    run('DELETE FROM study_sessions WHERE id = ? AND user_id = ?', id, user.id);
    return { ok: true };
  });

  /* ============================ READINGS ============================ */

  const readingSchema = {
    kind: f.enum(['paper', 'book', 'notes'], { default: 'paper' }),
    title: f.str({ required: true, min: 1, max: 300 }),
    authors: f.str({ default: '', max: 300 }),
    venue: f.str({ default: '', max: 200 }),
    year: f.int({ nullable: true, min: 1500, max: 2200 }),
    status: f.enum(['queued', 'reading', 'done', 'dropped'], { default: 'reading' }),
    rating: f.int({ nullable: true, min: 1, max: 5 }),
    progress: f.int({ default: 0, min: 0, max: 100000 }),
    total_pages: f.int({ nullable: true, min: 1, max: 100000 }),
    url: f.str({ default: '', max: 500 }),
    notes: f.str({ default: '', max: 8000 }),
  };

  api.post('/api/readings', async ({ req, user }) => {
    const d = validate(await readJson(req), readingSchema);
    const { lastInsertRowid } = run(
      `INSERT INTO readings (user_id, kind, title, authors, venue, year, status, rating, progress, total_pages, url, notes, started_at, finished_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      user.id, d.kind, d.title, d.authors, d.venue, d.year, d.status, d.rating, d.progress,
      d.total_pages, d.url, d.notes,
      d.status === 'reading' ? todayIso() : null,
      d.status === 'done' ? todayIso() : null,
      nowIso()
    );
    return { reading: get('SELECT * FROM readings WHERE id = ?', lastInsertRowid) };
  });

  api.patch('/api/readings/:id', async ({ req, params, user }) => {
    const id = requireId(params.id);
    const before = owned('readings', id, user.id);
    const d = validate(await readJson(req), { ...readingSchema, title: f.str({ min: 1, max: 300 }) }, { partial: true });
    if (d.status && d.status !== before.status) {
      if (d.status === 'done') d.finished_at = todayIso();
      if (d.status === 'reading' && !before.started_at) d.started_at = todayIso();
    }
    const { clause, params: values } = buildUpdate(d, [...Object.keys(readingSchema), 'started_at', 'finished_at']);
    run(`UPDATE readings SET ${clause} WHERE id = ? AND user_id = ?`, ...values, id, user.id);
    return { reading: get('SELECT * FROM readings WHERE id = ?', id) };
  });

  api.del('/api/readings/:id', ({ params, user }) => {
    const id = requireId(params.id);
    owned('readings', id, user.id);
    run('DELETE FROM readings WHERE id = ? AND user_id = ?', id, user.id);
    return { ok: true };
  });

  /* ============================ FINANCE ============================= */

  api.get('/api/finance', ({ user, query }) => {
    const from = query.from || `${monthKey(todayIso())}-01`;
    const to = query.to || todayIso();
    const transactions = all(
      `SELECT t.*, p.name AS project_name FROM transactions t
         LEFT JOIN projects p ON p.id = t.project_id
        WHERE t.user_id = ? AND t.date BETWEEN ? AND ?
        ORDER BY t.date DESC, t.id DESC LIMIT 800`,
      user.id, from, to
    );
    const byCategory = all(
      `SELECT category, type, currency, SUM(amount) AS total, COUNT(*) AS count
         FROM transactions WHERE user_id = ? AND date BETWEEN ? AND ?
        GROUP BY category, type, currency ORDER BY total DESC`,
      user.id, from, to
    );
    const monthly = all(
      `SELECT substr(date,1,7) AS month, type, currency, SUM(amount) AS total
         FROM transactions WHERE user_id = ? AND date >= ?
        GROUP BY month, type, currency ORDER BY month`,
      user.id, addDays(todayIso(), -365)
    );
    return {
      from, to,
      transactions,
      byCategory,
      monthly,
      budgets: all('SELECT * FROM budgets WHERE user_id = ? ORDER BY category', user.id),
      categories: { income: INCOME_CATEGORIES, expense: EXPENSE_CATEGORIES },
    };
  });

  const txSchema = {
    project_id: f.int({ nullable: true }),
    date: f.date({ required: true }),
    type: f.enum(['income', 'expense'], { default: 'expense' }),
    category: f.str({ required: true, max: 40 }),
    amount: f.num({ required: true, min: 0 }),
    currency: f.enum(['IRT', 'IRR', 'USD', 'EUR'], { default: 'IRT' }),
    account: f.str({ default: 'main', max: 40 }),
    note: f.str({ default: '', max: 500 }),
  };

  api.post('/api/transactions', async ({ req, user }) => {
    const d = validate(await readJson(req), txSchema);
    if (d.project_id) owned('projects', d.project_id, user.id);
    const { lastInsertRowid } = run(
      `INSERT INTO transactions (user_id, project_id, date, type, category, amount, currency, account, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      user.id, d.project_id, d.date, d.type, d.category, d.amount, d.currency, d.account, d.note
    );
    return { transaction: get('SELECT * FROM transactions WHERE id = ?', lastInsertRowid) };
  });

  api.patch('/api/transactions/:id', async ({ req, params, user }) => {
    const id = requireId(params.id);
    owned('transactions', id, user.id);
    const d = validate(await readJson(req), txSchema, { partial: true });
    const { clause, params: values } = buildUpdate(d, Object.keys(txSchema));
    run(`UPDATE transactions SET ${clause} WHERE id = ? AND user_id = ?`, ...values, id, user.id);
    return { transaction: get('SELECT * FROM transactions WHERE id = ?', id) };
  });

  api.del('/api/transactions/:id', ({ params, user }) => {
    const id = requireId(params.id);
    owned('transactions', id, user.id);
    run('DELETE FROM transactions WHERE id = ? AND user_id = ?', id, user.id);
    return { ok: true };
  });

  api.put('/api/budgets', async ({ req, user }) => {
    const d = validate(await readJson(req), {
      category: f.str({ required: true, max: 40 }),
      monthly_limit: f.num({ required: true, min: 0 }),
      currency: f.enum(['IRT', 'IRR', 'USD', 'EUR'], { default: 'IRT' }),
    });
    run(
      `INSERT INTO budgets (user_id, category, monthly_limit, currency) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, category) DO UPDATE SET monthly_limit = excluded.monthly_limit, currency = excluded.currency`,
      user.id, d.category, d.monthly_limit, d.currency
    );
    return { budgets: all('SELECT * FROM budgets WHERE user_id = ? ORDER BY category', user.id) };
  });

  api.del('/api/budgets/:category', ({ params, user }) => {
    run('DELETE FROM budgets WHERE user_id = ? AND category = ?', user.id, String(params.category).slice(0, 40));
    return { ok: true };
  });

  /* ============================== GOALS ============================= */

  const goalSchema = {
    title: f.str({ required: true, min: 1, max: 200 }),
    domain: f.enum(DOMAINS, { default: 'personal' }),
    period: f.enum(['year', 'quarter', 'month'], { default: 'quarter' }),
    period_key: f.str({ required: true, max: 12 }),
    target_value: f.num({ default: 100, min: 0 }),
    current_value: f.num({ default: 0, min: 0 }),
    unit: f.str({ default: '%', max: 20 }),
    status: f.enum(['active', 'done', 'missed', 'dropped'], { default: 'active' }),
    due_date: f.date({ nullable: true }),
    notes: f.str({ default: '', max: 4000 }),
  };

  api.get('/api/goals', ({ user, query }) => {
    const where = ['user_id = ?'];
    const args = [user.id];
    if (query.period) { where.push('period = ?'); args.push(query.period); }
    if (query.status && query.status !== 'all') { where.push('status = ?'); args.push(query.status); }
    return {
      goals: all(
        `SELECT * FROM goals WHERE ${where.join(' AND ')}
          ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, period_key DESC, id DESC`,
        ...args
      ),
    };
  });

  api.post('/api/goals', async ({ req, user }) => {
    const d = validate(await readJson(req), goalSchema);
    const { lastInsertRowid } = run(
      `INSERT INTO goals (user_id, title, domain, period, period_key, target_value, current_value, unit, status, due_date, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      user.id, d.title, d.domain, d.period, d.period_key, d.target_value, d.current_value,
      d.unit, d.status, d.due_date, d.notes, nowIso()
    );
    return { goal: get('SELECT * FROM goals WHERE id = ?', lastInsertRowid) };
  });

  api.patch('/api/goals/:id', async ({ req, params, user }) => {
    const id = requireId(params.id);
    owned('goals', id, user.id);
    const d = validate(await readJson(req), { ...goalSchema, title: f.str({ min: 1, max: 200 }), period_key: f.str({ max: 12 }) }, { partial: true });
    const { clause, params: values } = buildUpdate(d, Object.keys(goalSchema));
    run(`UPDATE goals SET ${clause} WHERE id = ? AND user_id = ?`, ...values, id, user.id);
    return { goal: get('SELECT * FROM goals WHERE id = ?', id) };
  });

  api.del('/api/goals/:id', ({ params, user }) => {
    const id = requireId(params.id);
    owned('goals', id, user.id);
    run('DELETE FROM goals WHERE id = ? AND user_id = ?', id, user.id);
    return { ok: true };
  });

  /* ============================= JOURNAL ============================ */

  api.get('/api/journal', ({ user, query }) => {
    const where = ['user_id = ?'];
    const args = [user.id];
    if (query.from) { where.push('date >= ?'); args.push(query.from); }
    if (query.to) { where.push('date <= ?'); args.push(query.to); }
    if (query.search) {
      where.push('(title LIKE ? OR body LIKE ? OR tags LIKE ? OR highlights LIKE ?)');
      const like = `%${query.search}%`;
      args.push(like, like, like, like);
    }
    return {
      entries: all(`SELECT * FROM journal_entries WHERE ${where.join(' AND ')} ORDER BY date DESC LIMIT 400`, ...args),
    };
  });

  api.put('/api/journal/:date', async ({ req, params, user }) => {
    const date = validate({ date: params.date }, { date: f.date({ required: true }) }).date;
    const d = validate(await readJson(req), {
      title: f.str({ default: '', max: 200 }),
      body: f.text({ default: '' }),
      highlights: f.str({ default: '', max: 4000 }),
      gratitude: f.str({ default: '', max: 4000 }),
      mood: f.int({ nullable: true, min: 1, max: 5 }),
      tags: f.str({ default: '', max: 300 }),
    });
    run(
      `INSERT INTO journal_entries (user_id, date, title, body, highlights, gratitude, mood, tags, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, date) DO UPDATE SET
         title = excluded.title, body = excluded.body, highlights = excluded.highlights,
         gratitude = excluded.gratitude, mood = excluded.mood, tags = excluded.tags`,
      user.id, date, d.title, d.body, d.highlights, d.gratitude, d.mood, d.tags, nowIso()
    );
    return { entry: get('SELECT * FROM journal_entries WHERE user_id = ? AND date = ?', user.id, date) };
  });

  api.del('/api/journal/:date', ({ params, user }) => {
    const date = validate({ date: params.date }, { date: f.date({ required: true }) }).date;
    run('DELETE FROM journal_entries WHERE user_id = ? AND date = ?', user.id, date);
    return { ok: true };
  });
}

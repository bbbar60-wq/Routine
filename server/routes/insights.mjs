import { all, get, run, tx, nowIso } from '../db.mjs';
import { readJson, badRequest } from '../http.mjs';
import { todayIso, addDays, startOfWeek, dateRange } from '../lib/dates.mjs';
import { computeStreaks, DOMAINS } from './core.mjs';

/**
 * One composite number per day, 0–4, driving the year heatmap. Each strand of
 * the routine contributes up to one point so no single habit can max the day.
 */
function activityLevel({ habitRatio, focusMin, trained, studiedMin }) {
  const score =
    Math.min(1, habitRatio) +
    Math.min(1, focusMin / 240) +
    (trained ? 1 : 0) +
    Math.min(1, studiedMin / 60);
  if (score <= 0) return 0;
  return Math.max(1, Math.min(4, Math.ceil(score)));
}

export default function registerInsights(api) {
  /* ============================ DASHBOARD =========================== */

  api.get('/api/dashboard', ({ user }) => {
    const today = todayIso();
    const weekStart = startOfWeek(today);
    const last7 = addDays(today, -6);
    const last30 = addDays(today, -29);

    /* --- habits --- */
    const habits = all('SELECT * FROM habits WHERE user_id = ? AND archived = 0 ORDER BY sort, id', user.id);
    const habitLogs = all(
      'SELECT * FROM habit_logs WHERE user_id = ? AND date >= ?',
      user.id, addDays(today, -400)
    );
    const logsByHabit = new Map();
    for (const l of habitLogs) {
      if (!logsByHabit.has(l.habit_id)) logsByHabit.set(l.habit_id, []);
      logsByHabit.get(l.habit_id).push(l);
    }
    const habitCards = habits.map((h) => {
      const logs = logsByHabit.get(h.id) || [];
      const s = computeStreaks(h, logs, today);
      return {
        id: h.id, name: h.name, domain: h.domain, unit: h.unit,
        cadence: h.cadence, target_value: h.target_value,
        doneToday: logs.some((l) => l.date === today && l.done),
        scheduledToday: s.scheduledToday,
        streak: s.current,
        longestStreak: s.longest,
      };
    });
    const dueToday = habitCards.filter((h) => h.scheduledToday);
    const habitsDone = dueToday.filter((h) => h.doneToday).length;

    /* --- tasks --- */
    const tasks = all(
      `SELECT t.*, p.name AS project_name FROM tasks t
         LEFT JOIN projects p ON p.id = t.project_id
        WHERE t.user_id = ? AND t.status != 'done'
          AND (t.due_date IS NULL OR t.due_date <= ?)
        ORDER BY t.due_date IS NULL, t.due_date, t.priority LIMIT 12`,
      user.id, today
    );
    const overdue = all(
      `SELECT COUNT(*) AS c FROM tasks WHERE user_id = ? AND status != 'done' AND due_date < ?`,
      user.id, today
    )[0].c;
    const completedToday = get(
      `SELECT COUNT(*) AS c FROM tasks WHERE user_id = ? AND status = 'done' AND substr(completed_at,1,10) = ?`,
      user.id, today
    ).c;

    /* --- focus --- */
    const running = get(
      `SELECT fs.*, p.name AS project_name FROM focus_sessions fs
         LEFT JOIN projects p ON p.id = fs.project_id
        WHERE fs.user_id = ? AND fs.ended_at IS NULL ORDER BY fs.started_at DESC`,
      user.id
    );
    const focusToday = all(
      'SELECT domain, kind, SUM(duration_min) AS minutes FROM focus_sessions WHERE user_id = ? AND date = ? GROUP BY domain, kind',
      user.id, today
    );
    const focusWeek = get(
      'SELECT COALESCE(SUM(duration_min),0) AS minutes FROM focus_sessions WHERE user_id = ? AND date >= ?',
      user.id, weekStart
    ).minutes;

    /* --- body & health --- */
    const healthToday = get('SELECT * FROM health_logs WHERE user_id = ? AND date = ?', user.id, today) || null;
    const lastWorkout = get('SELECT * FROM workouts WHERE user_id = ? ORDER BY date DESC, id DESC LIMIT 1', user.id) || null;
    const workoutsThisWeek = get(
      'SELECT COUNT(*) AS c FROM workouts WHERE user_id = ? AND date >= ?', user.id, weekStart
    ).c;
    const sportsThisWeek = get(
      'SELECT COUNT(*) AS c FROM sport_sessions WHERE user_id = ? AND date >= ?', user.id, weekStart
    ).c;

    /* --- 7-day momentum strip --- */
    const focusByDate = new Map(
      all('SELECT date, SUM(duration_min) AS m FROM focus_sessions WHERE user_id = ? AND date >= ? GROUP BY date', user.id, last30)
        .map((r) => [r.date, r.m])
    );
    const studyByDate = new Map(
      all('SELECT date, SUM(minutes) AS m FROM study_sessions WHERE user_id = ? AND date >= ? GROUP BY date', user.id, last30)
        .map((r) => [r.date, r.m])
    );
    const workoutDates = new Set(
      all('SELECT DISTINCT date FROM workouts WHERE user_id = ? AND date >= ?', user.id, last30).map((r) => r.date)
    );
    const habitDoneByDate = new Map();
    for (const l of habitLogs) {
      if (!l.done) continue;
      habitDoneByDate.set(l.date, (habitDoneByDate.get(l.date) || 0) + 1);
    }

    const momentum = dateRange(last7, today).map((date) => {
      const scheduled = habits.filter((h) => {
        if (h.cadence === 'daily' || h.cadence === 'weekly') return true;
        const days = String(h.weekdays).split(',').map(Number);
        return days.includes(new Date(`${date}T00:00:00Z`).getUTCDay());
      }).length;
      const done = habitDoneByDate.get(date) || 0;
      return {
        date,
        focusMin: focusByDate.get(date) || 0,
        studyMin: studyByDate.get(date) || 0,
        habitsDone: done,
        habitsScheduled: scheduled,
        trained: workoutDates.has(date),
        level: activityLevel({
          habitRatio: scheduled ? done / scheduled : 0,
          focusMin: focusByDate.get(date) || 0,
          trained: workoutDates.has(date),
          studiedMin: studyByDate.get(date) || 0,
        }),
      };
    });

    /* --- goals & deadlines --- */
    const goals = all(
      `SELECT * FROM goals WHERE user_id = ? AND status = 'active' ORDER BY period, period_key DESC LIMIT 8`,
      user.id
    );
    const deadlines = all(
      `SELECT id, name AS title, deadline AS date, domain, 'project' AS kind FROM projects
        WHERE user_id = ? AND deadline IS NOT NULL AND status = 'active' AND deadline >= ?
        UNION ALL
       SELECT id, title, due_date AS date, domain, 'task' AS kind FROM tasks
        WHERE user_id = ? AND due_date IS NOT NULL AND status != 'done' AND due_date >= ?
        ORDER BY date LIMIT 8`,
      user.id, today, user.id, today
    );

    const journalToday = get('SELECT * FROM journal_entries WHERE user_id = ? AND date = ?', user.id, today) || null;

    return {
      date: today,
      weekStart,
      habits: habitCards,
      habitsSummary: { done: habitsDone, scheduled: dueToday.length },
      tasks,
      tasksSummary: { overdue, completedToday },
      focus: {
        running: running || null,
        todayMinutes: focusToday.reduce((s, r) => s + r.minutes, 0),
        weekMinutes: focusWeek,
        byDomain: focusToday.reduce((acc, r) => {
          acc[r.domain] = (acc[r.domain] || 0) + r.minutes;
          return acc;
        }, {}),
      },
      health: healthToday,
      training: { lastWorkout, workoutsThisWeek, sportsThisWeek },
      momentum,
      goals,
      deadlines,
      journalToday,
    };
  });

  /* ============================ ANALYTICS =========================== */

  api.get('/api/analytics', ({ user, query }) => {
    const to = query.to || todayIso();
    const days = Math.min(400, Math.max(7, Number(query.days) || 90));
    const from = query.from || addDays(to, -(days - 1));

    const timeByDomain = all(
      `SELECT date, domain, SUM(duration_min) AS minutes FROM focus_sessions
        WHERE user_id = ? AND date BETWEEN ? AND ? GROUP BY date, domain ORDER BY date`,
      user.id, from, to
    );
    const timeTotals = all(
      `SELECT domain, SUM(duration_min) AS minutes FROM focus_sessions
        WHERE user_id = ? AND date BETWEEN ? AND ? GROUP BY domain ORDER BY minutes DESC`,
      user.id, from, to
    );

    const habits = all('SELECT * FROM habits WHERE user_id = ? AND archived = 0', user.id);
    const habitLogs = all(
      'SELECT habit_id, date, done FROM habit_logs WHERE user_id = ? AND date BETWEEN ? AND ?',
      user.id, from, to
    );
    const habitCompletion = habits.map((h) => {
      const logs = habitLogs.filter((l) => l.habit_id === h.id && l.done);
      const scheduled = dateRange(from, to).filter((d) => {
        if (h.cadence === 'daily' || h.cadence === 'weekly') return true;
        return String(h.weekdays).split(',').map(Number).includes(new Date(`${d}T00:00:00Z`).getUTCDay());
      }).length;
      return {
        id: h.id, name: h.name, domain: h.domain,
        done: logs.length, scheduled,
        rate: scheduled ? Math.round((logs.length / scheduled) * 100) : 0,
      };
    }).sort((a, b) => b.rate - a.rate);

    const volumeByWeek = all(
      `SELECT w.date, SUM(s.reps * s.weight_kg) AS volume, COUNT(DISTINCT w.id) AS sessions
         FROM workouts w
         JOIN exercises e ON e.workout_id = w.id
         JOIN sets s ON s.exercise_id = e.id AND s.is_warmup = 0
        WHERE w.user_id = ? AND w.date BETWEEN ? AND ?
        GROUP BY w.date ORDER BY w.date`,
      user.id, from, to
    );
    const weeklyVolume = [];
    for (const r of volumeByWeek) {
      const week = startOfWeek(r.date);
      const last = weeklyVolume[weeklyVolume.length - 1];
      if (last && last.week === week) { last.volume += r.volume; last.sessions += r.sessions; }
      else weeklyVolume.push({ week, volume: r.volume, sessions: r.sessions });
    }

    const health = all(
      `SELECT date, sleep_hours, mood, energy, weight_kg, steps, water_ml
         FROM health_logs WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date`,
      user.id, from, to
    );

    const sports = all(
      `SELECT sport, COUNT(*) AS sessions, SUM(duration_min) AS minutes, SUM(COALESCE(distance_km,0)) AS distance
         FROM sport_sessions WHERE user_id = ? AND date BETWEEN ? AND ?
        GROUP BY sport ORDER BY minutes DESC`,
      user.id, from, to
    );

    const finance = all(
      `SELECT substr(date,1,7) AS month, type, currency, SUM(amount) AS total
         FROM transactions WHERE user_id = ? AND date BETWEEN ? AND ?
        GROUP BY month, type, currency ORDER BY month`,
      user.id, from, to
    );

    const study = all(
      'SELECT date, SUM(minutes) AS minutes FROM study_sessions WHERE user_id = ? AND date BETWEEN ? AND ? GROUP BY date ORDER BY date',
      user.id, from, to
    );

    /* --- year heatmap (always a full 371-day window, independent of range) --- */
    const heatTo = todayIso();
    const heatFrom = addDays(startOfWeek(heatTo), -364);
    const focusMap = new Map(
      all('SELECT date, SUM(duration_min) AS m FROM focus_sessions WHERE user_id = ? AND date >= ? GROUP BY date', user.id, heatFrom)
        .map((r) => [r.date, r.m])
    );
    const studyMap = new Map(
      all('SELECT date, SUM(minutes) AS m FROM study_sessions WHERE user_id = ? AND date >= ? GROUP BY date', user.id, heatFrom)
        .map((r) => [r.date, r.m])
    );
    const trainSet = new Set(
      all('SELECT DISTINCT date FROM workouts WHERE user_id = ? AND date >= ?', user.id, heatFrom).map((r) => r.date)
    );
    const heatLogs = all('SELECT date, COUNT(*) AS c FROM habit_logs WHERE user_id = ? AND date >= ? AND done = 1 GROUP BY date', user.id, heatFrom);
    const habitMap = new Map(heatLogs.map((r) => [r.date, r.c]));
    const habitCount = Math.max(1, habits.length);

    const heatmap = dateRange(heatFrom, heatTo).map((date) => {
      const focusMin = focusMap.get(date) || 0;
      const studiedMin = studyMap.get(date) || 0;
      const trained = trainSet.has(date);
      const habitRatio = (habitMap.get(date) || 0) / habitCount;
      return {
        date,
        level: activityLevel({ habitRatio, focusMin, trained, studiedMin }),
        focusMin, studiedMin, trained,
        habitsDone: habitMap.get(date) || 0,
      };
    });

    return {
      from, to,
      timeByDomain, timeTotals,
      habitCompletion,
      weeklyVolume,
      health,
      sports,
      finance,
      study,
      heatmap,
      domains: DOMAINS,
    };
  });

  /* ========================= EXPORT / IMPORT ======================== */

  const TABLES = [
    'projects', 'tasks', 'habits', 'habit_logs', 'focus_sessions',
    'workouts', 'exercises', 'sets', 'sport_sessions', 'health_logs',
    'courses', 'study_sessions', 'readings', 'transactions', 'budgets',
    'goals', 'journal_entries',
  ];

  api.get('/api/export', ({ user }) => {
    const data = {};
    for (const table of TABLES) {
      data[table] = all(`SELECT * FROM ${table} WHERE user_id = ?`, user.id);
    }
    return {
      exportedAt: nowIso(),
      version: 1,
      user: { name: user.name, email: user.email },
      data,
    };
  });

  /**
   * Replaces everything the signed-in user owns. Runs in one transaction so a
   * malformed payload cannot leave a half-restored account behind.
   */
  api.post('/api/import', async ({ req, user }) => {
    const body = await readJson(req);
    if (!body.data || typeof body.data !== 'object') throw badRequest('Missing "data"');

    const counts = tx(() => {
      // Children go first; foreign keys cascade but explicit order keeps it clear.
      for (const table of [...TABLES].reverse()) {
        run(`DELETE FROM ${table} WHERE user_id = ?`, user.id);
      }
      const inserted = {};
      for (const table of TABLES) {
        const list = body.data[table];
        if (!Array.isArray(list)) continue;
        let n = 0;
        for (const raw of list) {
          if (!raw || typeof raw !== 'object') continue;
          const record = { ...raw, user_id: user.id };
          const cols = Object.keys(record).filter((c) => c !== 'rowid');
          const sql = `INSERT OR IGNORE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`;
          try {
            run(sql, ...cols.map((c) => {
              const v = record[c];
              return typeof v === 'boolean' ? (v ? 1 : 0) : v;
            }));
            n += 1;
          } catch {
            // Skip rows the schema rejects rather than failing the whole restore.
          }
        }
        inserted[table] = n;
      }
      return inserted;
    });

    return { imported: counts };
  });

  /** Wipe every record but keep the account. */
  api.post('/api/reset', ({ user }) => {
    tx(() => {
      for (const table of [...TABLES].reverse()) run(`DELETE FROM ${table} WHERE user_id = ?`, user.id);
    });
    return { ok: true };
  });
}

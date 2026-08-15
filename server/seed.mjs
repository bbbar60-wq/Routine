/**
 * Seeds a working account with ~140 days of plausible history so every chart
 * and streak in the app has something real to render.
 *
 *   node server/seed.mjs            # seed only if the database is empty
 *   node server/seed.mjs --reset    # wipe this user's data and reseed
 */
import { db, all, get, run, tx, nowIso } from './db.mjs';
import { hashPassword } from './auth.mjs';
import { todayIso, addDays, weekdayOf, dateRange, monthKey } from './lib/dates.mjs';

const RESET = process.argv.includes('--reset');

const EMAIL = process.env.SEED_EMAIL || 'rezabz2005@gmail.com';
const NAME = process.env.SEED_NAME || 'Reza';
const PASSWORD = process.env.SEED_PASSWORD || 'routine2026';

/* Deterministic PRNG so reseeding produces the same history. */
let seedState = 20260815;
function rnd() {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296;
  return seedState / 4294967296;
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (lo, hi) => lo + rnd() * (hi - lo);
const int = (lo, hi) => Math.round(between(lo, hi));
const chance = (p) => rnd() < p;

const TODAY = todayIso();
const START = addDays(TODAY, -139);
const DAYS = dateRange(START, TODAY);

/* ------------------------------------------------------------------ */

function ensureUser() {
  let user = get('SELECT * FROM users WHERE email = ?', EMAIL);
  if (user) return user;
  const settings = {
    theme: 'dark', calendar: 'both', weekStart: 6, currency: 'IRT', units: 'metric',
    dailyFocusGoalMin: 300, waterGoalMl: 2500, sleepGoalHours: 7.5,
  };
  const { lastInsertRowid } = run(
    'INSERT INTO users (email, name, password_hash, settings, created_at) VALUES (?, ?, ?, ?, ?)',
    EMAIL, NAME, hashPassword(PASSWORD), JSON.stringify(settings), nowIso()
  );
  return get('SELECT * FROM users WHERE id = ?', lastInsertRowid);
}

const TABLES = [
  'journal_entries', 'goals', 'budgets', 'transactions', 'readings', 'study_sessions',
  'courses', 'health_logs', 'sport_sessions', 'sets', 'exercises', 'workouts',
  'focus_sessions', 'habit_logs', 'habits', 'tasks', 'projects',
];

function wipe(userId) {
  for (const t of TABLES) run(`DELETE FROM ${t} WHERE user_id = ?`, userId);
}

/* ------------------------------------------------------------------ */

function seed(userId) {
  /* ---------------- projects ---------------- */
  const projects = [
    ['PI-ConvRNN — droplet collision', 'research', 'active', 'Physics-informed ConvRNN for two-droplet VOF collision. Hard constraints, blind (no CFD data). Target: capillary oscillation after merge.', addDays(TODAY, 46)],
    ['Odaroo — online pharmacy', 'work', 'active', 'Custom rebuild of the Dr. Aminian pharmacy storefront: Next.js BFF + Django API.', addDays(TODAY, 24)],
    ['Airfoil Simulator', 'work', 'active', 'Hess–Smith panel method demo. Page 3 workspace still unspecified.', addDays(TODAY, 61)],
    ['PEXI', 'work', 'paused', 'Django + React baseline stack.', null],
    ['Thesis & papers', 'research', 'active', 'Writing up the coalescence-regime results.', addDays(TODAY, 88)],
  ];
  const projectIds = projects.map(([name, domain, status, description, deadline], i) =>
    run(
      'INSERT INTO projects (user_id, name, domain, status, description, deadline, sort, created_at) VALUES (?,?,?,?,?,?,?,?)',
      userId, name, domain, status, description, deadline, i, nowIso()
    ).lastInsertRowid
  );
  const [PI, ODAROO, AIRFOIL, PEXI, THESIS] = projectIds;

  /* ---------------- tasks ---------------- */
  const tasks = [
    ['Run virial-identity training on GPU', PI, 'research', 1, 'doing', addDays(TODAY, 1), 240],
    ['Re-validate impulse low-pass at sigma=8', PI, 'research', 1, 'todo', addDays(TODAY, 2), 90],
    ['Write up coalescence regime results', THESIS, 'research', 2, 'todo', addDays(TODAY, 9), 300],
    ['Digitise Qian & Law Fig. 4 cases', THESIS, 'research', 3, 'todo', addDays(TODAY, 14), 120],
    ['Fix category product_count on nested nodes', ODAROO, 'work', 1, 'todo', TODAY, 60],
    ['Playwright: RTL + touch-target sweep', ODAROO, 'work', 2, 'doing', addDays(TODAY, 3), 120],
    ['Wire admin order pipeline to Django', ODAROO, 'work', 2, 'todo', addDays(TODAY, 5), 180],
    ['Ship sitemap + robots to staging', ODAROO, 'work', 3, 'todo', addDays(TODAY, 8), 45],
    ['Spec page 3 workspace', AIRFOIL, 'work', 2, 'todo', addDays(TODAY, 12), 90],
    ['Replace placeholder reference data', AIRFOIL, 'work', 3, 'todo', addDays(TODAY, 20), 120],
    ['Renew gym membership', null, 'fitness', 2, 'todo', addDays(TODAY, 4), 20],
    ['Book dentist appointment', null, 'health', 3, 'todo', addDays(TODAY, 6), 15],
    ['Read Tanguy 2005 level-set paper', THESIS, 'learning', 2, 'todo', addDays(TODAY, 2), 90],
    ['Update PEXI dependencies', PEXI, 'work', 4, 'todo', null, 60],
    ['Plan next quarter goals', null, 'personal', 3, 'todo', addDays(TODAY, 7), 45],
  ];
  for (const [title, projectId, domain, priority, status, due, est] of tasks) {
    run(
      `INSERT INTO tasks (user_id, project_id, title, notes, domain, priority, status, due_date, estimate_min, sort, completed_at, created_at)
       VALUES (?,?,?,'',?,?,?,?,?,0,NULL,?)`,
      userId, projectId, title, domain, priority, status, due, est, nowIso()
    );
  }
  // A trail of finished work so "completed" charts aren't empty.
  for (let i = 0; i < 64; i++) {
    const date = pick(DAYS);
    run(
      `INSERT INTO tasks (user_id, project_id, title, notes, domain, priority, status, due_date, estimate_min, sort, completed_at, created_at)
       VALUES (?,?,?,'',?,?, 'done', ?, ?, 0, ?, ?)`,
      userId,
      pick(projectIds),
      pick([
        'Fix rupture sub-cycling regression', 'Review PR comments', 'Refactor serializer',
        'Debug mass-drift certificate', 'Answer client email', 'Update seed script',
        'Rewrite category filter', 'Add axe a11y checks', 'Tune LR schedule',
        'Patch OTP throttle bucket', 'Profile field solve', 'Write unit test for streaks',
      ]),
      pick(['work', 'research', 'learning']),
      int(1, 4), date, int(20, 180), `${date}T${String(int(9, 22)).padStart(2, '0')}:12:00.000Z`, nowIso()
    );
  }

  /* ---------------- habits ---------------- */
  const habits = [
    ['Deep work block', 'work', 'weekdays', 5, '0,1,2,3,4', '', null, 0.86],
    ['Gym', 'fitness', 'weekly', 4, '0,1,2,3,4,5,6', 'session', 1, 0.72],
    ['Read a paper', 'learning', 'weekly', 4, '0,1,2,3,4,5,6', 'paper', 1, 0.68],
    ['Water 2.5L', 'health', 'daily', 7, '0,1,2,3,4,5,6', 'L', 2.5, 0.79],
    ['Sleep before 01:00', 'health', 'daily', 7, '0,1,2,3,4,5,6', '', null, 0.61],
    ['English practice', 'learning', 'weekdays', 5, '0,1,2,3,4', 'min', 20, 0.7],
    ['Stretch / mobility', 'fitness', 'daily', 7, '0,1,2,3,4,5,6', 'min', 10, 0.66],
    ['Journal', 'personal', 'daily', 7, '0,1,2,3,4,5,6', '', null, 0.74],
    ['No phone first hour', 'personal', 'daily', 7, '0,1,2,3,4,5,6', '', null, 0.58],
  ];
  const habitRows = habits.map(([name, domain, cadence, perWeek, weekdays, unit, target], i) => ({
    id: run(
      `INSERT INTO habits (user_id, name, domain, cadence, target_per_week, weekdays, unit, target_value, archived, sort, created_at)
       VALUES (?,?,?,?,?,?,?,?,0,?,?)`,
      userId, name, domain, cadence, perWeek, weekdays, unit, target, i, nowIso()
    ).lastInsertRowid,
    cadence, weekdays: weekdays.split(',').map(Number), target,
    rate: habits[i][7],
  }));

  for (const h of habitRows) {
    // A gentle upward drift, so recent weeks look better than old ones.
    for (let d = 0; d < DAYS.length; d++) {
      const date = DAYS[d];
      const scheduled = h.cadence === 'daily' || h.cadence === 'weekly' || h.weekdays.includes(weekdayOf(date));
      if (!scheduled) continue;
      const drift = 0.82 + 0.28 * (d / DAYS.length);
      let p = h.rate * drift;
      if (h.cadence === 'weekly') p *= 0.62;           // ~4 of 7 days
      if (date === TODAY && chance(0.35)) continue;    // today still in progress
      if (!chance(Math.min(0.97, p))) continue;
      run(
        'INSERT OR IGNORE INTO habit_logs (user_id, habit_id, date, value, done, note) VALUES (?,?,?,?,1,\'\')',
        userId, h.id, date, h.target ? Number(between(h.target * 0.8, h.target * 1.2).toFixed(1)) : 1
      );
    }
  }

  /* ---------------- focus sessions ---------------- */
  const focusLabels = {
    [PI]: ['Training run analysis', 'Virial residual derivation', 'Rehearsal gate debugging', 'Reading fields.h5 diagnostics'],
    [ODAROO]: ['Category page filters', 'BFF route handlers', 'Playwright suite', 'Django serializers'],
    [AIRFOIL]: ['Panel solver tuning', 'Page 2 carousel motion', 'Worker token plumbing'],
    [THESIS]: ['Results section draft', 'Figure preparation', 'Literature notes'],
    [PEXI]: ['Dependency sweep'],
  };
  for (const date of DAYS) {
    const dow = weekdayOf(date);
    const isFriday = dow === 5;                       // Iranian weekend
    const blocks = isFriday ? int(0, 2) : int(2, 5);
    for (let b = 0; b < blocks; b++) {
      const projectId = pick([PI, PI, PI, ODAROO, ODAROO, AIRFOIL, THESIS, PEXI]);
      const domain = projectId === PI || projectId === THESIS ? 'research' : 'work';
      const minutes = int(35, 115);
      const hour = 8 + b * 3 + int(0, 2);
      const startedAt = `${date}T${String(Math.min(hour, 22)).padStart(2, '0')}:${String(int(0, 55)).padStart(2, '0')}:00.000Z`;
      run(
        `INSERT INTO focus_sessions (user_id, project_id, task_id, domain, label, date, started_at, ended_at, duration_min, kind, notes)
         VALUES (?,?,NULL,?,?,?,?,?,?,?, '')`,
        userId, projectId, domain, pick(focusLabels[projectId] || ['Focus']), date, startedAt,
        new Date(new Date(startedAt).getTime() + minutes * 60000).toISOString(),
        minutes, chance(0.78) ? 'deep' : pick(['admin', 'meeting'])
      );
    }
  }

  /* ---------------- gym ---------------- */
  const templates = {
    Push: [['Bench Press', 'chest'], ['Incline Dumbbell Press', 'chest'], ['Overhead Press', 'shoulders'], ['Cable Fly', 'chest'], ['Triceps Pushdown', 'triceps']],
    Pull: [['Deadlift', 'back'], ['Pull-up', 'back'], ['Barbell Row', 'back'], ['Face Pull', 'shoulders'], ['Barbell Curl', 'biceps']],
    Legs: [['Back Squat', 'quads'], ['Romanian Deadlift', 'hamstrings'], ['Leg Press', 'quads'], ['Leg Curl', 'hamstrings'], ['Standing Calf Raise', 'calves']],
  };
  const baseWeights = {
    'Bench Press': 72, 'Incline Dumbbell Press': 28, 'Overhead Press': 45, 'Cable Fly': 18, 'Triceps Pushdown': 32,
    'Deadlift': 120, 'Pull-up': 0, 'Barbell Row': 65, 'Face Pull': 25, 'Barbell Curl': 32,
    'Back Squat': 100, 'Romanian Deadlift': 85, 'Leg Press': 180, 'Leg Curl': 45, 'Standing Calf Raise': 70,
  };
  const kinds = ['Push', 'Pull', 'Legs'];
  let kindIdx = 0;
  for (const date of DAYS) {
    const dow = weekdayOf(date);
    if (![0, 2, 4].includes(dow)) continue;           // Sun / Tue / Thu
    if (!chance(0.82)) continue;
    const kind = kinds[kindIdx++ % 3];
    const progress = 1 + 0.11 * (DAYS.indexOf(date) / DAYS.length);   // ~11% over the window
    const workoutId = run(
      'INSERT INTO workouts (user_id, date, kind, title, duration_min, rpe, notes, created_at) VALUES (?,?,?,?,?,?,\'\',?)',
      userId, date, kind, `${kind} day`, int(55, 92), Number(between(6.5, 9).toFixed(1)), nowIso()
    ).lastInsertRowid;

    templates[kind].forEach(([name, muscle], order) => {
      const exId = run(
        'INSERT INTO exercises (user_id, workout_id, name, muscle, order_idx) VALUES (?,?,?,?,?)',
        userId, workoutId, name, muscle, order
      ).lastInsertRowid;
      const top = Math.round(baseWeights[name] * progress * between(0.97, 1.03));
      const setCount = order === 0 ? 4 : 3;
      for (let s = 1; s <= setCount; s++) {
        const isWarm = s === 1 && order === 0;
        run(
          'INSERT INTO sets (user_id, exercise_id, set_idx, reps, weight_kg, rpe, is_warmup) VALUES (?,?,?,?,?,?,?)',
          userId, exId, s,
          isWarm ? 10 : int(5, 11),
          isWarm ? Math.round(top * 0.55) : Math.max(0, top - (s - 2) * (top > 60 ? 5 : 2)),
          Number(between(6, 9.5).toFixed(1)), isWarm ? 1 : 0
        );
      }
    });
  }

  /* ---------------- sports ---------------- */
  for (const date of DAYS) {
    const dow = weekdayOf(date);
    if (dow === 5 && chance(0.72)) {
      run(
        'INSERT INTO sport_sessions (user_id, date, sport, duration_min, distance_km, intensity, calories, notes) VALUES (?,?,?,?,?,?,?,\'\')',
        userId, date, 'Football', int(70, 105), null, int(3, 5), int(520, 820)
      );
    }
    if ([1, 3].includes(dow) && chance(0.45)) {
      const km = Number(between(4, 11).toFixed(1));
      run(
        'INSERT INTO sport_sessions (user_id, date, sport, duration_min, distance_km, intensity, calories, notes) VALUES (?,?,?,?,?,?,?,\'\')',
        userId, date, 'Running', Math.round(km * between(5.4, 6.4)), km, int(2, 4), Math.round(km * 68)
      );
    }
    if (dow === 6 && chance(0.22)) {
      run(
        'INSERT INTO sport_sessions (user_id, date, sport, duration_min, distance_km, intensity, calories, notes) VALUES (?,?,?,?,?,?,?,\'\')',
        userId, date, 'Swimming', int(35, 60), Number(between(0.8, 1.8).toFixed(1)), int(2, 4), int(280, 460)
      );
    }
  }

  /* ---------------- health ---------------- */
  let weight = 78.4;
  for (const date of DAYS) {
    weight += between(-0.22, 0.16);
    const sleep = Number(between(5.4, 8.6).toFixed(1));
    const quality = sleep > 7.5 ? int(4, 5) : sleep > 6.4 ? int(3, 4) : int(1, 3);
    const bedHour = sleep > 7 ? int(23, 24) : int(0, 2);
    run(
      `INSERT INTO health_logs (user_id, date, sleep_hours, sleep_quality, bed_time, wake_time, weight_kg, body_fat, water_ml, steps, mood, energy, stress, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'')`,
      userId, date, sleep, quality,
      `${String(bedHour % 24).padStart(2, '0')}:${String(int(0, 55)).padStart(2, '0')}`,
      `${String(int(7, 10)).padStart(2, '0')}:${String(int(0, 55)).padStart(2, '0')}`,
      Number(weight.toFixed(1)),
      Number(between(15.5, 18.5).toFixed(1)),
      int(1200, 3200), int(3200, 12500),
      // Mood and energy track sleep — the app's correlation view depends on it.
      Math.max(1, Math.min(5, Math.round(quality * between(0.75, 1.25)))),
      Math.max(1, Math.min(5, Math.round(quality * between(0.7, 1.3)))),
      Math.max(1, Math.min(5, Math.round((6 - quality) * between(0.6, 1.2))))
    );
  }

  /* ---------------- learning ---------------- */
  const courses = [
    ['Advanced CFD — multiphase flows', 'Sharif OCW', 'active', 62, 100, 'lessons', addDays(TODAY, 55)],
    ['Deep Learning Specialization', 'Coursera', 'active', 78, 100, 'lessons', addDays(TODAY, 30)],
    ['IELTS Academic prep', 'Self-study', 'active', 41, 100, 'lessons', addDays(TODAY, 75)],
    ['System Design for Web', 'YouTube', 'paused', 25, 100, 'lessons', null],
  ];
  const courseIds = courses.map(([title, provider, status, progress, total, unit, target]) =>
    run(
      'INSERT INTO courses (user_id, title, provider, status, progress, total_units, unit_label, target_date, notes, created_at) VALUES (?,?,?,?,?,?,?,?,\'\',?)',
      userId, title, provider, status, progress, total, unit, target, nowIso()
    ).lastInsertRowid
  );
  for (const date of DAYS) {
    if (!chance(0.46)) continue;
    run(
      'INSERT INTO study_sessions (user_id, course_id, date, minutes, topic, notes) VALUES (?,?,?,?,?,\'\')',
      userId, pick(courseIds), date, int(25, 105),
      pick(['VOF interface capturing', 'Backprop through time', 'Reading comprehension', 'Surface tension models', 'Attention mechanisms', 'Writing task 2', 'Caching strategies'])
    );
  }

  const readings = [
    ['paper', 'Numerical simulation of binary droplet collision using LBM', 'Bijarchi & Rahimian', 'MME', 2014, 'done', 5, 12, 12],
    ['paper', 'A level-set method for computing droplet collisions', 'Tanguy & Berlemont', 'Int. J. Multiphase Flow', 2005, 'done', 5, 24, 24],
    ['paper', 'Regimes of coalescence and separation in droplet collision', 'Qian & Law', 'JFM', 1997, 'done', 5, 30, 30],
    ['paper', 'PhyCRNet: Physics-informed convolutional-recurrent network', 'Ren et al.', 'CMAME', 2022, 'reading', 4, 18, 28],
    ['paper', 'Physics-informed neural networks', 'Raissi, Perdikaris & Karniadakis', 'JCP', 2019, 'done', 4, 26, 26],
    ['paper', 'Fourier Neural Operator for PDEs', 'Li et al.', 'ICLR', 2021, 'reading', 4, 9, 22],
    ['book', 'Designing Data-Intensive Applications', 'Martin Kleppmann', "O'Reilly", 2017, 'reading', 5, 214, 590],
    ['book', 'Refactoring UI', 'Wathan & Schoger', 'Self-published', 2018, 'done', 5, 150, 150],
    ['book', 'Deep Work', 'Cal Newport', 'Grand Central', 2016, 'done', 4, 296, 296],
    ['paper', 'An interface-compression scheme for VOF', 'Weller', 'OpenFOAM tech report', 2008, 'queued', null, 0, 14],
  ];
  for (const [kind, title, authors, venue, year, status, rating, progress, pages] of readings) {
    run(
      `INSERT INTO readings (user_id, kind, title, authors, venue, year, status, rating, progress, total_pages, url, notes, started_at, finished_at, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,'','',?,?,?)`,
      userId, kind, title, authors, venue, year, status, rating, progress, pages,
      status === 'queued' ? null : pick(DAYS.slice(0, 60)),
      status === 'done' ? pick(DAYS.slice(60)) : null,
      nowIso()
    );
  }

  /* ---------------- finance (Toman) ---------------- */
  const expenseMix = [
    ['housing', 18_000_000, 0.05], ['food', 2_400_000, 0.55], ['transport', 700_000, 0.4],
    ['software', 1_800_000, 0.08], ['gym', 3_500_000, 0.04], ['health', 1_500_000, 0.07],
    ['education', 4_000_000, 0.05], ['entertainment', 900_000, 0.18], ['family', 3_000_000, 0.1],
    ['hardware', 12_000_000, 0.02], ['other', 800_000, 0.25],
  ];
  for (const date of DAYS) {
    for (const [category, base, freq] of expenseMix) {
      if (!chance(freq)) continue;
      run(
        'INSERT INTO transactions (user_id, project_id, date, type, category, amount, currency, account, note) VALUES (?,NULL,?,\'expense\',?,?,\'IRT\',\'main\',\'\')',
        userId, date, category, Math.round(base * between(0.7, 1.3))
      );
    }
  }
  // Monthly freelance invoices tied to the client projects.
  const months = [...new Set(DAYS.map(monthKey))];
  for (const m of months) {
    run(
      'INSERT INTO transactions (user_id, project_id, date, type, category, amount, currency, account, note) VALUES (?,?,?,\'income\',\'client\',?,\'IRT\',\'main\',?)',
      userId, ODAROO, `${m}-05`, Math.round(between(85_000_000, 130_000_000)), 'Odaroo milestone'
    );
    if (chance(0.6)) {
      run(
        'INSERT INTO transactions (user_id, project_id, date, type, category, amount, currency, account, note) VALUES (?,?,?,\'income\',\'freelance\',?,\'IRT\',\'main\',?)',
        userId, AIRFOIL, `${m}-19`, Math.round(between(25_000_000, 60_000_000)), 'Airfoil demo work'
      );
    }
    run(
      'INSERT INTO transactions (user_id, project_id, date, type, category, amount, currency, account, note) VALUES (?,NULL,?,\'income\',\'scholarship\',?,\'IRT\',\'main\',?)',
      userId, `${m}-12`, 22_000_000, 'Research stipend'
    );
  }
  for (const [category, limit] of [['food', 90_000_000], ['transport', 20_000_000], ['entertainment', 15_000_000], ['software', 25_000_000]]) {
    run('INSERT OR IGNORE INTO budgets (user_id, category, monthly_limit, currency) VALUES (?,?,?,\'IRT\')', userId, category, limit);
  }

  /* ---------------- goals ---------------- */
  const year = TODAY.slice(0, 4);
  const quarter = `${year}-Q${Math.floor((Number(TODAY.slice(5, 7)) - 1) / 3) + 1}`;
  const goalRows = [
    ['Submit the droplet-collision paper', 'research', 'year', year, 1, 0.65, 'paper', 'active'],
    ['Ship Odaroo to production', 'work', 'quarter', quarter, 100, 78, '%', 'active'],
    ['Bench press 90 kg for 5', 'fitness', 'year', year, 90, 78, 'kg', 'active'],
    ['Read 24 papers', 'learning', 'year', year, 24, 15, 'papers', 'active'],
    ['Average 7.5 h sleep', 'health', 'quarter', quarter, 7.5, 6.9, 'h', 'active'],
    ['Save 400M Toman', 'finance', 'year', year, 400_000_000, 236_000_000, 'IRT', 'active'],
    ['Run 300 km', 'sports', 'year', year, 300, 168, 'km', 'active'],
    ['Journal every day', 'personal', 'quarter', quarter, 90, 67, 'days', 'active'],
  ];
  for (const [title, domain, period, key, target, current, unit, status] of goalRows) {
    run(
      'INSERT INTO goals (user_id, title, domain, period, period_key, target_value, current_value, unit, status, due_date, notes, created_at) VALUES (?,?,?,?,?,?,?,?,?,NULL,\'\',?)',
      userId, title, domain, period, key, target, current, unit, status, nowIso()
    );
  }

  /* ---------------- journal ---------------- */
  const entries = [
    ['Found the closure bug', 'The film closure was running at half its advertised reach the whole campaign. Four- and six-cell test films sat inside the working range, so it never showed up. Same class of mistake as c_comp — a test that overrides the parameter cannot validate the parameter.', 'Closure fix landed', 'Good tools. The diagnostic script paid for itself ten times over.', 4],
    ['Odaroo rate limiting', 'Every browser request shared one rate-limit bucket because Django saw the BFF as a single IP. The test suite caught it, not me. Worth remembering that a proxy collapses identity unless you tell it not to.', 'Fixed throttle identity', 'A test suite that finds real bugs on day one.', 4],
    ['Slow day', 'Low energy, poor sleep. Managed one deep block and gave up on the second. Rest is part of it.', '', 'Quiet evening, tea, no screens after eleven.', 2],
    ['Merged at last', 'The droplets merged at t*=0.96 with 86% of the kinetic energy. First time the whole approach-impact-merge chain worked end to end. Still no oscillation, but the failure is now precisely located.', 'Best run of the campaign', 'Months of work finally showing.', 5],
    ['Gym PR', 'Hit 78 for 5 on bench. Slow and steady. Legs felt strong after the deload week.', 'Bench 78x5', 'A body that keeps showing up.', 5],
  ];
  entries.forEach((e, i) => {
    const date = DAYS[DAYS.length - 1 - i * 6];
    run(
      'INSERT OR IGNORE INTO journal_entries (user_id, date, title, body, highlights, gratitude, mood, tags, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      userId, date, e[0], e[1], e[2], e[3], e[4], pick(['research', 'work', 'health', 'fitness']), nowIso()
    );
  });
  // Shorter entries across the window so the journal has depth.
  for (const date of DAYS) {
    if (!chance(0.3)) continue;
    run(
      'INSERT OR IGNORE INTO journal_entries (user_id, date, title, body, highlights, gratitude, mood, tags, created_at) VALUES (?,?,?,?,\'\',?,?,?,?)',
      userId, date,
      pick(['Steady', 'Long day', 'Good session', 'Reset', 'Shipped something']),
      pick([
        'Three deep blocks, one on the rehearsal gate. Progress feels real again.',
        'Client call ran long. Caught up in the evening.',
        'Trained, studied, wrote. The kind of day the system is meant to produce.',
        'Debugging all afternoon. Found it eventually.',
        'Rest day. Walked, read, slept early.',
      ]),
      pick(['Family', 'Good coffee', 'Clear head', 'Quiet morning', 'Rain']),
      int(2, 5), pick(['work', 'research', 'health', 'personal']), nowIso()
    );
  }
}

/* ------------------------------------------------------------------ */

const user = ensureUser();
const existing = get('SELECT COUNT(*) AS c FROM habits WHERE user_id = ?', user.id).c;

if (existing > 0 && !RESET) {
  console.log(`Account ${EMAIL} already has data. Re-run with --reset to rebuild it.`);
  process.exit(0);
}

tx(() => {
  if (RESET) wipe(user.id);
  seed(user.id);
});

const counts = {
  projects: get('SELECT COUNT(*) c FROM projects WHERE user_id=?', user.id).c,
  tasks: get('SELECT COUNT(*) c FROM tasks WHERE user_id=?', user.id).c,
  habits: get('SELECT COUNT(*) c FROM habits WHERE user_id=?', user.id).c,
  habitLogs: get('SELECT COUNT(*) c FROM habit_logs WHERE user_id=?', user.id).c,
  focus: get('SELECT COUNT(*) c FROM focus_sessions WHERE user_id=?', user.id).c,
  workouts: get('SELECT COUNT(*) c FROM workouts WHERE user_id=?', user.id).c,
  sets: get('SELECT COUNT(*) c FROM sets WHERE user_id=?', user.id).c,
  sports: get('SELECT COUNT(*) c FROM sport_sessions WHERE user_id=?', user.id).c,
  health: get('SELECT COUNT(*) c FROM health_logs WHERE user_id=?', user.id).c,
  study: get('SELECT COUNT(*) c FROM study_sessions WHERE user_id=?', user.id).c,
  readings: get('SELECT COUNT(*) c FROM readings WHERE user_id=?', user.id).c,
  transactions: get('SELECT COUNT(*) c FROM transactions WHERE user_id=?', user.id).c,
  goals: get('SELECT COUNT(*) c FROM goals WHERE user_id=?', user.id).c,
  journal: get('SELECT COUNT(*) c FROM journal_entries WHERE user_id=?', user.id).c,
};

console.log('\n  Seeded Routine\n');
console.log(`  sign in   ${EMAIL}`);
console.log(`  password  ${PASSWORD}\n`);
for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(14)} ${v}`);
console.log('');
db.close();

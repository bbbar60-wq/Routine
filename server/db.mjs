/**
 * Routine — database layer.
 *
 * Uses Node's built-in `node:sqlite` (Node >= 22.5) so the whole backend runs
 * with zero npm dependencies: no native build step, nothing to break when a
 * registry is slow or unreachable.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.ROUTINE_DATA_DIR || join(__dirname, '..', 'data');
export const DB_PATH = process.env.ROUTINE_DB || join(DATA_DIR, 'routine.db');

mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
  PRAGMA synchronous = NORMAL;
`);

/* ------------------------------------------------------------------ *
 * Schema
 * ------------------------------------------------------------------ */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  email          TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  name           TEXT    NOT NULL,
  password_hash  TEXT    NOT NULL,
  settings       TEXT    NOT NULL DEFAULT '{}',
  created_at     TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT    NOT NULL,
  created_at  TEXT    NOT NULL,
  expires_at  TEXT    NOT NULL,
  user_agent  TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- ---------- work ----------
CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  domain      TEXT    NOT NULL DEFAULT 'work',
  status      TEXT    NOT NULL DEFAULT 'active',   -- active | paused | done | archived
  description TEXT    NOT NULL DEFAULT '',
  deadline    TEXT,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id, status);

CREATE TABLE IF NOT EXISTS tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id   INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  title        TEXT    NOT NULL,
  notes        TEXT    NOT NULL DEFAULT '',
  domain       TEXT    NOT NULL DEFAULT 'work',
  priority     INTEGER NOT NULL DEFAULT 2,          -- 1 urgent .. 4 someday
  status       TEXT    NOT NULL DEFAULT 'todo',     -- todo | doing | done
  due_date     TEXT,
  estimate_min INTEGER,
  completed_at TEXT,
  sort         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_user     ON tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due      ON tasks(user_id, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_project  ON tasks(project_id);

-- ---------- habits ----------
CREATE TABLE IF NOT EXISTS habits (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT    NOT NULL,
  domain          TEXT    NOT NULL DEFAULT 'personal',
  cadence         TEXT    NOT NULL DEFAULT 'daily',  -- daily | weekly | weekdays
  target_per_week INTEGER NOT NULL DEFAULT 7,
  weekdays        TEXT    NOT NULL DEFAULT '0,1,2,3,4,5,6',
  unit            TEXT    NOT NULL DEFAULT '',
  target_value    REAL,
  archived        INTEGER NOT NULL DEFAULT 0,
  sort            INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_habits_user ON habits(user_id, archived);

CREATE TABLE IF NOT EXISTS habit_logs (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  habit_id  INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date      TEXT    NOT NULL,
  value     REAL    NOT NULL DEFAULT 1,
  done      INTEGER NOT NULL DEFAULT 1,
  note      TEXT    NOT NULL DEFAULT '',
  UNIQUE(habit_id, date)
);
CREATE INDEX IF NOT EXISTS idx_habitlogs_user_date ON habit_logs(user_id, date);

-- ---------- focus / time ----------
CREATE TABLE IF NOT EXISTS focus_sessions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id   INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  task_id      INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  domain       TEXT    NOT NULL DEFAULT 'work',
  label        TEXT    NOT NULL DEFAULT '',
  date         TEXT    NOT NULL,
  started_at   TEXT    NOT NULL,
  ended_at     TEXT,
  duration_min INTEGER NOT NULL DEFAULT 0,
  kind         TEXT    NOT NULL DEFAULT 'deep',     -- deep | admin | meeting | break
  notes        TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_focus_user_date ON focus_sessions(user_id, date);

-- ---------- gym ----------
CREATE TABLE IF NOT EXISTS workouts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date         TEXT    NOT NULL,
  kind         TEXT    NOT NULL DEFAULT 'push',
  title        TEXT    NOT NULL DEFAULT '',
  duration_min INTEGER NOT NULL DEFAULT 0,
  rpe          REAL,
  notes        TEXT    NOT NULL DEFAULT '',
  created_at   TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workouts_user_date ON workouts(user_id, date);

CREATE TABLE IF NOT EXISTS exercises (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  muscle     TEXT    NOT NULL DEFAULT '',
  order_idx  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_exercises_workout ON exercises(workout_id);

CREATE TABLE IF NOT EXISTS sets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  set_idx     INTEGER NOT NULL DEFAULT 1,
  reps        INTEGER NOT NULL DEFAULT 0,
  weight_kg   REAL    NOT NULL DEFAULT 0,
  rpe         REAL,
  is_warmup   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sets_exercise ON sets(exercise_id);

-- ---------- sports ----------
CREATE TABLE IF NOT EXISTS sport_sessions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date         TEXT    NOT NULL,
  sport        TEXT    NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 0,
  distance_km  REAL,
  intensity    INTEGER NOT NULL DEFAULT 3,          -- 1..5
  calories     INTEGER,
  notes        TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_sport_user_date ON sport_sessions(user_id, date);

-- ---------- health ----------
CREATE TABLE IF NOT EXISTS health_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date          TEXT    NOT NULL,
  sleep_hours   REAL,
  sleep_quality INTEGER,
  bed_time      TEXT,
  wake_time     TEXT,
  weight_kg     REAL,
  body_fat      REAL,
  water_ml      INTEGER,
  steps         INTEGER,
  mood          INTEGER,
  energy        INTEGER,
  stress        INTEGER,
  notes         TEXT NOT NULL DEFAULT '',
  UNIQUE(user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_health_user_date ON health_logs(user_id, date);

-- ---------- learning ----------
CREATE TABLE IF NOT EXISTS courses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT    NOT NULL,
  provider    TEXT    NOT NULL DEFAULT '',
  status      TEXT    NOT NULL DEFAULT 'active',    -- active | done | paused | planned
  progress    REAL    NOT NULL DEFAULT 0,
  total_units INTEGER NOT NULL DEFAULT 100,
  unit_label  TEXT    NOT NULL DEFAULT 'lessons',
  target_date TEXT,
  notes       TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_courses_user ON courses(user_id, status);

CREATE TABLE IF NOT EXISTS study_sessions (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  date      TEXT    NOT NULL,
  minutes   INTEGER NOT NULL DEFAULT 0,
  topic     TEXT    NOT NULL DEFAULT '',
  notes     TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_study_user_date ON study_sessions(user_id, date);

CREATE TABLE IF NOT EXISTS readings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT    NOT NULL DEFAULT 'paper',     -- paper | book | course-notes
  title       TEXT    NOT NULL,
  authors     TEXT    NOT NULL DEFAULT '',
  venue       TEXT    NOT NULL DEFAULT '',
  year        INTEGER,
  status      TEXT    NOT NULL DEFAULT 'reading',   -- queued | reading | done | dropped
  rating      INTEGER,
  progress    INTEGER NOT NULL DEFAULT 0,
  total_pages INTEGER,
  url         TEXT    NOT NULL DEFAULT '',
  notes       TEXT    NOT NULL DEFAULT '',
  started_at  TEXT,
  finished_at TEXT,
  created_at  TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_readings_user ON readings(user_id, status);

-- ---------- finance ----------
CREATE TABLE IF NOT EXISTS transactions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  date       TEXT    NOT NULL,
  type       TEXT    NOT NULL DEFAULT 'expense',    -- income | expense
  category   TEXT    NOT NULL DEFAULT 'other',
  amount     REAL    NOT NULL DEFAULT 0,
  currency   TEXT    NOT NULL DEFAULT 'IRT',
  account    TEXT    NOT NULL DEFAULT 'main',
  note       TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, date);

CREATE TABLE IF NOT EXISTS budgets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category      TEXT    NOT NULL,
  monthly_limit REAL    NOT NULL DEFAULT 0,
  currency      TEXT    NOT NULL DEFAULT 'IRT',
  UNIQUE(user_id, category)
);

-- ---------- goals ----------
CREATE TABLE IF NOT EXISTS goals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT    NOT NULL,
  domain        TEXT    NOT NULL DEFAULT 'personal',
  period        TEXT    NOT NULL DEFAULT 'quarter',  -- year | quarter | month
  period_key    TEXT    NOT NULL,                    -- 2026 | 2026-Q3 | 2026-08
  target_value  REAL    NOT NULL DEFAULT 100,
  current_value REAL    NOT NULL DEFAULT 0,
  unit          TEXT    NOT NULL DEFAULT '%',
  status        TEXT    NOT NULL DEFAULT 'active',   -- active | done | missed | dropped
  due_date      TEXT,
  notes         TEXT    NOT NULL DEFAULT '',
  created_at    TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id, status);

-- ---------- journal ----------
CREATE TABLE IF NOT EXISTS journal_entries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date       TEXT    NOT NULL,
  title      TEXT    NOT NULL DEFAULT '',
  body       TEXT    NOT NULL DEFAULT '',
  highlights TEXT    NOT NULL DEFAULT '',
  gratitude  TEXT    NOT NULL DEFAULT '',
  mood       INTEGER,
  tags       TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL,
  UNIQUE(user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_journal_user_date ON journal_entries(user_id, date);
`;

db.exec(SCHEMA);

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** node:sqlite can hand back BigInt for INTEGER columns — normalise to Number. */
export function num(v) {
  return typeof v === 'bigint' ? Number(v) : v;
}

/** Normalise a whole row (or null). */
export function row(r) {
  if (!r) return r;
  const out = {};
  for (const k of Object.keys(r)) out[k] = num(r[k]);
  return out;
}

export function rows(list) {
  return list.map(row);
}

export function all(sql, ...params) {
  return rows(db.prepare(sql).all(...params));
}

export function get(sql, ...params) {
  return row(db.prepare(sql).get(...params));
}

export function run(sql, ...params) {
  const info = db.prepare(sql).run(...params);
  return { changes: num(info.changes), lastInsertRowid: num(info.lastInsertRowid) };
}

/** Run `fn` inside a transaction. */
export function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
    throw err;
  }
}

export function nowIso() {
  return new Date().toISOString();
}

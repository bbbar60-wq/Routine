import type { Domain } from './domains';
import type { Currency } from './format';

export interface Settings {
  theme: 'dark' | 'light' | 'system';
  calendar: 'gregorian' | 'jalali' | 'both';
  weekStart: number;
  currency: Currency;
  units: 'metric' | 'imperial';
  dailyFocusGoalMin: number;
  waterGoalMl: number;
  sleepGoalHours: number;
}

export interface User {
  id: number;
  email: string;
  name: string;
  createdAt: string;
  settings: Settings;
}

export interface Project {
  id: number;
  name: string;
  domain: Domain;
  status: 'active' | 'paused' | 'done' | 'archived';
  description: string;
  deadline: string | null;
  sort: number;
  created_at: string;
  task_count?: number;
  task_done?: number;
  minutes_total?: number;
}

export interface Task {
  id: number;
  project_id: number | null;
  title: string;
  notes: string;
  domain: Domain;
  priority: number;
  status: 'todo' | 'doing' | 'done';
  due_date: string | null;
  estimate_min: number | null;
  completed_at: string | null;
  sort: number;
  created_at: string;
  project_name?: string | null;
}

export interface HabitLog {
  date: string;
  value: number;
  done: boolean;
  note: string;
}

export interface Habit {
  id: number;
  name: string;
  domain: Domain;
  cadence: 'daily' | 'weekdays' | 'weekly';
  target_per_week: number;
  weekdays: number[];
  unit: string;
  target_value: number | null;
  archived: number;
  sort: number;
  logs: HabitLog[];
  todayLog: HabitLog | null;
  streak: number;
  longestStreak: number;
  scheduledToday: boolean;
  last30: number;
}

export interface FocusSession {
  id: number;
  project_id: number | null;
  task_id: number | null;
  domain: Domain;
  label: string;
  date: string;
  started_at: string;
  ended_at: string | null;
  duration_min: number;
  kind: 'deep' | 'admin' | 'meeting' | 'break';
  notes: string;
  project_name?: string | null;
  task_title?: string | null;
}

export interface WorkoutSet {
  id?: number;
  set_idx: number;
  reps: number;
  weight_kg: number;
  rpe: number | null;
  is_warmup: boolean;
}

export interface Exercise {
  id?: number;
  name: string;
  muscle: string;
  order_idx: number;
  sets: WorkoutSet[];
  volume: number;
  topSet: WorkoutSet | null;
}

export interface Workout {
  id: number;
  date: string;
  kind: string;
  title: string;
  duration_min: number;
  rpe: number | null;
  notes: string;
  exercises: Exercise[];
  volume: number;
  set_count: number;
}

export interface LiftRecord {
  name: string;
  reps: number;
  weight_kg: number;
  date: string;
  e1rm: number;
}

export interface SportSession {
  id: number;
  date: string;
  sport: string;
  duration_min: number;
  distance_km: number | null;
  intensity: number;
  calories: number | null;
  notes: string;
}

export interface HealthLog {
  id?: number;
  date: string;
  sleep_hours: number | null;
  sleep_quality: number | null;
  bed_time: string | null;
  wake_time: string | null;
  weight_kg: number | null;
  body_fat: number | null;
  water_ml: number | null;
  steps: number | null;
  mood: number | null;
  energy: number | null;
  stress: number | null;
  notes: string;
}

export interface Course {
  id: number;
  title: string;
  provider: string;
  status: 'planned' | 'active' | 'paused' | 'done';
  progress: number;
  total_units: number;
  unit_label: string;
  target_date: string | null;
  notes: string;
}

export interface StudySession {
  id: number;
  course_id: number | null;
  date: string;
  minutes: number;
  topic: string;
  notes: string;
  course_title?: string | null;
}

export interface Reading {
  id: number;
  kind: 'paper' | 'book' | 'notes';
  title: string;
  authors: string;
  venue: string;
  year: number | null;
  status: 'queued' | 'reading' | 'done' | 'dropped';
  rating: number | null;
  progress: number;
  total_pages: number | null;
  url: string;
  notes: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface Transaction {
  id: number;
  project_id: number | null;
  date: string;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  currency: Currency;
  account: string;
  note: string;
  project_name?: string | null;
}

export interface Budget {
  id: number;
  category: string;
  monthly_limit: number;
  currency: Currency;
}

export interface Goal {
  id: number;
  title: string;
  domain: Domain;
  period: 'year' | 'quarter' | 'month';
  period_key: string;
  target_value: number;
  current_value: number;
  unit: string;
  status: 'active' | 'done' | 'missed' | 'dropped';
  due_date: string | null;
  notes: string;
}

export interface JournalEntry {
  id: number;
  date: string;
  title: string;
  body: string;
  highlights: string;
  gratitude: string;
  mood: number | null;
  tags: string;
}

export interface MomentumDay {
  date: string;
  focusMin: number;
  studyMin: number;
  habitsDone: number;
  habitsScheduled: number;
  trained: boolean;
  level: number;
}

export interface DashboardData {
  date: string;
  weekStart: string;
  habits: Array<{
    id: number; name: string; domain: Domain; unit: string;
    cadence: string; target_value: number | null;
    doneToday: boolean; scheduledToday: boolean; streak: number; longestStreak: number;
  }>;
  habitsSummary: { done: number; scheduled: number };
  tasks: Task[];
  tasksSummary: { overdue: number; completedToday: number };
  focus: {
    running: FocusSession | null;
    todayMinutes: number;
    weekMinutes: number;
    byDomain: Record<string, number>;
  };
  health: HealthLog | null;
  training: { lastWorkout: Workout | null; workoutsThisWeek: number; sportsThisWeek: number };
  momentum: MomentumDay[];
  goals: Goal[];
  deadlines: Array<{ id: number; title: string; date: string; domain: Domain; kind: 'project' | 'task' }>;
  journalToday: JournalEntry | null;
}

export interface HeatCell {
  date: string;
  level: number;
  focusMin: number;
  studiedMin: number;
  trained: boolean;
  habitsDone: number;
}

export interface AnalyticsData {
  from: string;
  to: string;
  timeByDomain: Array<{ date: string; domain: Domain; minutes: number }>;
  timeTotals: Array<{ domain: Domain; minutes: number }>;
  habitCompletion: Array<{ id: number; name: string; domain: Domain; done: number; scheduled: number; rate: number }>;
  weeklyVolume: Array<{ week: string; volume: number; sessions: number }>;
  health: Array<{ date: string; sleep_hours: number | null; mood: number | null; energy: number | null; weight_kg: number | null; steps: number | null; water_ml: number | null }>;
  sports: Array<{ sport: string; sessions: number; minutes: number; distance: number }>;
  finance: Array<{ month: string; type: 'income' | 'expense'; currency: Currency; total: number }>;
  study: Array<{ date: string; minutes: number }>;
  heatmap: HeatCell[];
  domains: Domain[];
}

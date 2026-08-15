import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Timer, Play, Square, Flame, CheckCircle2, Circle, Dumbbell, Moon,
  CalendarClock, Target, NotebookPen, ArrowUpRight, TriangleAlert, Sparkles, Activity,
} from 'lucide-react';
import { useResource } from '../lib/useResource';
import { api } from '../lib/api';
import { useApp } from '../state/app';
import {
  Button, Card, CardHeader, DomainChip, EmptyState, Progress, Skeleton, useToast, cx,
} from '../components/ui';
import { StatTile, ProgressRing, useTicker, HBarList } from '../components/charts';
import { domainColor } from '../lib/domains';
import {
  elapsedClock, elapsedMinutes, formatMinutes, relativeDay, toHours, weekdayLetter,
  weekdayOf, formatJalaliLatin, todayIso,
} from '../lib/date';
import { progressPercent, PRIORITY_LABELS, MOOD_LABELS } from '../lib/format';
import type { DashboardData } from '../lib/types';

export default function Dashboard() {
  const { data, loading, error, reload } = useResource<DashboardData>('/api/dashboard');
  const { user, settings } = useApp();
  const toast = useToast();
  const navigate = useNavigate();
  const [busyHabit, setBusyHabit] = useState<number | null>(null);

  const running = data?.focus.running ?? null;
  useTicker(!!running);

  const toggleHabit = useCallback(async (habitId: number, done: boolean) => {
    setBusyHabit(habitId);
    try {
      await api.put(`/api/habits/${habitId}/log`, { date: data?.date ?? todayIso(), done });
      await reload();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not save that', 'error');
    } finally {
      setBusyHabit(null);
    }
  }, [data?.date, reload, toast]);

  const completeTask = useCallback(async (id: number) => {
    try {
      await api.patch(`/api/tasks/${id}`, { status: 'done' });
      await reload();
      toast.push('Task completed');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not save that', 'error');
    }
  }, [reload, toast]);

  const stopTimer = useCallback(async () => {
    try {
      await api.post('/api/focus/stop', {});
      await reload();
      toast.push('Session saved');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not stop the timer', 'error');
    }
  }, [reload, toast]);

  const startTimer = useCallback(async (domain: string, label: string) => {
    try {
      await api.post('/api/focus/start', { domain, label, kind: 'deep' });
      await reload();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not start the timer', 'error');
    }
  }, [reload, toast]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 5) return 'Still up';
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    if (h < 22) return 'Good evening';
    return 'Good night';
  }, []);

  if (loading && !data) return <DashboardSkeleton />;

  if (error && !data) {
    return (
      <Card>
        <EmptyState
          icon={<TriangleAlert size={19} />}
          title="Could not load your day"
          message={error}
          action={<Button variant="primary" onClick={() => reload()}>Try again</Button>}
        />
      </Card>
    );
  }
  if (!data) return null;

  const focusGoal = settings.dailyFocusGoalMin || 240;
  const habitPct = data.habitsSummary.scheduled
    ? Math.round((data.habitsSummary.done / data.habitsSummary.scheduled) * 100)
    : 0;
  const sleep = data.health?.sleep_hours ?? null;
  const dueHabits = data.habits.filter((h) => h.scheduledToday);
  const maxMomentum = Math.max(...data.momentum.map((m) => m.focusMin), focusGoal, 1);

  return (
    <div className="space-y-4 max-w-[1500px]">
      {/* ---------------- greeting ---------------- */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[21px] font-semibold tracking-[-0.025em]">
            {greeting}, {user?.name?.split(' ')[0]}
          </h1>
          <p className="text-[12.5px] text-[var(--ink-muted)] mt-0.5">
            {formatJalaliLatin(data.date)}
            <span className="mx-1.5 opacity-40">·</span>
            {data.habitsSummary.scheduled - data.habitsSummary.done > 0
              ? `${data.habitsSummary.scheduled - data.habitsSummary.done} habits left today`
              : dueHabits.length
                ? 'Every habit done today'
                : 'Nothing scheduled today'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => navigate('/journal?edit=today')}>
            <NotebookPen size={14} /> Journal
          </Button>
          <Button size="sm" variant="primary" onClick={() => navigate('/tasks?new=1')}>
            Add task
          </Button>
        </div>
      </div>

      {/* ---------------- stat row ---------------- */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 stagger">
        <StatTile
          label="Focus today" value={toHours(data.focus.todayMinutes)} unit="h"
          accent={domainColor('work')} icon={<Timer size={15} />}
          delta={`${progressPercent(data.focus.todayMinutes, focusGoal)}% of goal`}
          deltaTone={data.focus.todayMinutes >= focusGoal ? 'good' : 'flat'}
          foot={`${toHours(data.focus.weekMinutes)}h this week`}
        />
        <StatTile
          label="Habits" value={`${data.habitsSummary.done}/${data.habitsSummary.scheduled}`}
          accent={domainColor('personal')} icon={<Flame size={15} />}
          delta={`${habitPct}% complete`}
          deltaTone={habitPct === 100 ? 'good' : habitPct >= 60 ? 'flat' : 'bad'}
          foot={`Best streak ${Math.max(0, ...data.habits.map((h) => h.streak))}d`}
        />
        <StatTile
          label="Training" value={data.training.workoutsThisWeek} unit="this week"
          accent={domainColor('fitness')} icon={<Dumbbell size={15} />}
          delta={data.training.lastWorkout ? `Trained ${relativeDay(data.training.lastWorkout.date, data.date)}` : 'No sessions yet'}
          deltaTone={data.training.workoutsThisWeek >= 3 ? 'good' : 'flat'}
          foot={data.training.sportsThisWeek ? `+${data.training.sportsThisWeek} sport` : undefined}
        />
        <StatTile
          label="Sleep" value={sleep != null ? sleep.toFixed(1) : '—'} unit={sleep != null ? 'h' : undefined}
          accent={domainColor('health')} icon={<Moon size={15} />}
          delta={sleep != null
            ? sleep >= settings.sleepGoalHours ? 'On target' : `${(settings.sleepGoalHours - sleep).toFixed(1)}h short`
            : 'Not logged'}
          deltaTone={sleep == null ? 'flat' : sleep >= settings.sleepGoalHours ? 'good' : 'bad'}
          foot={data.health?.mood ? MOOD_LABELS[data.health.mood] : undefined}
        />
      </div>

      {/* ---------------- main grid ---------------- */}
      {/* min-w-0 on the columns: a grid child defaults to min-width:auto, so
          without it a long task title widens the whole track and the page
          scrolls sideways on mobile. */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* ---- left: habits + tasks ---- */}
        <div className="lg:col-span-2 min-w-0 space-y-4">
          <Card>
            <CardHeader
              title="Today's habits" icon={<Flame size={15} />}
              subtitle={dueHabits.length ? `${data.habitsSummary.done} of ${dueHabits.length} done` : undefined}
              action={<Link to="/habits" className="text-[12px] text-[var(--ink-muted)] hover:text-[var(--ink)] flex items-center gap-1">
                All habits <ArrowUpRight size={12} />
              </Link>}
            />
            {dueHabits.length === 0 ? (
              <EmptyState
                icon={<Sparkles size={18} />} title="No habits scheduled today"
                message="Add a habit to start building a streak."
                action={<Button size="sm" variant="primary" onClick={() => navigate('/habits?new=1')}>Add habit</Button>}
              />
            ) : (
              <ul className="px-2 pb-2">
                {dueHabits.map((h) => (
                  <li key={h.id}>
                    <button
                      onClick={() => toggleHabit(h.id, !h.doneToday)}
                      disabled={busyHabit === h.id}
                      aria-pressed={h.doneToday}
                      className={cx(
                        'w-full flex items-center gap-3 px-2.5 h-11 rounded-[var(--radius-md)] text-left',
                        'transition-colors duration-150 cursor-pointer hover:bg-[var(--surface-hover)]',
                        busyHabit === h.id && 'opacity-60'
                      )}
                    >
                      {h.doneToday
                        ? <CheckCircle2 size={19} className="shrink-0" style={{ color: domainColor(h.domain) }} />
                        : <Circle size={19} className="shrink-0 text-[var(--border-strong)]" />}
                      <span className={cx(
                        'text-[13.5px] truncate min-w-0 flex-1',
                        h.doneToday ? 'text-[var(--ink-muted)] line-through decoration-[1.5px]' : 'text-[var(--ink)]'
                      )}>
                        {h.name}
                      </span>
                      <span className="ml-auto flex items-center gap-2 shrink-0">
                        {h.streak > 0 && (
                          <span className="inline-flex items-center gap-1 text-[11.5px] tabular text-[var(--ink-muted)]">
                            <Flame size={11} style={{ color: h.streak >= 7 ? 'var(--status-warning)' : undefined }} />
                            {h.streak}
                          </span>
                        )}
                        <DomainChip domain={h.domain} showLabel={false} size="sm" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="On deck" icon={<CheckCircle2 size={15} />}
              subtitle={
                data.tasksSummary.overdue
                  ? `${data.tasksSummary.overdue} overdue · ${data.tasksSummary.completedToday} done today`
                  : `${data.tasksSummary.completedToday} completed today`
              }
              action={<Link to="/tasks" className="text-[12px] text-[var(--ink-muted)] hover:text-[var(--ink)] flex items-center gap-1">
                All tasks <ArrowUpRight size={12} />
              </Link>}
            />
            {data.tasks.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 size={18} />} title="Nothing due"
                message="No tasks are due today or overdue. Clear runway."
              />
            ) : (
              <ul className="px-2 pb-2">
                {data.tasks.map((t) => {
                  const overdue = t.due_date != null && t.due_date < data.date;
                  return (
                    <li key={t.id} className="flex items-center gap-3 px-2.5 h-11 rounded-[var(--radius-md)] hover:bg-[var(--surface-hover)] transition-colors group">
                      <button
                        onClick={() => completeTask(t.id)}
                        aria-label={`Complete “${t.title}”`}
                        className="shrink-0 cursor-pointer text-[var(--border-strong)] hover:text-[var(--ink-secondary)] transition-colors"
                      >
                        <Circle size={18} />
                      </button>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] text-[var(--ink)] truncate">{t.title}</span>
                        {t.project_name && (
                          <span className="block text-[11.5px] text-[var(--ink-muted)] truncate">{t.project_name}</span>
                        )}
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        {t.priority === 1 && (
                          <span className="text-[10.5px] font-semibold px-1.5 h-[18px] inline-flex items-center rounded-[4px] bg-[var(--status-critical)]/15 text-[var(--status-critical-text)]">
                            {PRIORITY_LABELS[1]}
                          </span>
                        )}
                        {t.due_date && (
                          <span className={cx(
                            'text-[11.5px] tabular',
                            overdue ? 'text-[var(--status-critical-text)] font-medium' : 'text-[var(--ink-muted)]'
                          )}>
                            {relativeDay(t.due_date, data.date)}
                          </span>
                        )}
                        <DomainChip domain={t.domain} showLabel={false} size="sm" />
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        {/* ---- right: timer, momentum, deadlines, goals ---- */}
        <div className="min-w-0 space-y-4">
          {/* focus timer */}
          <Card className={cx('overflow-hidden', running && 'border-[var(--accent-ring)]/45')}>
            <CardHeader
              title={running ? 'Session running' : 'Focus timer'}
              icon={<Timer size={15} />}
              subtitle={running ? (running.label || running.project_name || 'Deep work') : 'Start a block and it lands in your day'}
            />
            <div className="px-4 pb-4">
              {running ? (
                <>
                  <div className="flex items-center gap-3 mb-3.5">
                    <span className="w-2 h-2 rounded-full bg-[var(--status-good)] animate-pulse-dot shrink-0" aria-hidden />
                    <span className="font-mono text-[30px] leading-none font-semibold tracking-[-0.02em] tabular">
                      {elapsedClock(running.started_at)}
                    </span>
                    <DomainChip domain={running.domain} size="sm" />
                  </div>
                  <Button variant="primary" className="w-full justify-center" onClick={stopTimer}>
                    <Square size={14} /> Stop &amp; save {formatMinutes(elapsedMinutes(running.started_at))}
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <ProgressRing
                      value={data.focus.todayMinutes} max={focusGoal} size={58} thickness={5}
                      color={domainColor('work')} label="Progress toward today's focus goal"
                    >
                      {progressPercent(data.focus.todayMinutes, focusGoal)}%
                    </ProgressRing>
                    <div className="text-right">
                      <p className="text-[19px] font-semibold tabular leading-none">{formatMinutes(data.focus.todayMinutes)}</p>
                      <p className="text-[11.5px] text-[var(--ink-muted)] mt-1">of {formatMinutes(focusGoal)} goal</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" onClick={() => startTimer('research', 'Research')}>
                      <Play size={13} /> Research
                    </Button>
                    <Button size="sm" onClick={() => startTimer('work', 'Work')}>
                      <Play size={13} /> Work
                    </Button>
                  </div>
                </>
              )}

              {Object.keys(data.focus.byDomain).length > 0 && (
                <div className="mt-4 pt-3.5 border-t border-[var(--border)]">
                  <HBarList
                    items={Object.entries(data.focus.byDomain)
                      .sort((a, b) => b[1] - a[1])
                      .map(([domain, minutes]) => ({
                        key: domain,
                        label: domain[0].toUpperCase() + domain.slice(1),
                        value: minutes,
                        color: domainColor(domain),
                      }))}
                    formatValue={(v) => formatMinutes(v)}
                  />
                </div>
              )}
            </div>
          </Card>

          {/* momentum */}
          <Card>
            <CardHeader title="Last 7 days" icon={<Activity size={15} />} subtitle="Focus hours, habits and training" />
            <div className="px-4 pb-4">
              <div className="flex items-end justify-between gap-1.5 h-[86px]">
                {data.momentum.map((m) => {
                  const h = Math.max(3, (m.focusMin / maxMomentum) * 74);
                  const isToday = m.date === data.date;
                  const habitRatio = m.habitsScheduled ? m.habitsDone / m.habitsScheduled : 0;
                  return (
                    <div key={m.date} className="flex-1 flex flex-col items-center gap-1.5 group relative">
                      <div className="w-full flex justify-center items-end h-[74px]">
                        <div
                          className="w-full max-w-[26px] rounded-t-[4px] transition-all duration-300"
                          style={{
                            height: h,
                            background: domainColor('work'),
                            opacity: isToday ? 1 : 0.45 + habitRatio * 0.4,
                          }}
                        />
                      </div>
                      <span className={cx(
                        'text-[10.5px] w-full text-center',
                        isToday ? 'text-[var(--ink)] font-semibold' : 'text-[var(--ink-muted)]'
                      )}>
                        {weekdayLetter(weekdayOf(m.date))}
                      </span>
                      {m.trained && (
                        <span
                          className="absolute -top-1 w-1.5 h-1.5 rounded-full"
                          style={{ background: domainColor('fitness') }}
                          title="Trained this day"
                          aria-label="Trained this day"
                        />
                      )}
                      {/* `hidden` rather than `opacity-0`: an absolutely
                          positioned invisible element still counts toward the
                          document's scroll width. */}
                      <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block z-10 px-2 py-1 rounded-[var(--radius-sm)] bg-[var(--surface-raised)] border border-[var(--border-strong)] shadow-[var(--shadow-md)] text-[10.5px] whitespace-nowrap">
                        {formatMinutes(m.focusMin)} · {m.habitsDone}/{m.habitsScheduled} habits
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-3.5 mt-3 pt-3 border-t border-[var(--border)] text-[11px] text-[var(--ink-secondary)]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: domainColor('work') }} aria-hidden />
                  Focus hours
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: domainColor('fitness') }} aria-hidden />
                  Trained
                </span>
              </div>
            </div>
          </Card>

          {/* deadlines */}
          {data.deadlines.length > 0 && (
            <Card>
              <CardHeader title="Coming up" icon={<CalendarClock size={15} />} />
              <ul className="px-2 pb-2">
                {data.deadlines.slice(0, 5).map((d) => (
                  <li key={`${d.kind}-${d.id}`} className="flex items-center gap-2.5 px-2.5 h-10">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: domainColor(d.domain) }} aria-hidden />
                    <span className="text-[12.5px] text-[var(--ink)] truncate flex-1">{d.title}</span>
                    <span className="text-[11.5px] text-[var(--ink-muted)] tabular shrink-0">
                      {relativeDay(d.date, data.date)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* goals */}
          {data.goals.length > 0 && (
            <Card>
              <CardHeader
                title="Active goals" icon={<Target size={15} />}
                action={<Link to="/goals" className="text-[12px] text-[var(--ink-muted)] hover:text-[var(--ink)] flex items-center gap-1">
                  All <ArrowUpRight size={12} />
                </Link>}
              />
              <ul className="px-4 pb-4 space-y-3">
                {data.goals.slice(0, 4).map((g) => {
                  const pct = progressPercent(g.current_value, g.target_value);
                  return (
                    <li key={g.id}>
                      <div className="flex items-baseline justify-between gap-2 mb-1.5">
                        <span className="text-[12.5px] text-[var(--ink)] truncate">{g.title}</span>
                        <span className="text-[11.5px] tabular text-[var(--ink-muted)] shrink-0">{pct}%</span>
                      </div>
                      <Progress value={pct} color={domainColor(g.domain)} label={g.title} />
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading dashboard">
      <Skeleton className="h-9 w-64" />
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[104px]" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Skeleton className="h-[320px]" />
          <Skeleton className="h-[280px]" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-[240px]" />
          <Skeleton className="h-[200px]" />
        </div>
      </div>
    </div>
  );
}

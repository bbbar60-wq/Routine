import { useMemo, useState } from 'react';
import { Plus, Target, Trash2, Pencil, CircleCheck, TrendingUp, Minus } from 'lucide-react';
import { useResource } from '../lib/useResource';
import { api } from '../lib/api';
import {
  Button, Card, ConfirmDialog, DomainChip, EmptyState, Field, Input,
  Modal, Progress, Segmented, Select, Skeleton, Textarea, useToast, cx,
} from '../components/ui';
import { StatTile, ProgressRing } from '../components/charts';
import { DOMAINS, domainColor } from '../lib/domains';
import { quarterKey, todayIso, daysBetween } from '../lib/date';
import { compactNumber, progressPercent } from '../lib/format';
import type { Goal } from '../lib/types';

type Filter = 'active' | 'all' | 'done';

const emptyGoal = (periodKey: string) => ({
  id: undefined as number | undefined,
  title: '', domain: 'personal', period: 'quarter',
  period_key: periodKey, target_value: 100, current_value: 0,
  unit: '%', status: 'active', due_date: '', notes: '',
});

export default function Goals() {
  const [filter, setFilter] = useState<Filter>('active');
  const res = useResource<{ goals: Goal[] }>(`/api/goals?status=${filter === 'all' ? 'all' : filter}`);
  const toast = useToast();

  const today = todayIso();
  const [draft, setDraft] = useState<ReturnType<typeof emptyGoal> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Goal | null>(null);
  const [saving, setSaving] = useState(false);

  const goals = res.data?.goals ?? [];

  /** Bump progress straight from the card — the common case is +1. */
  async function nudge(goal: Goal, delta: number) {
    const next = Math.max(0, goal.current_value + delta);
    res.set((prev) => ({ goals: prev.goals.map((g) => (g.id === goal.id ? { ...g, current_value: next } : g)) }));
    try {
      await api.patch(`/api/goals/${goal.id}`, { current_value: next });
    } catch (err) {
      await res.reload();
      toast.push(err instanceof Error ? err.message : 'Could not update', 'error');
    }
  }

  async function save() {
    if (!draft?.title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        title: draft.title.trim(), domain: draft.domain, period: draft.period,
        period_key: draft.period_key.trim(), target_value: Number(draft.target_value),
        current_value: Number(draft.current_value), unit: draft.unit.trim() || '%',
        status: draft.status, due_date: draft.due_date || null, notes: draft.notes.trim(),
      };
      if (draft.id) await api.patch(`/api/goals/${draft.id}`, payload);
      else await api.post('/api/goals', payload);
      setDraft(null);
      await res.reload();
      toast.push(draft.id ? 'Goal updated' : 'Goal created');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not save the goal', 'error');
    } finally {
      setSaving(false);
    }
  }

  /* ---------------- derived ---------------- */
  const active = goals.filter((g) => g.status === 'active');
  const done = goals.filter((g) => g.status === 'done').length;
  const avgProgress = active.length
    ? Math.round(active.reduce((s, g) => s + progressPercent(g.current_value, g.target_value), 0) / active.length)
    : 0;
  const onTrack = active.filter((g) => progressPercent(g.current_value, g.target_value) >= 50).length;

  const grouped = useMemo(() => {
    const order = { year: 0, quarter: 1, month: 2 } as Record<string, number>;
    const map = new Map<string, Goal[]>();
    for (const g of goals) {
      const key = `${g.period}:${g.period_key}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(g);
    }
    return [...map.entries()].sort((a, b) => {
      const [pa, ka] = a[0].split(':');
      const [pb, kb] = b[0].split(':');
      return (order[pa] ?? 9) - (order[pb] ?? 9) || kb.localeCompare(ka);
    });
  }, [goals]);

  if (res.loading && !res.data) {
    return <div className="space-y-4"><Skeleton className="h-[104px]" /><Skeleton className="h-[420px]" /></div>;
  }

  return (
    <div className="space-y-4 max-w-[1500px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={filter} onChange={setFilter}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'done', label: 'Achieved' },
            { value: 'all', label: 'All' },
          ]}
        />
        <Button variant="primary" size="sm" onClick={() => setDraft(emptyGoal(quarterKey(today)))}>
          <Plus size={15} /> New goal
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 stagger">
        <StatTile label="Active goals" value={active.length} icon={<Target size={15} />} accent={domainColor('work')} />
        <StatTile label="Average progress" value={`${avgProgress}%`} icon={<TrendingUp size={15} />}
          accent={domainColor('health')} deltaTone={avgProgress >= 60 ? 'good' : avgProgress >= 30 ? 'flat' : 'bad'}
          delta={avgProgress >= 60 ? 'Ahead' : avgProgress >= 30 ? 'Moving' : 'Behind'} />
        <StatTile label="On track" value={`${onTrack}/${active.length}`} icon={<CircleCheck size={15} />}
          accent={domainColor('learning')} foot="past halfway" />
        <StatTile label="Achieved" value={done} icon={<CircleCheck size={15} />} accent={domainColor('finance')} />
      </div>

      {goals.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Target size={19} />}
            title={filter === 'done' ? 'Nothing achieved yet' : 'No goals set'}
            message="A goal is a number with a deadline. Everything else is a wish."
            action={<Button variant="primary" onClick={() => setDraft(emptyGoal(quarterKey(today)))}>
              <Plus size={15} /> Set your first goal
            </Button>}
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {grouped.map(([key, list]) => {
            const [period, periodKey] = key.split(':');
            return (
              <section key={key}>
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)] mb-2.5 px-0.5">
                  {period === 'year' ? `${periodKey} — the year` : period === 'quarter' ? periodKey : periodKey}
                  <span className="ml-2 opacity-60">{list.length}</span>
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {list.map((g) => {
                    const pct = progressPercent(g.current_value, g.target_value);
                    const color = domainColor(g.domain);
                    const overdue = g.due_date && g.due_date < today && g.status === 'active';
                    return (
                      <Card key={g.id} className={cx('p-4 group', g.status === 'done' && 'opacity-70')}>
                        <div className="flex items-start gap-3 mb-3">
                          <ProgressRing value={pct} size={46} thickness={4} color={color} label={`${g.title}: ${pct}%`}>
                            <span className="text-[10.5px]">{pct}%</span>
                          </ProgressRing>
                          <div className="min-w-0 flex-1">
                            <h3 className="text-[13.5px] font-semibold text-[var(--ink)] leading-snug">{g.title}</h3>
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <DomainChip domain={g.domain} size="sm" />
                              {g.status !== 'active' && (
                                <span className="text-[10.5px] px-1.5 h-[20px] inline-flex items-center rounded-[var(--radius-full)] bg-[var(--surface-hover)] text-[var(--ink-muted)] capitalize">
                                  {g.status}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7" aria-label={`Edit ${g.title}`}
                              onClick={() => setDraft({
                                id: g.id, title: g.title, domain: g.domain, period: g.period,
                                period_key: g.period_key, target_value: g.target_value,
                                current_value: g.current_value, unit: g.unit, status: g.status,
                                due_date: g.due_date ?? '', notes: g.notes,
                              })}
                            >
                              <Pencil size={13} />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Delete ${g.title}`}
                              onClick={() => setConfirmDelete(g)}>
                              <Trash2 size={13} />
                            </Button>
                          </span>
                        </div>

                        <div className="flex items-baseline justify-between text-[11.5px] mb-1.5">
                          <span className="tabular text-[var(--ink)]">
                            <span className="font-semibold">
                              {g.unit === 'IRT' ? compactNumber(g.current_value) : formatValue(g.current_value)}
                            </span>
                            <span className="text-[var(--ink-muted)]">
                              {' / '}{g.unit === 'IRT' ? compactNumber(g.target_value) : formatValue(g.target_value)} {g.unit}
                            </span>
                          </span>
                          {g.due_date && (
                            <span className={cx('tabular', overdue ? 'text-[var(--status-critical-text)] font-medium' : 'text-[var(--ink-muted)]')}>
                              {overdue ? 'overdue' : `${daysBetween(today, g.due_date)}d left`}
                            </span>
                          )}
                        </div>
                        <Progress value={pct} color={color} label={g.title} />

                        {g.status === 'active' && (
                          <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-[var(--border)]">
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => nudge(g, -step(g))}
                              aria-label={`Decrease ${g.title}`}>
                              <Minus size={13} />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => nudge(g, step(g))}
                              aria-label={`Increase ${g.title}`}>
                              <Plus size={13} />
                            </Button>
                            {pct >= 100 && (
                              <Button
                                size="sm" className="ml-auto h-7"
                                onClick={async () => {
                                  await api.patch(`/api/goals/${g.id}`, { status: 'done' });
                                  await res.reload();
                                  toast.push('Goal achieved — well done');
                                }}
                              >
                                <CircleCheck size={13} /> Mark achieved
                              </Button>
                            )}
                          </div>
                        )}

                        {g.notes && (
                          <p className="text-[11.5px] text-[var(--ink-muted)] mt-3 pt-3 border-t border-[var(--border)] leading-relaxed">
                            {g.notes}
                          </p>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Modal
        open={!!draft} onClose={() => setDraft(null)}
        title={draft?.id ? 'Edit goal' : 'New goal'}
        description={draft?.id ? undefined : 'Name the number you want to reach, and by when.'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
            <Button variant="primary" onClick={save} loading={saving}>{draft?.id ? 'Save changes' : 'Create goal'}</Button>
          </>
        }
      >
        {draft && (
          <div className="space-y-4">
            <Field label="What do you want to achieve?" required>
              <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Bench press 90 kg for 5" autoFocus />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Area of life">
                <Select value={draft.domain} onChange={(e) => setDraft({ ...draft, domain: e.target.value })}>
                  {DOMAINS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                </Select>
              </Field>
              <Field label="Horizon">
                <Select
                  value={draft.period}
                  onChange={(e) => {
                    const period = e.target.value;
                    const period_key = period === 'year' ? today.slice(0, 4)
                      : period === 'quarter' ? quarterKey(today) : today.slice(0, 7);
                    setDraft({ ...draft, period, period_key });
                  }}
                >
                  <option value="year">This year</option>
                  <option value="quarter">This quarter</option>
                  <option value="month">This month</option>
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Current">
                <Input type="number" step="any" min={0} value={draft.current_value}
                  onChange={(e) => setDraft({ ...draft, current_value: Number(e.target.value) })} />
              </Field>
              <Field label="Target" required>
                <Input type="number" step="any" min={0} value={draft.target_value}
                  onChange={(e) => setDraft({ ...draft, target_value: Number(e.target.value) })} />
              </Field>
              <Field label="Unit">
                <Input value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                  placeholder="kg, papers, %" />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Period key" hint="2026, 2026-Q3, 2026-08">
                <Input value={draft.period_key} onChange={(e) => setDraft({ ...draft, period_key: e.target.value })} />
              </Field>
              <Field label="Deadline">
                <Input type="date" value={draft.due_date}
                  onChange={(e) => setDraft({ ...draft, due_date: e.target.value })} />
              </Field>
            </div>

            {draft.id && (
              <Field label="Status">
                <Segmented
                  value={draft.status} onChange={(v) => setDraft({ ...draft, status: v })}
                  options={[
                    { value: 'active', label: 'Active' },
                    { value: 'done', label: 'Achieved' },
                    { value: 'missed', label: 'Missed' },
                    { value: 'dropped', label: 'Dropped' },
                  ]}
                />
              </Field>
            )}

            <Field label="Notes">
              <Textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                placeholder="How will you get there?" className="min-h-[60px]" />
            </Field>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete} onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          await api.del(`/api/goals/${confirmDelete.id}`);
          await res.reload();
          toast.push('Goal deleted');
        }}
        title="Delete this goal?"
        message={`“${confirmDelete?.title}” will be removed permanently.`}
      />
    </div>
  );
}

/** A sensible nudge for the goal's scale — 1 for counts, 1% for percentages. */
function step(goal: Goal): number {
  if (goal.target_value >= 1_000_000) return Math.round(goal.target_value / 100);
  if (goal.target_value >= 1000) return 10;
  if (goal.target_value >= 100) return 1;
  if (goal.target_value >= 10) return 1;
  return 0.5;
}

function formatValue(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

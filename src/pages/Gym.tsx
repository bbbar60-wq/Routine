import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus, Dumbbell, Trophy, Trash2, Pencil, Weight, Flame, X, CalendarDays, ChevronDown,
} from 'lucide-react';
import { useResource } from '../lib/useResource';
import { api, qs } from '../lib/api';
import { useApp } from '../state/app';
import {
  Button, Card, CardHeader, Checkbox, ConfirmDialog, EmptyState, Field, Input,
  Modal, Segmented, Select, Skeleton, Textarea, useToast, cx,
} from '../components/ui';
import { StatTile, BarChart, HBarList, type BarDatum } from '../components/charts';

import { addDays, formatDate, formatMinutes, startOfWeek, todayIso } from '../lib/date';
import { compactNumber, formatNumber, formatWeight } from '../lib/format';
import type { Workout, LiftRecord } from '../lib/types';

const KINDS = ['Push', 'Pull', 'Legs', 'Upper', 'Lower', 'Full body', 'Arms', 'Core', 'Other'];

const MUSCLES = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core'];

/** A template makes logging a session two taps instead of twenty. */
const TEMPLATES: Record<string, Array<{ name: string; muscle: string }>> = {
  Push: [
    { name: 'Bench Press', muscle: 'chest' },
    { name: 'Incline Dumbbell Press', muscle: 'chest' },
    { name: 'Overhead Press', muscle: 'shoulders' },
    { name: 'Cable Fly', muscle: 'chest' },
    { name: 'Triceps Pushdown', muscle: 'triceps' },
  ],
  Pull: [
    { name: 'Deadlift', muscle: 'back' },
    { name: 'Pull-up', muscle: 'back' },
    { name: 'Barbell Row', muscle: 'back' },
    { name: 'Face Pull', muscle: 'shoulders' },
    { name: 'Barbell Curl', muscle: 'biceps' },
  ],
  Legs: [
    { name: 'Back Squat', muscle: 'quads' },
    { name: 'Romanian Deadlift', muscle: 'hamstrings' },
    { name: 'Leg Press', muscle: 'quads' },
    { name: 'Leg Curl', muscle: 'hamstrings' },
    { name: 'Standing Calf Raise', muscle: 'calves' },
  ],
};

interface DraftSet { reps: number; weight_kg: number; rpe: number | null; is_warmup: boolean }
interface DraftExercise { name: string; muscle: string; sets: DraftSet[] }
interface Draft {
  id?: number;
  date: string; kind: string; title: string;
  duration_min: number; rpe: number | null; notes: string;
  exercises: DraftExercise[];
}

const newDraft = (): Draft => ({
  date: todayIso(), kind: 'Push', title: '', duration_min: 60, rpe: null, notes: '',
  exercises: [],
});

const FITNESS = 'var(--domain-fitness)';

export default function Gym() {
  const [params, setParams] = useSearchParams();
  const [range, setRange] = useState<'30' | '90' | '365'>('90');
  const today = todayIso();
  const from = useMemo(() => addDays(today, -(Number(range) - 1)), [range, today]);

  const res = useResource<{ workouts: Workout[] }>(`/api/workouts${qs({ from, to: today })}`);
  const recordsRes = useResource<{ records: LiftRecord[] }>('/api/workouts/records');
  const { settings } = useApp();
  const toast = useToast();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Workout | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const workouts = res.data?.workouts ?? [];
  const records = recordsRes.data?.records ?? [];

  useEffect(() => {
    if (params.get('new') === '1') { setDraft(newDraft()); setParams({}, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const openEdit = useCallback((w: Workout) => {
    setDraft({
      id: w.id, date: w.date, kind: w.kind, title: w.title,
      duration_min: w.duration_min, rpe: w.rpe, notes: w.notes,
      exercises: w.exercises.map((e) => ({
        name: e.name, muscle: e.muscle,
        sets: e.sets.map((s) => ({ reps: s.reps, weight_kg: s.weight_kg, rpe: s.rpe, is_warmup: !!s.is_warmup })),
      })),
    });
    setError('');
  }, []);

  async function save() {
    if (!draft) return;
    if (draft.exercises.length === 0) { setError('Add at least one exercise'); return; }
    if (draft.exercises.some((e) => !e.name.trim())) { setError('Every exercise needs a name'); return; }
    setSaving(true);
    try {
      const payload = {
        date: draft.date, kind: draft.kind, title: draft.title.trim(),
        duration_min: Number(draft.duration_min) || 0, rpe: draft.rpe, notes: draft.notes.trim(),
        exercises: draft.exercises.map((e) => ({
          name: e.name.trim(), muscle: e.muscle,
          sets: e.sets.map((s) => ({
            reps: Number(s.reps) || 0, weight_kg: Number(s.weight_kg) || 0,
            rpe: s.rpe, is_warmup: s.is_warmup,
          })),
        })),
      };
      if (draft.id) await api.put(`/api/workouts/${draft.id}`, payload);
      else await api.post('/api/workouts', payload);
      setDraft(null);
      await Promise.all([res.reload(), recordsRes.reload()]);
      toast.push(draft.id ? 'Workout updated' : 'Workout logged');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the workout');
    } finally {
      setSaving(false);
    }
  }

  /* ---------------- derived ---------------- */
  const weekStart = startOfWeek(today, settings.weekStart);
  const thisWeek = workouts.filter((w) => w.date >= weekStart).length;
  const totalVolume = workouts.reduce((s, w) => s + w.volume, 0);
  const totalSets = workouts.reduce((s, w) => s + w.set_count, 0);
  const avgDuration = workouts.length
    ? Math.round(workouts.reduce((s, w) => s + w.duration_min, 0) / workouts.length)
    : 0;

  const volumeChart = useMemo<BarDatum[]>(() => {
    const weeks = new Map<string, number>();
    for (const w of workouts) {
      const key = startOfWeek(w.date, settings.weekStart);
      weeks.set(key, (weeks.get(key) ?? 0) + w.volume);
    }
    return [...weeks.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, volume]) => ({
        label: week.slice(5).replace('-', '/'),
        values: { volume },
        meta: `Week of ${formatDate(week)}`,
      }));
  }, [workouts, settings.weekStart]);

  const byMuscle = useMemo(() => {
    const totals = new Map<string, number>();
    for (const w of workouts) {
      for (const e of w.exercises) {
        const key = e.muscle || 'other';
        totals.set(key, (totals.get(key) ?? 0) + e.volume);
      }
    }
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([muscle, volume], i) => ({
        key: muscle,
        label: muscle[0].toUpperCase() + muscle.slice(1),
        value: volume,
        // One hue, stepped by rank — this is magnitude, not identity.
        color: `color-mix(in oklab, ${FITNESS} ${Math.max(35, 100 - i * 11)}%, var(--surface))`,
      }));
  }, [workouts]);

  if (res.loading && !res.data) {
    return <div className="space-y-4"><Skeleton className="h-[104px]" /><Skeleton className="h-[420px]" /></div>;
  }

  return (
    <div className="space-y-4 max-w-[1500px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={range} onChange={setRange}
          options={[{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '365', label: 'Year' }]}
        />
        <Button variant="primary" size="sm" onClick={() => setDraft(newDraft())}>
          <Plus size={15} /> Log workout
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 stagger">
        <StatTile label="Sessions" value={workouts.length} icon={<Dumbbell size={15} />} accent={FITNESS}
          delta={`${thisWeek} this week`} deltaTone={thisWeek >= 3 ? 'good' : 'flat'} />
        <StatTile label="Total volume" value={compactNumber(totalVolume)} unit="kg" icon={<Weight size={15} />}
          accent={FITNESS} foot={`${formatNumber(totalSets)} working sets`} />
        <StatTile label="Avg session" value={avgDuration} unit="min" icon={<CalendarDays size={15} />} accent={FITNESS} />
        <StatTile label="Lifts tracked" value={records.length} icon={<Trophy size={15} />} accent={FITNESS}
          foot={records[0] ? `Best: ${records[0].name}` : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 p-4">
          <h3 className="text-[13px] font-semibold mb-1">Weekly training volume</h3>
          <p className="text-[11.5px] text-[var(--ink-muted)] mb-3">Sets × reps × weight, working sets only.</p>
          {volumeChart.length === 0 ? (
            <EmptyState title="No workouts in this range" message="Log a session and the trend starts here." />
          ) : (
            <BarChart
              data={volumeChart}
              series={[{ key: 'volume', label: 'Volume', color: FITNESS }]}
              height={225} stacked highlightLast
              formatValue={(v) => compactNumber(v)}
            />
          )}
        </Card>

        <Card className="p-4">
          <h3 className="text-[13px] font-semibold mb-1">Volume by muscle group</h3>
          <p className="text-[11.5px] text-[var(--ink-muted)] mb-3.5">Where the work is going.</p>
          <HBarList items={byMuscle} formatValue={(v) => `${compactNumber(v)} kg`} emptyLabel="No exercises logged yet." />
        </Card>
      </div>

      {/* ---------------- records ---------------- */}
      <Card>
        <CardHeader
          title="Personal records" icon={<Trophy size={15} />}
          subtitle="Best estimated one-rep max per lift (Epley formula)"
        />
        {records.length === 0 ? (
          <EmptyState icon={<Trophy size={19} />} title="No records yet"
            message="Log a few working sets and your bests will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
                  <th className="text-left font-semibold px-4 py-2">Lift</th>
                  <th className="text-right font-semibold px-3 py-2">Best set</th>
                  <th className="text-right font-semibold px-3 py-2">Est. 1RM</th>
                  <th className="text-right font-semibold px-4 py-2">Achieved</th>
                </tr>
              </thead>
              <tbody>
                {records.slice(0, 12).map((r) => (
                  <tr key={r.name} className="border-t border-[var(--border)] hover:bg-[var(--surface-hover)] transition-colors">
                    <td className="px-4 py-2.5 font-medium text-[var(--ink)]">{r.name}</td>
                    <td className="px-3 py-2.5 text-right tabular text-[var(--ink-secondary)]">
                      {r.reps} × {formatWeight(r.weight_kg, settings.units)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular font-semibold" style={{ color: FITNESS }}>
                      {formatWeight(r.e1rm, settings.units)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular text-[var(--ink-muted)]">{formatDate(r.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ---------------- log ---------------- */}
      <Card>
        <CardHeader title="Training log" subtitle={`${workouts.length} sessions`} icon={<Dumbbell size={15} />} />
        {workouts.length === 0 ? (
          <EmptyState icon={<Dumbbell size={19} />} title="No workouts yet"
            message="Log your first session — pick a template and it fills in the exercises for you."
            action={<Button variant="primary" onClick={() => setDraft(newDraft())}><Plus size={15} /> Log workout</Button>} />
        ) : (
          <ul>
            {workouts.map((w) => {
              const open = expanded === w.id;
              return (
                <li key={w.id} className="border-t border-[var(--border)]">
                  <div className="group flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--surface-hover)] transition-colors">
                    <button
                      onClick={() => setExpanded(open ? null : w.id)}
                      aria-expanded={open}
                      className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <ChevronDown
                        size={15}
                        className={cx('text-[var(--ink-muted)] shrink-0 transition-transform duration-200', open && 'rotate-180')}
                        aria-hidden
                      />
                      <span
                        className="text-[11px] font-semibold px-2 h-[22px] inline-flex items-center rounded-[var(--radius-full)] shrink-0"
                        style={{ background: `color-mix(in oklab, ${FITNESS} 15%, transparent)`, color: 'var(--ink-secondary)' }}
                      >
                        {w.kind}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13.5px] text-[var(--ink)] truncate">
                          {w.title || `${w.kind} session`}
                        </span>
                        <span className="block text-[11.5px] text-[var(--ink-muted)]">
                          {w.exercises.length} exercises · {w.set_count} sets · {compactNumber(w.volume)} kg
                        </span>
                      </span>
                    </button>
                    <span className="flex items-center gap-3 shrink-0">
                      {w.rpe != null && (
                        <span className="hidden sm:inline-flex items-center gap-1 text-[11.5px] text-[var(--ink-muted)] tabular">
                          <Flame size={11} /> RPE {w.rpe}
                        </span>
                      )}
                      <span className="text-[11.5px] text-[var(--ink-muted)] tabular">{formatMinutes(w.duration_min)}</span>
                      <span className="text-[11.5px] text-[var(--ink-muted)] tabular w-[58px] text-right">{formatDate(w.date)}</span>
                      <span className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex gap-0.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(w)} aria-label="Edit workout">
                          <Pencil size={13} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setConfirmDelete(w)} aria-label="Delete workout">
                          <Trash2 size={13} />
                        </Button>
                      </span>
                    </span>
                  </div>

                  {open && (
                    <div className="px-4 pb-3.5 pl-11 animate-fade">
                      <table className="w-full text-[12px] max-w-2xl">
                        <thead>
                          <tr className="text-[10.5px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
                            <th className="text-left font-semibold py-1.5">Exercise</th>
                            <th className="text-left font-semibold py-1.5">Sets</th>
                            <th className="text-right font-semibold py-1.5">Volume</th>
                          </tr>
                        </thead>
                        <tbody>
                          {w.exercises.map((e, i) => (
                            <tr key={i} className="border-t border-[var(--border)]">
                              <td className="py-1.5 pr-3 text-[var(--ink)]">{e.name}</td>
                              <td className="py-1.5 pr-3 text-[var(--ink-secondary)] tabular">
                                {e.sets.filter((s) => !s.is_warmup).map((s) => `${s.reps}×${s.weight_kg}`).join('  ') || '—'}
                              </td>
                              <td className="py-1.5 text-right tabular text-[var(--ink-muted)]">
                                {compactNumber(e.volume)} kg
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {w.notes && <p className="text-[12px] text-[var(--ink-muted)] mt-2.5 italic">{w.notes}</p>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* ---------------- editor ---------------- */}
      <Modal
        open={!!draft} onClose={() => setDraft(null)} width="lg"
        title={draft?.id ? 'Edit workout' : 'Log a workout'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
            <Button variant="primary" onClick={save} loading={saving}>
              {draft?.id ? 'Save changes' : 'Save workout'}
            </Button>
          </>
        }
      >
        {draft && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="Date" required>
                <Input type="date" max={today} value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
              </Field>
              <Field label="Kind">
                <Select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
                  {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                </Select>
              </Field>
              <Field label="Duration" hint="minutes">
                <Input type="number" min={0} max={600} value={draft.duration_min}
                  onChange={(e) => setDraft({ ...draft, duration_min: Number(e.target.value) })} />
              </Field>
              <Field label="Session RPE" hint="1–10, optional">
                <Input type="number" min={1} max={10} step="0.5" value={draft.rpe ?? ''}
                  onChange={(e) => setDraft({ ...draft, rpe: e.target.value === '' ? null : Number(e.target.value) })} />
              </Field>
            </div>

            {draft.exercises.length === 0 && TEMPLATES[draft.kind] && (
              <div className="flex items-center gap-2.5 p-3 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] border border-[var(--border)]">
                <span className="text-[12.5px] text-[var(--ink-secondary)]">
                  Start from your usual {draft.kind.toLowerCase()} session?
                </span>
                <Button
                  size="sm" className="ml-auto"
                  onClick={() => setDraft({
                    ...draft,
                    exercises: TEMPLATES[draft.kind].map((t) => ({
                      ...t, sets: [{ reps: 8, weight_kg: 0, rpe: null, is_warmup: false }],
                    })),
                  })}
                >
                  Use template
                </Button>
              </div>
            )}

            {/* exercises */}
            <div className="space-y-3">
              {draft.exercises.map((ex, ei) => (
                <div key={ei} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-sunken)]/40 p-3">
                  <div className="flex items-center gap-2 mb-2.5">
                    <Input
                      value={ex.name}
                      onChange={(e) => {
                        const exercises = [...draft.exercises];
                        exercises[ei] = { ...ex, name: e.target.value };
                        setDraft({ ...draft, exercises });
                      }}
                      placeholder="Exercise name"
                      className="h-9 flex-1"
                      aria-label={`Exercise ${ei + 1} name`}
                    />
                    <Select
                      value={ex.muscle}
                      onChange={(e) => {
                        const exercises = [...draft.exercises];
                        exercises[ei] = { ...ex, muscle: e.target.value };
                        setDraft({ ...draft, exercises });
                      }}
                      className="h-9 w-[130px]"
                      aria-label={`Exercise ${ei + 1} muscle group`}
                    >
                      <option value="">Muscle…</option>
                      {MUSCLES.map((m) => <option key={m} value={m}>{m}</option>)}
                    </Select>
                    <Button
                      variant="ghost" size="icon" className="h-9 w-9"
                      onClick={() => setDraft({ ...draft, exercises: draft.exercises.filter((_, i) => i !== ei) })}
                      aria-label={`Remove ${ex.name || 'exercise'}`}
                    >
                      <X size={15} />
                    </Button>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.06em] text-[var(--ink-muted)] px-0.5">
                      <span className="w-6">#</span>
                      <span className="w-[68px]">Reps</span>
                      <span className="w-[84px]">Weight</span>
                      <span className="flex-1">Warm-up</span>
                    </div>
                    {ex.sets.map((set, si) => (
                      <div key={si} className="flex items-center gap-2">
                        <span className="w-6 text-[12px] tabular text-[var(--ink-muted)]">{si + 1}</span>
                        <Input
                          type="number" min={0} max={1000} value={set.reps}
                          onChange={(e) => {
                            const exercises = [...draft.exercises];
                            const sets = [...ex.sets];
                            sets[si] = { ...set, reps: Number(e.target.value) };
                            exercises[ei] = { ...ex, sets };
                            setDraft({ ...draft, exercises });
                          }}
                          className="h-9 w-[68px]" aria-label={`Set ${si + 1} reps`}
                        />
                        <Input
                          type="number" min={0} step="0.5" value={set.weight_kg}
                          onChange={(e) => {
                            const exercises = [...draft.exercises];
                            const sets = [...ex.sets];
                            sets[si] = { ...set, weight_kg: Number(e.target.value) };
                            exercises[ei] = { ...ex, sets };
                            setDraft({ ...draft, exercises });
                          }}
                          className="h-9 w-[84px]" aria-label={`Set ${si + 1} weight in kg`}
                        />
                        <div className="flex-1">
                          <Checkbox
                            checked={set.is_warmup}
                            onChange={(v) => {
                              const exercises = [...draft.exercises];
                              const sets = [...ex.sets];
                              sets[si] = { ...set, is_warmup: v };
                              exercises[ei] = { ...ex, sets };
                              setDraft({ ...draft, exercises });
                            }}
                          />
                        </div>
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8"
                          onClick={() => {
                            const exercises = [...draft.exercises];
                            exercises[ei] = { ...ex, sets: ex.sets.filter((_, i) => i !== si) };
                            setDraft({ ...draft, exercises });
                          }}
                          aria-label={`Remove set ${si + 1}`}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    ))}
                    <Button
                      size="sm" variant="ghost" className="mt-1"
                      onClick={() => {
                        const last = ex.sets[ex.sets.length - 1];
                        const exercises = [...draft.exercises];
                        exercises[ei] = {
                          ...ex,
                          sets: [...ex.sets, {
                            reps: last?.reps ?? 8, weight_kg: last?.weight_kg ?? 0,
                            rpe: null, is_warmup: false,
                          }],
                        };
                        setDraft({ ...draft, exercises });
                      }}
                    >
                      <Plus size={13} /> Add set
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <Button
              onClick={() => setDraft({
                ...draft,
                exercises: [...draft.exercises, { name: '', muscle: '', sets: [{ reps: 8, weight_kg: 0, rpe: null, is_warmup: false }] }],
              })}
              className="w-full justify-center"
            >
              <Plus size={15} /> Add exercise
            </Button>

            <Field label="Notes">
              <Textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                placeholder="How it felt, what to change next time." className="min-h-[60px]" />
            </Field>

            {error && <p className="text-[12.5px] text-[var(--status-critical-text)]" role="alert">{error}</p>}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete} onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          await api.del(`/api/workouts/${confirmDelete.id}`);
          await Promise.all([res.reload(), recordsRes.reload()]);
          toast.push('Workout deleted');
        }}
        title="Delete this workout?"
        message="Every exercise and set in this session will be removed, and your records will be recalculated."
      />
    </div>
  );
}

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Flame, Pencil, Trash2, Repeat2, Check, TrendingUp } from 'lucide-react';
import { useResource } from '../lib/useResource';
import { api } from '../lib/api';
import {
  Button, Card, CardHeader, Checkbox, ConfirmDialog, DomainChip, EmptyState, Field,
  Input, Modal, Segmented, Select, Skeleton, useToast, cx,
} from '../components/ui';
import { StatTile, HBarList } from '../components/charts';
import { DOMAINS, domainColor } from '../lib/domains';
import { addDays, dateRange, todayIso, weekdayLetter, weekdayOf, formatDate } from '../lib/date';
import type { Habit } from '../lib/types';

const CADENCES = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Specific days' },
  { value: 'weekly', label: 'N times a week' },
];

const emptyForm = {
  name: '', domain: 'personal', cadence: 'daily',
  target_per_week: 7, weekdays: [0, 1, 2, 3, 4, 5, 6],
  unit: '', target_value: '' as string | number,
};
type Form = typeof emptyForm;

export default function Habits() {
  const [params, setParams] = useSearchParams();
  const [range, setRange] = useState<'14' | '30' | '90'>('30');
  const { data, loading, reload } = useResource<{ habits: Habit[]; from: string; to: string }>('/api/habits');
  const toast = useToast();

  const [editing, setEditing] = useState<Habit | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Habit | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const today = todayIso();
  const days = useMemo(() => dateRange(addDays(today, -(Number(range) - 1)), today), [range, today]);

  // The grid is wider than the card on most screens, and today is the last
  // column — start scrolled to it rather than to 30 days ago.
  const gridRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = gridRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [range, data]);

  useEffect(() => {
    if (params.get('new') === '1') { openCreate(); setParams({}, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  function openCreate() {
    setForm(emptyForm);
    setFormError('');
    setEditing(null);
    setCreating(true);
  }

  function openEdit(habit: Habit) {
    setForm({
      name: habit.name, domain: habit.domain, cadence: habit.cadence,
      target_per_week: habit.target_per_week, weekdays: habit.weekdays,
      unit: habit.unit, target_value: habit.target_value ?? '',
    });
    setFormError('');
    setEditing(habit);
    setCreating(true);
  }

  const toggle = useCallback(async (habit: Habit, date: string, done: boolean) => {
    if (date > today) return;
    const key = `${habit.id}:${date}`;
    setPending(key);
    try {
      await api.put(`/api/habits/${habit.id}/log`, { date, done });
      await reload();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not save that', 'error');
    } finally {
      setPending(null);
    }
  }, [reload, toast, today]);

  async function save() {
    const name = form.name.trim();
    if (!name) { setFormError('Give the habit a name'); return; }
    if (form.cadence === 'weekdays' && form.weekdays.length === 0) {
      setFormError('Pick at least one day of the week');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name,
        domain: form.domain,
        cadence: form.cadence,
        target_per_week: form.cadence === 'weekly' ? Number(form.target_per_week) || 3 : 7,
        weekdays: (form.cadence === 'weekdays' ? form.weekdays : [0, 1, 2, 3, 4, 5, 6]).join(','),
        unit: form.unit.trim(),
        target_value: form.target_value === '' ? null : Number(form.target_value),
      };
      if (editing) await api.patch(`/api/habits/${editing.id}`, payload);
      else await api.post('/api/habits', payload);
      setCreating(false);
      await reload();
      toast.push(editing ? 'Habit updated' : 'Habit created');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save the habit');
    } finally {
      setSaving(false);
    }
  }

  async function remove(habit: Habit) {
    try {
      await api.del(`/api/habits/${habit.id}`);
      await reload();
      toast.push('Habit deleted');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not delete that', 'error');
    }
  }

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[104px]" />)}
        </div>
        <Skeleton className="h-[420px]" />
      </div>
    );
  }

  const habits = data?.habits ?? [];
  const scheduledToday = habits.filter((h) => h.scheduledToday);
  const doneToday = scheduledToday.filter((h) => h.todayLog?.done).length;
  const bestStreak = Math.max(0, ...habits.map((h) => h.streak));
  const avgRate = habits.length
    ? Math.round(habits.reduce((s, h) => s + (h.last30 / 30) * 100, 0) / habits.length)
    : 0;

  return (
    <div className="space-y-4 max-w-[1500px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={range} onChange={setRange}
          options={[
            { value: '14', label: '14 days' },
            { value: '30', label: '30 days' },
            { value: '90', label: '90 days' },
          ]}
        />
        <Button variant="primary" size="sm" onClick={openCreate}>
          <Plus size={15} /> New habit
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 stagger">
        <StatTile label="Today" value={`${doneToday}/${scheduledToday.length}`} icon={<Check size={15} />}
          accent={domainColor('personal')}
          delta={scheduledToday.length && doneToday === scheduledToday.length ? 'All done' : `${scheduledToday.length - doneToday} left`}
          deltaTone={scheduledToday.length && doneToday === scheduledToday.length ? 'good' : 'flat'} />
        <StatTile label="Longest active streak" value={bestStreak} unit="days" icon={<Flame size={15} />}
          accent={domainColor('fitness')} />
        <StatTile label="30-day completion" value={`${avgRate}%`} icon={<TrendingUp size={15} />}
          accent={domainColor('health')}
          deltaTone={avgRate >= 75 ? 'good' : avgRate >= 50 ? 'flat' : 'bad'}
          delta={avgRate >= 75 ? 'Strong' : avgRate >= 50 ? 'Holding' : 'Slipping'} />
        <StatTile label="Tracked habits" value={habits.length} icon={<Repeat2 size={15} />}
          accent={domainColor('learning')} />
      </div>

      {habits.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Repeat2 size={19} />} title="No habits yet"
            message="Habits are the backbone of the whole system — everything else measures what they produce."
            action={<Button variant="primary" onClick={openCreate}><Plus size={15} /> Create your first habit</Button>}
          />
        </Card>
      ) : (
        <>
          {/* ---------- the grid ---------- */}
          <Card className="overflow-hidden">
            <CardHeader title="Consistency grid" subtitle={`Tap any square to log it · last ${range} days`} icon={<Repeat2 size={15} />} />
            <div ref={gridRef} className="overflow-x-auto pb-2">
              <div className="min-w-max px-4 pb-2">
                {/* weekday ruler */}
                {/* No flex gap beside the pinned column — a transparent gap
                    would let the scrolled-under cells show through it. */}
                <div className="flex items-center mb-1.5">
                  <span className="sticky left-0 z-10 w-[136px] sm:w-[180px] shrink-0 bg-[var(--surface)]" />
                  <div className="flex gap-[3px]">
                    {days.map((d) => (
                      <span key={d} className={cx(
                        'w-[22px] text-center text-[9.5px]',
                        d === today ? 'text-[var(--ink)] font-semibold' : 'text-[var(--ink-muted)]'
                      )}>
                        {weekdayLetter(weekdayOf(d))}
                      </span>
                    ))}
                  </div>
                  <span className="w-[116px] shrink-0" />
                </div>

                <ul className="space-y-[3px]">
                  {habits.map((habit) => {
                    const logged = new Set(habit.logs.filter((l) => l.done).map((l) => l.date));
                    const color = domainColor(habit.domain);
                    const scheduledOn = (d: string) =>
                      habit.cadence === 'daily' || habit.cadence === 'weekly' || habit.weekdays.includes(weekdayOf(d));
                    return (
                      <li key={habit.id} className="flex items-center group">
                        {/* Pinned so you can still tell the rows apart once the
                            grid is scrolled to today on a narrow screen. The
                            right padding is what hides the cells sliding under it. */}
                        <div className="sticky left-0 z-10 w-[136px] sm:w-[180px] shrink-0 min-w-0 flex items-center gap-2 bg-[var(--surface)] pr-3">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} aria-hidden />
                          <span className="text-[12.5px] text-[var(--ink)] truncate">{habit.name}</span>
                        </div>

                        <div className="flex gap-[3px]">
                          {days.map((d) => {
                            const on = logged.has(d);
                            const sched = scheduledOn(d);
                            const future = d > today;
                            const key = `${habit.id}:${d}`;
                            return (
                              <button
                                key={d}
                                onClick={() => toggle(habit, d, !on)}
                                disabled={future || pending === key}
                                aria-label={`${habit.name} on ${formatDate(d)}: ${on ? 'done' : 'not done'}`}
                                title={`${formatDate(d)} — ${on ? 'done' : sched ? 'not done' : 'not scheduled'}`}
                                className={cx(
                                  'w-[22px] h-[22px] rounded-[5px] border transition-all duration-100',
                                  future ? 'cursor-default opacity-30' : 'cursor-pointer hover:scale-[1.15]',
                                  on ? 'border-transparent' : sched
                                    ? 'bg-[var(--surface-sunken)] border-[var(--border)] hover:border-[var(--ink-muted)]'
                                    : 'bg-transparent border-[var(--border)] border-dashed'
                                )}
                                style={on ? { background: color } : undefined}
                              />
                            );
                          })}
                        </div>

                        <div className="w-[116px] shrink-0 flex items-center justify-end gap-1.5 pl-3">
                          <span className="inline-flex items-center gap-1 text-[11.5px] tabular text-[var(--ink-muted)]" title={`Current streak · best ${habit.longestStreak}`}>
                            <Flame size={11} style={{ color: habit.streak >= 7 ? 'var(--status-warning)' : undefined }} />
                            {habit.streak}
                          </span>
                          <span className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex gap-0.5">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(habit)} aria-label={`Edit ${habit.name}`}>
                              <Pencil size={13} />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setConfirmDelete(habit)} aria-label={`Delete ${habit.name}`}>
                              <Trash2 size={13} />
                            </Button>
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <h3 className="text-[13px] font-semibold mb-3">30-day completion by habit</h3>
              <HBarList
                items={[...habits]
                  .sort((a, b) => b.last30 - a.last30)
                  .map((h) => ({
                    key: String(h.id), label: h.name,
                    value: Math.round((h.last30 / 30) * 100),
                    color: domainColor(h.domain),
                    meta: `${h.last30}d`,
                  }))}
                max={100}
                formatValue={(v) => `${Math.round(v)}%`}
              />
            </Card>

            <Card className="p-4">
              <h3 className="text-[13px] font-semibold mb-1">Streaks</h3>
              <p className="text-[11.5px] text-[var(--ink-muted)] mb-3">Current run against your personal best.</p>
              <ul className="space-y-2.5">
                {[...habits].sort((a, b) => b.streak - a.streak).map((h) => (
                  <li key={h.id} className="flex items-center gap-3">
                    <DomainChip domain={h.domain} showLabel={false} size="sm" />
                    <span className="text-[12.5px] truncate flex-1">{h.name}</span>
                    <span className="text-[12px] tabular font-medium text-[var(--ink)]">{h.streak}d</span>
                    <span className="text-[11.5px] tabular text-[var(--ink-muted)] w-[70px] text-right">
                      best {h.longestStreak}d
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}

      {/* ---------- editor ---------- */}
      <Modal
        open={creating} onClose={() => setCreating(false)}
        title={editing ? 'Edit habit' : 'New habit'}
        description={editing ? undefined : 'Small, repeatable, and easy to say yes to.'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            <Button variant="primary" onClick={save} loading={saving}>
              {editing ? 'Save changes' : 'Create habit'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" required error={formError && !form.name.trim() ? formError : undefined}>
            <Input
              value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Read a paper" autoFocus
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Area of life">
              <Select value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })}>
                {DOMAINS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </Select>
            </Field>
            <Field label="Rhythm">
              <Select value={form.cadence} onChange={(e) => setForm({ ...form, cadence: e.target.value })}>
                {CADENCES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
            </Field>
          </div>

          {form.cadence === 'weekdays' && (
            <Field label="Which days" error={formError && form.weekdays.length === 0 ? formError : undefined}>
              <div className="flex gap-1.5">
                {[6, 0, 1, 2, 3, 4, 5].map((d) => {
                  const on = form.weekdays.includes(d);
                  return (
                    <button
                      key={d} type="button"
                      onClick={() => setForm({
                        ...form,
                        weekdays: on ? form.weekdays.filter((x) => x !== d) : [...form.weekdays, d].sort(),
                      })}
                      aria-pressed={on}
                      className={cx(
                        'h-10 flex-1 rounded-[var(--radius-md)] border text-[12px] font-medium cursor-pointer transition-colors',
                        on
                          ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--ink-on-accent)]'
                          : 'bg-[var(--surface-raised)] border-[var(--border-strong)] text-[var(--ink-muted)] hover:border-[var(--ink-muted)]'
                      )}
                    >
                      {weekdayLetter(d)}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}

          {form.cadence === 'weekly' && (
            <Field label="Times per week" hint="A week counts toward the streak once it hits this number.">
              <Input
                type="number" min={1} max={21} value={form.target_per_week}
                onChange={(e) => setForm({ ...form, target_per_week: Number(e.target.value) })}
              />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Unit" hint="Optional — e.g. km, pages, L">
              <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="min" />
            </Field>
            <Field label="Daily target" hint="Optional">
              <Input
                type="number" step="0.1" min={0} value={form.target_value}
                onChange={(e) => setForm({ ...form, target_value: e.target.value })}
                placeholder="20"
              />
            </Field>
          </div>

          {editing && (
            <div className="pt-1">
              <Checkbox
                checked={!!editing.archived}
                onChange={async (v) => {
                  await api.patch(`/api/habits/${editing.id}`, { archived: v });
                  await reload();
                  setCreating(false);
                  toast.push(v ? 'Habit archived' : 'Habit restored');
                }}
                label="Archive this habit"
              />
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete} onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && remove(confirmDelete)}
        title="Delete this habit?"
        message={`“${confirmDelete?.name}” and every log attached to it will be removed. This cannot be undone — archive it instead if you just want it off the grid.`}
      />
    </div>
  );
}

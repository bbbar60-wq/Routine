import { useMemo, useState } from 'react';
import { Plus, Trophy, Trash2, Pencil, Route, Timer, Flame, Activity } from 'lucide-react';
import { useResource } from '../lib/useResource';
import { api, qs } from '../lib/api';
import {
  Button, Card, CardHeader, ConfirmDialog, EmptyState, Field, Input,
  Modal, ScalePicker, Segmented, Select, Skeleton, Textarea, useToast,
} from '../components/ui';
import { StatTile, BarChart, HBarList, type BarDatum } from '../components/charts';

import { addDays, formatDate, formatMinutes, startOfWeek, todayIso, toHours } from '../lib/date';
import { formatNumber } from '../lib/format';
import type { SportSession } from '../lib/types';

const SPORTS = 'var(--domain-sports)';

const COMMON = ['Football', 'Running', 'Swimming', 'Cycling', 'Basketball', 'Volleyball', 'Tennis', 'Hiking', 'Climbing', 'Other'];
const DISTANCE_SPORTS = new Set(['Running', 'Cycling', 'Swimming', 'Hiking']);
const INTENSITY_LABELS = ['', 'Easy', 'Light', 'Moderate', 'Hard', 'All out'];

const emptyDraft = (date: string) => ({
  id: undefined as number | undefined,
  date, sport: 'Football', duration_min: 60,
  distance_km: '' as string | number, intensity: 3,
  calories: '' as string | number, notes: '',
});

export default function Sports() {
  const [range, setRange] = useState<'30' | '90' | '365'>('90');
  const today = todayIso();
  const from = useMemo(() => addDays(today, -(Number(range) - 1)), [range, today]);

  const res = useResource<{ sessions: SportSession[] }>(`/api/sports${qs({ from, to: today })}`);
  const toast = useToast();

  const [draft, setDraft] = useState<ReturnType<typeof emptyDraft> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SportSession | null>(null);
  const [saving, setSaving] = useState(false);

  const sessions = res.data?.sessions ?? [];

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const payload = {
        date: draft.date, sport: draft.sport.trim(),
        duration_min: Number(draft.duration_min) || 0,
        distance_km: draft.distance_km === '' ? null : Number(draft.distance_km),
        intensity: Number(draft.intensity),
        calories: draft.calories === '' ? null : Number(draft.calories),
        notes: draft.notes.trim(),
      };
      if (draft.id) await api.patch(`/api/sports/${draft.id}`, payload);
      else await api.post('/api/sports', payload);
      setDraft(null);
      await res.reload();
      toast.push(draft.id ? 'Session updated' : 'Session logged');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not save that', 'error');
    } finally {
      setSaving(false);
    }
  }

  /* ---------------- derived ---------------- */
  const weekStart = startOfWeek(today);
  const thisWeek = sessions.filter((s) => s.date >= weekStart).length;
  const totalMin = sessions.reduce((s, x) => s + x.duration_min, 0);
  const totalKm = sessions.reduce((s, x) => s + (x.distance_km ?? 0), 0);
  const totalCal = sessions.reduce((s, x) => s + (x.calories ?? 0), 0);

  const bySport = useMemo(() => {
    const map = new Map<string, { minutes: number; sessions: number; distance: number }>();
    for (const s of sessions) {
      const cur = map.get(s.sport) ?? { minutes: 0, sessions: 0, distance: 0 };
      cur.minutes += s.duration_min;
      cur.sessions += 1;
      cur.distance += s.distance_km ?? 0;
      map.set(s.sport, cur);
    }
    return [...map.entries()]
      .sort((a, b) => b[1].minutes - a[1].minutes)
      .map(([sport, v], i) => ({
        key: sport, label: sport, value: v.minutes,
        // Magnitude ramp on one hue — these are ranks, not identities.
        color: `color-mix(in oklab, ${SPORTS} ${Math.max(35, 100 - i * 13)}%, var(--surface))`,
        meta: `${v.sessions}×`,
      }));
  }, [sessions]);

  const weekly = useMemo<BarDatum[]>(() => {
    const weeks = new Map<string, number>();
    for (const s of sessions) {
      const key = startOfWeek(s.date);
      weeks.set(key, (weeks.get(key) ?? 0) + s.duration_min);
    }
    return [...weeks.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, minutes]) => ({
        label: week.slice(5).replace('-', '/'),
        values: { minutes },
        meta: `Week of ${formatDate(week)}`,
      }));
  }, [sessions]);

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
        <Button variant="primary" size="sm" onClick={() => setDraft(emptyDraft(today))}>
          <Plus size={15} /> Log session
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 stagger">
        <StatTile label="Sessions" value={sessions.length} icon={<Trophy size={15} />} accent={SPORTS}
          delta={`${thisWeek} this week`} deltaTone={thisWeek >= 2 ? 'good' : 'flat'} />
        <StatTile label="Time played" value={toHours(totalMin)} unit="h" icon={<Timer size={15} />} accent={SPORTS} />
        <StatTile label="Distance" value={totalKm ? totalKm.toFixed(1) : '—'} unit={totalKm ? 'km' : undefined}
          icon={<Route size={15} />} accent={SPORTS} foot="running, cycling, swimming" />
        <StatTile label="Calories" value={totalCal ? formatNumber(totalCal) : '—'} icon={<Flame size={15} />} accent={SPORTS} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 p-4">
          <h3 className="text-[13px] font-semibold mb-1">Weekly minutes</h3>
          <p className="text-[11.5px] text-[var(--ink-muted)] mb-3">Time spent playing, across every sport.</p>
          {weekly.length === 0 ? (
            <EmptyState title="Nothing logged in this range" message="Log a session and the trend starts here." />
          ) : (
            <BarChart
              data={weekly} series={[{ key: 'minutes', label: 'Minutes', color: SPORTS }]}
              height={225} stacked highlightLast
              formatValue={(v) => (v >= 60 ? `${Math.round(v / 60)}h` : `${Math.round(v)}m`)}
            />
          )}
        </Card>

        <Card className="p-4">
          <h3 className="text-[13px] font-semibold mb-1">By sport</h3>
          <p className="text-[11.5px] text-[var(--ink-muted)] mb-3.5">Ranked by time played.</p>
          <HBarList items={bySport} formatValue={(v) => formatMinutes(v)} emptyLabel="No sessions yet." />
        </Card>
      </div>

      <Card>
        <CardHeader title="Session log" subtitle={`${sessions.length} sessions`} icon={<Activity size={15} />} />
        {sessions.length === 0 ? (
          <EmptyState icon={<Trophy size={19} />} title="No sessions yet"
            message="Football, running, swimming — anything that isn't the gym belongs here."
            action={<Button variant="primary" onClick={() => setDraft(emptyDraft(today))}><Plus size={15} /> Log a session</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
                  <th className="text-left font-semibold px-4 py-2">Date</th>
                  <th className="text-left font-semibold px-3 py-2">Sport</th>
                  <th className="text-right font-semibold px-3 py-2">Duration</th>
                  <th className="text-right font-semibold px-3 py-2 hidden sm:table-cell">Distance</th>
                  <th className="text-left font-semibold px-3 py-2 hidden md:table-cell">Intensity</th>
                  <th className="text-right font-semibold px-3 py-2 hidden lg:table-cell">Calories</th>
                  <th className="w-16" />
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="border-t border-[var(--border)] hover:bg-[var(--surface-hover)] transition-colors group">
                    <td className="px-4 py-2.5 tabular text-[var(--ink-muted)] whitespace-nowrap">{formatDate(s.date)}</td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: SPORTS }} aria-hidden />
                        {s.sport}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular">{formatMinutes(s.duration_min)}</td>
                    <td className="px-3 py-2.5 text-right tabular text-[var(--ink-muted)] hidden sm:table-cell">
                      {s.distance_km != null ? `${s.distance_km} km` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--ink-muted)] hidden md:table-cell">
                      {INTENSITY_LABELS[s.intensity] ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular text-[var(--ink-muted)] hidden lg:table-cell">
                      {s.calories != null ? formatNumber(s.calories) : '—'}
                    </td>
                    <td className="pr-3">
                      <span className="flex justify-end gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7" aria-label="Edit session"
                          onClick={() => setDraft({
                            id: s.id, date: s.date, sport: s.sport, duration_min: s.duration_min,
                            distance_km: s.distance_km ?? '', intensity: s.intensity,
                            calories: s.calories ?? '', notes: s.notes,
                          })}
                        >
                          <Pencil size={13} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => setConfirmDelete(s)} aria-label="Delete session">
                          <Trash2 size={13} />
                        </Button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={!!draft} onClose={() => setDraft(null)}
        title={draft?.id ? 'Edit session' : 'Log a session'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
            <Button variant="primary" onClick={save} loading={saving}>{draft?.id ? 'Save changes' : 'Save session'}</Button>
          </>
        }
      >
        {draft && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date" required>
                <Input type="date" max={today} value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
              </Field>
              <Field label="Sport" required>
                <Select value={COMMON.includes(draft.sport) ? draft.sport : 'Other'}
                  onChange={(e) => setDraft({ ...draft, sport: e.target.value })}>
                  {COMMON.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </Field>
            </div>

            {!COMMON.slice(0, -1).includes(draft.sport) && (
              <Field label="Sport name" required>
                <Input value={draft.sport === 'Other' ? '' : draft.sport}
                  onChange={(e) => setDraft({ ...draft, sport: e.target.value })}
                  placeholder="Padel" />
              </Field>
            )}

            <div className="grid grid-cols-3 gap-3">
              <Field label="Duration" hint="minutes" required>
                <Input type="number" min={0} max={1440} value={draft.duration_min}
                  onChange={(e) => setDraft({ ...draft, duration_min: Number(e.target.value) })} />
              </Field>
              <Field label="Distance" hint="km, optional">
                <Input type="number" step="0.1" min={0} value={draft.distance_km}
                  onChange={(e) => setDraft({ ...draft, distance_km: e.target.value })}
                  placeholder={DISTANCE_SPORTS.has(draft.sport) ? '8.5' : '—'} />
              </Field>
              <Field label="Calories" hint="optional">
                <Input type="number" min={0} value={draft.calories}
                  onChange={(e) => setDraft({ ...draft, calories: e.target.value })} placeholder="600" />
              </Field>
            </div>

            <Field label="Intensity">
              <ScalePicker
                name="Intensity" value={draft.intensity} labels={INTENSITY_LABELS}
                onChange={(v) => setDraft({ ...draft, intensity: v ?? 3 })}
              />
            </Field>

            <Field label="Notes">
              <Textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                placeholder="How it went." className="min-h-[60px]" />
            </Field>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete} onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          await api.del(`/api/sports/${confirmDelete.id}`);
          await res.reload();
          toast.push('Session deleted');
        }}
        title="Delete this session?"
        message={`The ${confirmDelete?.sport} session on ${confirmDelete ? formatDate(confirmDelete.date) : ''} will be removed.`}
      />
    </div>
  );
}

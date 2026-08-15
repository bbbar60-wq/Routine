import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Moon, HeartPulse, Scale, Footprints, Smile, Zap, Pencil, CalendarDays,
} from 'lucide-react';
import { useResource } from '../lib/useResource';
import { api, qs } from '../lib/api';
import { useApp } from '../state/app';
import {
  Button, Card, CardHeader, EmptyState, Field, Input, Modal, Segmented,
  ScalePicker, Skeleton, Textarea, useToast, cx,
} from '../components/ui';
import { StatTile, LineChart, Sparkline, type LinePoint } from '../components/charts';
import { domainColor } from '../lib/domains';
import { addDays, formatDate, todayIso } from '../lib/date';
import { ENERGY_LABELS, MOOD_LABELS, QUALITY_LABELS, formatNumber, formatWeight } from '../lib/format';
import type { HealthLog } from '../lib/types';

const HEALTH = 'var(--domain-health)';
const PERSONAL = 'var(--domain-personal)';

type Metric = 'sleep' | 'mood' | 'weight' | 'activity';

const emptyLog = (date: string): HealthLog => ({
  date, sleep_hours: null, sleep_quality: null, bed_time: null, wake_time: null,
  weight_kg: null, body_fat: null, water_ml: null, steps: null,
  mood: null, energy: null, stress: null, notes: '',
});

export default function Health() {
  const [params, setParams] = useSearchParams();
  const [range, setRange] = useState<'30' | '90' | '180'>('90');
  const [metric, setMetric] = useState<Metric>('sleep');
  const today = todayIso();
  const from = useMemo(() => addDays(today, -(Number(range) - 1)), [range, today]);

  const res = useResource<{ logs: HealthLog[]; today: HealthLog | null }>(
    `/api/health${qs({ from, to: today })}`
  );
  const { settings } = useApp();
  const toast = useToast();

  const [draft, setDraft] = useState<HealthLog | null>(null);
  const [saving, setSaving] = useState(false);

  const logs = useMemo(() => [...(res.data?.logs ?? [])].sort((a, b) => a.date.localeCompare(b.date)), [res.data]);
  const todayLog = res.data?.today ?? null;

  const openEditor = useCallback((date: string) => {
    const existing = res.data?.logs.find((l) => l.date === date);
    setDraft(existing ? { ...existing } : emptyLog(date));
  }, [res.data]);

  useEffect(() => {
    if (params.get('edit') === 'today') { openEditor(today); setParams({}, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, openEditor]);

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      await api.put(`/api/health/${draft.date}`, {
        sleep_hours: draft.sleep_hours, sleep_quality: draft.sleep_quality,
        bed_time: draft.bed_time || null, wake_time: draft.wake_time || null,
        weight_kg: draft.weight_kg, body_fat: draft.body_fat,
        water_ml: draft.water_ml, steps: draft.steps,
        mood: draft.mood, energy: draft.energy, stress: draft.stress,
        notes: draft.notes ?? '',
      });
      setDraft(null);
      await res.reload();
      toast.push('Health log saved');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not save that', 'error');
    } finally {
      setSaving(false);
    }
  }

  /* ---------------- derived ---------------- */
  const withSleep = logs.filter((l) => l.sleep_hours != null);
  const avgSleep = withSleep.length
    ? withSleep.reduce((s, l) => s + (l.sleep_hours ?? 0), 0) / withSleep.length : 0;
  const withMood = logs.filter((l) => l.mood != null);
  const avgMood = withMood.length ? withMood.reduce((s, l) => s + (l.mood ?? 0), 0) / withMood.length : 0;
  const weights = logs.filter((l) => l.weight_kg != null);
  const latestWeight = weights[weights.length - 1]?.weight_kg ?? null;
  const weightDelta = weights.length > 1 && latestWeight != null
    ? latestWeight - (weights[0].weight_kg ?? latestWeight) : 0;
  const withSteps = logs.filter((l) => l.steps != null);
  const avgSteps = withSteps.length
    ? Math.round(withSteps.reduce((s, l) => s + (l.steps ?? 0), 0) / withSteps.length) : 0;

  const chart = useMemo<{ points: LinePoint[]; series: Array<{ key: string; label: string; color: string }>; format: (v: number) => string; zeroBased: boolean }>(() => {
    const label = (d: string) => formatDate(d);
    if (metric === 'sleep') {
      return {
        points: logs.map((l) => ({ label: label(l.date), values: { sleep: l.sleep_hours, quality: l.sleep_quality } })),
        series: [
          { key: 'sleep', label: 'Hours slept', color: HEALTH },
          { key: 'quality', label: 'Quality (1–5)', color: domainColor('work') },
        ],
        format: (v) => v.toFixed(1),
        zeroBased: true,
      };
    }
    if (metric === 'mood') {
      return {
        points: logs.map((l) => ({ label: label(l.date), values: { mood: l.mood, energy: l.energy } })),
        series: [
          { key: 'mood', label: 'Mood', color: PERSONAL },
          { key: 'energy', label: 'Energy', color: domainColor('learning') },
        ],
        format: (v) => v.toFixed(1),
        zeroBased: true,
      };
    }
    if (metric === 'weight') {
      return {
        points: logs.map((l) => ({ label: label(l.date), values: { weight: l.weight_kg } })),
        series: [{ key: 'weight', label: 'Weight (kg)', color: domainColor('fitness') }],
        format: (v) => v.toFixed(1),
        zeroBased: false,
      };
    }
    return {
      points: logs.map((l) => ({ label: label(l.date), values: { steps: l.steps, water: l.water_ml } })),
      series: [
        { key: 'steps', label: 'Steps', color: domainColor('sports') },
        { key: 'water', label: 'Water (ml)', color: domainColor('work') },
      ],
      format: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v))),
      zeroBased: true,
    };
  }, [logs, metric]);

  if (res.loading && !res.data) {
    return <div className="space-y-4"><Skeleton className="h-[104px]" /><Skeleton className="h-[420px]" /></div>;
  }

  return (
    <div className="space-y-4 max-w-[1500px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={range} onChange={setRange}
          options={[{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '180', label: '6 months' }]}
        />
        <Button variant="primary" size="sm" onClick={() => openEditor(today)}>
          <Pencil size={15} /> {todayLog ? "Update today" : "Log today"}
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 stagger">
        <StatTile
          label="Average sleep" value={avgSleep ? avgSleep.toFixed(1) : '—'} unit={avgSleep ? 'h' : undefined}
          icon={<Moon size={15} />} accent={HEALTH}
          delta={avgSleep ? (avgSleep >= settings.sleepGoalHours ? 'On target' : `${(settings.sleepGoalHours - avgSleep).toFixed(1)}h below goal`) : undefined}
          deltaTone={avgSleep >= settings.sleepGoalHours ? 'good' : 'bad'}
          foot={<Sparkline data={withSleep.slice(-30).map((l) => l.sleep_hours ?? 0)} color={HEALTH} height={20} />}
        />
        <StatTile
          label="Average mood" value={avgMood ? avgMood.toFixed(1) : '—'} unit={avgMood ? '/ 5' : undefined}
          icon={<Smile size={15} />} accent={PERSONAL}
          delta={avgMood ? MOOD_LABELS[Math.round(avgMood)] : undefined}
          deltaTone={avgMood >= 3.5 ? 'good' : avgMood >= 2.5 ? 'flat' : 'bad'}
          foot={<Sparkline data={withMood.slice(-30).map((l) => l.mood ?? 0)} color={PERSONAL} height={20} />}
        />
        <StatTile
          label="Weight" value={latestWeight != null ? formatWeight(latestWeight, settings.units).split(' ')[0] : '—'}
          unit={latestWeight != null ? (settings.units === 'imperial' ? 'lb' : 'kg') : undefined}
          icon={<Scale size={15} />} accent={domainColor('fitness')}
          delta={weights.length > 1 ? `${weightDelta > 0 ? '+' : ''}${weightDelta.toFixed(1)} kg over ${range}d` : undefined}
          deltaTone={Math.abs(weightDelta) < 0.5 ? 'flat' : weightDelta < 0 ? 'good' : 'bad'}
        />
        <StatTile
          label="Average steps" value={avgSteps ? formatNumber(avgSteps) : '—'}
          icon={<Footprints size={15} />} accent={domainColor('sports')}
          deltaTone={avgSteps >= 8000 ? 'good' : 'flat'}
          delta={avgSteps ? (avgSteps >= 8000 ? 'Active' : 'Below 8k') : undefined}
        />
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-[13px] font-semibold">Trends</h3>
            <p className="text-[11.5px] text-[var(--ink-muted)] mt-0.5">Hover the chart to read any day.</p>
          </div>
          <Segmented
            value={metric} onChange={setMetric} size="sm"
            options={[
              { value: 'sleep', label: 'Sleep' },
              { value: 'mood', label: 'Mood' },
              { value: 'weight', label: 'Weight' },
              { value: 'activity', label: 'Activity' },
            ]}
          />
        </div>
        {logs.length === 0 ? (
          <EmptyState icon={<HeartPulse size={19} />} title="Nothing logged in this range"
            message="Log a day and the trend line starts here."
            action={<Button variant="primary" onClick={() => openEditor(today)}>Log today</Button>} />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 mb-2.5">
              {chart.series.map((s) => (
                <span key={s.key} className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--ink-secondary)]">
                  <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: s.color }} aria-hidden />
                  {s.label}
                </span>
              ))}
            </div>
            <LineChart
              data={chart.points} series={chart.series} height={250} area={chart.series.length === 1}
              formatValue={chart.format} zeroBased={chart.zeroBased}
            />
          </>
        )}
      </Card>

      {/* ---------------- daily log ---------------- */}
      <Card>
        <CardHeader title="Daily log" subtitle={`${logs.length} days recorded`} icon={<CalendarDays size={15} />} />
        {logs.length === 0 ? (
          <EmptyState icon={<HeartPulse size={19} />} title="No entries yet"
            message="Sleep, mood, weight and water — a few seconds a day is enough." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
                  <th className="text-left font-semibold px-4 py-2">Date</th>
                  <th className="text-right font-semibold px-3 py-2">Sleep</th>
                  <th className="text-right font-semibold px-3 py-2 hidden sm:table-cell">Quality</th>
                  <th className="text-right font-semibold px-3 py-2">Mood</th>
                  <th className="text-right font-semibold px-3 py-2 hidden md:table-cell">Energy</th>
                  <th className="text-right font-semibold px-3 py-2 hidden md:table-cell">Weight</th>
                  <th className="text-right font-semibold px-3 py-2 hidden lg:table-cell">Water</th>
                  <th className="text-right font-semibold px-3 py-2 hidden lg:table-cell">Steps</th>
                  <th className="w-9" />
                </tr>
              </thead>
              <tbody>
                {[...logs].reverse().slice(0, 90).map((l) => (
                  <tr key={l.date} className={cx(
                    'border-t border-[var(--border)] hover:bg-[var(--surface-hover)] transition-colors group',
                    l.date === today && 'bg-[var(--surface-hover)]/50'
                  )}>
                    <td className="px-4 py-2.5 tabular whitespace-nowrap">
                      {formatDate(l.date)}
                      {l.date === today && <span className="ml-2 text-[10.5px] text-[var(--ink-muted)]">today</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular">{l.sleep_hours != null ? `${l.sleep_hours}h` : '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular text-[var(--ink-muted)] hidden sm:table-cell">
                      {l.sleep_quality != null ? QUALITY_LABELS[l.sleep_quality] : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {l.mood != null ? <ScaleDots value={l.mood} color={PERSONAL} label={MOOD_LABELS[l.mood]} /> : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right hidden md:table-cell">
                      {l.energy != null ? <ScaleDots value={l.energy} color={domainColor('learning')} label={ENERGY_LABELS[l.energy]} /> : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular text-[var(--ink-muted)] hidden md:table-cell">
                      {l.weight_kg != null ? `${l.weight_kg} kg` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular text-[var(--ink-muted)] hidden lg:table-cell">
                      {l.water_ml != null ? `${(l.water_ml / 1000).toFixed(1)} L` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular text-[var(--ink-muted)] hidden lg:table-cell">
                      {l.steps != null ? formatNumber(l.steps) : '—'}
                    </td>
                    <td className="pr-3">
                      <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                        onClick={() => openEditor(l.date)} aria-label={`Edit ${formatDate(l.date)}`}
                      >
                        <Pencil size={13} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ---------------- editor ---------------- */}
      <Modal
        open={!!draft} onClose={() => setDraft(null)}
        title={draft?.date === today ? 'Log today' : `Log ${draft ? formatDate(draft.date) : ''}`}
        description="Leave anything blank that you did not measure."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
            <Button variant="primary" onClick={save} loading={saving}>Save</Button>
          </>
        }
      >
        {draft && (
          <div className="space-y-5">
            <section>
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-muted)] mb-3 flex items-center gap-1.5">
                <Moon size={13} /> Sleep
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Field label="Hours">
                  <Input type="number" step="0.1" min={0} max={24} value={draft.sleep_hours ?? ''}
                    onChange={(e) => setDraft({ ...draft, sleep_hours: e.target.value === '' ? null : Number(e.target.value) })}
                    placeholder="7.5" />
                </Field>
                <Field label="Bed time">
                  <Input type="time" value={draft.bed_time ?? ''}
                    onChange={(e) => setDraft({ ...draft, bed_time: e.target.value || null })} />
                </Field>
                <Field label="Wake time">
                  <Input type="time" value={draft.wake_time ?? ''}
                    onChange={(e) => setDraft({ ...draft, wake_time: e.target.value || null })} />
                </Field>
                <Field label="Water" hint="ml">
                  <Input type="number" min={0} max={20000} step={100} value={draft.water_ml ?? ''}
                    onChange={(e) => setDraft({ ...draft, water_ml: e.target.value === '' ? null : Number(e.target.value) })}
                    placeholder="2500" />
                </Field>
              </div>
              <Field label="Sleep quality" className="mt-3">
                <ScalePicker
                  name="Sleep quality" value={draft.sleep_quality} labels={QUALITY_LABELS}
                  onChange={(v) => setDraft({ ...draft, sleep_quality: v })}
                />
              </Field>
            </section>

            <section>
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-muted)] mb-3 flex items-center gap-1.5">
                <Zap size={13} /> How you felt
              </h3>
              <div className="space-y-3">
                <Field label="Mood">
                  <ScalePicker name="Mood" value={draft.mood} labels={MOOD_LABELS}
                    onChange={(v) => setDraft({ ...draft, mood: v })} />
                </Field>
                <Field label="Energy">
                  <ScalePicker name="Energy" value={draft.energy} labels={ENERGY_LABELS}
                    onChange={(v) => setDraft({ ...draft, energy: v })} />
                </Field>
                <Field label="Stress">
                  <ScalePicker name="Stress" value={draft.stress} labels={['', 'None', 'Mild', 'Some', 'High', 'Severe']}
                    onChange={(v) => setDraft({ ...draft, stress: v })} />
                </Field>
              </div>
            </section>

            <section>
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-muted)] mb-3 flex items-center gap-1.5">
                <Scale size={13} /> Body &amp; activity
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Weight" hint="kg">
                  <Input type="number" step="0.1" min={20} max={400} value={draft.weight_kg ?? ''}
                    onChange={(e) => setDraft({ ...draft, weight_kg: e.target.value === '' ? null : Number(e.target.value) })}
                    placeholder="78.4" />
                </Field>
                <Field label="Body fat" hint="%">
                  <Input type="number" step="0.1" min={1} max={70} value={draft.body_fat ?? ''}
                    onChange={(e) => setDraft({ ...draft, body_fat: e.target.value === '' ? null : Number(e.target.value) })}
                    placeholder="16.5" />
                </Field>
                <Field label="Steps">
                  <Input type="number" min={0} max={200000} step={100} value={draft.steps ?? ''}
                    onChange={(e) => setDraft({ ...draft, steps: e.target.value === '' ? null : Number(e.target.value) })}
                    placeholder="8000" />
                </Field>
              </div>
            </section>

            <Field label="Notes">
              <Textarea value={draft.notes ?? ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                placeholder="Anything worth remembering about the day." className="min-h-[60px]" />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}

/** Five dots — the value is also spelled out, so this is never colour-alone. */
function ScaleDots({ value, color, label }: { value: number; color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={label}>
      <span className="flex gap-[3px]" aria-hidden>
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n} className="w-[5px] h-[5px] rounded-full"
            style={{ background: n <= value ? color : 'var(--surface-sunken)' }}
          />
        ))}
      </span>
      <span className="text-[11.5px] text-[var(--ink-muted)] w-[46px] text-left">{label}</span>
    </span>
  );
}

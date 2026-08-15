import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Play, Square, Plus, Trash2, Timer, Zap, CalendarRange, X, Coffee, Users, ClipboardList,
} from 'lucide-react';
import { useResource } from '../lib/useResource';
import { api, qs } from '../lib/api';
import { useApp } from '../state/app';
import {
  Button, Card, CardHeader, ConfirmDialog, DomainChip, EmptyState, Field, Input,
  Modal, Segmented, Select, Skeleton, Textarea, useToast, cx,
} from '../components/ui';
import { StatTile, BarChart, DonutChart, useTicker, type BarDatum } from '../components/charts';
import { DOMAINS, domainColor, domainLabel } from '../lib/domains';
import {
  addDays, clockTime, dateRange, elapsedClock, elapsedMinutes, formatMinutes,
  todayIso, toHours, weekdayShort, formatDate,
} from '../lib/date';
import { progressPercent } from '../lib/format';
import type { FocusSession, Project } from '../lib/types';

const KINDS = [
  { value: 'deep', label: 'Deep work', icon: Zap },
  { value: 'admin', label: 'Admin', icon: ClipboardList },
  { value: 'meeting', label: 'Meeting', icon: Users },
  { value: 'break', label: 'Break', icon: Coffee },
];

export default function Focus() {
  const [params, setParams] = useSearchParams();
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const today = todayIso();
  const from = useMemo(() => addDays(today, -(Number(days) - 1)), [days, today]);

  const res = useResource<{ sessions: FocusSession[]; running: FocusSession | null; from: string; to: string }>(
    `/api/focus${qs({ from, to: today })}`
  );
  const projectsRes = useResource<{ projects: Project[] }>('/api/projects');
  const { settings } = useApp();
  const toast = useToast();

  const running = res.data?.running ?? null;
  useTicker(!!running);

  const [starterOpen, setStarterOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<FocusSession | null>(null);
  const [starter, setStarter] = useState({ domain: 'research', project_id: '' as string | number, label: '', kind: 'deep' });
  const [manual, setManual] = useState({
    date: today, domain: 'work', project_id: '' as string | number,
    label: '', duration_min: 60, kind: 'deep', notes: '',
  });

  useEffect(() => {
    if (params.get('start') === '1') { setStarterOpen(true); setParams({}, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const sessions = res.data?.sessions ?? [];
  const projects = projectsRes.data?.projects ?? [];

  const start = useCallback(async () => {
    try {
      await api.post('/api/focus/start', {
        domain: starter.domain,
        project_id: starter.project_id === '' ? null : Number(starter.project_id),
        label: starter.label.trim(),
        kind: starter.kind,
      });
      setStarterOpen(false);
      await res.reload();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not start the timer', 'error');
    }
  }, [starter, res, toast]);

  const stop = useCallback(async () => {
    try {
      await api.post('/api/focus/stop', {});
      await res.reload();
      toast.push('Session saved');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not stop the timer', 'error');
    }
  }, [res, toast]);

  const cancel = useCallback(async () => {
    await api.post('/api/focus/cancel', {});
    await res.reload();
    toast.push('Session discarded', 'info');
  }, [res, toast]);

  async function addManual() {
    try {
      await api.post('/api/focus', {
        date: manual.date, domain: manual.domain,
        project_id: manual.project_id === '' ? null : Number(manual.project_id),
        label: manual.label.trim(), duration_min: Number(manual.duration_min),
        kind: manual.kind, notes: manual.notes.trim(),
      });
      setManualOpen(false);
      setManual({ ...manual, label: '', notes: '', duration_min: 60 });
      await res.reload();
      toast.push('Session logged');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not log that session', 'error');
    }
  }

  /* ---- derived ---- */
  const todayMin = sessions.filter((s) => s.date === today).reduce((sum, s) => sum + s.duration_min, 0);
  const totalMin = sessions.reduce((sum, s) => sum + s.duration_min, 0);
  const deepMin = sessions.filter((s) => s.kind === 'deep').reduce((sum, s) => sum + s.duration_min, 0);
  const activeDays = new Set(sessions.map((s) => s.date)).size;

  const domainsUsed = useMemo(() => {
    const set = new Set(sessions.map((s) => s.domain));
    return DOMAINS.filter((d) => set.has(d.id));
  }, [sessions]);

  const chartData = useMemo<BarDatum[]>(() => {
    const byDate = new Map<string, Record<string, number>>();
    for (const s of sessions) {
      if (!byDate.has(s.date)) byDate.set(s.date, {});
      const bucket = byDate.get(s.date)!;
      bucket[s.domain] = (bucket[s.domain] ?? 0) + s.duration_min;
    }
    // Long ranges roll up to weeks so the bars stay readable.
    const list = dateRange(from, today);
    if (list.length <= 31) {
      return list.map((date) => ({
        label: list.length > 14 ? date.slice(8) : weekdayShort(date).slice(0, 2),
        values: byDate.get(date) ?? {},
        meta: formatDate(date),
      }));
    }
    const weeks = new Map<string, Record<string, number>>();
    for (const date of list) {
      const key = addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() - 6 + 7) % 7));
      if (!weeks.has(key)) weeks.set(key, {});
      const bucket = weeks.get(key)!;
      for (const [domain, mins] of Object.entries(byDate.get(date) ?? {})) {
        bucket[domain] = (bucket[domain] ?? 0) + mins;
      }
    }
    return [...weeks.entries()].map(([week, values]) => ({
      label: week.slice(5).replace('-', '/'), values, meta: `Week of ${formatDate(week)}`,
    }));
  }, [sessions, from, today]);

  const donutData = useMemo(() => {
    const totals = new Map<string, number>();
    for (const s of sessions) totals.set(s.domain, (totals.get(s.domain) ?? 0) + s.duration_min);
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([domain, minutes]) => ({
        key: domain, label: domainLabel(domain), value: minutes, color: domainColor(domain),
      }));
  }, [sessions]);

  const series = domainsUsed.map((d) => ({ key: d.id, label: d.label, color: domainColor(d.id) }));

  if (res.loading && !res.data) {
    return <div className="space-y-4"><Skeleton className="h-[150px]" /><Skeleton className="h-[420px]" /></div>;
  }

  return (
    <div className="space-y-4 max-w-[1500px]">
      {/* ------------- timer card ------------- */}
      <Card className={cx('overflow-hidden', running && 'border-[var(--accent-ring)]/45')}>
        <div className="p-4 sm:p-5 flex flex-wrap items-center gap-5">
          {running ? (
            <>
              <div className="flex items-center gap-4 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--status-good)] animate-pulse-dot shrink-0" aria-hidden />
                <div className="min-w-0">
                  <p className="font-mono text-[38px] sm:text-[44px] leading-none font-semibold tracking-[-0.03em] tabular">
                    {elapsedClock(running.started_at)}
                  </p>
                  <p className="text-[12.5px] text-[var(--ink-muted)] mt-2 truncate flex items-center gap-2">
                    <DomainChip domain={running.domain} size="sm" />
                    {running.label || running.project_name || 'Focus session'}
                    <span className="opacity-50">· started {clockTime(running.started_at)}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <Button variant="ghost" onClick={cancel} aria-label="Discard this session">
                  <X size={15} /> Discard
                </Button>
                <Button variant="primary" size="lg" onClick={stop}>
                  <Square size={15} /> Stop &amp; save {formatMinutes(elapsedMinutes(running.started_at))}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold">No session running</p>
                <p className="text-[12.5px] text-[var(--ink-muted)] mt-1">
                  {formatMinutes(todayMin)} logged today
                  <span className="opacity-50"> · </span>
                  {progressPercent(todayMin, settings.dailyFocusGoalMin)}% of your {formatMinutes(settings.dailyFocusGoalMin)} goal
                </p>
              </div>
              <div className="flex items-center gap-2 ml-auto flex-wrap">
                <Button onClick={() => setManualOpen(true)}><Plus size={15} /> Log past session</Button>
                <Button variant="primary" size="lg" onClick={() => setStarterOpen(true)}>
                  <Play size={15} /> Start a session
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={days} onChange={setDays}
          options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]}
        />
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 stagger">
        <StatTile label="Total tracked" value={toHours(totalMin)} unit="h" icon={<Timer size={15} />}
          accent={domainColor('work')} foot={`over ${days} days`} />
        <StatTile label="Deep work" value={toHours(deepMin)} unit="h" icon={<Zap size={15} />}
          accent={domainColor('research')}
          delta={totalMin ? `${Math.round((deepMin / totalMin) * 100)}% of tracked time` : undefined}
          deltaTone={deepMin / (totalMin || 1) >= 0.7 ? 'good' : 'flat'} />
        <StatTile label="Daily average" value={activeDays ? toHours(totalMin / Number(days)) : 0} unit="h"
          icon={<CalendarRange size={15} />} accent={domainColor('learning')}
          foot={`${activeDays} active days`} />
        <StatTile label="Today" value={toHours(todayMin)} unit="h" icon={<Play size={15} />}
          accent={domainColor('health')}
          delta={`${progressPercent(todayMin, settings.dailyFocusGoalMin)}% of goal`}
          deltaTone={todayMin >= settings.dailyFocusGoalMin ? 'good' : 'flat'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 p-4">
          <BarChart
            data={chartData} series={series} height={230} stacked
            formatValue={(v) => (v >= 60 ? `${Math.round(v / 60)}h` : `${Math.round(v)}m`)}
          />
          {series.length > 1 && (
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 mt-3 pt-3 border-t border-[var(--border)]">
              {series.map((s) => (
                <span key={s.key} className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--ink-secondary)]">
                  <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: s.color }} aria-hidden />
                  {s.label}
                </span>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="text-[13px] font-semibold mb-1">Where the time went</h3>
          <p className="text-[11.5px] text-[var(--ink-muted)] mb-4">Last {days} days by area of life.</p>
          {donutData.length === 0 ? (
            <EmptyState title="Nothing tracked yet" message="Start a session and it will show up here." />
          ) : (
            <DonutChart
              data={donutData} size={148} thickness={20}
              centerLabel="tracked" centerValue={`${toHours(totalMin)}h`}
              formatValue={(v) => formatMinutes(v)}
            />
          )}
        </Card>
      </div>

      {/* ------------- log ------------- */}
      <Card className="overflow-hidden">
        <CardHeader title="Session log" subtitle={`${sessions.length} sessions`} icon={<Timer size={15} />} />
        {sessions.length === 0 ? (
          <EmptyState icon={<Timer size={19} />} title="No sessions in this range"
            message="Start a timer, or log time you already spent."
            action={<Button variant="primary" onClick={() => setStarterOpen(true)}><Play size={15} /> Start a session</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
                  <th className="text-left font-semibold px-4 py-2">Date</th>
                  <th className="text-left font-semibold px-3 py-2">Area</th>
                  <th className="text-left font-semibold px-3 py-2">What</th>
                  <th className="text-left font-semibold px-3 py-2 hidden sm:table-cell">Kind</th>
                  <th className="text-right font-semibold px-3 py-2">Time</th>
                  <th className="w-9" />
                </tr>
              </thead>
              <tbody>
                {sessions.slice(0, 120).map((s) => (
                  <tr key={s.id} className="border-t border-[var(--border)] hover:bg-[var(--surface-hover)] transition-colors group">
                    <td className="px-4 py-2.5 text-[var(--ink-muted)] tabular whitespace-nowrap">{formatDate(s.date)}</td>
                    <td className="px-3 py-2.5"><DomainChip domain={s.domain} size="sm" /></td>
                    <td className="px-3 py-2.5 min-w-0">
                      <span className="block truncate max-w-[280px]">{s.label || s.project_name || '—'}</span>
                      {s.project_name && s.label && (
                        <span className="block text-[11px] text-[var(--ink-muted)] truncate">{s.project_name}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--ink-muted)] capitalize hidden sm:table-cell">{s.kind}</td>
                    <td className="px-3 py-2.5 text-right tabular font-medium whitespace-nowrap">{formatMinutes(s.duration_min)}</td>
                    <td className="pr-3">
                      <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                        onClick={() => setConfirmDelete(s)} aria-label="Delete session"
                      >
                        <Trash2 size={13} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ---------- start dialog ---------- */}
      <Modal
        open={starterOpen} onClose={() => setStarterOpen(false)}
        title="Start a focus session" description="The clock runs until you stop it."
        footer={
          <>
            <Button variant="ghost" onClick={() => setStarterOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={start}><Play size={15} /> Start</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Kind">
            <div className="grid grid-cols-4 gap-2">
              {KINDS.map((k) => (
                <button
                  key={k.value} type="button"
                  onClick={() => setStarter({ ...starter, kind: k.value })}
                  aria-pressed={starter.kind === k.value}
                  className={cx(
                    'flex flex-col items-center gap-1.5 py-3 rounded-[var(--radius-md)] border cursor-pointer transition-colors text-[11.5px] font-medium',
                    starter.kind === k.value
                      ? 'bg-[var(--surface-active)] border-[var(--accent-ring)] text-[var(--ink)]'
                      : 'bg-[var(--surface-raised)] border-[var(--border-strong)] text-[var(--ink-muted)] hover:border-[var(--ink-muted)]'
                  )}
                >
                  <k.icon size={16} /> {k.label}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Project">
              <Select value={starter.project_id} onChange={(e) => {
                const project = projects.find((p) => String(p.id) === e.target.value);
                setStarter({ ...starter, project_id: e.target.value, domain: project?.domain ?? starter.domain });
              }}>
                <option value="">No project</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Area of life">
              <Select value={starter.domain} onChange={(e) => setStarter({ ...starter, domain: e.target.value })}>
                {DOMAINS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="What are you working on?" hint="Optional — helps when you look back.">
            <Input value={starter.label} onChange={(e) => setStarter({ ...starter, label: e.target.value })}
              placeholder="Virial residual derivation" />
          </Field>
        </div>
      </Modal>

      {/* ---------- manual dialog ---------- */}
      <Modal
        open={manualOpen} onClose={() => setManualOpen(false)}
        title="Log a past session" description="For time you spent away from the app."
        footer={
          <>
            <Button variant="ghost" onClick={() => setManualOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={addManual}>Save session</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" required>
              <Input type="date" max={today} value={manual.date}
                onChange={(e) => setManual({ ...manual, date: e.target.value })} />
            </Field>
            <Field label="Duration" hint="minutes" required>
              <Input type="number" min={1} max={1440} value={manual.duration_min}
                onChange={(e) => setManual({ ...manual, duration_min: Number(e.target.value) })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Project">
              <Select value={manual.project_id} onChange={(e) => {
                const project = projects.find((p) => String(p.id) === e.target.value);
                setManual({ ...manual, project_id: e.target.value, domain: project?.domain ?? manual.domain });
              }}>
                <option value="">No project</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Area of life">
              <Select value={manual.domain} onChange={(e) => setManual({ ...manual, domain: e.target.value })}>
                {DOMAINS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kind">
              <Select value={manual.kind} onChange={(e) => setManual({ ...manual, kind: e.target.value })}>
                {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </Select>
            </Field>
            <Field label="Label">
              <Input value={manual.label} onChange={(e) => setManual({ ...manual, label: e.target.value })}
                placeholder="Client call" />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea value={manual.notes} onChange={(e) => setManual({ ...manual, notes: e.target.value })} />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete} onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          await api.del(`/api/focus/${confirmDelete.id}`);
          await res.reload();
          toast.push('Session deleted');
        }}
        title="Delete this session?"
        message="The time it recorded will be removed from your totals."
      />
    </div>
  );
}

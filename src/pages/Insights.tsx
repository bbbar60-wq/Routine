import { useMemo, useState } from 'react';
import {
  ChartNoAxesCombined, Flame, Timer, Moon, Dumbbell, Activity, Lightbulb, CalendarRange,
} from 'lucide-react';
import { useResource } from '../lib/useResource';
import { Card, CardHeader, EmptyState, Segmented, Skeleton, cx } from '../components/ui';
import {
  StatTile, BarChart, LineChart, DonutChart, Heatmap, HBarList, type BarDatum,
} from '../components/charts';
import { DOMAINS, domainColor, domainLabel } from '../lib/domains';
import { formatDate, formatMinutes, toHours, todayIso } from '../lib/date';
import { compactNumber } from '../lib/format';
import type { AnalyticsData } from '../lib/types';

type Range = '30' | '90' | '180' | '365';

export default function Insights() {
  const [range, setRange] = useState<Range>('90');
  const res = useResource<AnalyticsData>(`/api/analytics?days=${range}`);
  const today = todayIso();

  const data = res.data;

  /* ---------------- time by domain ---------------- */
  const timeChart = useMemo<BarDatum[]>(() => {
    if (!data) return [];
    const byWeek = new Map<string, Record<string, number>>();
    for (const row of data.timeByDomain) {
      // Bucket to ISO week-ish keys so long ranges stay readable.
      const week = row.date.slice(0, 7) + (Number(row.date.slice(8)) <= 15 ? '-a' : '-b');
      if (!byWeek.has(week)) byWeek.set(week, {});
      const bucket = byWeek.get(week)!;
      bucket[row.domain] = (bucket[row.domain] ?? 0) + row.minutes;
    }
    return [...byWeek.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, values]) => ({
        label: key.slice(5, 7) + (key.endsWith('-a') ? '·1' : '·2'),
        values,
        meta: `${key.slice(0, 7)} ${key.endsWith('-a') ? 'first half' : 'second half'}`,
      }));
  }, [data]);

  const usedDomains = useMemo(() => {
    if (!data) return [];
    const set = new Set(data.timeTotals.filter((t) => t.minutes > 0).map((t) => t.domain));
    return DOMAINS.filter((d) => set.has(d.id));
  }, [data]);

  /* ---------------- sleep vs mood ---------------- */
  const sleepMood = useMemo(() => {
    if (!data) return { points: [], correlation: null as number | null };
    const rows = data.health.filter((h) => h.sleep_hours != null && h.mood != null);
    const points = rows.map((h) => ({
      label: formatDate(h.date),
      values: { sleep: h.sleep_hours, mood: (h.mood ?? 0) * 1.6 },
    }));

    // Pearson r between sleep hours and mood — the honest way to state the link.
    let correlation: number | null = null;
    if (rows.length >= 8) {
      const xs = rows.map((h) => h.sleep_hours as number);
      const ys = rows.map((h) => h.mood as number);
      const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
      const my = ys.reduce((a, b) => a + b, 0) / ys.length;
      let num = 0, dx = 0, dy = 0;
      for (let i = 0; i < xs.length; i++) {
        num += (xs[i] - mx) * (ys[i] - my);
        dx += (xs[i] - mx) ** 2;
        dy += (ys[i] - my) ** 2;
      }
      correlation = dx && dy ? num / Math.sqrt(dx * dy) : null;
    }
    return { points, correlation };
  }, [data]);

  const heatStats = useMemo(() => {
    if (!data) return { active: 0, best: 0, current: 0 };
    const cells = data.heatmap.filter((c) => c.date <= today);
    const active = cells.filter((c) => c.level > 0).length;
    let best = 0, run = 0, current = 0;
    for (const c of cells) {
      if (c.level > 0) { run += 1; best = Math.max(best, run); } else run = 0;
    }
    for (let i = cells.length - 1; i >= 0; i--) {
      if (cells[i].level > 0) current += 1; else break;
    }
    return { active, best, current };
  }, [data, today]);

  if (res.loading && !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[104px]" />
        <Skeleton className="h-[180px]" />
        <Skeleton className="h-[380px]" />
      </div>
    );
  }
  if (!data) return null;

  const totalFocus = data.timeTotals.reduce((s, t) => s + t.minutes, 0);
  const totalStudy = data.study.reduce((s, t) => s + t.minutes, 0);
  const trainingSessions = data.weeklyVolume.reduce((s, w) => s + w.sessions, 0);
  const avgHabit = data.habitCompletion.length
    ? Math.round(data.habitCompletion.reduce((s, h) => s + h.rate, 0) / data.habitCompletion.length)
    : 0;

  const netIncome = data.finance.reduce((s, r) => s + (r.type === 'income' ? r.total : -r.total), 0);

  return (
    <div className="space-y-4 max-w-[1500px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={range} onChange={setRange}
          options={[
            { value: '30', label: '30 days' },
            { value: '90', label: '90 days' },
            { value: '180', label: '6 months' },
            { value: '365', label: 'Year' },
          ]}
        />
        <p className="text-[12px] text-[var(--ink-muted)]">
          {formatDate(data.from, { year: true })} — {formatDate(data.to, { year: true })}
        </p>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 stagger">
        <StatTile label="Tracked focus" value={toHours(totalFocus)} unit="h" icon={<Timer size={15} />}
          accent={domainColor('work')} foot={`${toHours(totalFocus / Number(range) * 7)}h / week`} />
        <StatTile label="Habit completion" value={`${avgHabit}%`} icon={<Flame size={15} />}
          accent={domainColor('personal')}
          deltaTone={avgHabit >= 75 ? 'good' : avgHabit >= 50 ? 'flat' : 'bad'}
          delta={avgHabit >= 75 ? 'Strong' : avgHabit >= 50 ? 'Holding' : 'Slipping'} />
        <StatTile label="Training sessions" value={trainingSessions} icon={<Dumbbell size={15} />}
          accent={domainColor('fitness')} foot={`${data.sports.reduce((s, x) => s + x.sessions, 0)} sport sessions`} />
        <StatTile label="Study time" value={toHours(totalStudy)} unit="h" icon={<Lightbulb size={15} />}
          accent={domainColor('learning')} />
      </div>

      {/* ---------------- year heatmap ---------------- */}
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-[13px] font-semibold">A year of showing up</h3>
            <p className="text-[11.5px] text-[var(--ink-muted)] mt-0.5">
              Each square blends habits, focus hours, training and study for that day.
            </p>
          </div>
          <div className="flex items-center gap-4 text-[11.5px]">
            <span><span className="text-[var(--ink-muted)]">Active days </span>
              <span className="tabular font-medium">{heatStats.active}</span></span>
            <span><span className="text-[var(--ink-muted)]">Current run </span>
              <span className="tabular font-medium">{heatStats.current}d</span></span>
            <span><span className="text-[var(--ink-muted)]">Best run </span>
              <span className="tabular font-medium">{heatStats.best}d</span></span>
          </div>
        </div>
        <Heatmap
          cells={data.heatmap}
          describe={(cell) => (
            <div>
              <div className="font-medium text-[var(--ink)] mb-1">{formatDate(cell.date, { year: true })}</div>
              <div className="text-[var(--ink-secondary)]">{formatMinutes(cell.focusMin)} focus</div>
              {cell.studiedMin > 0 && <div className="text-[var(--ink-secondary)]">{formatMinutes(cell.studiedMin)} study</div>}
              <div className="text-[var(--ink-secondary)]">{cell.habitsDone} habits done</div>
              {cell.trained && <div className="text-[var(--ink-secondary)]">Trained</div>}
            </div>
          )}
        />
      </Card>

      {/* ---------------- time allocation ---------------- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 p-4">
          <h3 className="text-[13px] font-semibold mb-1">Where your hours go</h3>
          <p className="text-[11.5px] text-[var(--ink-muted)] mb-3">Tracked focus time, split by area of life.</p>
          {timeChart.length === 0 ? (
            <EmptyState title="No time tracked in this range" message="Run a few focus sessions and this fills in." />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 mb-2.5">
                {usedDomains.map((d) => (
                  <span key={d.id} className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--ink-secondary)]">
                    <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: domainColor(d.id) }} aria-hidden />
                    {d.label}
                  </span>
                ))}
              </div>
              <BarChart
                data={timeChart}
                series={usedDomains.map((d) => ({ key: d.id, label: d.label, color: domainColor(d.id) }))}
                height={240} stacked
                formatValue={(v) => (v >= 60 ? `${Math.round(v / 60)}h` : `${Math.round(v)}m`)}
              />
            </>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="text-[13px] font-semibold mb-1">Total split</h3>
          <p className="text-[11.5px] text-[var(--ink-muted)] mb-4">Across the whole range.</p>
          {data.timeTotals.length === 0 ? (
            <EmptyState title="Nothing tracked" />
          ) : (
            <DonutChart
              data={data.timeTotals.filter((t) => t.minutes > 0).map((t) => ({
                key: t.domain, label: domainLabel(t.domain), value: t.minutes, color: domainColor(t.domain),
              }))}
              size={148} thickness={20}
              centerLabel="tracked" centerValue={`${toHours(totalFocus)}h`}
              formatValue={(v) => formatMinutes(v)}
            />
          )}
        </Card>
      </div>

      {/* ---------------- habits + training ---------------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="text-[13px] font-semibold mb-1">Habit completion rate</h3>
          <p className="text-[11.5px] text-[var(--ink-muted)] mb-3.5">Days done against days scheduled.</p>
          <HBarList
            items={data.habitCompletion.map((h) => ({
              key: String(h.id), label: h.name, value: h.rate,
              color: domainColor(h.domain), meta: `${h.done}/${h.scheduled}`,
            }))}
            max={100}
            formatValue={(v) => `${Math.round(v)}%`}
            emptyLabel="No habits tracked yet."
          />
        </Card>

        <Card className="p-4">
          <h3 className="text-[13px] font-semibold mb-1">Training volume</h3>
          <p className="text-[11.5px] text-[var(--ink-muted)] mb-3">Weekly tonnage from the gym.</p>
          {data.weeklyVolume.length === 0 ? (
            <EmptyState title="No workouts in this range" />
          ) : (
            <BarChart
              data={data.weeklyVolume.map((w) => ({
                label: w.week.slice(5).replace('-', '/'),
                values: { volume: w.volume },
                meta: `${w.sessions} session${w.sessions === 1 ? '' : 's'}`,
              }))}
              series={[{ key: 'volume', label: 'Volume', color: domainColor('fitness') }]}
              height={196} stacked highlightLast
              formatValue={(v) => compactNumber(v)}
            />
          )}
        </Card>
      </div>

      {/* ---------------- sleep vs mood ---------------- */}
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-[13px] font-semibold">Sleep and how you feel</h3>
            <p className="text-[11.5px] text-[var(--ink-muted)] mt-0.5">
              Mood is scaled onto the sleep axis so the two curves can share one scale.
            </p>
          </div>
          {sleepMood.correlation != null && (
            <span className={cx(
              'text-[11.5px] px-2 h-[24px] inline-flex items-center rounded-[var(--radius-full)] border',
              Math.abs(sleepMood.correlation) >= 0.4
                ? 'border-[var(--status-good)]/30 bg-[var(--status-good)]/10 text-[var(--status-good-text)]'
                : 'border-[var(--border)] text-[var(--ink-muted)]'
            )}>
              r = {sleepMood.correlation.toFixed(2)}
              <span className="ml-1.5 opacity-75">
                {Math.abs(sleepMood.correlation) >= 0.6 ? 'strong link'
                  : Math.abs(sleepMood.correlation) >= 0.3 ? 'some link' : 'little link'}
              </span>
            </span>
          )}
        </div>
        {sleepMood.points.length < 3 ? (
          <EmptyState icon={<Moon size={19} />} title="Not enough health data"
            message="Log sleep and mood for a week or two and the relationship becomes readable." />
        ) : (
          <>
            <div className="flex items-center gap-3.5 mb-2.5">
              <span className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--ink-secondary)]">
                <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: domainColor('health') }} aria-hidden />
                Sleep (hours)
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--ink-secondary)]">
                <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: domainColor('personal') }} aria-hidden />
                Mood (scaled)
              </span>
            </div>
            <LineChart
              data={sleepMood.points}
              series={[
                { key: 'sleep', label: 'Sleep (h)', color: domainColor('health') },
                { key: 'mood', label: 'Mood (scaled)', color: domainColor('personal') },
              ]}
              height={230} formatValue={(v) => v.toFixed(1)}
            />
          </>
        )}
      </Card>

      {/* ---------------- sports + money ---------------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="text-[13px] font-semibold mb-1">Sport</h3>
          <p className="text-[11.5px] text-[var(--ink-muted)] mb-3.5">Minutes played, by sport.</p>
          <HBarList
            items={data.sports.map((s, i) => ({
              key: s.sport, label: s.sport, value: s.minutes,
              color: `color-mix(in oklab, ${domainColor('sports')} ${Math.max(35, 100 - i * 13)}%, var(--surface))`,
              meta: `${s.sessions}×`,
            }))}
            formatValue={(v) => formatMinutes(v)}
            emptyLabel="No sport sessions in this range."
          />
        </Card>

        <Card className="p-4">
          <h3 className="text-[13px] font-semibold mb-1">Money</h3>
          <p className="text-[11.5px] text-[var(--ink-muted)] mb-3">
            Net {netIncome >= 0 ? 'surplus' : 'deficit'} of {compactNumber(Math.abs(netIncome))} over this range.
          </p>
          {data.finance.length === 0 ? (
            <EmptyState title="No transactions in this range" />
          ) : (
            <BarChart
              data={monthlyFinance(data)}
              series={[
                { key: 'income', label: 'Income', color: domainColor('finance') },
                { key: 'expense', label: 'Spending', color: domainColor('sports') },
              ]}
              height={196} stacked={false}
              formatValue={(v) => compactNumber(v)}
            />
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          title="How to read this" icon={<ChartNoAxesCombined size={15} />}
          subtitle="Every number here comes from what you logged — nothing is estimated."
        />
        <ul className="px-4 pb-4 space-y-2 text-[12.5px] text-[var(--ink-secondary)] leading-relaxed">
          <li className="flex gap-2.5">
            <Activity size={14} className="mt-[3px] shrink-0 text-[var(--ink-muted)]" aria-hidden />
            <span>
              The year grid scores each day out of four: habits done, focus hours toward your goal,
              whether you trained, and study time. No single strand can max out a day.
            </span>
          </li>
          <li className="flex gap-2.5">
            <CalendarRange size={14} className="mt-[3px] shrink-0 text-[var(--ink-muted)]" aria-hidden />
            <span>
              Completion rates count only days a habit was actually scheduled, so a weekday-only
              habit is never penalised for the weekend.
            </span>
          </li>
          <li className="flex gap-2.5">
            <Moon size={14} className="mt-[3px] shrink-0 text-[var(--ink-muted)]" aria-hidden />
            <span>
              The sleep–mood figure is a Pearson correlation over days where you logged both.
              It shows association, not cause — a strong r is a prompt to look closer, not proof.
            </span>
          </li>
        </ul>
      </Card>
    </div>
  );
}

function monthlyFinance(data: AnalyticsData): BarDatum[] {
  const months = new Map<string, { income: number; expense: number }>();
  for (const row of data.finance) {
    const cur = months.get(row.month) ?? { income: 0, expense: 0 };
    cur[row.type] += row.total;
    months.set(row.month, cur);
  }
  return [...months.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, v]) => ({
      label: month.slice(5),
      values: { income: v.income, expense: v.expense },
      meta: `Net ${compactNumber(v.income - v.expense)}`,
    }));
}

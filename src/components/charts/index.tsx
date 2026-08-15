import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import { cx } from '../ui';

/* ------------------------------------------------------------------ *
 * Shared plumbing
 * ------------------------------------------------------------------ */

/** Measure the container so SVG text renders at its true size, never scaled. */
export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Measure once synchronously: ResizeObserver's first callback lands after
    // paint, which would flash an empty chart on every mount.
    const rect = el.getBoundingClientRect();
    if (rect.width > 0) setSize({ width: rect.width, height: rect.height });

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((prev) => (Math.abs(prev.width - width) > 0.5 || Math.abs(prev.height - height) > 0.5
        ? { width, height } : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, size] as const;
}

/** Nice round axis ceiling, so ticks land on readable numbers. */
export function niceMax(value: number, ticks = 4): number {
  if (!value || value <= 0) return ticks;
  const rough = value / ticks;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * mag * ticks;
}

/** A bar with rounded ends only at the data end — the baseline stays square. */
function barPath(x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, w / 2, h));
  if (h <= 0) return '';
  return `M${x},${y + h}L${x},${y + radius}Q${x},${y} ${x + radius},${y}L${x + w - radius},${y}Q${x + w},${y} ${x + w},${y + radius}L${x + w},${y + h}Z`;
}

/* ------------------------------- chrome ------------------------------- */

export interface Series {
  key: string;
  label: string;
  color: string;
}

export function Legend({ series, className }: { series: Series[]; className?: string }) {
  if (series.length < 2) return null;   // one series is named by the title
  return (
    <div className={cx('flex flex-wrap items-center gap-x-3.5 gap-y-1.5', className)}>
      {series.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--ink-secondary)]">
          <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: s.color }} aria-hidden />
          {s.label}
        </span>
      ))}
    </div>
  );
}

interface TooltipState { x: number; y: number; content: ReactNode }

function Tooltip({ state, width }: { state: TooltipState | null; width: number }) {
  if (!state) return null;
  const flip = state.x > width * 0.62;
  return (
    <div
      className="pointer-events-none absolute z-20 px-2.5 py-2 rounded-[var(--radius-md)] bg-[var(--surface-raised)] border border-[var(--border-strong)] shadow-[var(--shadow-lg)] text-[11.5px] whitespace-nowrap"
      style={{
        left: flip ? undefined : state.x + 12,
        right: flip ? width - state.x + 12 : undefined,
        top: Math.max(4, state.y - 12),
      }}
      role="tooltip"
    >
      {state.content}
    </div>
  );
}

export function ChartFrame({
  title, subtitle, series, action, height = 200, children, footer, empty, className,
}: {
  title?: ReactNode; subtitle?: ReactNode; series?: Series[]; action?: ReactNode;
  height?: number; children: ReactNode; footer?: ReactNode; empty?: boolean; className?: string;
}) {
  return (
    <div className={cx('flex flex-col', className)}>
      {(title || series || action) && (
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            {title && <h3 className="text-[13px] font-semibold text-[var(--ink)] truncate">{title}</h3>}
            {subtitle && <p className="text-[11.5px] text-[var(--ink-muted)] mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {series && series.length > 1 && <Legend series={series} className="mb-2.5" />}
      {empty ? (
        <div className="flex items-center justify-center text-[12px] text-[var(--ink-muted)]" style={{ height }}>
          Nothing logged in this range yet.
        </div>
      ) : (
        children
      )}
      {footer && <div className="mt-2.5">{footer}</div>}
    </div>
  );
}

/* ------------------------------ StatTile ------------------------------ */

export function StatTile({
  label, value, unit, delta, deltaTone, icon, foot, accent, className,
}: {
  label: string; value: ReactNode; unit?: string;
  delta?: string; deltaTone?: 'good' | 'bad' | 'flat';
  icon?: ReactNode; foot?: ReactNode; accent?: string; className?: string;
}) {
  const tone = deltaTone === 'good' ? 'var(--status-good-text)'
    : deltaTone === 'bad' ? 'var(--status-critical-text)' : 'var(--ink-muted)';
  return (
    <div className={cx(
      'relative bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-3.5 overflow-hidden',
      'shadow-[var(--shadow-sm)] transition-colors duration-200 hover:border-[var(--border-strong)]', className
    )}>
      {accent && <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: accent }} aria-hidden />}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="text-[11.5px] font-medium text-[var(--ink-muted)] truncate">{label}</span>
        {icon && <span className="text-[var(--ink-muted)] shrink-0 opacity-70">{icon}</span>}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[26px] leading-none font-semibold text-[var(--ink)] tracking-[-0.02em]">{value}</span>
        {unit && <span className="text-[12px] text-[var(--ink-muted)]">{unit}</span>}
      </div>
      {(delta || foot) && (
        // Wraps rather than truncates: on a narrow screen two short lines beat
        // one clipped one.
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px]">
          {delta && <span style={{ color: tone }} className="font-medium">{delta}</span>}
          {foot && <span className="text-[var(--ink-muted)] min-w-0">{foot}</span>}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Sparkline ------------------------------ */

export function Sparkline({
  data, color = 'var(--accent-ring)', height = 34, fill = true, className,
}: { data: number[]; color?: string; height?: number; fill?: boolean; className?: string }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  if (!data.length) return <div ref={ref} style={{ height }} className={className} />;

  const w = Math.max(width, 1);
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const y = (v: number) => height - 3 - ((v - min) / span) * (height - 6);

  const points = data.map((v, i) => `${i * step},${y(v)}`);
  const line = `M${points.join('L')}`;
  const area = `${line}L${w},${height}L0,${height}Z`;
  const lastX = (data.length - 1) * step;

  return (
    <div ref={ref} className={cx('w-full', className)} style={{ height }}>
      {width > 0 && (
        <svg width={w} height={height} aria-hidden className="overflow-visible block">
          {fill && (
            <>
              <defs>
                <linearGradient id={`spark-${color.replace(/\W/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity="0.22" />
                  <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={area} fill={`url(#spark-${color.replace(/\W/g, '')})`} />
            </>
          )}
          <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={lastX} cy={y(data[data.length - 1])} r={3} fill={color} stroke="var(--surface)" strokeWidth={2} />
        </svg>
      )}
    </div>
  );
}

/* ------------------------------ BarChart ------------------------------ */

export interface BarDatum {
  label: string;
  /** One entry per series key. */
  values: Record<string, number>;
  meta?: ReactNode;
}

export function BarChart({
  data, series, height = 210, stacked = true, formatValue = (v) => String(Math.round(v)),
  yTicks = 4, highlightLast, className,
}: {
  data: BarDatum[]; series: Series[]; height?: number; stacked?: boolean;
  formatValue?: (v: number) => string; yTicks?: number; highlightLast?: boolean; className?: string;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [tip, setTip] = useState<TooltipState | null>(null);

  const padding = { top: 8, right: 4, bottom: 22, left: 34 };
  const w = Math.max(width, 1);
  const innerW = Math.max(w - padding.left - padding.right, 1);
  const innerH = Math.max(height - padding.top - padding.bottom, 1);

  const totals = data.map((d) => (stacked
    ? series.reduce((s, k) => s + (d.values[k.key] || 0), 0)
    : Math.max(...series.map((k) => d.values[k.key] || 0), 0)));
  const max = niceMax(Math.max(...totals, 0), yTicks);

  const slot = innerW / Math.max(data.length, 1);
  const barW = Math.max(3, Math.min(stacked ? 26 : 26 / series.length, slot * (stacked ? 0.6 : 0.72 / series.length)));
  const gap = 2;   // the surface gap that keeps adjacent fills readable

  return (
    <div ref={ref} className={cx('relative w-full', className)} style={{ height }}>
      {width > 0 && (
        <svg width={w} height={height} className="block" role="img" aria-label="Bar chart">
          {/* recessive grid + value axis */}
          {Array.from({ length: yTicks + 1 }, (_, i) => {
            const value = (max / yTicks) * i;
            const y = padding.top + innerH - (value / max) * innerH;
            return (
              <g key={i}>
                <line x1={padding.left} x2={w - padding.right} y1={y} y2={y} stroke="var(--grid)" strokeWidth={1} />
                <text x={padding.left - 7} y={y + 3.5} textAnchor="end"
                  className="fill-[var(--ink-muted)] tabular" style={{ fontSize: 10 }}>
                  {formatValue(value)}
                </text>
              </g>
            );
          })}

          {data.map((d, i) => {
            const cx0 = padding.left + slot * i + slot / 2;
            const isLast = i === data.length - 1;
            let cursor = padding.top + innerH;

            return (
              <g key={d.label}>
                {series.map((s, si) => {
                  const value = d.values[s.key] || 0;
                  const h = max > 0 ? (value / max) * innerH : 0;
                  if (h <= 0) return null;

                  const x = stacked
                    ? cx0 - barW / 2
                    : cx0 - (barW * series.length + gap * (series.length - 1)) / 2 + si * (barW + gap);
                  const y = stacked ? cursor - h : padding.top + innerH - h;
                  if (stacked) cursor -= h + gap;

                  return (
                    <path
                      key={s.key}
                      d={barPath(x, y, barW, stacked ? Math.max(h - gap, 1) : h, 4)}
                      fill={s.color}
                      opacity={highlightLast && !isLast ? 0.62 : 1}
                      className="transition-opacity duration-150"
                    />
                  );
                })}

                {/* hit target wider than the mark */}
                <rect
                  x={padding.left + slot * i} y={padding.top} width={slot} height={innerH}
                  fill="transparent" className="cursor-pointer"
                  onMouseEnter={() => setTip({
                    x: cx0, y: padding.top,
                    content: (
                      <div>
                        <div className="font-medium text-[var(--ink)] mb-1">{d.label}</div>
                        {series.map((s) => (
                          <div key={s.key} className="flex items-center gap-1.5 text-[var(--ink-secondary)]">
                            <span className="w-2 h-2 rounded-[2px]" style={{ background: s.color }} aria-hidden />
                            <span>{s.label}</span>
                            <span className="ml-auto pl-3 tabular text-[var(--ink)]">{formatValue(d.values[s.key] || 0)}</span>
                          </div>
                        ))}
                        {d.meta && <div className="mt-1 pt-1 border-t border-[var(--border)] text-[var(--ink-muted)]">{d.meta}</div>}
                      </div>
                    ),
                  })}
                  onMouseLeave={() => setTip(null)}
                />

                {/* Label every bar when there is room, else thin them out. */}
                {(data.length <= 14 || i % Math.ceil(data.length / 12) === 0) && (
                  <text x={cx0} y={height - 6} textAnchor="middle"
                    className="fill-[var(--ink-muted)]" style={{ fontSize: 10 }}>
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}

          <line x1={padding.left} x2={w - padding.right} y1={padding.top + innerH} y2={padding.top + innerH}
            stroke="var(--axis)" strokeWidth={1} />
        </svg>
      )}
      <Tooltip state={tip} width={w} />
    </div>
  );
}

/* ------------------------------ LineChart ------------------------------ */

export interface LinePoint { label: string; values: Record<string, number | null> }

export function LineChart({
  data, series, height = 210, formatValue = (v) => String(Math.round(v)),
  yTicks = 4, area = false, zeroBased = true, className,
}: {
  data: LinePoint[]; series: Series[]; height?: number;
  formatValue?: (v: number) => string; yTicks?: number; area?: boolean;
  zeroBased?: boolean; className?: string;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const padding = { top: 10, right: 8, bottom: 22, left: 36 };
  const w = Math.max(width, 1);
  const innerW = Math.max(w - padding.left - padding.right, 1);
  const innerH = Math.max(height - padding.top - padding.bottom, 1);

  const flat = data.flatMap((d) => series.map((s) => d.values[s.key])).filter((v): v is number => v != null);
  const rawMax = Math.max(...flat, 0);
  const rawMin = Math.min(...flat, 0);
  const max = niceMax(rawMax, yTicks);
  const min = zeroBased ? 0 : Math.floor(rawMin);
  const span = max - min || 1;

  const xAt = (i: number) => padding.left + (data.length > 1 ? (i / (data.length - 1)) * innerW : innerW / 2);
  const yAt = (v: number) => padding.top + innerH - ((v - min) / span) * innerH;

  const onMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = e.clientX - rect.left - padding.left;
    const idx = Math.round((rel / innerW) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, idx)));
  }, [data.length, innerW]);

  const tip: TooltipState | null = hover != null && data[hover]
    ? {
        x: xAt(hover), y: padding.top,
        content: (
          <div>
            <div className="font-medium text-[var(--ink)] mb-1">{data[hover].label}</div>
            {series.map((s) => (
              <div key={s.key} className="flex items-center gap-1.5 text-[var(--ink-secondary)]">
                <span className="w-2 h-2 rounded-full" style={{ background: s.color }} aria-hidden />
                <span>{s.label}</span>
                <span className="ml-auto pl-3 tabular text-[var(--ink)]">
                  {data[hover].values[s.key] == null ? '—' : formatValue(data[hover].values[s.key] as number)}
                </span>
              </div>
            ))}
          </div>
        ),
      }
    : null;

  return (
    <div ref={ref} className={cx('relative w-full', className)} style={{ height }}>
      {width > 0 && (
        <svg
          width={w} height={height} className="block" role="img" aria-label="Line chart"
          onMouseMove={onMove} onMouseLeave={() => setHover(null)}
        >
          {Array.from({ length: yTicks + 1 }, (_, i) => {
            const value = min + (span / yTicks) * i;
            const y = yAt(value);
            return (
              <g key={i}>
                <line x1={padding.left} x2={w - padding.right} y1={y} y2={y} stroke="var(--grid)" strokeWidth={1} />
                <text x={padding.left - 7} y={y + 3.5} textAnchor="end"
                  className="fill-[var(--ink-muted)] tabular" style={{ fontSize: 10 }}>
                  {formatValue(value)}
                </text>
              </g>
            );
          })}

          {hover != null && (
            <line x1={xAt(hover)} x2={xAt(hover)} y1={padding.top} y2={padding.top + innerH}
              stroke="var(--border-strong)" strokeWidth={1} strokeDasharray="3 3" />
          )}

          {series.map((s) => {
            const pts = data
              .map((d, i) => ({ i, v: d.values[s.key] }))
              .filter((p): p is { i: number; v: number } => p.v != null);
            if (pts.length < 1) return null;
            const path = pts.map((p, k) => `${k === 0 ? 'M' : 'L'}${xAt(p.i)},${yAt(p.v)}`).join('');
            return (
              <g key={s.key}>
                {area && pts.length > 1 && (
                  <>
                    <defs>
                      <linearGradient id={`ln-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={s.color} stopOpacity="0.20" />
                        <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path
                      d={`${path}L${xAt(pts[pts.length - 1].i)},${padding.top + innerH}L${xAt(pts[0].i)},${padding.top + innerH}Z`}
                      fill={`url(#ln-${s.key})`}
                    />
                  </>
                )}
                <path d={path} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                {hover != null && data[hover]?.values[s.key] != null && (
                  <circle
                    cx={xAt(hover)} cy={yAt(data[hover].values[s.key] as number)} r={4.5}
                    fill={s.color} stroke="var(--surface)" strokeWidth={2}
                  />
                )}
              </g>
            );
          })}

          <line x1={padding.left} x2={w - padding.right} y1={padding.top + innerH} y2={padding.top + innerH}
            stroke="var(--axis)" strokeWidth={1} />

          {data.map((d, i) => (
            (data.length <= 10 || i % Math.ceil(data.length / 8) === 0 || i === data.length - 1) && (
              <text key={d.label + i} x={xAt(i)} y={height - 6} textAnchor="middle"
                className="fill-[var(--ink-muted)]" style={{ fontSize: 10 }}>
                {d.label}
              </text>
            )
          ))}
        </svg>
      )}
      <Tooltip state={tip} width={w} />
    </div>
  );
}

/* ------------------------------ Donut ------------------------------ */

export function DonutChart({
  data, size = 168, thickness = 22, centerLabel, centerValue, formatValue = (v) => String(Math.round(v)),
}: {
  data: Array<{ key: string; label: string; value: number; color: string }>;
  size?: number; thickness?: number; centerLabel?: string; centerValue?: ReactNode;
  formatValue?: (v: number) => string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;

  let offset = 0;
  const gapDeg = data.length > 1 ? 2 : 0;   // the 2px surface gap, in arc terms

  return (
    <div className="flex items-center gap-5 flex-wrap">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="block -rotate-90" role="img" aria-label={centerLabel ?? 'Donut chart'}>
          <circle cx={c} cy={c} r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth={thickness} />
          {total > 0 && data.map((d) => {
            const frac = d.value / total;
            const len = Math.max(0, circumference * frac - gapDeg);
            const dash = `${len} ${circumference - len}`;
            const el = (
              <circle
                key={d.key} cx={c} cy={c} r={r} fill="none"
                stroke={d.color}
                strokeWidth={hover === d.key ? thickness + 3 : thickness}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                className="transition-[stroke-width] duration-150 cursor-pointer"
                onMouseEnter={() => setHover(d.key)}
                onMouseLeave={() => setHover(null)}
              />
            );
            offset += circumference * frac;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[22px] font-semibold text-[var(--ink)] tracking-[-0.02em] leading-none">
            {hover ? formatValue(data.find((d) => d.key === hover)?.value ?? 0) : centerValue}
          </span>
          <span className="text-[11px] text-[var(--ink-muted)] mt-1 max-w-[92px] text-center leading-tight">
            {hover ? data.find((d) => d.key === hover)?.label : centerLabel}
          </span>
        </div>
      </div>

      {/* The legend doubles as the value table — identity is never colour alone. */}
      <ul className="min-w-[150px] grow space-y-1.5">
        {data.map((d) => (
          <li
            key={d.key}
            className={cx(
              'flex items-center gap-2 text-[12px] px-1.5 py-1 rounded-[var(--radius-sm)] cursor-pointer transition-colors',
              hover === d.key ? 'bg-[var(--surface-hover)]' : ''
            )}
            onMouseEnter={() => setHover(d.key)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: d.color }} aria-hidden />
            <span className="text-[var(--ink-secondary)] truncate">{d.label}</span>
            <span className="ml-auto tabular text-[var(--ink)] font-medium">{formatValue(d.value)}</span>
            <span className="tabular text-[var(--ink-muted)] w-9 text-right">
              {total ? Math.round((d.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------- ProgressRing ---------------------------- */

export function ProgressRing({
  value, max = 100, size = 52, thickness = 5, color = 'var(--accent)', children, label,
}: {
  value: number; max?: number; size?: number; thickness?: number;
  color?: string; children?: ReactNode; label?: string;
}) {
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}
      role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <svg width={size} height={size} className="-rotate-90 block">
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth={thickness} />
        <circle
          cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={thickness}
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-700 ease-[var(--ease-out)]"
        />
      </svg>
      {children && (
        <div className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-[var(--ink)] tabular">
          {children}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Heatmap ------------------------------ */

const HEAT = ['var(--heat-0)', 'var(--heat-1)', 'var(--heat-2)', 'var(--heat-3)', 'var(--heat-4)'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function Heatmap<T extends { date: string; level: number }>({
  cells, cellSize = 11, gap = 3, onSelect, describe,
}: {
  cells: T[];
  cellSize?: number; gap?: number;
  onSelect?: (date: string) => void;
  describe?: (cell: T) => ReactNode;
}) {
  const [tip, setTip] = useState<TooltipState | null>(null);
  const [ref, { width }] = useSize<HTMLDivElement>();

  const weeks = useMemo(() => {
    const out: Array<Array<T | null>> = [];
    let current: Array<T | null> = [];
    cells.forEach((cell) => {
      const dow = new Date(`${cell.date}T00:00:00Z`).getUTCDay();
      if (!current.length && dow !== 0) current = Array(dow).fill(null);
      current.push(cell);
      if (dow === 6) { out.push(current); current = []; }
    });
    if (current.length) out.push([...current, ...Array(7 - current.length).fill(null)]);
    return out;
  }, [cells]);

  const step = cellSize + gap;
  const chartW = weeks.length * step;
  const chartH = 7 * step;

  // Month label at the first week that contains that month's first days.
  const monthMarks = useMemo(() => {
    const marks: Array<{ x: number; label: string }> = [];
    let lastMonth = -1;
    weeks.forEach((week, wi) => {
      const first = week.find(Boolean);
      if (!first) return;
      const m = Number(first.date.slice(5, 7)) - 1;
      if (m !== lastMonth) { marks.push({ x: wi * step, label: MONTHS[m] }); lastMonth = m; }
    });
    return marks;
  }, [weeks, step]);

  return (
    <div ref={ref} className="relative">
      <div className="overflow-x-auto scrollbar-none pb-1">
        <svg width={Math.max(chartW, 1)} height={chartH + 18} className="block" role="img" aria-label="Activity heatmap">
          {monthMarks.map((m, i) => (
            <text key={i} x={m.x} y={9} className="fill-[var(--ink-muted)]" style={{ fontSize: 9.5 }}>{m.label}</text>
          ))}
          {weeks.map((week, wi) =>
            week.map((cell, di) => {
              if (!cell) return null;
              return (
                <rect
                  key={cell.date}
                  x={wi * step} y={14 + di * step}
                  width={cellSize} height={cellSize} rx={2.5}
                  fill={HEAT[Math.max(0, Math.min(4, cell.level))]}
                  className={cx('transition-[stroke] duration-100', onSelect && 'cursor-pointer')}
                  stroke="transparent" strokeWidth={2}
                  onMouseEnter={(e) => {
                    (e.target as SVGRectElement).setAttribute('stroke', 'var(--ink-muted)');
                    const box = ref.current?.getBoundingClientRect();
                    const r = (e.target as SVGRectElement).getBoundingClientRect();
                    setTip({
                      x: r.left - (box?.left ?? 0) + cellSize / 2,
                      y: r.top - (box?.top ?? 0),
                      content: describe ? describe(cell) : cell.date,
                    });
                  }}
                  onMouseLeave={(e) => {
                    (e.target as SVGRectElement).setAttribute('stroke', 'transparent');
                    setTip(null);
                  }}
                  onClick={() => onSelect?.(cell.date)}
                />
              );
            })
          )}
        </svg>
      </div>
      <div className="flex items-center gap-1.5 mt-1 text-[10.5px] text-[var(--ink-muted)]">
        <span>Quieter</span>
        {HEAT.map((c, i) => (
          <span key={i} className="w-[10px] h-[10px] rounded-[2px]" style={{ background: c }} aria-hidden />
        ))}
        <span>Fuller</span>
      </div>
      <Tooltip state={tip} width={width} />
    </div>
  );
}

/* ----------------------------- HBarList ----------------------------- */

/** Horizontal ranked bars — the right form when categories have long names. */
export function HBarList({
  items, formatValue = (v) => String(Math.round(v)), max: fixedMax, emptyLabel = 'Nothing here yet.',
}: {
  items: Array<{ key: string; label: string; value: number; color: string; meta?: ReactNode }>;
  formatValue?: (v: number) => string; max?: number; emptyLabel?: string;
}) {
  if (!items.length) {
    return <p className="text-[12px] text-[var(--ink-muted)] py-6 text-center">{emptyLabel}</p>;
  }
  const max = fixedMax ?? Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item.key}>
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <span className="text-[12.5px] text-[var(--ink-secondary)] truncate flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-[2px] shrink-0" style={{ background: item.color }} aria-hidden />
              {item.label}
            </span>
            <span className="text-[12px] tabular text-[var(--ink)] font-medium shrink-0">
              {formatValue(item.value)}
              {item.meta && <span className="text-[var(--ink-muted)] font-normal ml-1.5">{item.meta}</span>}
            </span>
          </div>
          <div className="h-[6px] rounded-[var(--radius-full)] bg-[var(--surface-sunken)] overflow-hidden">
            <div
              className="h-full rounded-[var(--radius-full)] transition-[width] duration-500 ease-[var(--ease-out)]"
              style={{ width: `${(item.value / max) * 100}%`, background: item.color }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* --------------------------- live clock hook --------------------------- */

export function useTicker(active: boolean, intervalMs = 1000) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => force((n) => n + 1), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
}

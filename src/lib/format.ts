export type Currency = 'IRT' | 'IRR' | 'USD' | 'EUR';

const SYMBOL: Record<Currency, string> = { IRT: 'T', IRR: '﷼', USD: '$', EUR: '€' };

/** 12_500_000 -> "12.5M" — Toman figures are long, so charts and tiles compact them. */
export function compactNumber(n: number, digits = 1): string {
  const v = Math.abs(n ?? 0);
  const sign = (n ?? 0) < 0 ? '-' : '';
  if (v >= 1e12) return `${sign}${trim(v / 1e12, digits)}T`;
  if (v >= 1e9) return `${sign}${trim(v / 1e9, digits)}B`;
  if (v >= 1e6) return `${sign}${trim(v / 1e6, digits)}M`;
  if (v >= 1e3) return `${sign}${trim(v / 1e3, digits)}K`;
  return `${sign}${trim(v, v < 10 && v % 1 !== 0 ? 1 : 0)}`;
}

function trim(v: number, digits: number): string {
  const s = v.toFixed(digits);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

export function formatNumber(n: number, digits = 0): string {
  return (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Full precision — for table rows and detail views. */
export function formatMoney(amount: number, currency: Currency = 'IRT'): string {
  const value = formatNumber(Math.round(amount ?? 0));
  return currency === 'IRT' || currency === 'IRR'
    ? `${value} ${SYMBOL[currency]}`
    : `${SYMBOL[currency]}${value}`;
}

/** Compact — for stat tiles, axis ticks and chart labels. */
export function formatMoneyShort(amount: number, currency: Currency = 'IRT'): string {
  const value = compactNumber(amount ?? 0);
  return currency === 'IRT' || currency === 'IRR'
    ? `${value} ${SYMBOL[currency]}`
    : `${SYMBOL[currency]}${value}`;
}

export const currencySymbol = (c: Currency = 'IRT') => SYMBOL[c];

export function formatPercent(value: number, digits = 0): string {
  return `${(value ?? 0).toFixed(digits)}%`;
}

export function formatWeight(kg: number | null | undefined, units: 'metric' | 'imperial' = 'metric'): string {
  if (kg == null) return '—';
  return units === 'imperial' ? `${(kg * 2.20462).toFixed(1)} lb` : `${kg.toFixed(1)} kg`;
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function initials(name: string): string {
  return (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Safe percentage for progress bars — never NaN, never past 100. */
export function progressPercent(current: number, target: number): number {
  if (!target) return 0;
  return clamp(Math.round(((current ?? 0) / target) * 100), 0, 100);
}

export const MOOD_LABELS = ['', 'Rough', 'Low', 'Okay', 'Good', 'Great'];
export const ENERGY_LABELS = ['', 'Drained', 'Low', 'Steady', 'High', 'Peak'];
export const QUALITY_LABELS = ['', 'Poor', 'Fair', 'Okay', 'Good', 'Excellent'];
export const PRIORITY_LABELS: Record<number, string> = { 1: 'Urgent', 2: 'High', 3: 'Normal', 4: 'Someday' };

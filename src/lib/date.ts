/**
 * Date helpers. Dates travel as plain `YYYY-MM-DD`; arithmetic runs in UTC on
 * the date-only value so a DST shift can never move a day.
 *
 * Jalali (Persian) dates come from the platform's own `ca-persian` calendar
 * rather than a hand-rolled converter — correct, localised, and free.
 */

export type ISODate = string;

export function todayIso(d = new Date()): ISODate {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function toDate(iso: ISODate): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function addDays(iso: ISODate, n: number): ISODate {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function addMonths(iso: ISODate, n: number): ISODate {
  const d = toDate(iso);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday */
export function weekdayOf(iso: ISODate): number {
  return toDate(iso).getUTCDay();
}

export function startOfWeek(iso: ISODate, weekStart = 6): ISODate {
  return addDays(iso, -((weekdayOf(iso) - weekStart + 7) % 7));
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86400000);
}

export function dateRange(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  let cursor = from;
  let guard = 0;
  while (cursor <= to && guard++ < 4000) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

export const monthKey = (iso: ISODate) => iso.slice(0, 7);

export function quarterKey(iso: ISODate) {
  return `${iso.slice(0, 4)}-Q${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1}`;
}

/* --------------------------- formatting --------------------------- */

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const weekdayShort = (iso: ISODate) => WEEKDAY_SHORT[weekdayOf(iso)];
export const weekdayLetter = (n: number) => WEEKDAY_LETTER[n];

/** "12 Aug" / "12 Aug 2025" once the year differs from today's. */
export function formatDate(iso: ISODate, opts: { year?: boolean } = {}): string {
  if (!iso) return '—';
  const d = toDate(iso);
  const showYear = opts.year ?? iso.slice(0, 4) !== todayIso().slice(0, 4);
  return `${d.getUTCDate()} ${MONTH_SHORT[d.getUTCMonth()]}${showYear ? ` ${d.getUTCFullYear()}` : ''}`;
}

export function formatLongDate(iso: ISODate): string {
  const d = toDate(iso);
  return `${WEEKDAY_SHORT[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "today" / "tomorrow" / "3 days ago" / a plain date beyond a week. */
export function relativeDay(iso: ISODate, today = todayIso()): string {
  const diff = daysBetween(today, iso);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  if (diff > 1 && diff <= 7) return `in ${diff} days`;
  if (diff < -1 && diff >= -7) return `${Math.abs(diff)} days ago`;
  return formatDate(iso);
}

/* ----------------------------- Jalali ----------------------------- */

const jalaliParts = (iso: ISODate) => {
  const parts = new Intl.DateTimeFormat('en-u-ca-persian', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  }).formatToParts(toDate(iso));
  const find = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { year: find('year'), month: find('month'), day: find('day') };
};

/** "۲۴ مرداد ۱۴۰۵" — Persian script and digits. */
export function formatJalali(iso: ISODate): string {
  try {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
    }).format(toDate(iso));
  } catch {
    return '';
  }
}

/** "24 Mordad 1405" — Latin transliteration, for mixed-script layouts. */
export function formatJalaliLatin(iso: ISODate): string {
  try {
    const { year, month, day } = jalaliParts(iso);
    return `${day} ${month} ${year}`;
  } catch {
    return '';
  }
}

export function jalaliYear(iso: ISODate): string {
  try {
    return jalaliParts(iso).year;
  } catch {
    return '';
  }
}

/* ------------------------------ time ------------------------------ */

/** 135 -> "2h 15m", 45 -> "45m", 0 -> "0m" */
export function formatMinutes(min: number): string {
  const n = Math.max(0, Math.round(min || 0));
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (!h) return `${m}m`;
  if (!m) return `${h}h`;
  return `${h}h ${m}m`;
}

/** 135 -> "2.3" (hours, one decimal) */
export const toHours = (min: number) => Math.round(((min || 0) / 60) * 10) / 10;

/** Live "01:23:45" from an ISO timestamp to now. */
export function elapsedClock(startedAt: string, now = Date.now()): string {
  const secs = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const pad = (v: number) => String(v).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function elapsedMinutes(startedAt: string, now = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 60000));
}

/** "14:32" from an ISO timestamp, in local time. */
export function clockTime(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

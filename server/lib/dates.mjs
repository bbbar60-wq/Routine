/**
 * Date helpers. Dates are stored as plain `YYYY-MM-DD` strings; all arithmetic
 * runs in UTC on the date-only value so a daylight-saving shift can never move
 * a day. "Today" is read from local time, because that is the user's day.
 */

/** Default week start: Saturday, matching the Iranian working week. */
export const DEFAULT_WEEK_START = 6;

export function todayIso(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function toUtc(iso) {
  return new Date(`${iso}T00:00:00Z`);
}

export function fromUtc(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso, n) {
  const d = toUtc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUtc(d);
}

export function addMonths(iso, n) {
  const d = toUtc(iso);
  d.setUTCMonth(d.getUTCMonth() + n);
  return fromUtc(d);
}

/** 0 = Sunday … 6 = Saturday */
export function weekdayOf(iso) {
  return toUtc(iso).getUTCDay();
}

export function startOfWeek(iso, weekStart = DEFAULT_WEEK_START) {
  const day = weekdayOf(iso);
  const back = (day - weekStart + 7) % 7;
  return addDays(iso, -back);
}

export function startOfMonth(iso) {
  return `${iso.slice(0, 7)}-01`;
}

export function monthKey(iso) {
  return iso.slice(0, 7);
}

export function quarterKey(iso) {
  const month = Number(iso.slice(5, 7));
  return `${iso.slice(0, 4)}-Q${Math.floor((month - 1) / 3) + 1}`;
}

export function yearKey(iso) {
  return iso.slice(0, 4);
}

export function daysBetween(a, b) {
  return Math.round((toUtc(b) - toUtc(a)) / 86400000);
}

/** Inclusive list of dates from `from` to `to`. */
export function dateRange(from, to) {
  const out = [];
  let cursor = from;
  let guard = 0;
  while (cursor <= to && guard++ < 4000) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

/**
 * Tiny declarative validator. Every write endpoint runs its body through a
 * field spec so nothing untyped reaches SQL.
 */
import { badRequest } from './http.mjs';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export const f = {
  str: (opts = {}) => ({ type: 'str', max: 2000, ...opts }),
  text: (opts = {}) => ({ type: 'str', max: 20000, ...opts }),
  int: (opts = {}) => ({ type: 'int', ...opts }),
  num: (opts = {}) => ({ type: 'num', ...opts }),
  bool: (opts = {}) => ({ type: 'bool', ...opts }),
  date: (opts = {}) => ({ type: 'date', ...opts }),
  time: (opts = {}) => ({ type: 'time', ...opts }),
  enum: (values, opts = {}) => ({ type: 'enum', values, ...opts }),
};

function coerce(key, spec, value) {
  const { type } = spec;

  if (type === 'str') {
    if (typeof value !== 'string') throw badRequest(`"${key}" must be a string`);
    const v = value.trim();
    if (spec.min != null && v.length < spec.min) throw badRequest(`"${key}" is too short`);
    if (spec.max != null && v.length > spec.max) throw badRequest(`"${key}" is too long (max ${spec.max})`);
    return v;
  }

  if (type === 'int' || type === 'num') {
    const v = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    if (typeof v !== 'number' || !Number.isFinite(v)) throw badRequest(`"${key}" must be a number`);
    if (type === 'int' && !Number.isInteger(v)) throw badRequest(`"${key}" must be a whole number`);
    if (spec.min != null && v < spec.min) throw badRequest(`"${key}" must be at least ${spec.min}`);
    if (spec.max != null && v > spec.max) throw badRequest(`"${key}" must be at most ${spec.max}`);
    return v;
  }

  if (type === 'bool') {
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value === 1 || value === 0) return value;
    throw badRequest(`"${key}" must be true or false`);
  }

  if (type === 'date') {
    if (typeof value !== 'string' || !DATE_RE.test(value)) {
      throw badRequest(`"${key}" must be a date (YYYY-MM-DD)`);
    }
    const d = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) throw badRequest(`"${key}" is not a real date`);
    return value;
  }

  if (type === 'time') {
    if (typeof value !== 'string' || !TIME_RE.test(value)) {
      throw badRequest(`"${key}" must be a time (HH:MM)`);
    }
    return value;
  }

  if (type === 'enum') {
    if (!spec.values.includes(value)) {
      throw badRequest(`"${key}" must be one of: ${spec.values.join(', ')}`);
    }
    return value;
  }

  throw badRequest(`Unknown field type for "${key}"`);
}

/**
 * @param body    raw request body
 * @param schema  { field: spec }
 * @param opts    { partial } — when true, absent fields are simply omitted
 *                (used by PATCH), instead of falling back to defaults.
 */
export function validate(body, schema, { partial = false } = {}) {
  const out = {};
  for (const [key, spec] of Object.entries(schema)) {
    const present = Object.prototype.hasOwnProperty.call(body, key);
    const value = body[key];

    if (!present || value === undefined) {
      if (partial) continue;
      if (spec.default !== undefined) { out[key] = spec.default; continue; }
      if (spec.required) throw badRequest(`"${key}" is required`);
      if (spec.nullable) { out[key] = null; continue; }
      continue;
    }

    if (value === null || value === '') {
      if (spec.nullable) { out[key] = null; continue; }
      if (spec.required) throw badRequest(`"${key}" is required`);
      if (spec.type === 'str') { out[key] = ''; continue; }
      if (spec.default !== undefined) { out[key] = spec.default; continue; }
      out[key] = null;
      continue;
    }

    out[key] = coerce(key, spec, value);
  }
  return out;
}

/** Build `SET a = ?, b = ?` plus the ordered params, from a validated patch. */
export function buildUpdate(patch, allowed) {
  const keys = Object.keys(patch).filter((k) => allowed.includes(k));
  if (!keys.length) throw badRequest('Nothing to update');
  return {
    clause: keys.map((k) => `${k} = ?`).join(', '),
    params: keys.map((k) => patch[k]),
  };
}

export function requireId(value, label = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw badRequest(`Invalid ${label}`);
  return n;
}

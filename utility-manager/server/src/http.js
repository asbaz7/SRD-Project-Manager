// Small helpers shared by route modules.
import { z } from 'zod';
import { badRequest, notFound } from './errors.js';

export function parse(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    throw badRequest(`Invalid ${details[0]?.field || 'input'}: ${details[0]?.message}`, details);
  }
  return result.data;
}

export const id = z.uuid();
export const serial = z.coerce.number().int().positive();
export const date = z.iso.date();
export const datetime = z.iso.datetime({ offset: true });
export const service = z.enum(['electricity', 'water', 'sewerage']);
export const text = (max = 500) => z.string().trim().min(1).max(max);
export const optText = (max = 2000) => z.string().trim().max(max).nullish().transform((v) => v || null);
export const optNumber = z.number().finite().nonnegative().nullish();

export const paging = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const idParam = z.object({ id });
export const serialParam = z.object({ id: serial });

export function one(rows, what) {
  if (!rows[0]) throw notFound(what);
  return rows[0];
}

// Builds "set a = $2, b = $3" from the keys present in a PATCH body.
export function updateSet(patch, columns, startAt = 2) {
  const keys = Object.keys(patch).filter((k) => columns.includes(k) && patch[k] !== undefined);
  if (!keys.length) throw badRequest('Nothing to update');
  return {
    sql: keys.map((k, i) => `${k} = $${i + startAt}`).join(', '),
    values: keys.map((k) => patch[k]),
  };
}

// Paged list result. Queries select `count(*) over () as total_count`.
export function pageOf(rows, { limit, offset }) {
  const total = rows[0]?.total_count ?? 0;
  return { items: rows.map(({ total_count, ...r }) => r), total, limit, offset };
}

// Accumulates "and x = $n" filters.
export class Where {
  constructor() { this.parts = []; this.values = []; }
  add(sqlWithQ, value) {
    if (value === undefined || value === null || value === '') return this;
    this.values.push(value);
    this.parts.push(sqlWithQ.replaceAll('?', `$${this.values.length}`));
    return this;
  }
  raw(sql) { this.parts.push(sql); return this; }
  get sql() { return this.parts.length ? `where ${this.parts.join(' and ')}` : ''; }
  next() { return `$${this.values.length + 1}`; }
}

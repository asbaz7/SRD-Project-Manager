// CSV in and out, for Excel users.

// Cells starting with these could run as formulas when opened in Excel.
const FORMULA = /^[=+\-@\t\r]/;

function cell(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  let s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (typeof value === 'string' && FORMULA.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

// columns: [[header, key or fn(row)], ...]
export function toCsv(rows, columns) {
  const head = columns.map(([h]) => cell(h)).join(',');
  const body = rows.map((r) => columns.map(([, k]) => cell(typeof k === 'function' ? k(r) : r[k])).join(','));
  return '﻿' + [head, ...body].join('\r\n') + '\r\n'; // BOM so Excel reads UTF-8
}

export function sendCsv(reply, filename, rows, columns) {
  return reply
    .header('content-type', 'text/csv; charset=utf-8')
    .header('content-disposition', `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`)
    .send(toCsv(rows, columns));
}

export function parseCsv(text) {
  text = String(text).replace(/^﻿/, '');
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head = [], ...data] = rows.filter((r) => r.some((f) => f.trim() !== ''));
  const keys = head.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return data.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

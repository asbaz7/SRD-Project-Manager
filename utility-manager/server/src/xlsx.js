// Minimal .xlsx reader: cell values plus their number formats, which is what
// the engine condition reports need (to tell dates from running-hour
// durations). Pure JS, so it runs on Node.js and Cloudflare Workers alike.
import { strFromU8, unzipSync } from 'fflate';

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 22, 27, 30, 36, 45, 46, 47, 50, 57]);
const BUILTIN_FORMATS = { 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mmss.0' };

const decode = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&');

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? decode(m[1]) : undefined;
};

// All <t> text inside a fragment (rich text runs included).
const textOf = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join('');

export function colIndex(ref) {
  const letters = ref.match(/^[A-Z]+/)[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * readWorkbook(bytes) -> [{ name, rows }]
 * rows[r][c] = { v: string|number|boolean, fmt?: string, date?: boolean }
 */
export function readWorkbook(bytes) {
  let files;
  try {
    files = unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  } catch {
    throw new Error('Not a valid .xlsx file');
  }
  const read = (path) => (files[path] ? strFromU8(files[path]) : null);
  const workbook = read('xl/workbook.xml');
  if (!workbook) throw new Error('Not a valid .xlsx file');

  const shared = [];
  const sst = read('xl/sharedStrings.xml');
  if (sst) for (const m of sst.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]));

  // Number formats per style index.
  const styles = read('xl/styles.xml') || '';
  const customFormats = {};
  for (const m of styles.matchAll(/<numFmt\s[^>]*\/?>/g)) customFormats[attr(m[0], 'numFmtId')] = attr(m[0], 'formatCode');
  const xfsBlock = styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] || '';
  const styleFormats = [...xfsBlock.matchAll(/<xf\s[^>]*?\/?>/g)].map((m) => {
    const id = Number(attr(m[0], 'numFmtId') || 0);
    const code = customFormats[id] ?? BUILTIN_FORMATS[id] ?? '';
    return { code, date: BUILTIN_DATE_FORMATS.has(id) || isDateFormat(code) };
  });

  const rels = read('xl/_rels/workbook.xml.rels') || '';
  const target = {};
  for (const m of rels.matchAll(/<Relationship\s[^>]*\/?>/g)) target[attr(m[0], 'Id')] = attr(m[0], 'Target');

  const sheets = [];
  for (const m of workbook.matchAll(/<sheet\s[^>]*\/?>/g)) {
    const name = attr(m[0], 'name');
    const rid = attr(m[0], 'r:id');
    let path = target[rid] || '';
    path = path.startsWith('/') ? path.slice(1) : `xl/${path.replace(/^\.\//, '')}`;
    const xml = read(path);
    if (!xml) continue;
    sheets.push({ name, rows: parseSheet(xml, shared, styleFormats) });
  }
  return sheets;
}

function parseSheet(xml, shared, styleFormats) {
  const rows = [];
  for (const m of xml.matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const tag = ` ${m[1]}`;
    const ref = attr(tag, 'r');
    if (!ref) continue;
    const type = attr(tag, 't');
    const style = styleFormats[Number(attr(tag, 's') || 0)] || { code: '', date: false };
    const inner = m[2] || '';
    const raw = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
    let v;
    if (type === 's') v = raw === undefined ? undefined : shared[Number(raw)];
    else if (type === 'inlineStr') v = textOf(inner);
    else if (type === 'str') v = raw === undefined ? undefined : decode(raw);
    else if (type === 'b') v = raw === '1';
    else if (type === 'e') v = undefined; // #VALUE! etc.
    else if (raw !== undefined) v = Number(raw);
    if (v === undefined || v === '') continue;
    const r = Number(ref.match(/\d+$/)[0]) - 1;
    const c = colIndex(ref);
    (rows[r] ||= [])[c] = typeof v === 'number' ? { v, fmt: style.code, date: style.date } : { v };
  }
  return rows;
}

// A format with day/month/year parts is a date; one that only has hours,
// minutes or seconds (including [h]) is a time or a duration.
function isDateFormat(code) {
  if (!code) return false;
  const cleaned = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
  return /[dy]/i.test(cleaned) || /m{3,}/i.test(cleaned) || (/m/i.test(cleaned) && !/[hs]/i.test(cleaned));
}

export function isDurationFormat(code) {
  return /\[h+\]/i.test(code || '') || (/h/i.test(code || '') && !isDateFormat(code));
}

// Excel serial (1900 date system) -> 'YYYY-MM-DD'
export function serialToDate(serial) {
  if (!Number.isFinite(serial) || serial < 1) return null;
  const ms = Math.round((serial - 25569) * 86400000);
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

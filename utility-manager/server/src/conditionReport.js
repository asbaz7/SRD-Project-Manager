// Reads a monthly ENGINE CONDITION REPORT workbook (the standard SRD
// template: one column per genset, one row per field, usually one sheet per
// month) into clean, typed data.
import { isDurationFormat, readWorkbook, serialToDate } from './xlsx.js';

// Row label (start of column A, upper-cased) -> field. First match wins, so
// longer / more specific labels come first.
const FIELDS = [
  ['GENSET NO', 'number', 'tag'],
  ['FIXED ASSET CODE', 'fixed_asset_code', 'text'],
  ['ENGINE MAKE', 'make', 'text'],
  ['ENGINE MODEL', 'model', 'text'],
  ['ENGINE CAPACITY', 'engine_kw', 'kw'],
  ['ENGINE SERIAL', 'serial_no', 'text'],
  ['CPL', 'cpl', 'text'],
  ['DYNAMO MAKE', 'alt_make', 'text'],
  ['DYNAMO FRAME', 'alt_frame', 'text'],
  ['DYNAMO SERIAL', 'alt_serial', 'text'],
  ['DYNAMO CAPACITY', 'alt_kw', 'kw'],
  ['LAST BATTERY CHANGE', 'battery_changed_on', 'date'],
  ['LAST DYNAMO SERVICE', 'alt_serviced_on', 'date'],
  ['ORIGINAL COMMISSIONING', 'commissioned_on', 'date'],
  ['ENGINE INSTALLED', 'installed_on', 'date'],
  ['IS THE ENGINE CONNECTED', 'connected', 'bool'],
  ['STATUS OF ENGINE', 'status_text', 'text'],
  ['DETAILS OF ANY ENGINE FAULT', 'fault', 'fault'],
  ['LAST VALVE CLEARANCE', 'valve_on', 'date'],
  ['RUNNING HOURS SINCE LAST VALVE', 'hours_since_valve', 'hours'],
  ['LAST OVERHAUL DATE', 'overhaul_on', 'date'],
  ['RUNNING HOURS SINCE LAST OVERHAUL', 'hours_since_overhaul', 'hours'],
  ['RUNNING HOURS AFTER LAST OVERHAUL', 'hours_since_overhaul', 'hours'],
  ['RUNNING HOURS FOR NEXT OVERHAUL', 'hours_to_overhaul', 'hours'],
  ['TOTAL RUNNING HOURS', 'total_hours', 'hours'],
  ['MAXIMUM LOAD TAKEN', 'max_load_kw', 'kw'],
  ['MAXIMUM LOAD ENGINE CAN TAKE', 'capable_kw', 'kw'],
  ['ENGINE NEEDS OVERHAUL', 'needs_overhaul', 'bool'],
  ['DYNAMO NEEDS SERVICE', 'alt_needs_service', 'bool'],
  ['SPARE FOR OVERHAUL', 'overhaul_spares_received', 'bool'],
];
const ISLAND_FIELDS = [
  ['MAXIMUM PEAK LOAD OF ISLAND', 'peak_load_record'],
  ['PEAK LOAD OF ISLAND THIS MONTH', 'peak_load_month'],
  ['THIS RECORD UPDATED', 'updated_on'],
];

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const EMPTY = /^(-+|\.+|nil+|n\/?a|none|null|no|nill|#value!|0)$/i;

const label = (cell) => (cell && typeof cell.v === 'string' ? cell.v.replace(/\s+/g, ' ').trim().toUpperCase() : '');
const pad = (n) => String(n).padStart(2, '0');
const validDate = (y, m, d) => {
  if (y < 1980 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 ? `${y}-${pad(m)}-${pad(d)}` : null;
};

export function toDate(cell) {
  if (!cell) return null;
  if (typeof cell.v === 'number') {
    if (cell.date || (cell.v > 25000 && cell.v < 60000 && !isDurationFormat(cell.fmt))) return serialToDate(cell.v);
    return null;
  }
  const s = String(cell.v).trim();
  if (!s || EMPTY.test(s)) return null;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{2,4})\b/); // day first (Maldives convention)
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return validDate(y, +m[2], +m[1]) || validDate(y, +m[1], +m[2]);
  }
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s\-.]*([A-Za-z]{3,})[\s\-.,]*(\d{2,4})/);
  if (m) {
    const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase());
    let y = +m[3];
    if (y < 100) y += 2000;
    if (mon >= 0) return validDate(y, mon + 1, +m[1]);
  }
  m = s.match(/^([A-Za-z]{3,})[\s\-.]*(\d{1,2}),?\s*(\d{4})/);
  if (m) {
    const mon = MONTHS.indexOf(m[1].slice(0, 3).toUpperCase());
    if (mon >= 0) return validDate(+m[3], mon + 1, +m[2]);
  }
  return null;
}

export function toHours(cell) {
  if (!cell) return null;
  if (typeof cell.v === 'number') {
    if (isDurationFormat(cell.fmt)) return round(cell.v * 24);
    if (cell.date) return null; // a date typed into an hours field
    return cell.v >= 0 && cell.v < 500000 ? round(cell.v) : null;
  }
  let s = String(cell.v).trim().replace(/;/g, ':').replace(/,/g, '');
  if (!s || EMPTY.test(s)) return null;
  let m = s.match(/(\d+)\s*days?\s*(\d+):(\d+)/i); // "285 days, 3:10:00"
  if (m) return round(+m[1] * 24 + +m[2] + +m[3] / 60);
  s = s.replace(/\s*[a-z]+\.?\s*$/i, '').trim(); // '4189 Hours.', '35721 HRM'
  m = s.match(/^(\d+):(\d+)(?::(\d+))?$/);
  if (m) return round(+m[1] + +m[2] / 60);
  m = s.match(/^(\d+(?:\.\d+)?)$/);
  if (m) return round(+m[1]);
  return null;
}

const round = (n) => Math.round(n * 10) / 10;

export function toKw(cell) {
  if (!cell) return null;
  if (typeof cell.v === 'number') return cell.date ? null : cell.v;
  const m = String(cell.v).replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

export function toBool(cell) {
  if (!cell) return null;
  const s = String(cell.v).trim().toUpperCase();
  if (/^Y(ES)?\b/.test(s)) return true;
  if (/^NO?\b/.test(s)) return false;
  return null;
}

function toText(cell) {
  if (!cell) return null;
  const v = typeof cell.v === 'number' && cell.date ? serialToDate(cell.v) : String(cell.v);
  const s = v.replace(/\s+/g, ' ').trim();
  return !s || /^(-+|\.+|nil+|n\/?a)$/i.test(s) ? null : s;
}

function toFault(cell) {
  const s = toText(cell);
  if (!s || /^(no|ok|nil+|none|no (engine )?faults?|no issues?|good|fine|normal|all ok)\.?$/i.test(s)) return null;
  return s;
}

function toTag(cell) {
  if (!cell) return null;
  if (typeof cell.v === 'number') return String(Math.round(cell.v));
  const m = String(cell.v).match(/(\d+)/);
  return m ? String(Number(m[1])) : String(cell.v).trim() || null;
}

const PARSE = { text: toText, fault: toFault, date: toDate, hours: toHours, kw: toKw, bool: toBool, tag: toTag };

/**
 * Overall engine condition from the free-text status (and fault details):
 * 'not_running' | 'major_fault' | 'minor_fault' | 'ok' | null
 */
export function classifyCondition(statusText, fault) {
  const s = `${statusText || ''}`.toUpperCase();
  if (!s && !fault) return null;
  if (/NOT\s*RUNNING|DISCONNECT|BREAK\s*DOWN|STOPPED|OUT OF SERVICE|SHUT\s*DOWN/.test(s)) return 'not_running';
  if (/MAJOR/.test(s)) return 'major_fault';
  if (/MINOR|FAULT|LEAK|CHARGING|PROBLEM|ISSUE/.test(s)) return 'minor_fault';
  if (/RUNNING|OK|GOOD|STANDBY/.test(s)) return fault ? 'minor_fault' : 'ok';
  return fault ? 'minor_fault' : null;
}

function monthOf(text) {
  const m = String(text).toUpperCase().match(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*/);
  return m ? MONTHS.indexOf(m[1]) + 1 : null;
}

// Report month ('YYYY-MM-01') for a sheet: the month in its name if any
// (year from the name, else the year that puts it just before the update
// date), otherwise the month before the update date.
// Year priority: in the sheet name ('August 2026', 'Aug 26'), then in the
// file name, then inferred from the update date, then the sheet's title row.
export function reportMonth(sheetName, updatedOn, fileYear, titleYear) {
  const month = monthOf(sheetName);
  const name = String(sheetName);
  const named = name.match(/\b(20\d{2})\b/) || name.match(/[A-Za-z]{3,}[\s.\-,]+(2\d)\s*$/);
  const upd = updatedOn ? new Date(`${updatedOn}T00:00:00Z`) : null;
  if (month) {
    let year = named ? (named[1].length === 2 ? 2000 + +named[1] : +named[1]) : fileYear || null;
    if (!year && upd) year = month <= upd.getUTCMonth() + 1 ? upd.getUTCFullYear() : upd.getUTCFullYear() - 1;
    year ||= titleYear;
    return year ? `${year}-${pad(month)}-01` : null;
  }
  if (upd) {
    const d = new Date(Date.UTC(upd.getUTCFullYear(), upd.getUTCMonth() - (upd.getUTCDate() <= 20 ? 1 : 0), 1));
    return d.toISOString().slice(0, 10);
  }
  return null;
}

// "Running hours since <service>" is sometimes filled with the total hours
// AT the service. If the figure is more than the engine could have run since
// that date (24 h a day), read it that way and work out the real figure.
export function fixSinceHours(g, dateKey, sinceKey, atKey, asOf) {
  const since = g[sinceKey];
  if (since == null || !g[dateKey]) return;
  const end = asOf ? Date.parse(`${asOf}T00:00:00Z`) : Date.now();
  const possible = Math.max(0, (end - Date.parse(`${g[dateKey]}T00:00:00Z`)) / 3600000) + 48;
  if (since <= possible) return;
  if (g.total_hours != null && since <= g.total_hours) {
    g[atKey] = since;
    g[sinceKey] = Math.round((g.total_hours - since) * 10) / 10;
  } else {
    delete g[sinceKey]; // impossible either way
  }
}

function parseSheet(sheet, fileYear) {
  const fieldRows = {};
  const island = {};
  let powerhouse = null;
  let year = null;
  sheet.rows.forEach((row, r) => {
    if (!row) return;
    const lab = label(row[0]);
    if (!lab) return;
    if (lab.startsWith('POWERHOUSE NAME')) {
      powerhouse = (lab.split(':')[1] || toText(row[1]) || '').replace(/POWER\s*HOUSE/, '').trim() || null;
      return;
    }
    const y = lab.match(/ENGINE CONDITION REPORT.*\b(20\d{2})\b/);
    if (y) year = +y[1];
    const field = FIELDS.find(([prefix]) => lab.startsWith(prefix));
    if (field && !(field[1] in fieldRows)) { fieldRows[field[1]] = { r, type: field[2] }; return; }
    const isl = ISLAND_FIELDS.find(([prefix]) => lab.startsWith(prefix));
    if (isl) {
      const cell = row.slice(1).find(Boolean);
      island[isl[1]] = isl[1] === 'updated_on' ? toDate(cell) : toText(cell);
    }
  });
  // The "GENSET NO." label is sometimes typed over (Thulusdhoo, Apr–Aug 2026:
  // "pr"). Without it, take the row of genset numbers just above the first
  // engine field instead of silently skipping the month.
  let numberLabelMissing = false;
  if (!fieldRows.number) {
    const first = Math.min(...Object.values(fieldRows).map((f) => f.r));
    if (Number.isFinite(first) && Object.keys(fieldRows).length >= 5) {
      for (let r = first - 1; r >= Math.max(0, first - 3); r--) {
        const cells = (sheet.rows[r] || []).slice(1).filter((c) => c && String(c.v).trim() !== '');
        if (cells.length && cells.every((c) => /^\s*\d{1,2}\s*$/.test(String(c.v)))) {
          fieldRows.number = { r, type: 'tag' };
          numberLabelMissing = true;
          break;
        }
      }
    }
  }
  if (!fieldRows.number) return null;

  const numberRow = sheet.rows[fieldRows.number.r];
  const gensets = [];
  for (let c = 1; c < numberRow.length; c++) {
    const tag = toTag(numberRow[c]);
    if (!tag) continue;
    const g = { number: tag };
    let filled = 0;
    for (const [key, { r, type }] of Object.entries(fieldRows)) {
      if (key === 'number') continue;
      const value = PARSE[type](sheet.rows[r]?.[c]);
      if (value !== null && value !== undefined) { g[key] = value; filled++; }
    }
    if (filled < 2) continue; // a numbered but empty column
    g.condition = classifyCondition(g.status_text, g.fault);
    fixSinceHours(g, 'overhaul_on', 'hours_since_overhaul', 'overhaul_hours', island.updated_on);
    fixSinceHours(g, 'valve_on', 'hours_since_valve', 'valve_hours', island.updated_on);
    gensets.push(g);
  }
  if (!gensets.length) return null;
  return {
    sheet: sheet.name,
    powerhouse,
    month: reportMonth(sheet.name, island.updated_on, fileYear, year),
    updated_on: island.updated_on || null,
    peak_load_record: island.peak_load_record || null,
    peak_load_month: island.peak_load_month || null,
    number_label_missing: numberLabelMissing,
    gensets,
  };
}

// A sheet that looks like a condition report (has engine field labels), used
// to tell the uploader about months that could not be read.
function looksLikeReport(sheet) {
  return sheet.rows.some((row) => row && FIELDS.slice(1).some(([prefix]) => label(row[0])?.startsWith(prefix)));
}

/**
 * parseConditionReport(bytes, fileName) ->
 *   { powerhouse, reports: [...one per month, oldest first], latest }
 */
// Year written in a sheet name: 'AUGUST 2026' or 'Aug 26'.
function sheetYear(name) {
  const m = String(name).match(/\b(20\d{2})\b/) || String(name).match(/[A-Za-z]{3,}[\s.\-,]+(2\d)\b/);
  return m ? (m[1].length === 2 ? 2000 + +m[1] : +m[1]) : null;
}

export function parseConditionReport(bytes, fileName = '') {
  const sheets = readWorkbook(bytes);
  const fileYear = String(fileName).match(/\b(20\d{2})\b/)?.[1];
  // A workbook covers one year: a sheet without a year ('5.May') takes it
  // from the sheets before it ('1. JANUARY 2026'). File names are often a
  // year out of date, so they only count when no sheet names a year.
  const explicit = sheets.map((s) => sheetYear(s.name));
  const workbookYear = Math.max(0, ...explicit.filter(Boolean)) || (fileYear ? +fileYear : null);
  let carried = null;
  const skipped = [];
  const reports = sheets
    .map((s, i) => {
      carried = explicit[i] || carried;
      const r = parseSheet(s, carried || workbookYear);
      if (!r && looksLikeReport(s)) skipped.push(s.name);
      return { ...r, index: i };
    })
    .filter((r) => r.gensets);
  if (!reports.length) throw new Error('No engine condition report found in this file (expected the standard template with a "GENSET NO." row)');
  // Oldest first; sheets without a month keep workbook order.
  reports.sort((a, b) => (a.month || '').localeCompare(b.month || '') || a.index - b.index);
  const latest = reports.at(-1);
  return {
    powerhouse: latest.powerhouse || reports.find((r) => r.powerhouse)?.powerhouse || null,
    reports: reports.map(({ index, ...r }) => r),
    latest: (({ index, ...r }) => r)(latest),
    // Sheets that look like reports but could not be read.
    skipped,
  };
}

// Builds small .xlsx files in the ENGINE CONDITION REPORT template for tests.
// Cell values: string -> text, number -> number, { date: 'YYYY-MM-DD' } ->
// date cell, { hours: 1234.5 } -> [h]:mm duration cell.
import { strToU8, zipSync } from 'fflate';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const col = (i) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
const serial = (iso) => (Date.parse(`${iso}T00:00:00Z`) / 86400000) + 25569;

function cellXml(ref, v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
  if (v.date) return `<c r="${ref}" s="1"><v>${serial(v.date)}</v></c>`;
  if (v.hours !== undefined) return `<c r="${ref}" s="2"><v>${v.hours / 24}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
}

export function makeXlsx(sheets) {
  const files = {
    'xl/workbook.xml': strToU8(`<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${
      sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0"?><Relationships>${
      sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`),
    'xl/styles.xml': strToU8(`<?xml version="1.0"?><styleSheet><numFmts count="2"><numFmt numFmtId="164" formatCode="dd\\ mmmm\\ yyyy"/><numFmt numFmtId="165" formatCode="[h]:mm"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="165"/></cellXfs></styleSheet>`),
  };
  sheets.forEach((s, i) => {
    const rows = s.rows.map((row, r) => `<row r="${r + 1}">${row.map((v, c) => cellXml(`${col(c)}${r + 1}`, v)).join('')}</row>`).join('');
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(`<?xml version="1.0"?><worksheet><sheetData>${rows}</sheetData></worksheet>`);
  });
  return zipSync(files);
}

// One month of the standard template. gensets: array of objects keyed by
// the template's row labels (see LABELS below).
const LABELS = [
  ['GENSET NO.', 'number'], ['FIXED ASSET CODE', 'asset'], ['ENGINE MAKE', 'make'], ['ENGINE MODEL', 'model'],
  ['ENGINE CAPACITY (kW)', 'kw'], ['ENGINE SERIAL NO.', 'serial'], ['CPL/SPEC No.', 'cpl'], ['DYNAMO MAKE', 'altMake'],
  ['DYNAMO FRAME NO:', 'altFrame'], ['DYNAMO SERIAL NO.', 'altSerial'], ['DYNAMO CAPACITY (kW)', 'altKw'], null,
  ['LAST BATTERY CHANGE DATE', 'battery'], ['LAST DYNAMO SERVICE DATE', 'altService'],
  ['ORIGINAL COMMISSIONING DATE AT FIRST POWER PLANT', 'commissioned'], ['ENGINE INSTALLED DATE AT THIS POWER PLANT', 'installed'],
  ['IS THE ENGINE CONNECTED TO PANEL? (YES/NO)', 'connected'], ['STATUS OF ENGINE', 'status'],
  ['DETAILS OF ANY ENGINE FAULT', 'fault'], null, ['LAST VALVE CLEARANCE DATE', 'valve'],
  ['RUNNING HOURS SINCE LAST VALVE CLEARANCE', 'sinceValve'], null, ['LAST OVERHAUL DATE', 'overhaul'],
  ['RUNNING HOURS SINCE LAST OVERHAUL', 'sinceOverhaul'], ['TOTAL RUNNING HOURS (HHHHH)', 'total'], null,
  ['MAXIMUM LOAD TAKEN BY THE ENGINE THIS MONTH (kW)', 'maxLoad'], ['MAXIMUM LOAD ENGINE CAN TAKE (kW)', 'capable'], null,
  ['ENGINE NEEDS OVERHAULING (YES/NO)', 'needsOverhaul'], ['DYNAMO NEEDS SERVICE (YES/NO)', 'altNeedsService'],
];

export function reportSheet({ name, powerhouse, updated, peak, gensets }) {
  const rows = [[`POWERHOUSE NAME : ${powerhouse}`], ['ENGINE CONDITION REPORT 2026'], []];
  for (const entry of LABELS) {
    if (!entry) { rows.push([]); continue; }
    const [lab, key] = entry;
    rows.push([lab, ...gensets.map((g) => g[key] ?? null)]);
  }
  rows.push([], ['MAXIMUM PEAK LOAD OF ISLAND (# kW, DATE, TIME)', peak || null],
    ['PEAK LOAD OF ISLAND THIS MONTH (# kW, DATE, TIME)', peak || null], [], ['THIS RECORD UPDATED DATE', updated ? { date: updated } : null]);
  return { name, rows };
}

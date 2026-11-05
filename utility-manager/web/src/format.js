export const TZ = 'Indian/Maldives';

export const SERVICES = {
  electricity: { label: 'Electricity', icon: '⚡', path: '/electricity' },
  water: { label: 'Water', icon: '💧', path: '/water' },
  sewerage: { label: 'Sewerage', icon: '♻', path: '/sewerage' },
};

export const ASSET_STATUS = {
  running: { label: 'Running', icon: '●', tone: 'ok' },
  standby: { label: 'Standby', icon: '○', tone: 'info' },
  down: { label: 'Down', icon: '✕', tone: 'bad' },
  maintenance: { label: 'Maintenance', icon: '⚙', tone: 'warn' },
  disconnected: { label: 'Disconnected', icon: '⊘', tone: 'none' },
  decommissioned: { label: 'Decommissioned', icon: '–', tone: 'none' },
  unknown: { label: 'No status', icon: '?', tone: 'none' },
};

export const FACILITY_KINDS = {
  powerhouse: 'Powerhouse', solar_plant: 'Solar plant', water_plant: 'Water plant (RO)', water_storage: 'Water storage',
  sewerage_plant: 'Sewage treatment plant', sewerage_system: 'Sewerage system', pump_station: 'Pump station', other: 'Other',
};
// Operating licences of water and sewerage systems.
export const LICENCE_TYPES = { P: 'Permanent', T: 'Temporary', TP: 'Temporary (TP)' };

// A plant's operating licence at a glance: expired (by the department's
// status or the date), expiring within 90 days, not held, or valid.
export function licenceState(f) {
  if (!f.licence_type && !f.licence_status && !f.licence_expires_on) return null;
  const expires = f.licence_expires_on ? String(f.licence_expires_on).slice(0, 10) : null;
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
  if (/expired/i.test(f.licence_status || '') || (expires && expires < today)) return { tone: 'bad', text: `Licence expired${expires && expires < today ? ` ${date(expires)}` : ''}` };
  if (!f.licence_type) return { tone: 'warn', text: `No licence${f.licence_status ? `: ${f.licence_status}` : ''}` };
  if (expires && expires < soon) return { tone: 'warn', text: `Licence expires ${date(expires)}` };
  return { tone: '', text: `Licence ${LICENCE_TYPES[f.licence_type] || f.licence_type}${expires ? ` to ${date(expires)}` : ''}` };
}

// "Genset 3", "RO unit RO-01"; assets of kind 'other' go by what they are
// (Rainwater plant RW-01, Vacuum station VS-01, Sewage treatment plant STP-01).
export function assetLabel(a) {
  if (a.kind === 'other') return a.make_model ? `${a.make_model.replace(/\s*\(.*\)\s*$/, '')} ${a.tag}` : a.tag;
  return `${ASSET_KINDS[a.kind] || ''} ${a.tag}`.trim();
}

// Licences over a list of plants: counts, and those needing action (expired
// first, then expiring, then not held).
export function licenceSummary(facilities) {
  const rows = facilities.map((f) => ({ f, st: licenceState(f) })).filter((x) => x.st);
  const by = (tone, pred = () => true) => rows.filter((x) => x.st.tone === tone && pred(x));
  const expired = by('bad');
  const expiring = by('warn', (x) => x.st.text.startsWith('Licence expires'));
  const missing = by('warn', (x) => !x.st.text.startsWith('Licence expires'));
  return { expired: expired.length, expiring: expiring.length, missing: missing.length, valid: by('').length, list: [...expired, ...expiring, ...missing] };
}

export const ASSET_KINDS = {
  genset: 'Genset', solar_inverter: 'Solar inverter', battery: 'Battery', transformer: 'Transformer',
  ro_unit: 'RO unit', pump: 'Pump', blower: 'Blower', tank: 'Tank', other: 'Other',
};
export const INCIDENT_CATEGORIES = {
  outage: 'Supply outage', breakdown: 'Breakdown', maintenance: 'Maintenance', quality: 'Quality issue', safety: 'Safety', other: 'Other',
};
export const SEVERITIES = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
// Project task tracker (Powerhouse Takeover): the workbook's lists.
export const TASK_STATUSES = {
  'Not Started': { key: 'not-started' }, 'In Progress': { key: 'in-progress' }, 'On Hold': { key: 'on-hold' },
  Completed: { key: 'completed' }, Cancelled: { key: 'cancelled' },
};
export const PRIORITIES = {
  1: 'Critical Reliability & Safety', 2: 'Operational Reliability', 3: 'System Improvement & Infrastructure',
  4: 'Efficiency, Monitoring, Training & Staff Capacity Building',
};
export const DEPARTMENTS = ['HR', 'IT', 'Finance', 'Corporate', 'Corporate (Safety Unit)', 'CS Billing', 'Store', 'Department', 'Powerhouse', 'T&D', 'Water'];
export const ACCESS_STATUSES = ['Not Requested', 'Requested', 'Granted', 'Rejected'];
export const AVAILABILITY = ['Available', 'Not Available', 'Partial', 'Requested'];
export const CHECKLISTS = { diesel: 'Diesel checklist', safety_ppe: 'Safety PPE', stationery: 'Stationery' };
export const PROJECT_STATES = { planned: 'Planned', ongoing: 'Ongoing', on_hold: 'On hold', completed: 'Completed', cancelled: 'Cancelled' };
// A genset's faults (with its status, its current state).
export const FAULTS = {
  none: { label: 'No faults', icon: '✓', tone: 'ok' },
  minor: { label: 'Minor fault', icon: '▲', tone: 'warn' },
  major: { label: 'Major fault', icon: '■', tone: 'serious' },
};

export const CONDITIONS = {
  ok: { label: 'OK', icon: '●', tone: 'ok' },
  minor_fault: { label: 'Minor fault', icon: '▲', tone: 'warn' },
  major_fault: { label: 'Major fault', icon: '■', tone: 'serious' },
  not_running: { label: 'Not running', icon: '✕', tone: 'bad' },
};
export const WORK_KINDS = {
  overhaul: 'Overhaul', top_overhaul: 'Top overhaul', alternator_service: 'Alternator service', repair: 'Repair',
  service: 'Service', inspection: 'Inspection', installation: 'Installation', relocation: 'Genset move', other: 'Other',
};
export const WORK_STATES = {
  planned: 'Planned', in_progress: 'In progress', awaiting_parts: 'Awaiting parts', on_hold: 'On hold',
  dismantling: 'Dismantling', in_transit: 'In transit', installing: 'Installing',
  completed: 'Completed', cancelled: 'Cancelled',
};
// A genset move has its own stages; other work doesn't use them.
export const MOVE_STAGES = ['planned', 'dismantling', 'in_transit', 'installing', 'completed'];
const MOVE_ONLY = ['dismantling', 'in_transit', 'installing'];
export const statesFor = (kind) => Object.fromEntries(Object.entries(WORK_STATES).filter(([k]) =>
  (kind === 'relocation' ? !['in_progress', 'awaiting_parts'].includes(k) : !MOVE_ONLY.includes(k))));
export const EVENT_KINDS = {
  overhaul: 'Overhaul', top_overhaul: 'Top overhaul', alternator_service: 'Alternator service',
  valve_clearance: 'Valve clearance', battery_change: 'Battery change', repair: 'Repair', service: 'Service',
  inspection: 'Inspection', other: 'Other',
};
// 'YYYY-MM-01' -> 'Aug 2026'
export const month = (value) => (value ? new Date(`${value.slice(0, 7)}-15T00:00:00Z`)
  .toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');

export const ROLES = {
  admin: 'Administrator', manager: 'Manager', staff: 'Staff', viewer: 'Viewer (read-only)',
};
// Project types (the department's list).
export const PROJECT_TYPES = {
  mechanical: 'Mechanical', electrical: 'Electrical', infrastructure: 'Infrastructure', office_cs: 'Office/CS',
  maintenance: 'Maintenance', store: 'Store', workshop: 'Workshop', staff_area: 'Staff area',
};
// One decimal, like the department's form ("8.6%").
export const pct = (v) => `${Math.round(Number(v || 0) * 10) / 10}%`;

// What a Staff user may do, ticked per person.
export const PERMISSIONS = {
  documents: ['Send documents', 'Create documents for signature and manage the ones they sent'],
  incidents: ['Report interruptions', 'Report interruptions and edit the ones they reported'],
  work: ['Update work', 'Post updates and move work along (not create, complete or cancel it)'],
  projects: ['Create projects', 'Start projects and share them with chosen people'],
  surveys: ['Carry out surveys', 'Start and fill in surveys (technical surveys need technical staff type)'],
};

export function num(value, digits = 0) {
  if (value === null || value === undefined || value === '') return '—';
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}
// 66472 kW -> '66.5 MW'; smaller figures stay in kW.
export const power = (kw) => (kw == null ? '—' : kw >= 10000 ? `${num(kw / 1000, 1)} MW` : `${num(kw)} kW`);
export const unitLabel = (unit) => String(unit || '').replace(/m3/g, 'm³');
export const withUnit = (value, unit, digits) => (value == null ? '—' : `${num(value, digits)} ${unitLabel(unit)}`);

const dateFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function date(value) {
  if (!value) return '—';
  // Plain 'YYYY-MM-DD' dates are calendar days, not instants.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return dateFmt.format(new Date(`${value}T12:00:00Z`));
  return dateFmt.format(new Date(value));
}
export const dateTime = (value) => (value ? dateTimeFmt.format(new Date(value)) : '—');

// Today / yesterday as YYYY-MM-DD in Maldives time.
export const localDate = (offsetDays = 0) =>
  new Date(Date.now() + offsetDays * 86400_000).toLocaleDateString('en-CA', { timeZone: TZ });

// <input type="datetime-local"> works in the browser's zone; the department
// works in Maldives time (UTC+5, no DST), so convert explicitly.
export const toLocalInput = (iso) =>
  iso ? new Date(new Date(iso).getTime() + 5 * 3600_000).toISOString().slice(0, 16) : '';
export const fromLocalInput = (value) => (value ? `${value}:00+05:00` : null);

export function duration(minutes) {
  if (minutes == null) return '—';
  const d = Math.floor(minutes / 1440), h = Math.floor((minutes % 1440) / 60), m = minutes % 60;
  return [d && `${d}d`, h && `${h}h`, (!d && m) || (!d && !h) ? `${m}m` : null].filter(Boolean).join(' ');
}

export function since(value) {
  if (!value) return '';
  const mins = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  const days = Math.round(mins / 1440);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

// A powerhouse's peak load: "1,258 kW on 12 Jul 2026 18:00". From the checked
// figures Fleet Manager sends, else read from the sheet's text, which runs
// the parts together ("1258/12/07/202618:00:00"); shown as written if that fails.
export function peakLoad(r) {
  if (!r) return null;
  if (r.peak_load_kw != null) return `${num(r.peak_load_kw)} kW${r.peak_load_at ? ` on ${dateTime(r.peak_load_at)}` : ''}`;
  const raw = r.peak_load_month || r.peak_load_record;
  if (!raw) return null;
  const m = String(raw).match(/^\s*([\d.,]+)\s*(?:kw)?\s*[/\s-]+(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s*(\d{1,2}:\d{2})?/i);
  if (!m) return raw;
  const [, kw, d, mo, y, time] = m;
  const day = new Date(Date.UTC(+y, +mo - 1, +d));
  if (Number.isNaN(day.getTime()) || +mo > 12) return raw;
  const when = day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return `${num(Number(kw.replace(/,/g, '')))} kW on ${when}${time ? ` ${time}` : ''}`;
}

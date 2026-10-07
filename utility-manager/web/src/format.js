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
  decommissioned: { label: 'Decommissioned', icon: '–', tone: 'none' },
  unknown: { label: 'No status', icon: '?', tone: 'none' },
};

export const FACILITY_KINDS = {
  powerhouse: 'Powerhouse', solar_plant: 'Solar plant', water_plant: 'Water plant (RO)', water_storage: 'Water storage',
  sewerage_plant: 'Sewage treatment plant', pump_station: 'Pump station', other: 'Other',
};
export const ASSET_KINDS = {
  genset: 'Genset', solar_inverter: 'Solar inverter', battery: 'Battery', transformer: 'Transformer',
  ro_unit: 'RO unit', pump: 'Pump', blower: 'Blower', tank: 'Tank', other: 'Other',
};
export const INCIDENT_CATEGORIES = {
  outage: 'Supply outage', breakdown: 'Breakdown', maintenance: 'Maintenance', quality: 'Quality issue', safety: 'Safety', other: 'Other',
};
export const SEVERITIES = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
export const PROJECT_STATES = { planned: 'Planned', ongoing: 'Ongoing', on_hold: 'On hold', completed: 'Completed', cancelled: 'Cancelled' };
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
  admin: 'Administrator', manager: 'Manager', viewer: 'Viewer (read-only)',
};

export function num(value, digits = 0) {
  if (value === null || value === undefined || value === '') return '—';
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}
// 66472 kW -> '66.5 MW'; smaller figures stay in kW.
export const power = (kw) => (kw == null ? '—' : kw >= 10000 ? `${num(kw / 1000, 1)} MW` : `${num(kw)} kW`);
export const withUnit = (value, unit, digits) => (value == null ? '—' : `${num(value, digits)} ${unit}`);

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

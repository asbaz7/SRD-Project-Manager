export const TZ = 'Indian/Maldives';

export const SERVICES = {
  electricity: { label: 'Electricity', icon: '⚡' },
  water: { label: 'Water', icon: '💧' },
  sewerage: { label: 'Sewerage', icon: '♻' },
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
export const ROLES = {
  admin: 'Administrator', manager: 'Manager', operator: 'Operator', viewer: 'Viewer',
};

export function num(value, digits = 0) {
  if (value === null || value === undefined || value === '') return '—';
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}
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

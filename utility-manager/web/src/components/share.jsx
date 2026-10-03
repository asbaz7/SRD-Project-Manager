// "Share to WhatsApp": opens WhatsApp (app or web) with a ready-written
// message and a link back to the page; the person picks the group or chat.
// No WhatsApp account is connected to the system for this.
import { ASSET_KINDS, CONDITIONS, INCIDENT_CATEGORIES, SERVICES, SEVERITIES, WORK_KINDS, WORK_STATES, date, dateTime, num, power } from '../format.js';
import { Icon } from './icons.jsx';

const SERVICE_EMOJI = { electricity: '⚡', water: '💧', sewerage: '♻️' };
const clip = (s, n = 220) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s);
const lines = (...xs) => xs.filter(Boolean).join('\n');

export function whatsappUrl(text, path) {
  const link = path ? `\n${window.location.origin}${path}` : '';
  return `https://wa.me/?text=${encodeURIComponent(text + link)}`;
}

export function ShareWhatsApp({ text, path, label = 'Share', className = 'btn' }) {
  return (
    <a className={`${className} share-wa`} href={whatsappUrl(text, path)} target="_blank" rel="noopener noreferrer"
      title="Share on WhatsApp — choose the group or chat in WhatsApp">
      <Icon name="whatsapp" /> {label}
    </a>
  );
}

export const incidentMessage = (x) => lines(
  `🚨 *${x.ref}* — ${SEVERITIES[x.severity] || x.severity}${x.status !== 'open' ? ` · ${x.status}` : ''}`,
  `*${x.title}*`,
  `${x.atoll_code}. ${x.island_name} · ${SERVICES[x.service]?.label} · ${INCIDENT_CATEGORIES[x.category]}${x.asset_tag ? ` · ${ASSET_KINDS[x.asset_kind]} ${x.asset_tag}` : ''}`,
  `Started ${dateTime(x.started_at)}${x.resolved_at ? ` · resolved ${dateTime(x.resolved_at)}` : ''}${x.customers_affected ? ` · ${num(x.customers_affected)} customers affected` : ''}`,
  clip(x.description),
  x.resolution && `Resolution: ${clip(x.resolution)}`,
);

export const workMessage = (w) => lines(
  `🔧 *${w.ref}* — ${WORK_STATES[w.status]}`,
  `*${w.title}*`,
  `${w.atoll_code}. ${w.island_name} · ${SERVICES[w.service]?.label} · ${WORK_KINDS[w.kind]}${w.asset_tag ? ` · ${ASSET_KINDS[w.asset_kind]} ${w.asset_tag}` : ''}`,
  w.assigned_to && `Assigned to: ${w.assigned_to}`,
  (w.updates?.[0]?.body || w.last_update) && `Latest: ${clip(w.updates?.[0]?.body || w.last_update)}`,
  w.target_on && `Target: ${date(w.target_on)}${w.overdue ? ' (overdue)' : ''}`,
);

export const assetMessage = (a) => {
  const c = a.condition;
  const e = a.engine || {};
  const open = (a.work || []).filter((w) => !['completed', 'cancelled'].includes(w.status));
  return lines(
    `${SERVICE_EMOJI[a.service] || ''} *${a.atoll_code}. ${a.island_name} · ${ASSET_KINDS[a.kind]} ${a.tag}*${a.make_model ? ` (${a.make_model}${a.rated_capacity ? `, ${num(a.rated_capacity)} ${a.capacity_unit || ''}` : ''})` : ''}`,
    c ? `Condition: ${CONDITIONS[c.condition]?.label || '—'}${c.status_text ? ` — ${c.status_text}` : ''}` : `Status: ${a.status}`,
    c?.fault && `Fault: ${clip(c.fault)}`,
    a.status_note && !c?.fault && !a.status_note.startsWith('Condition report') && `Note: ${clip(a.status_note)}`,
    e.hours_since_overhaul != null && `Since overhaul: ${num(e.hours_since_overhaul)} h${e.last_overhaul_on ? ` (last ${date(e.last_overhaul_on)})` : ''}`,
    (e.overhaul_due || e.alt_service_due) && `Due: ${[e.overhaul_due && 'overhaul', e.alt_service_due && 'alternator service'].filter(Boolean).join(', ')}`,
    ...open.map((w) => `Work: ${w.title} (${WORK_STATES[w.status]})`),
  );
};

export const projectMessage = (p) => lines(
  `📁 *${p.ref}* — ${p.status.replace('_', ' ')} · ${p.progress_pct}%`,
  `*${p.title}*`,
  `${p.island_name ? `${p.atoll_code}. ${p.island_name}` : 'Regional'} · ${SERVICES[p.service]?.label}${p.contractor ? ` · ${p.contractor}` : ''}`,
  p.target_date && `Target: ${date(p.target_date)}${p.overdue ? ' (overdue)' : ''}`,
  p.updates?.[0] && `Latest: ${clip(p.updates[0].body)}`,
);

const today = () => new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Indian/Maldives' });

// The overview as a short daily summary for a group chat.
export const overviewMessage = (d, items) => {
  const el = d.services.electricity;
  return lines(
    `📋 *SRD summary — ${today()}*`,
    `⚡ Electricity: ${el.running}/${el.assets} gensets running · ${power(el.available_kw)} available · ${d.engines.major_fault + d.engines.not_running} serious faults`,
    ...['water', 'sewerage'].filter((s) => d.services[s].assets).map((s) =>
      `${SERVICE_EMOJI[s]} ${SERVICES[s].label}: ${d.services[s].running}/${d.services[s].assets} running${d.services[s].down ? ` · ${d.services[s].down} out of service` : ''}`),
    `🔧 Work in progress: ${d.work.length} · 🚨 Open incidents: ${d.incidents.open}`,
    items.length ? `\n*Needs attention*\n${items.slice(0, 10).map((it) => `• ${it.text}${it.sub ? ` — ${it.sub}` : ''}`).join('\n')}` : '\n✅ Nothing needs attention.',
  );
};

export const serviceMessage = (svc, d) => lines(
  `${SERVICE_EMOJI[svc]} *${SERVICES[svc].label} — ${today()}*`,
  `${d.summary.running}/${d.summary.assets} ${svc === 'electricity' ? 'gensets' : 'assets'} running${d.summary.down ? ` · ${d.summary.down} out of service` : ''}`,
  d.engines && `Faults: ${d.engines.not_running} not running · ${d.engines.major_fault} major · ${d.engines.minor_fault} minor · ${d.engines.overhaul_due} overhaul due`,
  d.reports?.missing.length && `Reports missing: ${d.reports.missing.map((r) => `${r.atoll_code}. ${r.island_name}`).join(', ')}`,
  d.attention.length ? `\n*Needs attention*\n${d.attention.slice(0, 12).map((a) => `• ${a.atoll_code}. ${a.island_name} ${ASSET_KINDS[a.kind]} ${a.tag}: ${a.condition ? CONDITIONS[a.condition]?.label : a.status}${a.fault || a.status_note ? ` — ${clip(a.fault || a.status_note, 80)}` : ''}${a.work_title ? ` (🔧 ${a.work_title})` : ''}`).join('\n')}${d.attention.length > 12 ? `\n…and ${d.attention.length - 12} more` : ''}` : '',
  d.work.length ? `\n🔧 Work: ${d.work.length} in progress` : '',
);

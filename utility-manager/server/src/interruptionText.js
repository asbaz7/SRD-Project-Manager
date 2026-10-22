// What /interruption understands from free text ("/interruption Maafushi G3
// tripped since 14:20, whole island off, 300 customers"): the service, kind,
// severity, the genset or plant, when it started (and ended), and how many
// customers. Words the person puts first ("high", "water") always win over
// what is read from the rest.

const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const SERVICE_WORDS = {
  electricity: 'electricity', power: 'electricity', electric: 'electricity',
  water: 'water', sewerage: 'sewerage', sewer: 'sewerage', sewage: 'sewerage',
};

const has = (re, s) => re.test(s);
// "low voltage", "high TDS": a reading, not the severity.
const MEASURES = /^(voltage|pressure|tds|frequency|level|load|temp|temperature|current|ph|chlorine|turbidity)\b/i;

function readService(lower) {
  if (has(/\b(sewer|sewage|sewerage|stp|manhole|pump ?station|lift station|overflow)/, lower)) return 'sewerage';
  if (has(/\b(power|electric|genset|engine|generator|blackout|voltage|feeder|breaker|trip|tripped|\bg\d)/, lower)) return 'electricity';
  if (has(/\b(water|ro\b|ro-?\d|desal|membrane|tds|pressure|tank|tap|salty)/, lower)) return 'water';
  return null;
}

function readCategory(lower) {
  if (has(/\b(fire|smoke|injur|electrocut|shock|explo|accident|spill|burn)/, lower)) return 'safety';
  if (has(/\b(planned|scheduled|shutdown for|maintenance)/, lower)) return 'maintenance';
  if (has(/\b(outage|cut|blackout|no (power|water|supply)|off\b|trip|tripped|interrupt|supply|black ?out|went out)/, lower)) return 'outage';
  if (has(/\b(voltage|flicker|frequency|low pressure|pressure|dirty|colou?r|smell|taste|salty|tds|quality|brown)/, lower)) return 'quality';
  return 'breakdown';
}

function readSeverity(lower, category) {
  if (has(/\b(fire|explo|injur|electrocut)/, lower)) return 'critical';
  if (has(/\b(whole|entire|all of the|island[- ]wide|total|complete|full) ?(island|blackout|outage|supply)?/, lower)
    && has(/\b(island|blackout|outage|supply|off|cut|no power|no water)/, lower)) return 'critical';
  if (category === 'safety') return 'high';
  if (has(/\b(blackout|no power|no water|black ?out)/, lower)) return 'high';
  if (category === 'outage' && !has(/\b(area|ward|road|street|feeder|house|houses|block|zone|part|harbou?r|school|mosque)/, lower)) return 'high';
  if (category === 'maintenance') return 'low';
  return 'medium';
}

// "14:20", "2:20pm", "2pm", "1420" → minutes after midnight.
function clock(text) {
  const m = /^(\d{1,2})(?::|\.)?(\d{2})?\s*(am|pm)?$/i.exec(text.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (!m[2] && !m[3]) return null; // a bare number is not a time
  if (m[3]) { if (h === 12) h = 0; if (m[3].toLowerCase() === 'pm') h += 12; }
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

const TIME = String.raw`(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?)`;

function readTimes(lower) {
  let start = null;
  let end = null;
  let m = new RegExp(String.raw`\b(?:from\s+)?${TIME}\s*(?:-|–|to|till|until)\s*${TIME}`).exec(lower);
  if (m && clock(m[1]) != null && clock(m[2]) != null) return { start: clock(m[1]), end: clock(m[2]) };
  m = new RegExp(String.raw`\b(?:since|from|started|starting|at|@)\s+${TIME}`).exec(lower);
  if (m) start = clock(m[1]);
  m = new RegExp(String.raw`\b(?:restored|back|resolved|fixed|normal(?:ised|ized)?|on again|up again)\s+(?:at\s+|by\s+)?${TIME}`).exec(lower);
  if (m) end = clock(m[1]);
  return { start, end };
}

// Minutes after local midnight → an instant, today (or yesterday when that
// would be in the future). offsetMin: the zone's offset from UTC.
function at(minutes, now, offsetMin) {
  const local = new Date(now.getTime() + offsetMin * 60000);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offsetMin * 60000;
  let t = midnight + minutes * 60000;
  if (t > now.getTime() + 5 * 60000) t -= 86400000;
  return new Date(t);
}

/** The zone's offset from UTC now, in minutes (e.g. 300 for the Maldives). */
export function zoneOffset(tz, now = new Date()) {
  const part = (zone) => new Date(now.toLocaleString('en-US', { timeZone: zone })).getTime();
  return Math.round((part(tz) - part('UTC')) / 60000);
}

const ASSET_RE = /\b(?:(g|gen|genset|engine|eng|dg|unit)\s*-?\s*(\d{1,2})|(ro)\s*-?\s*(\d{1,2}))\b/i;
const tagKey = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^(genset|gen|engine|eng|dg|g|unit|no)(?=\d)/, '');

/**
 * words: the text after the island. assets: the island's assets ({ id, kind,
 * tag, service, facility_id }). Returns what to report, and what was read.
 */
export function readInterruption(words, { assets = [], now = new Date(), offsetMin = 300 } = {}) {
  let rest = [...words];
  let service = null;
  let severity = null;
  // Flags first, in any order: a severity word is taken out of the text; a
  // service word sets the service but stays ("water supply cut ...").
  for (let i = 0; i < 3 && i < rest.length; i++) {
    const w = rest[i].toLowerCase();
    if (SERVICE_WORDS[w] && !service) service = SERVICE_WORDS[w];
    else if (SEVERITIES.includes(w) && !severity && !MEASURES.test(rest[i + 1] ?? '')) { severity = w; rest.splice(i--, 1); }
    else if (['urgent', 'serious'].includes(w) && !severity) { severity = 'high'; rest.splice(i--, 1); }
    else break;
  }
  const title = rest.join(' ').trim();
  const lower = title.toLowerCase();

  // A genset or plant named anywhere: "G3", "genset 3", "RO 1".
  let asset = null;
  const am = ASSET_RE.exec(title);
  if (am) {
    const isRo = !!am[3];
    const key = tagKey(isRo ? `ro${am[4]}` : am[2]);
    const hits = assets.filter((a) => (isRo ? a.service === 'water' : a.kind === 'genset')
      && (tagKey(a.tag) === key || tagKey(`${a.kind}${a.tag}`) === key || (isRo && tagKey(a.tag) === am[4])));
    if (hits.length === 1) asset = hits[0];
  }

  service ??= asset?.service || readService(lower) || 'electricity';
  const category = readCategory(lower);
  severity ??= readSeverity(lower, category);
  const times = readTimes(lower);
  const restored = times.end == null && has(/\b(restored|back on|back up|resolved|normal again|now normal)\b/, lower);
  const started = times.start != null ? at(times.start, now, offsetMin) : now;
  let resolved = times.end != null ? at(times.end, now, offsetMin) : restored ? now : null;
  // "23:40-00:20": it started the day before.
  if (resolved && resolved < started) started.setTime(started.getTime() - 86400000);
  if (resolved && resolved < started) resolved = null;
  const cm = /\b(\d{1,6})\s*(customers|consumers|houses|households|homes|connections|meters)\b/.exec(lower);
  return {
    title,
    service,
    category,
    severity,
    asset,
    started_at: started,
    started_given: times.start != null,
    resolved_at: resolved,
    customers_affected: cm ? Number(cm[1]) : null,
  };
}

// The open work and power state of an atoll or one island, as the TV
// board's detail view shows them: figure tiles (ongoing, on hold, overdue,
// power supply) and a card per island with its open jobs.
import { Link } from 'react-router-dom';
import { qs } from '../api.js';
import { useApi } from '../hooks.js';
import { WORK_STATES, date, num } from '../format.js';

const HELD = ['on_hold', 'awaiting_parts'];
const DAY = 86400000;
const tone = (w) => (w.overdue ? 'over' : HELD.includes(w.status) ? 'hold' : 'prog');

// Open work and open power outages for { atoll_id } or { island_id }.
export function useAreaWork(where) {
  const work = useApi(`/work${qs({ ...where, status: 'open', limit: 200 })}`);
  const power = useApi(`/incidents${qs({ ...where, status: 'open', service: 'electricity', category: 'outage', limit: 200 })}`);
  return { work: work.data?.items || null, outages: power.data ? power.data.items : power.error ? [] : null };
}

export function AreaTiles({ work, outages }) {
  const list = work || [];
  const off = outages ? new Set(outages.map((o) => o.island_id)).size : null;
  const tiles = [
    [list.filter((w) => !HELD.includes(w.status)).length, 'Ongoing', 'prog'],
    [list.filter((w) => HELD.includes(w.status)).length, 'On hold', 'hold'],
    [list.filter((w) => w.overdue).length, 'Overdue', 'over'],
  ];
  return <div className="area-tiles">
    {tiles.map(([n, label, t]) => <div key={label} className={`area-tile t-${n ? t : 'none'}`}><b>{work ? num(n) : '–'}</b><span>{label}</span></div>)}
    <div className={`area-tile t-${off ? 'over' : 'ok'}`}><b>{off == null ? '–' : off ? `${off} off` : 'OK'}</b><span>Power supply</span></div>
  </div>;
}

function due(w) {
  if (!w.target_on) return null;
  const days = Math.round((new Date(`${w.target_on}T00:00:00`) - new Date(new Date().toDateString())) / DAY);
  return `Due ${date(w.target_on)}${days > 0 ? ` · ${days} day${days === 1 ? '' : 's'} left` : days === 0 ? ' · today' : ''}`;
}

function WorkCard({ w }) {
  const late = w.overdue && w.target_on ? Math.round((new Date(new Date().toDateString()) - new Date(`${w.target_on}T00:00:00`)) / DAY) : 0;
  return <Link to={`/work/${w.id}`} className={`area-task t-${tone(w)}`}>
    <span className="st">{late > 0 ? `${late} day${late === 1 ? '' : 's'} late` : WORK_STATES[w.status] || w.status}<em>{w.ref}</em></span>
    <strong>{w.title}</strong>
    {w.unit_name && <span className="unit">{w.unit_name}</span>}
    {due(w) && <span className="due">{due(w)}</span>}
    {w.last_update && <span className="note">{w.last_update}</span>}
  </Link>;
}

// One card per island with open work; onIsland opens that island.
export function IslandWorkCards({ work, islands, onIsland }) {
  if (!work) return null;
  const by = new Map();
  for (const w of work) { if (!by.has(w.island_id)) by.set(w.island_id, []); by.get(w.island_id).push(w); }
  const cards = (islands ? islands.filter((i) => by.has(i.id)) : [...by.keys()].map((id) => ({ id, name: by.get(id)[0].island_name })));
  const quiet = (islands || []).filter((i) => !by.has(i.id));
  return <>
    {cards.length === 0 && <div className="area-card"><div className="area-card-head"><strong>{islands?.length === 1 ? islands[0].name : 'No open work'}</strong><span>0 open</span></div>
      <p className="muted small">No open work.</p></div>}
    <div className="area-cards">{cards.map((i) => <div key={i.id} className="area-card">
      <div className="area-card-head">
        {onIsland ? <button type="button" className="link" onClick={() => onIsland(i)}><strong>{i.name}</strong></button> : <strong>{i.name}</strong>}
        <span>{by.get(i.id).length} open</span>
      </div>
      {by.get(i.id).sort((a, b) => b.overdue - a.overdue).map((w) => <WorkCard key={w.id} w={w} />)}
    </div>)}</div>
    {onIsland && quiet.length > 0 && cards.length > 0 && <p className="area-quiet small">No open work on {quiet.map((i) => i.name).join(', ')}.</p>}
  </>;
}

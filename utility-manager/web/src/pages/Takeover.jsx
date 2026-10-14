// The national takeover: utility services on every inhabited island moving
// from FENAKA to STELCO, and the survey of each island before it. A map of
// the islands, coloured by the takeover or by the survey (the switch top
// left), with the figures, lists and details floating over it. Managers keep
// it up to date.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Async, Empty, ErrorBox, Field, Modal, Select } from '../components/ui.jsx';
import { date, num } from '../format.js';
import { useApi, useFilters, useSubmit } from '../hooks.js';

const SERVICES = [['electricity', 'Electricity'], ['water', 'Water'], ['sewerage', 'Sewerage']];
const STATUS = { taken_over: 'Taken over', fenaka: 'Under FENAKA', other_operator: 'Other operator', not_applicable: 'Not applicable' };
// Only a takeover has a date (when); the survey has its own.
const dated = (st) => st === 'taken_over';
const STATE = { taken_over: 'Under STELCO', pending: 'Under FENAKA', other: 'Other operator', not_set: 'Not set' };
// The survey, for islands still (partly) FENAKA's.
const SURVEY = { planned: 'Planned', ongoing: 'Ongoing', completed: 'Completed' };
const SURVEY_STATE = { not_started: 'Survey not started', planned: 'Survey planned', ongoing: 'Survey ongoing', completed: 'Survey completed' };
const surveyState = (i) => (i.state === 'pending' ? i.survey_stage || 'not_started' : null);

const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

export default function Takeover() {
  const state = useApi('/takeover');
  // The map fills the page; the figures, lists and details float over it.
  return <div className="tko-full">
    <Async state={state}>{(t) => <TakeoverView t={t} reload={state.reload} />}</Async>
  </div>;
}

const wide = () => typeof window === 'undefined' || window.innerWidth > 860;

function TakeoverView({ t, reload }) {
  const { can } = useAuth();
  const [filters, setFilter] = useFilters();
  const [editing, setEditing] = useState(null);
  const [bulk, setBulk] = useState(false);
  const [picked, setPicked] = useState(null);
  const [drawer, setDrawer] = useState(wide);
  const [summary, setSummary] = useState(wide);
  const done = t.totals.taken_over;
  const total = t.expected_islands;
  const survey = filters.view === 'survey';
  const match = survey
    ? (i) => (filters.stage ? surveyState(i) === filters.stage : true)
    : (i) => !filters.show || i.state === filters.show;
  const atoll = t.atolls.find((a) => a.code === filters.atoll);
  const list = t.islands.filter((i) => (!atoll || i.atoll_code === atoll.code) && match(i));
  const island = t.islands.find((i) => i.id === picked);
  const pickAtoll = (code) => { setPicked(null); setFilter('atoll', code); if (code && wide()) setDrawer(true); };

  return <div className={`tko-stage${drawer ? ' drawer-open' : ''}`}>
    <div className="tko-map-wrap">
      <AtollMap atolls={t.atolls} islands={t.islands} match={match} selected={filters.atoll} picked={picked} survey={survey}
        onPick={(code) => pickAtoll(filters.atoll === code ? '' : code)} onIsland={(i) => setPicked(i.id)} />
    </div>

    {/* Figures, top left; folds down to one line. */}
    <section className="glass tko-float tko-summary">
      <header>
        <h1>National takeover</h1>
        <button className="btn small ghost" onClick={() => setSummary(!summary)} aria-expanded={summary}>{summary ? 'Hide' : 'Show'}</button>
      </header>
      <div className="tko-switch" role="tablist">
        <button role="tab" aria-selected={!survey} className={!survey ? 'on' : ''} onClick={() => setFilter({ stage: '', view: '' })}>Takeover</button>
        <button role="tab" aria-selected={survey} className={survey ? 'on' : ''} onClick={() => setFilter({ show: '', view: 'survey' })}>Survey</button>
      </div>
      {!survey ? <>
        <div className="tko-headline"><strong>{pct(done, total)}%</strong><span className="small">{num(done)} of {num(total)} inhabited islands under STELCO</span></div>
        <div className="tko-bar"><span style={{ width: `${pct(done, total)}%` }} /></div>
        {summary && <>
          <p className="small muted">{num(t.totals.pending)} under FENAKA{t.totals.other ? ` · ${num(t.totals.other)} other operator` : ''} · {num(t.totals.not_set)} not set</p>
          {SERVICES.map(([k, label]) => {
            const s = t.services[k];
            const of = s.taken_over + s.fenaka;
            return <div key={k} className="tko-svc"><span className="small">{label}</span>
              <div className="tko-bar thin"><span style={{ width: `${pct(s.taken_over, of)}%` }} /></div>
              <small className="muted">{num(s.taken_over)} / {num(of)}</small></div>;
          })}
          <div className="chips">
            {[['', 'All'], ['taken_over', 'Under STELCO'], ['pending', 'Under FENAKA'], ['other', 'Other operator'], ['not_set', 'Not set']].map(([k, l]) =>
              <button key={k} className={`chip ${(filters.show || '') === k ? 'on' : ''}`} onClick={() => setFilter('show', k)}>{l}</button>)}
          </div>
        </>}
      </> : <>
        <div className="tko-headline"><strong>{pct(t.survey.completed, t.survey.scope)}%</strong><span className="small">{num(t.survey.completed)} of {num(t.survey.scope)} islands under FENAKA surveyed</span></div>
        <SurveyBar s={t.survey} />
        {summary && <>
          <p className="small"><span className="sv-text completed">{num(t.survey.completed)} completed</span> · <span className="sv-text ongoing">{num(t.survey.ongoing)} ongoing</span> · <span className="sv-text planned">{num(t.survey.planned)} planned</span> · <span className="muted">{num(t.survey.not_started)} not started</span></p>
          <div className="chips">
            {[['', 'All'], ['completed', 'Completed'], ['ongoing', 'Ongoing'], ['planned', 'Planned'], ['not_started', 'Not started']].map(([k, l]) =>
              <button key={k} className={`chip ${(filters.stage || '') === k ? 'on' : ''}`} onClick={() => setFilter('stage', k)}>{l}</button>)}
          </div>
        </>}
      </>}
    </section>

    {/* Legend and the way back, bottom left. */}
    <div className="glass tko-float tko-legend-float small">
      {!survey ? <><span><i className="dot taken" /> Under STELCO</span><span><i className="dot pending" /> Under FENAKA</span><span><i className="dot other" /> Other operator</span><span><i className="dot none" /> Not set</span></>
        : <><span><i className="dot sv-completed" /> Completed</span><span><i className="dot sv-ongoing" /> Ongoing</span><span><i className="dot sv-planned" /> Planned</span><span><i className="dot sv-not_started" /> Not started</span><span><i className="dot sv-none" /> STELCO / other</span></>}
      {filters.atoll && <button className="btn small" onClick={() => pickAtoll('')}>← Whole country</button>}
    </div>

    {/* The atolls, or an atoll's islands, on the right (a sheet on phones). */}
    {drawer ? <section className="glass tko-float tko-drawer">
      <header>
        <h2>{atoll ? `${atoll.code} · ${atoll.name}` : 'Atolls'}{atoll && <small className="muted"> {survey
          ? `${atoll.survey.completed} of ${atoll.survey.scope} surveyed` : `${atoll.taken_over} of ${atoll.islands} taken over`}</small>}</h2>
        <button className="btn small ghost" onClick={() => setDrawer(false)} aria-label="Hide list">✕</button>
      </header>
      {can('manager') && <div className="tko-drawer-actions">
        {atoll && atoll.islands > 0 && <button className="btn small" onClick={() => setBulk(survey ? 'survey' : 'service')}>Set for whole atoll</button>}
        <button className="btn small primary" onClick={() => setEditing({ atoll_code: atoll?.code || '' })}>Add island</button>
      </div>}
      <div className="tko-drawer-body">
        {!atoll && !filters.show && !filters.stage ? <AtollList atolls={t.atolls} survey={survey} onPick={pickAtoll} />
          : list.length === 0 ? <Empty>No islands here{filters.show || filters.stage ? ' with this status' : ' on the list yet'}.</Empty>
            : <IslandList islands={list} showAtoll={!atoll} picked={picked} survey={survey} onPick={(i) => setPicked(i.id)} />}
      </div>
    </section>
      : <button className="btn tko-float tko-drawer-open" onClick={() => setDrawer(true)}>☰ {atoll ? `${atoll.name} islands` : 'Atolls'}</button>}

    {/* The island picked, as a card. */}
    {island && <IslandCard i={island} onClose={() => setPicked(null)} onEdit={can('manager') ? () => setEditing(island) : null} />}

    {bulk && atoll && <AtollForm atoll={atoll} kind={bulk} onClose={() => setBulk(false)} onSaved={() => { setBulk(false); reload(); }} />}
    {editing && <IslandForm row={editing} atolls={t.atolls} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
  </div>;
}

function IslandCard({ i, onClose, onEdit }) {
  return <section className="glass tko-float tko-popup" role="dialog" aria-label={`${i.atoll_code}. ${i.name}`}>
    <header>
      <h2>{i.atoll_code}. {i.island_id ? <Link to={`/islands/${i.island_id}`}>{i.name}</Link> : i.name}
        <small className={`tko-state ${i.state}`}> {STATE[i.state]}</small></h2>
      <button className="btn small ghost" onClick={onClose} aria-label="Close">✕</button>
    </header>
    <dl className="tko-popup-services">{SERVICES.map(([k, label]) => <div key={k}><dt>{label}</dt><dd><Service status={i[`${k}_status`]} on={i[`${k}_on`]} /></dd></div>)}</dl>
    {(i.state === 'pending' || i.survey_stage) && <div className="tko-popup-survey">
      <p className="small"><strong className={`sv-text ${i.survey_stage || 'not_started'}`}>{SURVEY_STATE[i.survey_stage || 'not_started']}</strong>
        {i.survey_start && <> · {i.survey_stage === 'planned' ? 'from' : 'started'} {date(i.survey_start)}</>}
        {i.survey_end && <> · completed {date(i.survey_end)}</>}</p>
      {i.survey_team && <p className="small"><span className="muted">Team:</span> {i.survey_team}</p>}
      {i.survey_link && <p className="small"><a href={i.survey_link} target="_blank" rel="noreferrer">Open survey report ↗</a></p>}
    </div>}
    {i.phase && <p className="small"><span className="muted">Phase:</span> {i.phase}</p>}
    {i.notes && <p className="small muted">{i.notes}</p>}
    {onEdit && <div className="form-actions"><button className="btn small primary" onClick={onEdit}>Edit</button></div>}
  </section>;
}

// The map: every island at its place (OpenStreetMap positions, migration
// 055), coloured by its state; each atoll's outline shaded and clickable.
// Picking an atoll zooms to it and names its islands; picking an island
// shows it in the list. Lon/lat drawn straight (the Maldives is near the
// equator, so the stretch is negligible), 100 units to the degree.
const BOUNDS = { west: 72.5, east: 73.9, north: 7.25, south: -0.8 };
const toXY = (i) => [(i.lon - BOUNDS.west) * 100, (BOUNDS.north - i.lat) * 100];
const FULL = [0, 0, (BOUNDS.east - BOUNDS.west) * 100, (BOUNDS.north - BOUNDS.south) * 100];

// The outline round an atoll's islands (convex hull, padded).
function hull(points, pad) {
  if (points.length === 1) {
    const [x, y] = points[0];
    return Array.from({ length: 12 }, (_, k) => [x + pad * Math.cos(k * Math.PI / 6), y + pad * Math.sin(k * Math.PI / 6)]);
  }
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => list.reduce((h, p) => { while (h.length >= 2 && cross(h.at(-2), h.at(-1), p) <= 0) h.pop(); h.push(p); return h; }, []);
  const lower = half(pts);
  const upper = half([...pts].reverse());
  const ring = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  const cx = ring.reduce((n, p) => n + p[0], 0) / ring.length;
  const cy = ring.reduce((n, p) => n + p[1], 0) / ring.length;
  // Push each corner out from the middle, and round the shape a little.
  return ring.flatMap((p) => {
    const dx = p[0] - cx; const dy = p[1] - cy; const d = Math.hypot(dx, dy) || 1;
    return [[p[0] + (dx / d) * pad, p[1] + (dy / d) * pad]];
  });
}

// The map moves like an online map: drag to pan, scroll or pinch to zoom
// (round the pointer), + / − / ⌂ buttons; picking an atoll glides to it.
// The view is kept to the map's own shape, so a screen pixel is the same
// distance across and down (px map units).
const MIN_W = 6;
function fitTo(v, box) {
  const [x, y, w, h] = v;
  const want = box.w / box.h;
  let nw = w; let nh = h;
  if (w / h < want) nw = h * want; else nh = w / want;
  return [x + (w - nw) / 2, y + (h - nh) / 2, nw, nh];
}

function AtollMap({ atolls, islands, match, selected, onPick, picked, onIsland, survey }) {
  const placed = islands.filter((i) => i.lat != null && i.lon != null);
  const byAtoll = Object.fromEntries(atolls.map((a) => [a.code, placed.filter((i) => i.atoll_code === a.code)]));
  const ref = useRef(null);
  const [box, setBox] = useState({ w: 800, h: 800 });
  const [view, setView] = useState(() => fitTo(FULL, { w: 800, h: 800 }));
  const frame = useRef(0);
  const measured = useRef(false);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const now = useRef(view);
  now.current = view;
  const drag = useRef({ pointers: new Map(), moved: false });

  const targetFor = (code) => {
    const list = code && byAtoll[code];
    if (!list?.length) return FULL;
    const xy = list.map(toXY);
    const xs = xy.map((p) => p[0]); const ys = xy.map((p) => p[1]);
    const pad = 10;
    return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...ys) - Math.min(...ys) + pad * 2];
  };
  const glide = (to) => {
    cancelAnimationFrame(frame.current);
    const goal = fitTo(to, box);
    const from = now.current;
    const start = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - start) / 400);
      const e = 1 - (1 - k) ** 3;
      setView(from.map((v, n) => v + (goal[n] - v) * e));
      if (k < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => {
      const nb = { w: e.contentRect.width || 800, h: e.contentRect.height || 800 };
      setBox(nb);
      // The first measure frames the map to fit; after that, keep the view.
      if (!measured.current) { measured.current = true; cancelAnimationFrame(frame.current); setView(fitTo(targetFor(selectedRef.current), nb)); }
      else setView((v) => fitTo(v, nb));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (measured.current) glide(targetFor(selected)); }, [selected]);

  const px = view[2] / box.w;
  const zoomAt = (factor, cx = box.w / 2, cy = box.h / 2) => {
    cancelAnimationFrame(frame.current);
    setView(([x, y, w, h]) => {
      const nw = Math.min(Math.max(w * factor, MIN_W), FULL[3] * 2 * (box.w / box.h));
      const f = nw / w;
      const mx = x + (cx / box.w) * w; const my = y + (cy / box.h) * h;
      return [mx - (mx - x) * f, my - (my - y) * f, nw, h * f];
    });
  };

  // Mouse wheel / trackpad, round the pointer.
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0025)), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  // Drag to pan; two fingers to pinch.
  const onPointerDown = (e) => {
    const d = drag.current;
    if (d.pointers.size === 0) d.moved = false;
    d.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    cancelAnimationFrame(frame.current);
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    const prev = d.pointers.get(e.pointerId);
    if (!prev) return;
    const r = ref.current.getBoundingClientRect();
    if (d.pointers.size === 1) {
      const dx = e.clientX - prev.x; const dy = e.clientY - prev.y;
      // Held only once it is a drag, so a plain click still reaches the island.
      if (!d.moved && Math.abs(dx) + Math.abs(dy) > 3) { d.moved = true; ref.current.setPointerCapture?.(e.pointerId); }
      if (!d.moved) return;
      setView(([x, y, w, h]) => [x - dx * (w / box.w), y - dy * (w / box.w), w, h]);
    } else if (d.pointers.size === 2) {
      const [other] = [...d.pointers.entries()].filter(([id]) => id !== e.pointerId).map(([, p]) => p);
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (before > 0) zoomAt(before / after, (e.clientX + other.x) / 2 - r.left, (e.clientY + other.y) / 2 - r.top);
      d.moved = true;
    }
    d.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onPointerUp = (e) => { drag.current.pointers.delete(e.pointerId); };
  // A click that ended a drag is not a pick.
  const click = (fn) => (e) => { e.stopPropagation(); if (!drag.current.moved) fn(); };

  const showNames = px < 0.09;
  const tone = survey
    ? (a) => (!a.survey.scope ? 'sv-clear' : a.survey.completed === a.survey.scope ? 'sv-completed'
      : a.survey.completed + a.survey.ongoing ? 'sv-ongoing' : a.survey.planned ? 'sv-planned' : 'sv-not_started')
    : (a) => (!a.islands ? 'none' : a.not_set === a.islands ? 'none' : a.taken_over + a.other === a.islands ? 'taken' : 'pending');

  // Atoll labels beside their atoll, west atolls to the left, the rest to
  // the right; on each side pushed apart so none overlap.
  const labels = [];
  for (const a of atolls) {
    const xy = byAtoll[a.code].map(toXY);
    if (!xy.length) continue;
    const xs = xy.map((p) => p[0]);
    const cx = xs.reduce((n, v) => n + v, 0) / xs.length;
    const cy = xy.reduce((n, p) => n + p[1], 0) / xy.length;
    const left = cx < (72.99 - BOUNDS.west) * 100;
    labels.push({ a, left, x: left ? Math.min(...xs) - px * 12 : Math.max(...xs) + px * 12, y: cy });
  }
  for (const side of [true, false]) {
    const list = labels.filter((l) => l.left === side).sort((p, q) => p.y - q.y);
    for (let n = 1; n < list.length; n++) list[n].y = Math.max(list[n].y, list[n - 1].y + px * 19);
  }

  return <>
    <svg ref={ref} className="tko-map" viewBox={view.join(' ')} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Islands by takeover status"
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      {atolls.map((a) => {
        const xy = byAtoll[a.code].map(toXY);
        if (!xy.length) return null;
        const ring = hull(xy, Math.max(4, px * 8));
        return <g key={a.code} className={`tko-atoll ${tone(a)}${selected === a.code ? ' selected' : ''}`}
          onClick={click(() => onPick(a.code))} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onPick(a.code)}>
          <title>{survey ? `${a.name}: ${a.survey.completed} of ${a.survey.scope} surveyed` : `${a.name}: ${a.taken_over} of ${a.islands} taken over`}</title>
          <polygon points={ring.map((p) => p.join(',')).join(' ')} strokeWidth={px * 1.5} strokeLinejoin="round" />
        </g>;
      })}
      {placed.map((i) => {
        const [x, y] = toXY(i);
        const sv = surveyState(i);
        const cls = survey ? `sv-${sv || 'none'}` : i.state;
        return <g key={i.id} className={`tko-island ${cls}${picked === i.id ? ' picked' : ''}${match(i) ? '' : ' dim'}`}
          onClick={click(() => (showNames || selected === i.atoll_code ? onIsland(i) : onPick(i.atoll_code)))}>
          <title>{`${i.atoll_code}. ${i.name}: ${survey ? (sv ? SURVEY_STATE[sv] : STATE[i.state]) : STATE[i.state]}`}</title>
          <circle cx={x} cy={y} r={px * 10} className="hit" />
          <circle cx={x} cy={y} r={px * (showNames ? 6 : 4)} strokeWidth={px * 1.2} />
          {showNames && <text x={x + px * 10} y={y + px * 4.5} fontSize={px * 13}>{i.name}</text>}
        </g>;
      })}
      {!showNames && labels.map(({ a, left, x, y }) =>
        <text key={a.code} x={x} y={y + px * 5} fontSize={px * 14} textAnchor={left ? 'end' : 'start'} className="tko-label"
          onClick={click(() => onPick(a.code))}>
          {a.code}<tspan className="count" dx={px * 5} fontSize={px * 12}>{survey ? `${a.survey.completed}/${a.survey.scope}` : `${a.taken_over}/${a.islands}`}</tspan></text>)}
    </svg>
    <div className="tko-zoom glass">
      <button onClick={() => zoomAt(1 / 1.6)} aria-label="Zoom in">+</button>
      <button onClick={() => zoomAt(1.6)} aria-label="Zoom out">−</button>
      <button onClick={() => (selected ? onPick('') : glide(FULL))} aria-label="Whole country" title="Whole country">⌂</button>
    </div>
  </>;
}

// Survey stages as one bar: completed, ongoing, planned, of those to survey.
function SurveyBar({ s, thin }) {
  return <div className={`tko-bar sv${thin ? ' thin' : ''}`}>
    {['completed', 'ongoing', 'planned'].map((k) => <span key={k} className={k} style={{ width: `${s.scope ? (s[k] / s.scope) * 100 : 0}%` }} />)}
  </div>;
}

function AtollList({ atolls, survey, onPick }) {
  return <ul className="tko-list">{atolls.map((a) => <li key={a.code}>
    <button onClick={() => onPick(a.code)}>
      <span className="grow"><strong>{a.code}</strong> · {a.name}
        {survey ? (a.survey.scope ? <SurveyBar s={a.survey} thin /> : <small className="muted tko-none">Nothing to survey</small>)
          : a.islands ? <div className="tko-bar thin"><span style={{ width: `${pct(a.taken_over, a.islands)}%` }} /></div> : null}</span>
      <span className="small muted num">{survey ? (a.survey.scope ? `${a.survey.completed}/${a.survey.scope}` : '') : a.islands ? `${a.taken_over}/${a.islands}` : '—'}</span>
    </button></li>)}</ul>;
}

function Service({ status, on }) {
  if (!status) return <span className="muted">—</span>;
  return <span className={`tko-pill ${status}`} title={on ? `${status === 'taken_over' ? 'Taken over' : 'Survey started'} ${date(on)}` : undefined}>
    {STATUS[status]}{on && dated(status) ? ` · ${date(on)}` : ''}</span>;
}

function IslandList({ islands, showAtoll, picked, survey, onPick }) {
  return <ul className="tko-list">{islands.map((i) => <li key={i.id} className={picked === i.id ? 'picked' : ''}>
    <button onClick={() => onPick(i)}>
      <span className="grow"><strong>{showAtoll && `${i.atoll_code}. `}{i.name}</strong>
        <span className="tko-mini">{SERVICES.map(([k, label]) => i[`${k}_status`] && i[`${k}_status`] !== 'not_applicable' && i[`${k}_status`] !== 'other_operator'
          ? <span key={k} className={`tko-pill ${i[`${k}_status`]}`} title={`${label}: ${STATUS[i[`${k}_status`]]}`}>{label[0]}</span> : null)}</span></span>
      {survey && surveyState(i) ? <small className={`sv-text ${surveyState(i)}`}>{SURVEY_STATE[surveyState(i)]}</small>
        : <small className={`tko-state ${i.state}`}>{STATE[i.state]}</small>}
    </button></li>)}</ul>;
}

function IslandForm({ row, atolls, onClose, onSaved }) {
  const { can } = useAuth();
  const srd = useApi('/islands');
  const [f, setF] = useState(() => ({
    atoll_code: row.atoll_code || '', name: row.name || '', island_id: row.island_id || '', phase: row.phase || '', notes: row.notes || '',
    survey_stage: row.survey_stage || '', survey_start: row.survey_start || '', survey_end: row.survey_end || '',
    survey_team: row.survey_team || '', survey_link: row.survey_link || '',
    ...Object.fromEntries(SERVICES.flatMap(([k]) => [[`${k}_status`, row[`${k}_status`] || ''], [`${k}_on`, row[`${k}_on`] || '']])),
  }));
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));
  const save = useSubmit(async () => {
    const body = { atoll_code: f.atoll_code, name: f.name.trim(), island_id: f.island_id || null, phase: f.phase || null, notes: f.notes || null,
      survey_stage: f.survey_stage || null, survey_start: f.survey_stage ? f.survey_start || null : null,
      survey_end: f.survey_stage === 'completed' ? f.survey_end || null : null,
      survey_team: f.survey_team.trim() || null, survey_link: f.survey_link.trim() || null,
      ...Object.fromEntries(SERVICES.flatMap(([k]) => [[`${k}_status`, f[`${k}_status`] || null], [`${k}_on`, dated(f[`${k}_status`]) ? f[`${k}_on`] || null : null]])) };
    if (row.id) await api(`/takeover/islands/${row.id}`, { method: 'PATCH', body });
    else await api('/takeover/islands', { method: 'POST', body });
    onSaved();
  });
  const remove = useSubmit(async () => {
    if (!window.confirm(`Remove ${row.atoll_code}. ${row.name} from the takeover list?`)) return;
    await api(`/takeover/islands/${row.id}`, { method: 'DELETE' });
    onSaved();
  });
  const srdHere = (srd.data || []).filter((i) => i.atoll_code === f.atoll_code);
  return <Modal title={row.id ? `${row.atoll_code}. ${row.name}` : 'Add island'} onClose={onClose}>
    <form className="form" onSubmit={(e) => { e.preventDefault(); save.submit(); }}>
      <ErrorBox error={save.error || remove.error} />
      <Field label="Atoll"><Select required value={f.atoll_code} onChange={set('atoll_code')} placeholder="Choose…" options={atolls.map((a) => [a.code, `${a.code} · ${a.name}`])} /></Field>
      <Field label="Island"><input required maxLength="100" value={f.name} onChange={set('name')} /></Field>
      {srdHere.length > 0 && <Field label="SRD island (if SRD manages it)"><Select value={f.island_id} onChange={(v) => { set('island_id')(v); const i = srdHere.find((x) => x.id === v); if (i && !f.name) set('name')(i.name); }}
        placeholder="—" options={srdHere.map((i) => [i.id, i.name])} /></Field>}
      <Field label="Phase / batch"><input maxLength="100" value={f.phase} onChange={set('phase')} placeholder="e.g. Phase 2" /></Field>
      {SERVICES.map(([k, label]) => <Field key={k} label={label}>
        <div className="tko-service-input">
          <Select value={f[`${k}_status`]} onChange={set(`${k}_status`)} placeholder="Not set" options={Object.entries(STATUS)} />
          {dated(f[`${k}_status`]) && <input type="date" value={f[`${k}_on`]} onChange={set(`${k}_on`)}
            aria-label={`${label}: taken over on`} title="Taken over on" />}
        </div></Field>)}
      <h3 className="wide tko-form-head">Survey</h3>
      <Field label="Stage"><Select value={f.survey_stage} onChange={set('survey_stage')} placeholder="Not started" options={Object.entries(SURVEY)} /></Field>
      {f.survey_stage && <Field label={f.survey_stage === 'planned' ? 'Planned start' : 'Started on'}><input type="date" value={f.survey_start} onChange={set('survey_start')} /></Field>}
      {f.survey_stage === 'completed' && <Field label="Completed on"><input type="date" value={f.survey_end} onChange={set('survey_end')} /></Field>}
      <Field label="Team"><input maxLength="300" value={f.survey_team} onChange={set('survey_team')} placeholder="Who is surveying" /></Field>
      <Field label="Survey report (Microsoft 365 link)" wide><input type="url" maxLength="2000" value={f.survey_link} onChange={set('survey_link')} placeholder="https://…sharepoint.com/…" /></Field>
      <Field label="Notes" wide><textarea rows="2" maxLength="2000" value={f.notes} onChange={set('notes')} /></Field>
      <p className="muted small wide">Taken over: the date it was. Other operator: say who in the notes (e.g. MWSC).</p>
      <div className="form-actions">
        {row.id && can('admin') && <button type="button" className="btn danger" disabled={remove.busy} onClick={remove.submit} style={{ marginRight: 'auto' }}>Remove</button>}
        <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={save.busy}>Save</button></div>
    </form>
  </Modal>;
}

// For every island of an atoll at once: one service's status (e.g. "Seenu:
// electricity taken over"), or the survey stage of its islands still with
// FENAKA. Islands already set keep theirs unless "all" is ticked.
function AtollForm({ atoll, kind, onClose, onSaved }) {
  const [mode, setMode] = useState(kind);
  const [f, setF] = useState({ service: 'electricity', status: 'taken_over', on: '', stage: 'planned', start: '', end: '', team: '', all: false });
  const { submit, busy, error } = useSubmit(async () => {
    if (mode === 'survey') {
      await api(`/takeover/atolls/${atoll.code}/survey`, { method: 'POST',
        body: { stage: f.stage, start: f.start || null, end: f.stage === 'completed' ? f.end || null : null, team: f.team.trim() || null, all: f.all } });
    } else {
      await api(`/takeover/atolls/${atoll.code}`, { method: 'POST', body: { service: f.service, status: f.status, on: dated(f.status) ? f.on || null : null, all: f.all } });
    }
    onSaved();
  });
  return <Modal title={`${atoll.code} · ${atoll.name}: set for the whole atoll`} onClose={onClose}>
    <form className="form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <ErrorBox error={error} />
      <div className="tko-switch wide" role="tablist">
        <button type="button" className={mode === 'service' ? 'on' : ''} onClick={() => setMode('service')}>Service status</button>
        <button type="button" className={mode === 'survey' ? 'on' : ''} onClick={() => setMode('survey')}>Survey</button>
      </div>
      {mode === 'service' ? <>
        <Field label="Service"><Select value={f.service} onChange={(v) => setF({ ...f, service: v })} options={SERVICES} /></Field>
        <Field label="Status"><Select value={f.status} onChange={(v) => setF({ ...f, status: v })} options={Object.entries(STATUS)} /></Field>
        {dated(f.status) && <Field label="Taken over on (optional)"><input type="date" value={f.on} onChange={(e) => setF({ ...f, on: e.target.value })} /></Field>}
      </> : <>
        <Field label="Stage"><Select value={f.stage} onChange={(v) => setF({ ...f, stage: v })} options={Object.entries(SURVEY)} /></Field>
        <Field label={f.stage === 'planned' ? 'Planned start (optional)' : 'Started on (optional)'}><input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
        {f.stage === 'completed' && <Field label="Completed on (optional)"><input type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>}
        <Field label="Team (optional)"><input maxLength="300" value={f.team} onChange={(e) => setF({ ...f, team: e.target.value })} /></Field>
        <p className="muted small wide">For the {atoll.survey.scope} islands in {atoll.name} still under FENAKA.</p>
      </>}
      <label className="check wide"><input type="checkbox" checked={f.all} onChange={(e) => setF({ ...f, all: e.target.checked })} /> Also change islands already set (otherwise only those not set yet)</label>
      <div className="form-actions"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy}>Apply to {atoll.name}</button></div>
    </form>
  </Modal>;
}

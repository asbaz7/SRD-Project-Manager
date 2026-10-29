// The department's atolls as a map, drawn as on the TV board: true
// geography (one scale both ways), reef outlines with a lagoon fill and a
// soft glow, quiet islands as small dots, and islands with open work as
// markers in the state of their most pressing job (overdue, on hold, in
// progress), with the count. An island whose power is off gets a red ring.
// Labels keep clear of rims, markers and each other, with a leader line when
// they have to sit further out. Choosing an atoll eases the map onto it.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ATOLL_SHAPES, ATOLL_SPLIT } from '../atollShapes.js';

const n = (v) => Number(v || 0);
export const islandTone = (i) => (n(i.overdue_work) ? 'over' : n(i.held_work) ? 'hold' : n(i.open_work) ? 'prog' : null);

// A closed Catmull-Rom curve through the points, as cubic Béziers.
function smooth(pts) {
  const len = pts.length;
  if (len < 3) return '';
  const f = (v) => v.toFixed(1);
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < len; i++) {
    const p0 = pts[(i - 1 + len) % len], p1 = pts[i], p2 = pts[(i + 1) % len], p3 = pts[(i + 2) % len];
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])},${f(p2[1])}`;
  }
  return `${d}Z`;
}

const textW = (s, size, italic) => s.length * size * (italic ? 0.56 : 0.6);
const overlaps = (b, list) => list.some((p) => b.x0 < p.x1 && b.x1 > p.x0 && b.y0 < p.y1 && b.y1 > p.y0);
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const keepSide = (c) => (p) => !ATOLL_SPLIT[c] || (ATOLL_SPLIT[c].keep === 'north' ? p[1] >= ATOLL_SPLIT[c].lat : p[1] <= ATOLL_SPLIT[c].lat);

// Where to look: the shown atolls' outlines and islands (a shared ring only
// on its own side), fitted with room for the labels beside them.
function fit(codes, islands, w, h, focused) {
  const pts = codes.flatMap((c) => (ATOLL_SHAPES[c] || []).flat().filter(keepSide(c))).concat(islands.map((i) => [i.lon, i.lat]));
  if (!pts.length || w < 50) return null;
  const lons = pts.map((p) => p[0]), lats = pts.map((p) => p[1]);
  const lon = [Math.min(...lons), Math.max(...lons)], lat = [Math.min(...lats), Math.max(...lats)];
  const room = w < 520 ? 44 : Math.min(170, w * 0.24), top = w < 520 ? 22 : 34;
  const k = Math.min((w - room * 2) / Math.max(lon[1] - lon[0], 0.15), (h - top * 2) / Math.max(lat[1] - lat[0], 0.15)) * (focused ? 0.8 : 1);
  return { cx: (lon[0] + lon[1]) / 2, cy: (lat[0] + lat[1]) / 2, k };
}

// What an atoll's label says under its name, in parts with their tone.
function summary(list) {
  const sum = (k) => list.reduce((t, i) => t + n(i[k]), 0);
  const open = sum('open_work'), hold = sum('held_work'), over = sum('overdue_work'), off = list.filter((i) => i.power_off).length;
  const parts = [open ? [`${open} open`, ''] : ['No open work', ''], hold && [`${hold} on hold`, 'hold'], over && [`${over} overdue`, 'over'], off && [off > 1 ? `power off on ${off}` : 'power off', 'over']].filter(Boolean);
  return { parts, tone: off || over ? 'over' : hold ? 'hold' : 'ok' };
}

export default function AtollMap({ islands, atolls, focus, onAtoll }) {
  const navigate = useNavigate();
  const box = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const placedIslands = islands.filter((i) => i.lat != null && i.lon != null);
  const codes = atolls.map((a) => a.code).filter((c) => ATOLL_SHAPES[c]);
  const target = useMemo(() => fit(focus ? [focus] : codes, focus ? placedIslands.filter((i) => i.atoll_code === focus) : placedIslands, size.w, size.h, !!focus),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [focus, size.w, size.h, codes.join(), placedIslands.length]);

  // The signature move: the map eases onto the chosen atoll and back.
  const [view, setView] = useState(null);
  const shown = useRef(null);
  useEffect(() => {
    if (!target) return undefined;
    const from = shown.current;
    if (!from || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { shown.current = target; setView(target); return undefined; }
    let raf;
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / 650), e = ease(p);
      const v = { cx: from.cx + (target.cx - from.cx) * e, cy: from.cy + (target.cy - from.cy) * e, k: Math.exp(Math.log(from.k) + (Math.log(target.k) - Math.log(from.k)) * e) };
      shown.current = v;
      setView(v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  const { w, h } = size;
  let svg = null;
  if (view && w > 50) {
    const gx = (lon) => w / 2 + (lon - view.cx) * view.k;
    const gy = (lat) => h / 2 - (lat - view.cy) * view.k;
    const placed = [];
    const rimPts = [];
    const shapes = atolls.filter((a) => ATOLL_SHAPES[a.code]).map((a) => {
      const rings = ATOLL_SHAPES[a.code].map((ring) => ring.map(([lon, lat]) => [gx(lon), gy(lat)]));
      const split = ATOLL_SPLIT[a.code];
      const cutY = split ? gy(split.lat) : null;
      const keep = (p) => !split || (split.keep === 'north' ? p[1] <= cutY : p[1] >= cutY);
      const outer = rings[0].filter(keep);
      for (const ring of rings.map((r, i) => (i === 0 ? r.filter(keep) : r))) {
        for (let i = 0; i < ring.length; i++) {
          const [x0, y0] = ring[i], [x1, y1] = ring[(i + 1) % ring.length];
          const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 8));
          for (let s = 0; s <= steps; s++) {
            const x = x0 + ((x1 - x0) * s) / steps, y = y0 + ((y1 - y0) * s) / steps;
            rimPts.push({ x0: x - 2, x1: x + 2, y0: y - 2, y1: y + 2, atoll: a.code });
          }
        }
      }
      return { a, rings, split, cutY, outer };
    });

    // Islands: markers first, so labels keep clear of them.
    // Phones: compact, as the board's narrow mode (codes only, smaller marks).
    const small = w < 520;
    const R = small ? 9 : 11;
    const marks = placedIslands.map((i) => ({ i, x: gx(i.lon), y: gy(i.lat), tone: islandTone(i), off: !!i.power_off }));
    const rad = (m) => (m.tone ? R : m.off ? 6 : 4);
    for (const m of marks) {
      const e = rad(m) + (m.off ? 6 : 2);
      placed.push({ x0: m.x - e, x1: m.x + e, y0: m.y - e, y1: m.y + e });
    }

    // Atoll labels: beside the rim, right or left, nudged up or down until clear.
    const labels = [];
    for (const s of shapes) {
      if (!s.outer.length) continue;
      const xs = s.outer.map((p) => p[0]), ys = s.outer.map((p) => p[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs), midY = (Math.min(...ys) + Math.max(...ys)) / 2;
      const sm = summary(placedIslands.filter((i) => i.atoll_code === s.a.code));
      const sub = sm.parts.map((p) => p[0]).join(' · ');
      // Bold capitals run wide: the code's width is estimated generously.
      const head = s.a.code.length * 19 * 0.66 + (small ? 0 : textW(s.a.name, 18, true)) + 22;
      const lw = (small ? head : Math.max(head, textW(sub, 13.5))) + 6, lh = small ? 24 : 42;
      const others = [...placed, ...rimPts.filter((p) => p.atoll !== s.a.code)];
      let best = null;
      search: for (const dy of [0, 1, -1, 2, -2, 3, -3, 4, -4]) {
        for (const [anchor, x] of [['start', maxX + 14], ['end', minX - 14], ['start', maxX + 36], ['end', minX - 36]]) {
          const y = midY + dy * lh * 0.6;
          const x0 = anchor === 'start' ? x : x - lw;
          const b = { x0: x0 - 3, x1: x0 + lw + 3, y0: y - 19, y1: y + (small ? 6 : lh - 16) };
          if (b.x0 < 2 || b.x1 > w - 2 || b.y0 < 2 || b.y1 > h - 2 || overlaps(b, others)) continue;
          best = { anchor, x, y, b };
          break search;
        }
      }
      // Nowhere clear: the side with more room, kept inside the map.
      if (!best) best = w - maxX >= minX ? { anchor: 'start', x: Math.min(maxX + 14, w - lw - 4), y: midY } : { anchor: 'end', x: Math.max(minX - 14, lw + 4), y: midY };
      if (best.b) placed.push(best.b);
      labels.push({ s, sm, head, ...best });
    }

    // Island names: for islands with a marker, and every island of the
    // chosen atoll. Beside the marker if there is room, else further out
    // with a leader line.
    const names = [];
    const leaders = [];
    const named = marks.slice().sort((p, q) => (q.tone === 'over') - (p.tone === 'over') || q.off - p.off || n(q.i.open_work) - n(p.i.open_work));
    for (const m of named) {
      const fs = small ? (m.tone || m.off ? 10.5 : 9.5) : m.tone || m.off ? 13 : 11.5;
      const tw = textW(m.i.name, fs) + 4;
      const off = rad(m) + (m.off ? 9 : 5);
      const blockers = [...placed, ...rimPts.filter((p) => p.atoll !== m.i.atoll_code)];
      const at = (x, y, anchor) => {
        const x0 = anchor === 'start' ? x : anchor === 'end' ? x - tw : x - tw / 2;
        const b = { x0, x1: x0 + tw, y0: y - fs, y1: y + 3 };
        return b.x0 < 2 || b.x1 > w - 2 || b.y0 < 2 || b.y1 > h - 2 || overlaps(b, blockers) ? null : b;
      };
      let done = false;
      for (const [x, y, anchor] of [[m.x, m.y - off - 3, 'middle'], [m.x, m.y + off + fs, 'middle'], [m.x + off, m.y + fs * 0.35, 'start'], [m.x - off, m.y + fs * 0.35, 'end']]) {
        const b = at(x, y, anchor);
        if (b) { placed.push(b); names.push({ m, x, y, anchor, fs }); done = true; break; }
      }
      if (!done) {
        search: for (const dist of [1.8, 2.6, 3.4, 4.4, 5.6, 7]) {
          for (const deg of [0, 180, -30, 30, 150, -150, -60, 60, 120, -120, -90, 90]) {
            const rr = (deg * Math.PI) / 180, ex = m.x + Math.cos(rr) * dist * (small ? 10 : 13), ey = m.y + Math.sin(rr) * dist * (small ? 10 : 13);
            const anchor = Math.cos(rr) > 0.3 ? 'start' : Math.cos(rr) < -0.3 ? 'end' : 'middle';
            const tx = ex + (anchor === 'start' ? 4 : anchor === 'end' ? -4 : 0);
            const b = at(tx, ey + fs * 0.35, anchor);
            if (b) {
              placed.push(b);
              names.push({ m, x: tx, y: ey + fs * 0.35, anchor, fs });
              leaders.push({ id: m.i.id, x1: m.x + Math.cos(rr) * (rad(m) + 2), y1: m.y + Math.sin(rr) * (rad(m) + 2), x2: ex, y2: ey });
              done = true;
              break search;
            }
          }
        }
      }
      // Every island is named: with no clear spot, beside its dot anyway.
      if (!done) names.push({ m, x: m.x + off, y: m.y + fs * 0.35, anchor: m.x + off + tw < w - 2 ? 'start' : 'end', fs });
    }

    const open = (i) => navigate(`/islands/${i.id}`);
    const dimA = (code) => focus && focus !== code;
    svg = <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Map of the department's atolls and islands">
      <defs>
        <linearGradient id="am-lagoon" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="rgb(120 170 220)" stopOpacity=".16" /><stop offset="1" stopColor="rgb(90 140 200)" stopOpacity=".07" /></linearGradient>
        <linearGradient id="am-lagoon-on" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="rgb(140 190 240)" stopOpacity=".28" /><stop offset="1" stopColor="rgb(100 150 210)" stopOpacity=".12" /></linearGradient>
        <filter id="am-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3.5" /></filter>
        {shapes.filter((s) => s.split).map((s) => <clipPath key={s.a.code} id={`am-clip-${s.a.code}`}>
          {s.split.keep === 'north' ? <rect x={-w} y={-h} width={w * 3} height={s.cutY + h} /> : <rect x={-w} y={s.cutY} width={w * 3} height={h * 2} />}
        </clipPath>)}
      </defs>
      {shapes.map((s) => {
        const on = focus === s.a.code;
        const d = smooth(s.rings[0]);
        const extra = s.rings.slice(1).map(smooth).join(' ');
        return <g key={s.a.code} className={`am-atoll${on ? ' on' : ''}`} opacity={dimA(s.a.code) ? 0.32 : 1}
          onClick={(e) => { e.stopPropagation(); onAtoll(on ? null : s.a.code); }}>
          <g clipPath={s.split ? `url(#am-clip-${s.a.code})` : undefined}>
            <path d={d} className="am-glow" filter="url(#am-glow)" />
            <path d={d} className="am-fill" fill={on ? 'url(#am-lagoon-on)' : 'url(#am-lagoon)'} />
            <path d={d} className="am-rim" />
          </g>
          {extra && <><path d={extra} className="am-fill" fill={on ? 'url(#am-lagoon-on)' : 'url(#am-lagoon)'} /><path d={extra} className="am-rim" /></>}
          <title>{`${s.a.code} · ${s.a.name}: ${on ? 'tap to show all atolls' : 'tap to show its islands'}`}</title>
        </g>;
      })}
      {shapes.filter((s) => s.split?.keep === 'north').map((s) => {
        const ring = s.rings[0], xs = [];
        for (let i = 0; i < ring.length; i++) {
          const p = ring[i], q = ring[(i + 1) % ring.length];
          if ((p[1] - s.cutY) * (q[1] - s.cutY) <= 0 && p[1] !== q[1]) xs.push(p[0] + ((q[0] - p[0]) * (s.cutY - p[1])) / (q[1] - p[1]));
        }
        return xs.length >= 2 && <line key="ari" className="am-cut" x1={Math.min(...xs) + 3} x2={Math.max(...xs) - 3} y1={s.cutY} y2={s.cutY}
          opacity={focus && focus !== 'AA' && focus !== 'ADh' ? 0.32 : 1} />;
      })}
      {labels.map((l) => {
        const left = l.anchor === 'start';
        return <g key={l.s.a.code} className="am-label" opacity={dimA(l.s.a.code) ? 0.4 : 1}
          onClick={(e) => { e.stopPropagation(); onAtoll(focus === l.s.a.code ? null : l.s.a.code); }}>
          <circle cx={left ? l.x + 4 : l.x - l.head + 10} cy={l.y - 6} r="4.2" className={`am-ldot ${l.sm.tone}`} />
          <text x={left ? l.x + 14 : l.x} y={l.y} textAnchor={l.anchor} className="am-code"><tspan>{l.s.a.code}</tspan>{!small && <tspan className="am-name" dx="8">{l.s.a.name}</tspan>}</text>
          {!small && <text x={l.x} y={l.y + 21} textAnchor={l.anchor} className="am-sub">
            {l.sm.parts.map(([t, tone], i) => <tspan key={t} className={tone}>{i ? ` · ${t}` : t}</tspan>)}
          </text>}
        </g>;
      })}
      {leaders.map((ld) => <line key={ld.id} className="am-leader" x1={ld.x1} y1={ld.y1} x2={ld.x2} y2={ld.y2} />)}
      {marks.sort((p, q) => !!(p.tone || p.off) - !!(q.tone || q.off)).map((m) => {
        const dim = dimA(m.i.atoll_code);
        const said = [n(m.i.open_work) && `${m.i.open_work} open work`, n(m.i.held_work) && `${m.i.held_work} on hold`, n(m.i.overdue_work) && `${m.i.overdue_work} overdue`, m.off && 'power off'].filter(Boolean);
        const label = `${m.i.atoll_code}. ${m.i.name}: ${said.length ? said.join(', ') : 'no open work'}`;
        return <g key={m.i.id} className={`am-island${m.tone ? ` t-${m.tone}` : ''}${m.off ? ' off' : ''}`} opacity={dim ? 0.3 : 1} role="link"
          tabIndex={dim ? -1 : 0} aria-label={label} onClick={(e) => { e.stopPropagation(); open(m.i); }} onKeyDown={(e) => { if (e.key === 'Enter') open(m.i); }}>
          <title>{label}</title>
          {m.off && <><circle cx={m.x} cy={m.y} r={rad(m) + 5} className="am-off" /><circle cx={m.x} cy={m.y} r={rad(m) + 5} className="am-off pulse" /></>}
          {m.tone ? <>
            <circle cx={m.x} cy={m.y} r={R} className="am-mark" />
            <circle cx={m.x} cy={m.y} r={R + 1.6} className="am-halo" />
            {n(m.i.open_work) > 1 && <text x={m.x} y={m.y} dy=".36em" textAnchor="middle" className="am-badge">{m.i.open_work}</text>}
          </> : <circle cx={m.x} cy={m.y} r={m.off ? 5 : focus === m.i.atoll_code ? 3.4 : 2.4} className={`am-dot${m.off ? ' off' : ''}`} />}
          <circle cx={m.x} cy={m.y} r={14} fill="transparent" />
        </g>;
      })}
      {names.map((t) => <text key={t.m.i.id} x={t.x} y={t.y} textAnchor={t.anchor} className={`am-iname${t.m.tone || t.m.off ? '' : ' quiet'}`} fontSize={t.fs}
        opacity={dimA(t.m.i.atoll_code) ? 0.3 : 1}>{t.m.i.name}</text>)}
    </svg>;
  }

  return <div className="atoll-map">
    <div className="am-canvas" ref={box} onClick={() => focus && onAtoll(null)}>{svg}</div>
    <div className="am-legend small">
      <span><i className="t-prog" /> In progress</span>
      <span><i className="t-hold" /> On hold</span>
      <span><i className="t-over" /> Overdue</span>
      <span><i className="off" /> Power off</span>
      <span><i className="quiet" /> No open work</span>
      {focus && <button type="button" className="btn small ghost" onClick={() => onAtoll(null)}>All atolls</button>}
    </div>
  </div>;
}

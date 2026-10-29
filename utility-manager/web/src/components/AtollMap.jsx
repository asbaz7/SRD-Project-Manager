// The department's atolls as a map, in the TV board's manner: true
// geography (one scale both ways), reef outlines with a lagoon fill and a
// soft glow, islands as small dots, and islands that need something as
// coloured markers (red: gensets down or an interruption; amber: a licence
// expired; blue: open work, with the count). Labels keep clear of rims,
// markers and each other. Choosing an atoll eases the map onto it.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ATOLL_SHAPES, ATOLL_SPLIT } from '../atollShapes.js';

export const islandTone = (i) => (i.down_count > 0 || i.open_incidents > 0 ? 'bad'
  : i.licences_expired > 0 ? 'warn' : i.open_work > 0 ? 'work' : null);

// A closed Catmull-Rom curve through the points, as cubic Béziers.
function smooth(pts) {
  const n = pts.length;
  if (n < 3) return '';
  const f = (v) => v.toFixed(1);
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])},${f(p2[1])}`;
  }
  return `${d}Z`;
}

const textW = (s, size) => s.length * size * 0.6;
const overlaps = (b, list) => list.some((p) => b.x0 < p.x1 && b.x1 > p.x0 && b.y0 < p.y1 && b.y1 > p.y0);
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

// Where to look: the shown atolls' outlines and islands, fitted with room
// for the labels beside them.
function fit(codes, islands, w, h, focused) {
  // A shared ring (Ari) counts only on its own side of the split.
  const side = (c) => (p) => !ATOLL_SPLIT[c] || (ATOLL_SPLIT[c].keep === 'north' ? p[1] >= ATOLL_SPLIT[c].lat : p[1] <= ATOLL_SPLIT[c].lat);
  const pts = codes.flatMap((c) => (ATOLL_SHAPES[c] || []).flat().filter(side(c))).concat(islands.map((i) => [i.lon, i.lat]));
  if (!pts.length || w < 50) return null;
  const lons = pts.map((p) => p[0]), lats = pts.map((p) => p[1]);
  const lon = [Math.min(...lons), Math.max(...lons)], lat = [Math.min(...lats), Math.max(...lats)];
  const room = Math.min(130, w * 0.2), top = 26;
  const k = Math.min((w - room * 2) / Math.max(lon[1] - lon[0], 0.15), (h - top * 2) / Math.max(lat[1] - lat[0], 0.15)) * (focused ? 0.82 : 1);
  return { cx: (lon[0] + lon[1]) / 2, cy: (lat[0] + lat[1]) / 2, k };
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
    const still = !from || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (still) { shown.current = target; setView(target); return undefined; }
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
          const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 8));
          for (let s = 0; s <= n; s++) rimPts.push({ x0: x0 + ((x1 - x0) * s) / n - 2, x1: x0 + ((x1 - x0) * s) / n + 2, y0: y0 + ((y1 - y0) * s) / n - 2, y1: y0 + ((y1 - y0) * s) / n + 2, atoll: a.code });
        }
      }
      return { a, rings, split, cutY, outer };
    });

    // Islands: markers first, so labels keep clear of them.
    const r = 7.5;
    const marks = placedIslands.map((i) => ({ i, x: gx(i.lon), y: gy(i.lat), tone: islandTone(i) }));
    const rad = (m) => (m.tone ? r : 4);
    for (const m of marks) if (m.tone || focus === m.i.atoll_code) placed.push({ x0: m.x - rad(m) - 2, x1: m.x + rad(m) + 2, y0: m.y - rad(m) - 2, y1: m.y + rad(m) + 2 });

    // Atoll labels: beside the rim, right or left, nudged up or down until clear.
    const labels = [];
    for (const s of shapes) {
      if (!s.outer.length) continue;
      const xs = s.outer.map((p) => p[0]), ys = s.outer.map((p) => p[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs), midY = (Math.min(...ys) + Math.max(...ys)) / 2;
      const list = placedIslands.filter((i) => i.atoll_code === s.a.code);
      const down = list.reduce((n, i) => n + Number(i.down_count || 0), 0);
      const work = list.reduce((n, i) => n + Number(i.open_work || 0), 0);
      const sub = [`${list.length} island${list.length === 1 ? '' : 's'}`, down ? `${down} down` : null, work ? `${work} open work` : null].filter(Boolean).join(' · ');
      const title = `${s.a.code}  ${s.a.name}`;
      const lw = Math.max(textW(title, 13.5), textW(sub, 11.5)) + 8, lh = 34;
      const others = [...placed, ...rimPts.filter((p) => p.atoll !== s.a.code)];
      let best = null;
      search: for (const dy of [0, 1, -1, 2, -2, 3, -3, 4, -4]) {
        for (const [anchor, x] of [['start', maxX + 10], ['end', minX - 10], ['start', maxX + 30], ['end', minX - 30]]) {
          const y = midY + dy * lh * 0.6;
          const x0 = anchor === 'start' ? x : x - lw;
          const b = { x0: x0 - 3, x1: x0 + lw + 3, y0: y - 16, y1: y + lh - 12 };
          if (b.x0 < 2 || b.x1 > w - 2 || b.y0 < 2 || b.y1 > h - 2 || overlaps(b, others)) continue;
          best = { anchor, x, y, b };
          break search;
        }
      }
      // Nowhere clear: the side with more room, kept inside the map.
      if (!best) best = w - maxX >= minX ? { anchor: 'start', x: Math.min(maxX + 10, w - lw - 4), y: midY, b: null } : { anchor: 'end', x: Math.max(minX - 10, lw + 4), y: midY, b: null };
      if (best.b) placed.push(best.b);
      labels.push({ s, title: s.a.code, name: s.a.name, sub, down, ...best });
    }

    // Island names: for islands with a marker, and every island of the chosen atoll.
    const names = [];
    const named = marks.filter((m) => m.tone || focus === m.i.atoll_code)
      .sort((p, q) => (q.tone === 'bad') - (p.tone === 'bad') || Number(q.i.open_work || 0) - Number(p.i.open_work || 0));
    for (const m of named) {
      const size = focus ? 12 : 11;
      const tw = textW(m.i.name, size) + 4;
      const off = rad(m) + 5;
      for (const [x, y, anchor] of [[m.x + off, m.y + 4, 'start'], [m.x - off, m.y + 4, 'end'], [m.x, m.y - off - 2, 'middle'], [m.x, m.y + off + 11, 'middle']]) {
        const x0 = anchor === 'start' ? x : anchor === 'end' ? x - tw : x - tw / 2;
        const b = { x0, x1: x0 + tw, y0: y - size, y1: y + 3 };
        if (b.x0 < 2 || b.x1 > w - 2 || b.y0 < 2 || b.y1 > h - 2 || overlaps(b, [...placed, ...rimPts.filter((p) => p.atoll !== m.i.atoll_code)])) continue;
        placed.push(b);
        names.push({ m, x, y, anchor, size });
        break;
      }
    }

    const open = (i) => navigate(`/islands/${i.id}`);
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
        const on = focus === s.a.code, dim = focus && !on;
        const d = smooth(s.rings[0]);
        const extra = s.rings.slice(1).map(smooth).join(' ');
        return <g key={s.a.code} className={`am-atoll${on ? ' on' : ''}`} opacity={dim ? 0.32 : 1} onClick={(e) => { e.stopPropagation(); onAtoll(on ? null : s.a.code); }}>
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
      {labels.map((l) => <g key={l.s.a.code} className="am-label" opacity={focus && focus !== l.s.a.code ? 0.4 : 1} onClick={(e) => { e.stopPropagation(); onAtoll(focus === l.s.a.code ? null : l.s.a.code); }}>
        <text x={l.x} y={l.y} textAnchor={l.anchor} className="am-code"><tspan>{l.title}</tspan><tspan className="am-name" dx="6">{l.name}</tspan></text>
        <text x={l.x} y={l.y + 15} textAnchor={l.anchor} className={`am-sub${l.down ? ' bad' : ''}`}>{l.sub}</text>
      </g>)}
      {marks.sort((p, q) => !!p.tone - !!q.tone).map((m) => {
        const dim = focus && focus !== m.i.atoll_code;
        const label = `${m.i.atoll_code}. ${m.i.name}${m.i.down_count > 0 ? ` · ${m.i.down_count} genset${m.i.down_count > 1 ? 's' : ''} down` : ''}${m.i.open_incidents > 0 ? ` · ${m.i.open_incidents} open interruption${m.i.open_incidents > 1 ? 's' : ''}` : ''}${m.i.licences_expired > 0 ? ' · licence expired' : ''}${m.i.open_work > 0 ? ` · ${m.i.open_work} open work` : ''}`;
        return <g key={m.i.id} className={`am-island${m.tone ? ` t-${m.tone}` : ''}`} opacity={dim ? 0.3 : 1} role="link" tabIndex={dim ? -1 : 0} aria-label={label}
          onClick={(e) => { e.stopPropagation(); open(m.i); }} onKeyDown={(e) => { if (e.key === 'Enter') open(m.i); }}>
          <title>{label}</title>
          {m.tone ? <>
            <circle cx={m.x} cy={m.y} r={r} className="am-mark" />
            <circle cx={m.x} cy={m.y} r={r + 1.5} className="am-halo" />
            {m.tone === 'work' && m.i.open_work > 1 && <text x={m.x} y={m.y} dy=".35em" textAnchor="middle" className="am-badge">{m.i.open_work}</text>}
          </> : <circle cx={m.x} cy={m.y} r={focus === m.i.atoll_code ? 3.6 : 2.4} className="am-dot" />}
          <circle cx={m.x} cy={m.y} r={12} fill="transparent" />
        </g>;
      })}
      {names.map((n) => <text key={n.m.i.id} x={n.x} y={n.y} textAnchor={n.anchor} className="am-iname" fontSize={n.size}
        opacity={focus && focus !== n.m.i.atoll_code ? 0.3 : 1}>{n.m.i.name}</text>)}
    </svg>;
  }

  return <div className="atoll-map">
    <div className="am-canvas" ref={box} onClick={() => focus && onAtoll(null)}>{svg}</div>
    <div className="am-legend small">
      <span><i className="t-bad" /> Gensets down or interruption</span>
      <span><i className="t-warn" /> Licence expired</span>
      <span><i className="t-work" /> Open work</span>
      <span><i className="quiet" /> All clear</span>
      {focus && <button type="button" className="btn small ghost" onClick={() => onAtoll(null)}>All atolls</button>}
    </div>
  </div>;
}

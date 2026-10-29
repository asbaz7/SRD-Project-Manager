// The department's atolls as a map, drawn as on the TV board: true
// geography (one scale both ways), reef outlines with a lagoon fill and a
// soft glow, and every island as a named dot. Names keep clear of rims, dots and each other, with a
// leader line where they have to sit further out. Choosing an atoll eases
// the map onto it. Drag to move, scroll or pinch to zoom, or use the
// buttons; the reset button (or choosing an atoll) frames the map again.
// Pressing an island flies the map onto it, then fades into its page.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { useNavigate } from 'react-router-dom';
import { ATOLL_SHAPES, ATOLL_SPLIT } from '../atollShapes.js';


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
  // Phones leave room at the top for the islands card over the map.
  const room = w < 520 ? 44 : Math.min(170, w * 0.24), top = w < 520 ? 74 : 34;
  const k = Math.min((w - room * 2) / Math.max(lon[1] - lon[0], 0.15), (h - top * 2) / Math.max(lat[1] - lat[0], 0.15)) * (focused ? 0.8 : 1);
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

  // The person's own pan and zoom, on top of the framed view. Choosing an
  // atoll (or the reset button) starts it afresh.
  const [pz, setPz] = useState({ z: 1, dx: 0, dy: 0 });
  useEffect(() => { setPz({ z: 1, dx: 0, dy: 0 }); }, [focus]);
  const zoomAt = (f, sx, sy) => setPz((p) => {
    const z = Math.min(12, Math.max(0.6, p.z * f)), q = z / p.z;
    const cx = sx ?? size.w / 2, cy = sy ?? size.h / 2;
    return { z, dx: cx - size.w / 2 - (cx - size.w / 2 - p.dx) * q, dy: cy - size.h / 2 - (cy - size.h / 2 - p.dy) * q };
  });
  // Wheel zoom (a listener of our own: React's is passive and can't stop the page scrolling).
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const b = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)), e.clientX - b.left, e.clientY - b.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });
  // Drag to move; two fingers to pinch. A drag is never taken for a tap.
  const drag = useRef({ pts: new Map(), moved: false });
  const onPointerDown = (e) => {
    const d = drag.current;
    if (d.pts.size === 0) { d.moved = false; d.start = { x: e.clientX, y: e.clientY }; }
    d.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    const prev = d.pts.get(e.pointerId);
    if (!prev) return;
    const next = { x: e.clientX, y: e.clientY };
    if (d.pts.size === 1) {
      const mx = next.x - prev.x, my = next.y - prev.y;
      if (Math.abs(mx) + Math.abs(my) > 0) {
        if (!d.moved && Math.hypot(next.x - d.start.x, next.y - d.start.y) < 4) return;
        d.moved = true;
        setPz((p) => ({ ...p, dx: p.dx + mx, dy: p.dy + my }));
      }
    } else if (d.pts.size === 2) {
      const [a, b] = [...d.pts.entries()].map(([id, pt]) => (id === e.pointerId ? next : pt));
      const [a0, b0] = [...d.pts.values()];
      const r0 = Math.hypot(b0.x - a0.x, b0.y - a0.y), r1 = Math.hypot(b.x - a.x, b.y - a.y);
      if (r0 > 0) {
        const rect = box.current.getBoundingClientRect();
        d.moved = true;
        zoomAt(r1 / r0, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
      }
    }
    d.pts.set(e.pointerId, next);
  };
  const onPointerUp = (e) => { drag.current.pts.delete(e.pointerId); };
  const tapped = () => !drag.current.moved;

  // Pressing an island: the map flies onto it (zooming in, the island
  // gliding to the centre, ringed), then its page fades in.
  const [going, setGoing] = useState(null);
  const fly = useRef(0);
  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const goTo = (i) => {
    const url = `/islands/${i.id}`;
    const go = () => (document.startViewTransition && !reduced() ? document.startViewTransition(() => navigate(url)) : navigate(url));
    if (!view || reduced()) { go(); return; }
    const from = pz, k0 = view.k;
    const ox = (i.lon - view.cx) * k0, oy = (i.lat - view.cy) * k0;
    const x0 = from.dx + ox * from.z, y0 = from.dy - oy * from.z;      // where it sits now, from the centre
    const zt = Math.min(12, Math.max(from.z * 2.6, 3.5));
    setGoing(i.id);
    cancelAnimationFrame(fly.current);
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / 520), e = ease(p);
      const z = Math.exp(Math.log(from.z) + (Math.log(zt) - Math.log(from.z)) * e);
      const x = x0 * (1 - e), y = y0 * (1 - e);                         // glides to the centre
      setPz({ z, dx: x - ox * z, dy: y + oy * z });
      if (p < 1) fly.current = requestAnimationFrame(step); else go();
    };
    fly.current = requestAnimationFrame(step);
  };
  useEffect(() => () => cancelAnimationFrame(fly.current), []);

  const { w, h } = size;
  let svg = null;
  if (view && w > 50) {
    const k = view.k * pz.z;
    const gx = (lon) => w / 2 + pz.dx + (lon - view.cx) * k;
    const gy = (lat) => h / 2 + pz.dy - (lat - view.cy) * k;
    // The islands card floats top left and the zoom buttons at the side
    // (top right on phones, bottom right otherwise): labels keep clear.
    const placed = [{ x0: 0, y0: 0, x1: w < 520 ? 210 : 236, y1: w < 520 ? 66 : 92 },
      w < 520 ? { x0: w - 54, y0: 0, x1: w, y1: 130 } : { x0: w - 64, y0: h - 150, x1: w, y1: h }];
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
    const marks = placedIslands.map((i) => ({ i, x: gx(i.lon), y: gy(i.lat) }));
    const rad = () => (small ? 3.5 : 4.5);
    for (const m of marks) {
      const e = rad(m) + 2;
      placed.push({ x0: m.x - e, x1: m.x + e, y0: m.y - e, y1: m.y + e });
    }

    // Atoll labels: beside the rim, right or left, nudged up or down until clear.
    const labels = [];
    for (const s of shapes) {
      if (!s.outer.length) continue;
      const xs = s.outer.map((p) => p[0]), ys = s.outer.map((p) => p[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs), midY = (Math.min(...ys) + Math.max(...ys)) / 2;
      const count = placedIslands.filter((i) => i.atoll_code === s.a.code).length;
      const sub = `${count} island${count === 1 ? '' : 's'}`;
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
      labels.push({ s, sub, head, ...best });
    }

    // Island names: for islands with a marker, and every island of the
    // chosen atoll. Beside the marker if there is room, else further out
    // with a leader line.
    const names = [];
    const leaders = [];
    const named = marks;
    for (const m of named) {
      const fs = small ? 10 : 12.5;
      const tw = textW(m.i.name, fs) + 4;
      const off = rad(m) + 5;
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
          onClick={(e) => { e.stopPropagation(); if (tapped()) onAtoll(on ? null : s.a.code); }}>
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
          onClick={(e) => { e.stopPropagation(); if (tapped()) onAtoll(focus === l.s.a.code ? null : l.s.a.code); }}>
          <text x={l.x} y={l.y} textAnchor={l.anchor} className="am-code"><tspan>{l.s.a.code}</tspan>{!small && <tspan className="am-name" dx="8">{l.s.a.name}</tspan>}</text>
          {!small && <text x={l.x} y={l.y + 21} textAnchor={l.anchor} className="am-sub">
            {l.sub}
          </text>}
        </g>;
      })}
      {leaders.map((ld) => <line key={ld.id} className="am-leader" x1={ld.x1} y1={ld.y1} x2={ld.x2} y2={ld.y2} />)}
      {marks.map((m) => {
        const dim = dimA(m.i.atoll_code);
        const label = `${m.i.atoll_code}. ${m.i.name}`;
        return <g key={m.i.id} className="am-island" opacity={dim ? 0.3 : 1} role="link"
          tabIndex={dim ? -1 : 0} aria-label={label} onClick={(e) => { e.stopPropagation(); if (tapped() && !going) goTo(m.i); }} onKeyDown={(e) => { if (e.key === 'Enter' && !going) goTo(m.i); }}>
          <title>{label}</title>
          {going === m.i.id && <circle cx={m.x} cy={m.y} r={rad(m) + 7} className="am-going" />}
          <circle cx={m.x} cy={m.y} r={rad(m)} className="am-dot" />
          <circle cx={m.x} cy={m.y} r={small ? 12 : 9} fill="transparent" />
        </g>;
      })}
      {names.map((t) => <text key={t.m.i.id} x={t.x} y={t.y} textAnchor={t.anchor} className="am-iname" fontSize={t.fs}
        opacity={dimA(t.m.i.atoll_code) ? 0.3 : 1}>{t.m.i.name}</text>)}
    </svg>;
  }

  return <div className="atoll-map">
    <div className={`am-canvas${pz.z !== 1 || pz.dx || pz.dy ? ' moved' : ''}`} ref={box} onClick={() => focus && tapped() && onAtoll(null)}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onPointerLeave={onPointerUp}>
      {svg}
      <div className="am-zoom glass" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => zoomAt(1.5)} aria-label="Zoom in"><Icon name="plus" size={18} /></button>
        <button type="button" onClick={() => zoomAt(1 / 1.5)} aria-label="Zoom out"><Icon name="minus" size={18} /></button>
        <button type="button" onClick={() => setPz({ z: 1, dx: 0, dy: 0 })} aria-label="Show the whole map"><Icon name="home" size={18} /></button>
      </div>
    </div>
    {focus && <div className="am-legend small">
      <span>{atolls.find((a) => a.code === focus)?.name || focus}</span>
      <button type="button" className="btn small ghost" onClick={() => onAtoll(null)}>All atolls</button>
    </div>}
  </div>;
}

dash.calc('board', {
  inputs: ['tasks'],
  title: 'Task list with time left',
  description: 'Each task (planned, ongoing, on hold or completed) with its start and due dates, days left (from today) and an order: overdue first, then by due date, planned after work under way, completed last. An older "Not started" status counts as Planned.',
  fn: (tasks) => {
    const now = new Date();
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const fmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    const rows = tasks.map((r) => {
      const progress = Number(r.progress) || 0;
      const due = Date.parse(String(r.due || '').slice(0, 10) + 'T00:00:00Z');
      const hasDue = Number.isFinite(due);
      const days = hasDue ? Math.round((due - today) / 864e5) : Infinity;
      const status = r.status === 'Not started' ? 'Planned' : r.status;
      const start = Date.parse(String(r.start || '').slice(0, 10) + 'T00:00:00Z');
      const starts_in = Number.isFinite(start) ? Math.round((start - today) / 864e5) : null;
      const done = status === 'Completed';
      const state = done ? 'done' : days < 0 ? 'overdue' : status === 'On hold' ? 'hold' : status === 'Planned' ? 'planned' : days <= 7 ? 'soon' : 'ok';
      const due_note = done ? 'Done'
        : !hasDue ? 'No due date'
        : days < 0 ? (-days) + (days === -1 ? ' day' : ' days') + ' overdue'
        : days === 0 ? 'Due today'
        : days + (days === 1 ? ' day' : ' days') + ' left';
      const rank = done ? 5 : state === 'overdue' ? 0 : state === 'planned' ? 4 : state === 'hold' ? 3 : state === 'soon' ? 1 : 2;
      return { id: r.id, task: r.task, unit: r.unit, island: r.island, category: r.category, status,
        start_label: Number.isFinite(start) ? fmt.format(start) : '', starts_in,
        progress, progress_label: progress + '%', due_label: hasDue ? fmt.format(due) : 'No due date', has_due: hasDue, due_note, days, state, rank, note: r.note || '', assigned: r.assigned || '' };
    });
    return rows.sort((a, b) => a.rank - b.rank || (a.days === b.days ? 0 : a.days - b.days));
  },
});

dash.calc('outage_list', {
  inputs: ['outages'],
  title: 'Power interruptions with status',
  description: 'Each electricity interruption marked Ongoing (started, not restored), Scheduled (starts later) or Restored, with its duration; times in Maldives time. Water and sewerage rows are left out.',
  fn: (outages) => {
    const now = Date.now();
    outages = outages.filter((r) => r.service === 'Electricity');
    const fmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Indian/Maldives' });
    const dur = (m) => (m < 60 ? m + ' min' : Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : ''));
    const rows = outages.map((r) => {
      const s = Date.parse(r.start);
      const e = r.end ? Date.parse(r.end) : null;
      const state = s > now ? 'Scheduled' : (e == null || e > now) ? 'Ongoing' : 'Restored';
      const minutes = e != null ? Math.round((e - s) / 6e4) : null;
      return {
        id: r.id, island: r.island, service: r.service, type: r.type, cause: r.cause, unit: r.unit, state,
        start_ms: s, start_label: fmt.format(s),
        end_label: state === 'Restored' ? fmt.format(e) : e != null ? 'Expected ' + fmt.format(e) : 'Not yet',
        minutes,
        duration_label: state === 'Restored' ? dur(minutes) : state === 'Scheduled' ? (minutes != null ? dur(minutes) + ' planned' : 'Planned') : 'Still off',
      };
    });
    const rank = { Ongoing: 0, Scheduled: 1, Restored: 2 };
    return rows.sort((a, b) => rank[a.state] - rank[b.state] || (a.state === 'Scheduled' ? a.start_ms - b.start_ms : b.start_ms - a.start_ms));
  },
});

dash.calc('outage_summary', {
  inputs: ['outage_list'],
  title: 'Power interruption counts',
  description: 'Ongoing and planned interruptions now, and for interruptions that started this month: count, unplanned count, total hours without service (restored ones) and average restore time of unplanned ones.',
  fn: (outage_list) => {
    const tz = 'Indian/Maldives';
    const ym = (ms) => {
      const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit' }).formatToParts(ms);
      return p.find((x) => x.type === 'year').value + '-' + p.find((x) => x.type === 'month').value;
    };
    const dur = (m) => (m < 60 ? m + ' min' : Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : ''));
    const nowMs = Date.now();
    const thisMonth = ym(nowMs);
    const month = outage_list.filter((r) => r.state !== 'Scheduled' && ym(r.start_ms) === thisMonth);
    const restored = month.filter((r) => r.state === 'Restored');
    const unplanned = restored.filter((r) => r.type === 'Unplanned');
    const totalMin = restored.reduce((s, r) => s + r.minutes, 0);
    const avg = unplanned.length ? Math.round(unplanned.reduce((s, r) => s + r.minutes, 0) / unplanned.length) : 0;
    return [{
      ongoing: outage_list.filter((r) => r.state === 'Ongoing').length,
      scheduled: outage_list.filter((r) => r.state === 'Scheduled').length,
      month_label: new Intl.DateTimeFormat('en-GB', { timeZone: tz, month: 'long' }).format(nowMs),
      month_count: month.length,
      month_unplanned: month.filter((r) => r.type === 'Unplanned').length,
      month_hours_label: (totalMin / 60).toFixed(1) + ' h',
      avg_restore_label: unplanned.length ? dur(avg) : '—',
    }];
  },
});

dash.calc('team_list', {
  inputs: ['team'],
  title: 'Staff status on the latest day',
  description: 'Each staff member on the most recent attendance date, with their status and when they are back.',
  fn: (team) => {
    const latest = team.reduce((m, r) => (String(r.date) > m ? String(r.date) : m), '');
    const fmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    const order = { 'Present': 0, 'On island duty': 1, 'Salaam': 2, 'Annual leave': 3, 'FRL': 4, 'Sick leave': 5 };
    return team.filter((r) => String(r.date) === latest).map((r) => {
      const until = r.until ? fmt.format(Date.parse(String(r.until).slice(0, 10) + 'T00:00:00Z')) : '';
      const detail = [r.note, until ? 'until ' + until : ''].filter(Boolean).join(' · ');
      return { staff_id: r.staff_id, name: r.name, unit: r.unit, role: r.role, status: r.status, detail, location: r.status === 'On island duty' ? (r.note || '') : '',
        working: r.status === 'Present' || r.status === 'On island duty', rank: order[r.status] ?? 9, date: latest };
    }).sort((a, b) => a.rank - b.rank || String(a.name).localeCompare(String(b.name)));
  },
});

dash.calc('team_summary', {
  inputs: ['team_list'],
  title: 'Staff counts today',
  description: 'How many staff are working (in office or on island duty) and how many are on each kind of leave, on the latest attendance date.',
  fn: (team_list) => {
    const c = (s) => team_list.filter((r) => r.status === s).length;
    const date = team_list.length ? team_list[0].date : '';
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Indian/Maldives', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(Date.now());
    const today = ['year', 'month', 'day'].map((t) => p.find((x) => x.type === t).value).join('-');
    return [{
      total: team_list.length,
      at_work: team_list.filter((r) => r.working).length,
      present: c('Present'), island_duty: c('On island duty'), salaam: c('Salaam'), annual: c('Annual leave'), frl: c('FRL'), sick: c('Sick leave'),
      as_of_label: date ? new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(Date.parse(date + 'T00:00:00Z')) : '—',
      is_today: date === today,
    }];
  },
});

dash.calc('outage_daily', {
  inputs: ['outage_list'],
  title: 'Hours without power per day',
  description: 'For each day of the current month (Maldives time): minutes without power from restored interruptions that started that day, split into breakdowns (unplanned) and planned shutdowns.',
  fn: (outage_list) => {
    const tz = 'Indian/Maldives';
    const parts = (ms) => {
      const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(ms);
      const g = (t) => Number(p.find((x) => x.type === t).value);
      return { y: g('year'), m: g('month'), d: g('day') };
    };
    const now = parts(Date.now());
    const days = new Date(Date.UTC(now.y, now.m, 0)).getUTCDate();
    const rows = [];
    for (let d = 1; d <= days; d++) {
      const label = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(Date.UTC(now.y, now.m - 1, d));
      rows.push({ day: d, date_label: label, unplanned_min: 0, planned_min: 0, unplanned_n: 0, planned_n: 0, is_future: d > now.d, is_today: d === now.d });
    }
    for (const r of outage_list) {
      if (r.state !== 'Restored') continue;
      const p = parts(r.start_ms);
      if (p.y !== now.y || p.m !== now.m) continue;
      const row = rows[p.d - 1];
      if (r.type === 'Unplanned') { row.unplanned_min += r.minutes; row.unplanned_n += 1; }
      else { row.planned_min += r.minutes; row.planned_n += 1; }
    }
    return rows;
  },
});

dash.calc('summary', {
  inputs: ['board'],
  title: 'Headline counts',
  description: 'Total tasks, and counts of open, overdue, due-this-week, on-hold and completed tasks, and the average progress of open tasks.',
  fn: (board) => {
    const open = board.filter((r) => r.state !== 'done');
    const avg = open.length ? Math.round(open.reduce((s, r) => s + r.progress, 0) / open.length) : 0;
    return [{
      total: board.length,
      active: open.length,
      overdue: open.filter((r) => r.state === 'overdue').length,
      due_week: open.filter((r) => r.days >= 0 && r.days <= 7).length,
      on_hold: open.filter((r) => r.status === 'On hold').length,
      planned: open.filter((r) => r.status === 'Planned').length,
      completed: board.length - open.length,
      avg_progress_label: avg + '%',
    }];
  },
});

dash.calc('by_unit', {
  inputs: ['board'],
  title: 'Tasks per unit',
  description: 'For each of the five SCRD units: open, overdue, due-this-week and completed tasks, and the average progress of its open tasks.',
  fn: (board) => {
    const units = ['Electrical Services Unit', 'Mechanical Services Unit', 'Water and Sewage Services Unit', 'Administration and Support Service Unit', 'Logistics Unit'];
    return units.map((unit) => {
      const all = board.filter((r) => r.unit === unit);
      const open = all.filter((r) => r.state !== 'done');
      const avg = open.length ? Math.round(open.reduce((s, r) => s + r.progress, 0) / open.length) : 0;
      return {
        unit,
        open: open.length,
        overdue: open.filter((r) => r.state === 'overdue').length,
        due_week: open.filter((r) => r.days >= 0 && r.days <= 7).length,
        completed: all.length - open.length,
        avg_progress: avg,
        avg_progress_label: avg + '%',
      };
    });
  },
});

dash.calc('island_tasks', {
  inputs: ['islands', 'board', 'outage_list'],
  title: 'Open tasks per island',
  description: 'Each island SCRD serves with its position, open tasks (count, overdue, most urgent status) and whether its power is off now.',
  fn: (islands, board, outage_list) => islands.map((i) => {
    const open = board.filter((t) => t.island === i.island && t.state !== 'done');
    const overdue = open.filter((t) => t.state === 'overdue').length;
    const top_status = overdue ? 'Overdue' : ['In progress', 'On hold', 'Planned'].find((s) => open.some((t) => t.status === s)) || '';
    return {
      island: i.island, atoll: i.atoll, atoll_name: i.atoll_name, lat: Number(i.lat), lon: Number(i.lon),
      open: open.length, overdue, top_status,
      power_off: outage_list.some((o) => o.island === i.island && o.state === 'Ongoing'),
      task_ids: open.map((t) => t.id).join(','),
      task_lines: open.map((t) => t.task + ': ' + (t.state === 'overdue' ? t.due_note : t.status) + ', ' + t.progress_label).join('\n'),
    };
  }),
});

dash.calc('atoll_summary', {
  inputs: ['island_tasks', 'board'],
  title: 'Open tasks per atoll',
  description: 'For each atoll: islands, islands with open tasks, open and overdue tasks, average progress of open tasks, islands without power now. An "Office" row counts open tasks at the SCRD office and workshop.',
  fn: (island_tasks, board) => {
    const atolls = [];
    for (const r of island_tasks) if (!atolls.some((a) => a.atoll === r.atoll)) atolls.push({ atoll: r.atoll, atoll_name: r.atoll_name });
    const rows = atolls.map((a) => {
      const isl = island_tasks.filter((r) => r.atoll === a.atoll);
      return { atoll: a.atoll, atoll_name: a.atoll_name, islands: isl.length, islands_with_tasks: isl.filter((r) => r.open).length,
        open: isl.reduce((s, r) => s + r.open, 0), overdue: isl.reduce((s, r) => s + r.overdue, 0), power_off: isl.filter((r) => r.power_off).length,
        avg_progress: (() => { const ids = new Set(isl.flatMap((r) => String(r.task_ids || '').split(',').filter(Boolean))); const ts = board.filter((t) => ids.has(t.id)); return ts.length ? Math.round(ts.reduce((s, t) => s + t.progress, 0) / ts.length) : 0; })() };
    });
    const known = new Set(island_tasks.map((r) => r.island));
    const off = board.filter((t) => !known.has(t.island) && t.state !== 'done');
    rows.push({ atoll: 'Office', atoll_name: 'SCRD office, workshop and other locations', islands: 0, islands_with_tasks: 0, open: off.length, overdue: off.filter((t) => t.state === 'overdue').length, power_off: 0,
      avg_progress: off.length ? Math.round(off.reduce((s, t) => s + t.progress, 0) / off.length) : 0 });
    return rows;
  },
});

dash.calc('task_status', {
  inputs: ['board'],
  title: 'Tasks per status',
  description: 'Number of tasks in each status (In progress, On hold, Planned, Completed) and its share of all tasks.',
  fn: (board) => ['In progress', 'On hold', 'Planned', 'Completed'].map((status) => {
    const n = board.filter((r) => r.status === status).length;
    return { status, count: n, share_label: board.length ? Math.round(n / board.length * 100) + '%' : '0%' };
  }),
});

(() => {
  const root = document.getElementById('gx');
  const mapBox = document.getElementById('map');
  const side = document.getElementById('side');
  const tip = document.getElementById('tip');
  const css = (n) => getComputedStyle(root).getPropertyValue(n).trim();
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const isBad = (s) => ['error', 'connect', 'declined', 'missing'].includes(s.status);
  const pending = (box, s) => { if (isBad(s)) box.replaceChildren(el('div', 'failed', 'Failed to load')); else box.replaceChildren(); };
  const pill = (c, text) => { const p = el('span', 'pill', text); p.style.setProperty('--c', c); return p; };
  const over = (box) => box.scrollHeight > box.clientHeight + 1;
  const short = (s) => String(s).replace(/^[A-Za-z]+\.\s*/, '');
  const ok = (id) => { const s = dash.data(id); return s.status === 'ok' ? s.data : null; };
  const reduce = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TASK_C = { 'In progress': '--t-prog', 'On hold': '--t-hold', 'Planned': '--t-plan', 'Completed': '--t-done' };
  const tzDay = (ms) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Indian/Maldives', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);

  // clock
  const tick = () => {
    const d = new Date();
    document.getElementById('clock-time').textContent = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Indian/Maldives' });
    document.getElementById('clock-date').textContent = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Indian/Maldives' });
  };
  tick(); setInterval(tick, 20000);

  // tooltips
  root.addEventListener('mouseover', (ev) => {
    const t = ev.target.closest && ev.target.closest('[data-tip]');
    if (!t) { tip.hidden = true; return; }
    tip.textContent = t.getAttribute('data-tip'); tip.hidden = false;
    const r = t.getBoundingClientRect(); const o = root.getBoundingClientRect();
    const left = Math.min(Math.max(4, r.left - o.left + r.width / 2 - tip.offsetWidth / 2), o.width - tip.offsetWidth - 4);
    let top = r.top - o.top - tip.offsetHeight - 8; if (top < 4) top = r.bottom - o.top + 8;
    tip.style.left = left + 'px'; tip.style.top = top + 'px';
  });
  root.addEventListener('mouseleave', () => { tip.hidden = true; });

  // hide the pointer after a few idle seconds (TV)
  let hideT = null;
  const wake = () => { root.classList.remove('idle'); clearTimeout(hideT); hideT = setTimeout(() => root.classList.add('idle'), 4000); };
  root.addEventListener('mousemove', wake); root.addEventListener('pointerdown', wake); wake();

  // sizing
  let MODE = 'tv';
  const size = () => {
    const w = root.clientWidth || window.innerWidth;
    const narrow = w < 1000;
    MODE = narrow ? 'narrow' : 'tv';
    root.classList.toggle('narrow', narrow);
    root.classList.toggle('tv', !narrow);
    if (!narrow) {
      const top = document.fullscreenElement === root ? 0 : root.getBoundingClientRect().top + window.scrollY;
      const h = Math.max(560, window.innerHeight - top - 6);
      root.style.setProperty('--tv-h', h + 'px');
      root.style.setProperty('--tv-fs', Math.max(12, Math.min(w * 0.0078, h * 0.0146)).toFixed(2) + 'px');
    }
  };

  const fill = (id) => {
    const rows = ok(id) || [];
    root.querySelectorAll('[data-source="' + id + '"][data-field]').forEach((n) => {
      let row = null;
      if (n.dataset.where) { const i = n.dataset.where.indexOf('='); const k = n.dataset.where.slice(0, i), v = n.dataset.where.slice(i + 1); row = rows.find((r) => String(r[k]) === v); }
      else if (n.dataset.row != null) row = rows[Number(n.dataset.row)];
      n.textContent = row ? String(row[n.dataset.field]) : '—';
    });
  };

  // ---------- power ----------
  const svgPath = (d, cls) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2.2'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('stroke-linecap', 'round'); const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); s.appendChild(p); if (cls) s.setAttribute('class', cls); return s; };
  // one row style used everywhere: status label | title + detail | figure
  const naRow = (cls, when, title, sub, right, onClick, tipT, tag) => {
    const b = el(tag || (onClick ? 'button' : 'div'), 'na-r ' + cls); if (b.tagName === 'BUTTON') b.type = 'button';
    const mid = el('span', 'na-m'); mid.append(el('span', 'na-t', title), el('span', 'na-s', sub));
    b.append(el('span', 'na-w', when), mid, el('span', 'na-x', right || ''));
    if (onClick) b.addEventListener('click', (ev) => { ev.stopPropagation(); onClick(); });
    if (tipT) b.setAttribute('data-tip', tipT);
    return b;
  };
  const unitS = (u) => String(u || '').replace(/ Services? Unit$| Unit$/, '').replace('Administration and Support', 'Admin & Support').replace('Water and Sewage', 'Water & Sewage');
  const hm = (lbl) => String(lbl).replace(/^.*?,\s*/, '');
  const evItem = (r, scheduled) => {
    const d = naRow(scheduled ? 'shut' : 'over', scheduled ? 'Today ' + hm(r.start_label) : (r.type === 'Planned' ? 'Planned' : 'No power'), short(r.island) + (scheduled ? ' shutdown' : ''),
      r.cause + ' · ' + unitS(r.unit), scheduled ? r.duration_label.replace(' planned', '') : 'since ' + String(r.start_label).split(',')[0], null, null, 'div');
    d.setAttribute('data-tip', r.island + (scheduled ? '\nShutdown ' + r.start_label + ', ' + r.duration_label : '\nOff since ' + r.start_label) + '\n' + r.cause + '\n' + r.unit);
    return d;
  };
  const drawPower = () => {
    const state = document.getElementById('pw-state'), box = document.getElementById('ev-list');
    const s = dash.data('outage_list');
    if (s.status !== 'ok') { pending(state, s); box.replaceChildren(); return; }
    const today = tzDay(Date.now());
    const on = s.data.filter((r) => r.state === 'Ongoing');
    const tod = s.data.filter((r) => r.state === 'Scheduled' && tzDay(r.start_ms) === today);
    const c = on.length ? css('--red') : tod.length ? css('--amber') : css('--green');
    const lamp = el('span', 'lamp' + (on.length ? ' pulse' : '')); lamp.style.setProperty('--c', c); lamp.appendChild(svgPath('M13 2 4 14h7l-1 8 9-12h-7z'));
    const parts = [];
    if (on.length) parts.push(on.length + (on.length === 1 ? ' island without power' : ' islands without power'));
    if (tod.length) parts.push(tod.length + (tod.length === 1 ? ' shutdown today' : ' shutdowns today'));
    const t = el('div'); const none = !s.data.length;
    t.append(el('b', '', parts.length ? parts.join(', ') : none ? 'No interruptions logged' : 'All islands have power'), el('span', '', parts.length ? 'Tap for the full picture' : none ? 'Waiting for the interruption log' : 'No shutdowns scheduled today'));
    if (none && !parts.length) lamp.style.setProperty('--c', css('--ink3'));
    state.replaceChildren(lamp, t);
    box.replaceChildren(...on.map((r) => evItem(r, false)), ...tod.map((r) => evItem(r, true)));
    box.hidden = !box.children.length;
    if (MODE !== 'tv') return;
    let hidden = 0; const more = el('div', 'more');
    while (over(box) && box.querySelectorAll('.na-r').length > 1) { [...box.querySelectorAll('.na-r')].pop().remove(); hidden++; more.textContent = '+' + hidden + ' more'; box.appendChild(more); }
  };
  const nowCard = document.getElementById('now');
  nowCard.addEventListener('click', () => go({ kind: 'power' }));
  nowCard.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go({ kind: 'power' }); } });

  const fmtMin = (m) => (m < 60 ? m + ' min' : Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : ''));
  const drawMonthInto = (box) => {
    const s = dash.data('outage_daily');
    if (s.status !== 'ok') return pending(box, s);
    const rows = s.data;
    const W = Math.max(200, box.clientWidth), H = Math.max(60, box.clientHeight);
    const svg = d3.create('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
    box.replaceChildren(svg.node());
    const maxH = Math.max(1, d3.max(rows, (r) => (r.unplanned_min + r.planned_min) / 60));
    const base = H - 16;
    const y = d3.scaleLinear([0, maxH], [base, 4]);
    const x = d3.scaleBand(rows.map((r) => r.day), [0, W]).paddingInner(0.3);
    const bw = x.bandwidth();
    const cell = Math.max(4, Math.min(bw, 10)), gp = 2;
    const nRows = Math.max(4, Math.floor((base - 4) / (cell + gp)));
    const perCell = maxH / nRows;
    for (const r of rows) {
      const cx = x(r.day) + (bw - cell) / 2;
      const t = r.date_label + '\n' + (r.unplanned_n || r.planned_n
        ? [r.unplanned_n ? 'Breakdowns: ' + r.unplanned_n + ', ' + fmtMin(r.unplanned_min) : '', r.planned_n ? 'Planned: ' + r.planned_n + ', ' + fmtMin(r.planned_min) : ''].filter(Boolean).join('\n')
        : (r.is_future ? 'Still to come' : 'No interruptions'));
      const uN = Math.round((r.unplanned_min / 60) / perCell), pN = Math.round((r.planned_min / 60) / perCell);
      const uCells = r.unplanned_min > 0 ? Math.max(1, uN) : 0, pCells = r.planned_min > 0 ? Math.max(1, pN) : 0;
      for (let i = 0; i < nRows; i++) {
        const yy = base - (i + 1) * (cell + gp) + gp;
        const fillC = r.is_future ? 'rgba(255,255,255,.035)' : i < uCells ? css('--red') : i < uCells + pCells ? css('--amber') : 'rgba(255,255,255,.06)';
        svg.append('rect').attr('x', cx).attr('y', yy).attr('width', cell).attr('height', cell).attr('rx', 1.5).attr('fill', fillC).attr('pointer-events', 'none');
      }
      svg.append('rect').attr('x', x(r.day) - 1).attr('y', 0).attr('width', bw + 2).attr('height', base).attr('fill', 'transparent').attr('data-tip', t);
    }
    const today = rows.find((r) => r.is_today);
    const kept = [];
    for (const r of [rows[0], today, rows[rows.length - 1]].filter(Boolean)) {
      const t = svg.append('text').attr('y', H - 2).attr('text-anchor', 'middle').attr('x', x(r.day) + bw / 2).attr('font-weight', r.is_today ? 700 : null).attr('fill', r.is_today ? '#fff' : null).text(r.is_today ? 'Today' : r.day);
      const w = t.node().getComputedTextLength();
      let x0 = x(r.day) + bw / 2 - w / 2;
      if (x0 < 0) { t.attr('text-anchor', 'start').attr('x', 0); x0 = 0; }
      if (x0 + w > W) { t.attr('text-anchor', 'end').attr('x', W); x0 = W - w; }
      if (kept.some((k) => x0 < k[1] + 4 && x0 + w > k[0] - 4)) t.remove(); else kept.push([x0, x0 + w]);
    }
  };

  // ---------- tasks ----------
  const drawTasks = () => {
    const ts = ok('task_status') || [];
    const n = (st) => { const r = ts.find((x) => x.status === st); return r ? r.count : 0; };
    document.getElementById('tb-prog').classList.toggle('is-zero', n('In progress') === 0);
    const hb = document.getElementById('tb-hold');
    hb.classList.toggle('is-zero', n('On hold') === 0); hb.classList.toggle('is-alert', n('On hold') > 0);
    const box = document.getElementById('hold-list');
    const s = dash.data('board');
    const where = (st) => { if (s.status !== 'ok') return ''; const ts = s.data.filter((t) => t.status === st && t.state !== 'done'); const isl = new Set(ts.map((t) => t.island)); return ts.length ? 'at ' + isl.size + (isl.size === 1 ? ' location' : ' locations') : ''; };
    document.getElementById('tb-prog-sub').textContent = where('In progress');
    document.getElementById('tb-hold-sub').textContent = where('On hold');
    document.getElementById('tb-plan-sub').textContent = where('Planned');
    document.getElementById('tb-plan').classList.toggle('is-zero', n('Planned') === 0);
    if (s.status !== 'ok') return pending(box, s);
    const holds = s.data.filter((t) => t.status === 'On hold' && t.state !== 'done');
    if (!s.data.length) { box.replaceChildren(el('p', 'quiet', 'No tasks yet. Use + Add at the top to add the first one.')); drawUnitMini(); return; }
    if (!holds.length) { box.replaceChildren(el('div', 'okline', 'Nothing on hold')); drawUnitMini(); return; }
    box.replaceChildren(...holds.map((t) => {
      const why = /^(a?wait)/i.test(t.note || '') ? t.note : 'Waiting: ' + (t.note || 'no reason given');
      return naRow('hold', 'On hold', t.task, short(t.island) + ' · ' + why, t.progress_label,
        () => { const known = (ok('island_tasks') || []).some((r) => r.island === t.island); go(known ? { kind: 'island', island: t.island } : { kind: 'office' }); },
        t.task + '\n' + t.island + ' · ' + t.unit + '\n' + t.progress_label + ' done · due ' + t.due_label);
    }));
    if (MODE === 'tv') {
      let hidden = 0; const more = el('div', 'more');
      while (over(box) && box.querySelectorAll('.na-r').length > 1) { [...box.querySelectorAll('.na-r')].pop().remove(); hidden++; more.textContent = '+' + hidden + ' more on hold'; box.appendChild(more); }
    }
    drawUnitMini();
  };
  const drawUnitMini = () => {
    const box = document.getElementById('unit-mini'); const s = dash.data('by_unit');
    if (s.status !== 'ok') return pending(box, s);
    const rows = s.data.filter((r) => r.open > 0).sort((a, b) => b.overdue - a.overdue || b.open - a.open);
    document.getElementById('unit-mini-h').hidden = !rows.length;
    if (!rows.length) { box.replaceChildren(); return; }
    box.replaceChildren(...rows.map((r) => {
      const b = naRow(r.overdue ? 'over' : 'due', r.open + ' open', unitS(r.unit),
        (r.overdue ? r.overdue + ' overdue · ' : '') + (r.due_week ? r.due_week + ' due this week' : 'none due this week'), r.avg_progress_label,
        () => go({ kind: 'unit', unit: r.unit }), r.unit + '\n' + r.open + ' open · ' + r.overdue + ' overdue · average ' + r.avg_progress_label + ' done');
      const tr = el('span', 'um-bar'); const f = el('i'); f.style.width = Math.max(0, Math.min(100, r.avg_progress)) + '%'; tr.appendChild(f);
      b.querySelector('.na-m').appendChild(tr);
      return b;
    }));
    if (MODE !== 'tv') return;
    while (over(box) && box.querySelectorAll('.na-r').length > 1) [...box.querySelectorAll('.na-r')].pop().remove();
  };
  document.getElementById('tb-prog').addEventListener('click', () => go({ kind: 'status', status: 'In progress' }));
  document.getElementById('tb-hold').addEventListener('click', () => go({ kind: 'status', status: 'On hold' }));
  document.getElementById('tb-plan').addEventListener('click', () => go({ kind: 'status', status: 'Planned' }));
  document.getElementById('tb-over').addEventListener('click', () => go({ kind: 'status', status: 'Overdue' }));

  // ---------- team ----------
  const TEAM = [['present', 'In office', '--st-present', 'Present'], ['island_duty', 'Island duty', '--st-island', 'On island duty'], ['salaam', 'Salaam', '--st-salaam', 'Salaam'],
    ['annual', 'Annual leave', '--st-annual', 'Annual leave'], ['sick', 'Sick leave', '--st-sick', 'Sick leave'], ['frl', 'FRL', '--st-frl', 'FRL']];
  const drawTeam = () => {
    const r0 = (ok('team_summary') || [])[0];
    document.getElementById('team-stale').hidden = !(r0 && !r0.is_today);
    const bar = document.getElementById('team-stack');
    if (!r0) { pending(bar, dash.data('team_summary')); return; }
    const segs = [['present', 'In office', '--st-present'], ['island_duty', 'Island duty', '--st-island'], ['annual', 'Annual leave', '--st-annual'], ['salaam', 'Salaam', '--st-salaam'], ['frl', 'FRL', '--st-frl'], ['sick', 'Sick leave', '--st-sick']];
    bar.replaceChildren(...segs.filter(([k]) => r0[k] > 0).map(([k, label, c]) => { const i = el('i'); i.style.flex = r0[k] + ' 0 0'; i.style.setProperty('--c', 'var(' + c + ')'); i.setAttribute('data-tip', label + ': ' + r0[k]); return i; }));
    document.querySelectorAll('#tt-grid .tt').forEach((t) => { const v = Number(t.querySelector('b').textContent); t.classList.toggle('zero', !v); });
    const card = document.getElementById('team');
    card.classList.remove('compact', 'tight');
    if (MODE === 'tv' && over(card)) { card.classList.add('compact'); if (over(card)) card.classList.add('tight'); }
  };
  const teamCard = document.getElementById('team');
  teamCard.addEventListener('click', () => go({ kind: 'team' }));
  teamCard.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go({ kind: 'team' }); } });

  // ---------- per-atoll status counts ----------
  const atollCounts = () => {
    const isl = ok('island_tasks') || [], board = ok('board') || [];
    const map = new Map(isl.map((r) => [r.island, r.atoll]));
    const out = {};
    for (const t of board) {
      if (t.state === 'done') continue;
      const a = map.get(t.island) || 'Office';
      const o = out[a] || (out[a] = { prog: 0, hold: 0, plan: 0, over: 0 });
      if (t.state === 'overdue') o.over++;
      if (t.status === 'In progress') o.prog++; else if (t.status === 'On hold') o.hold++; else if (t.status === 'Planned') o.plan++;
    }
    return out;
  };

  // ---------- right panel ----------
  let view = { kind: 'list', tab: 'atolls' };
  let idle = null;
  function go(v) {
    const was = view.kind;
    view = v;
    root.classList.toggle('detail', v.kind !== 'list');
    drawSide(true);
    animateMap();
    clearTimeout(idle);
    if (v.kind !== 'list') idle = setTimeout(() => { zoom = 1; go({ kind: 'list', tab: 'atolls' }); }, 120000);
    if (was !== v.kind && MODE === 'narrow' && v.kind !== 'list') side.scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth', block: 'start' });
  }

  const taskCard = (t) => {
    const cls = t.state === 'done' ? 'done' : t.state === 'overdue' ? 'over' : t.status === 'On hold' ? 'hold' : t.status === 'Planned' ? 'plan' : 'due';
    const when = t.state === 'done' ? 'Done' : t.state === 'overdue' ? t.due_note.replace(' overdue', ' late') : t.status === 'On hold' ? 'On hold' : t.status === 'Planned' ? 'Planned' : 'Ongoing';
    const d = naRow(cls + ' na-card', when, t.task, [...new Set([unitS(t.unit), t.category].filter(Boolean))].join(' · '), t.progress_label, null, null, 'div');
    const ext = el('div', 'na-ext');
    const tr = el('div', 'track'); const f = el('div', 'fill'); f.style.width = Math.max(0, Math.min(100, t.progress)) + '%'; tr.appendChild(f);
    const planTxt = t.status === 'Planned' && t.start_label ? (t.starts_in > 0 ? 'Starts ' + t.start_label + ' · ' : t.starts_in === 0 ? 'Starts today · ' : 'Was due to start ' + t.start_label + ' · ') : '';
    ext.append(tr, el('span', 'na-due', planTxt + (t.has_due ? 'Due ' + t.due_label + (t.state === 'overdue' || t.state === 'done' ? '' : ' · ' + t.due_note.toLowerCase()) : 'No due date')));
    if (t.assigned) ext.appendChild(el('span', 'na-due na-who', 'Assigned: ' + t.assigned));
    if (t.note) ext.appendChild(el('span', 'na-note', (t.status === 'On hold' && !/^(a?wait)/i.test(t.note) ? 'Waiting: ' : '') + t.note));
    d.appendChild(ext);
    d.dataset.tid = t.id;
    return d;
  };
  const sortTasks = (a, b) => a.rank - b.rank || a.days - b.days;
  const tile = (v, label, cls) => { const t = el('div', 'tile' + (cls ? ' ' + cls : '')); t.append(el('b', '', String(v)), el('span', '', label)); return t; };
  const topBar = (title, sub, back, island) => {
    const top = el('div', 'dtop'); const tl = el('div');
    const bk = el('button', 'back', '‹ ' + (back ? back.label : 'Overview')); bk.type = 'button';
    bk.addEventListener('click', () => go(back ? back.view : { kind: 'list', tab: view.kind === 'unit' ? 'units' : 'atolls' }));
    tl.append(bk, el('h2', '', title), el('p', '', sub));
    const cb = el('button', 'closeb', 'Close'); cb.type = 'button'; cb.addEventListener('click', () => { zoom = 1; go({ kind: 'list', tab: 'atolls' }); });
    if (island) {
      // shown only to people who can edit (see .gx.can-edit in the styles)
      const acts = el('div', 'dacts');
      const at = el('button', 'addhere primary', '+ Add task'); at.type = 'button'; at.dataset.add = 'task'; at.dataset.island = island;
      const ao = el('button', 'addhere', '+ Power interruption'); ao.type = 'button'; ao.dataset.add = 'outage'; ao.dataset.island = island;
      acts.append(at, ao, cb); top.append(tl, acts); return top;
    }
    top.append(tl, cb); return top;
  };

  function drawSide(animate) {
    const atolls = ok('atoll_summary'), islands = ok('island_tasks'), board = ok('board'), units = ok('by_unit'), outs = ok('outage_list');
    if (!atolls || !islands || !board) { pending(side, dash.data(!atolls ? 'atoll_summary' : !islands ? 'island_tasks' : 'board')); return; }
    const parts = [];
    let after = null;

    if (view.kind === 'list') {
      const ph = el('div', 'ph'); ph.appendChild(el('h2', '', view.tab === 'units' ? 'Units' : 'Needs attention'));
      const seg = el('div', 'seg');
      for (const [k, l] of [['atolls', 'Attention'], ['units', 'Units']]) { const b = el('button', view.tab === k ? 'on' : '', l); b.type = 'button'; b.addEventListener('click', () => go({ kind: 'list', tab: k })); seg.appendChild(b); }
      ph.appendChild(seg); parts.push(ph);
      if (view.tab !== 'units') {
        // ---- Needs attention: overdue + next 7 days (tasks due, planned shutdowns) ----
        const known = new Set(islands.map((r) => r.island));
        const tz = 'Indian/Maldives';
        const dayKey = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
        const todayK = dayKey(Date.now());
        const dayDiff = (k) => Math.round((Date.parse(k + 'T00:00:00Z') - Date.parse(todayK + 'T00:00:00Z')) / 864e5);
        const dayLabel = (n, k) => n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'short' }).format(Date.parse(k + 'T00:00:00Z'));
        const open = board.filter((t) => t.state !== 'done');
        const overdue = open.filter((t) => t.state === 'overdue').sort((a, b) => a.days - b.days);
        const items = [];
        for (const t of open.filter((t) => t.days >= 0 && t.days <= 7 && !(t.status === 'Planned' && t.starts_in != null && t.starts_in >= 0 && t.starts_in <= 7))) items.push({ kind: 'task', n: t.days, key: null, t });
        for (const t of open.filter((t) => t.status === 'Planned' && t.state !== 'overdue' && t.starts_in != null && t.starts_in >= 0 && t.starts_in <= 7)) items.push({ kind: 'start', n: t.starts_in, key: null, t });
        for (const o of (outs || []).filter((o) => o.state === 'Scheduled')) { const k = dayKey(o.start_ms), n = dayDiff(k); if (n >= 0 && n <= 7) items.push({ kind: 'shut', n, key: k, o }); }
        items.sort((a, b) => a.n - b.n || (a.kind === 'shut' ? -1 : 1));
        const list = el('div', 'na-list');
        const goTask = (t) => go(known.has(t.island) ? { kind: 'island', island: t.island } : { kind: 'office' });
        const row = (cls, when, title, sub, right, onClick, tipT) => naRow(cls, when, title, sub, right, onClick, tipT);
        const sec = (label, n, cls) => { const s = el('div', 'na-h ' + (cls || '')); s.append(el('span', '', label), el('b', '', String(n))); return s; };
        list.appendChild(sec('Overdue', overdue.length, 'bad'));
        if (!overdue.length) list.appendChild(el('div', 'okline na-ok', 'Nothing overdue'));
        for (const t of overdue) list.appendChild(row('over', (-t.days) + (t.days === -1 ? ' day' : ' days') + ' late', t.task, short(t.island) + ' · ' + unitS(t.unit), t.progress_label, () => goTask(t), t.task + '\n' + t.island + ' · ' + t.unit + '\nDue ' + t.due_label + ' · ' + t.progress_label + ' done' + (t.note ? '\n' + t.note : '')));
        list.appendChild(sec('Next 7 days', items.length));
        if (!items.length) list.appendChild(el('div', 'okline na-ok', 'Nothing due in the next 7 days'));
        let lastN = null;
        for (const it of items) {
          if (it.n !== lastN) { lastN = it.n; const k = it.key || dayKey(Date.now() + it.n * 864e5); list.appendChild(el('div', 'na-d', dayLabel(it.n, k))); }
          if (it.kind === 'start') { const t = it.t; list.appendChild(row('plan', 'Starts', t.task, short(t.island) + ' · ' + unitS(t.unit), t.has_due ? 'due ' + t.due_label : '', () => goTask(t), t.task + '\n' + t.island + ' · ' + t.unit + '\nPlanned: starts ' + t.start_label + (t.has_due ? ', due ' + t.due_label : '') + (t.note ? '\n' + t.note : ''))); }
          else if (it.kind === 'task') { const t = it.t; list.appendChild(row(t.status === 'On hold' ? 'hold' : t.status === 'Planned' ? 'plan' : 'due', t.status === 'On hold' ? 'On hold' : t.status === 'Planned' ? 'Planned' : 'Ongoing', t.task, short(t.island) + ' · ' + unitS(t.unit), t.progress_label, () => goTask(t), t.task + '\n' + t.island + ' · ' + t.unit + '\nDue ' + t.due_label + ' · ' + t.progress_label + ' done' + (t.note ? '\n' + t.note : ''))); }
          else { const o = it.o; list.appendChild(row('shut', o.start_label.replace(/^.*?,\s*/, ''), 'Planned shutdown, ' + short(o.island), o.cause + ' · ' + o.duration_label.replace(' planned', ''), '', () => go({ kind: 'power' }), o.island + '\nShutdown ' + o.start_label + ', ' + o.duration_label + '\n' + o.cause + '\n' + o.unit)); }
        }
        parts.push(list);
        side.classList.toggle('swap', !!animate && !reduce());
        if (animate) { side.classList.remove('swap'); void side.offsetWidth; if (!reduce()) side.classList.add('swap'); }
        side.replaceChildren(...parts);
        if (MODE === 'tv') {
          let hidden = 0; const more = el('div', 'more na-more');
          while (over(list)) { const rs = [...list.querySelectorAll('.na-r')]; if (rs.length <= 1) break; const last = rs[rs.length - 1]; const prev = last.previousElementSibling; last.remove(); if (prev && prev.classList.contains('na-d') && (!prev.nextElementSibling || !prev.nextElementSibling.classList.contains('na-r'))) prev.remove(); hidden++; more.textContent = '+' + hidden + ' more'; list.appendChild(more); }
        }
        return;
      }
      const counts = atollCounts();
      const isUnits = view.tab === 'units';
      let rows;
      if (isUnits) {
        rows = (units || []).map((u) => {
          const ts = board.filter((t) => t.unit === u.unit && t.state !== 'done');
          return { key: u.unit, name: u.unit.replace(/ Unit$/, ''), sub: '', prog: ts.filter((t) => t.status === 'In progress').length, hold: ts.filter((t) => t.status === 'On hold').length, over: ts.filter((t) => t.state === 'overdue').length, open: ts.length, unit: true };
        });
      } else {
        rows = atolls.map((a) => { const c = counts[a.atoll] || { prog: 0, hold: 0, not: 0, over: 0 };
          return { key: a.atoll, name: a.atoll === 'Office' ? 'Office & other' : a.atoll_name, sub: a.atoll === 'Office' ? '' : a.atoll, prog: c.prog, hold: c.hold, over: c.over, open: a.open, off: a.power_off, isl: a.islands }; });
      }
      const tbl = el('div', 'atbl' + (isUnits ? ' units' : ''));
      const hd = el('div', 'at-h');
      hd.append(el('span', '', isUnits ? 'Unit' : 'Atoll'), el('span', 'c k-prog', 'Ongoing'), el('span', 'c k-hold', 'On hold'), el('span', 'c k-over', 'Overdue'));
      if (!isUnits) hd.append(el('span', 'c', 'Power'));
      tbl.appendChild(hd);
      const num = (v, cls) => { const s = el('span', 'c n ' + cls + (v ? '' : ' zero'), v ? String(v) : '–'); return s; };
      const body = el('div', 'at-body');
      for (const r of rows) {
        const b = el('button', 'at-r'); b.type = 'button';
        const flag = r.off ? 'f-off' : r.over ? 'f-over' : r.hold ? 'f-hold' : '';
        if (flag) b.classList.add(flag);
        const nm = el('span', 'at-n');
        if (!isUnits) nm.append(el('span', 'code', r.key === 'Office' ? 'HQ' : r.sub));
        nm.append(el('b', '', r.name));
        b.append(nm, num(r.prog, 'k-prog'), num(r.hold, 'k-hold'), num(r.over, 'k-over'));
        if (!isUnits) {
          const p = el('span', 'c pw');
          if (r.key === 'Office') { p.classList.add('na'); p.textContent = '–'; }
          else if (r.off) { p.classList.add('off'); p.textContent = r.off + ' off'; }
          else { p.classList.add('ok'); p.textContent = 'OK'; }
          b.appendChild(p);
        }
        b.setAttribute('data-tip', r.name + '\n' + r.prog + ' ongoing · ' + r.hold + ' on hold · ' + r.over + ' overdue' + (r.off ? '\nPower off on ' + r.off + ' island' : '') + '\nTap to open');
        b.addEventListener('click', () => go(r.unit ? { kind: 'unit', unit: r.key } : r.key === 'Office' ? { kind: 'office' } : { kind: 'atoll', atoll: r.key }));
        body.appendChild(b);
      }
      tbl.appendChild(body);
      const sum = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
      const tot = el('div', 'at-t');
      tot.append(el('span', 'at-tl', 'All of SCRD'), num(sum('prog'), 'k-prog'), num(sum('hold'), 'k-hold'), num(sum('over'), 'k-over'));
      if (!isUnits) { const off = sum('off'); const p = el('span', 'c pw ' + (off ? 'off' : 'ok'), off ? off + ' off' : 'OK'); tot.appendChild(p); }
      tbl.appendChild(tot);
      const list = tbl;
      parts.push(list);
    } else if (view.kind === 'team') {
      const r0 = (ok('team_summary') || [])[0] || {};
      const list = ok('team_list') || [];
      parts.push(topBar('Team today', 'Attendance as of ' + (r0.as_of_label || '—') + (r0.is_today ? '' : ' · not updated today')));
      const tiles = el('div', 'tiles');
      tiles.append(tile((r0.at_work ?? '—') + ' / ' + (r0.total ?? '—'), 'Working today', 'good'), tile(r0.present ?? '—', 'In office'), tile(r0.island_duty ?? '—', 'On island duty', 'prog'),
        tile(r0.annual ?? '—', 'Annual leave'), tile(r0.salaam ?? '—', 'Salaam'), tile(r0.frl ?? '—', 'FRL'), tile(r0.sick ?? '—', 'Sick leave'));
      parts.push(tiles);
      const C = { 'Present': '--st-present', 'On island duty': '--st-island', 'Annual leave': '--st-annual', 'Salaam': '--st-salaam', 'FRL': '--st-frl', 'Sick leave': '--st-sick' };
      const grid = el('div', 'dgrid');
      const unitsOrder = ['Electrical Services Unit', 'Mechanical Services Unit', 'Water and Sewage Services Unit', 'Administration and Support Service Unit', 'Logistics Unit'];
      for (const u of unitsOrder) {
        const ppl = list.filter((p) => p.unit === u);
        if (!ppl.length) continue;
        const b = el('div', 'iblock');
        const hb = el('div', 'ihead'); hb.append(el('b', '', u.replace(/ Services? Unit$| Unit$/, '')), el('span', '', ppl.filter((p) => p.working).length + ' of ' + ppl.length + ' working'));
        b.appendChild(hb);
        const tbl = el('div', 'staff-t');
        for (const p of ppl) {
          const row = el('div', 'st-r' + (p.status === 'Present' ? '' : ' away'));
          const st = el('span', 'st-s'); st.style.setProperty('--c', 'var(' + (C[p.status] || '--ink3') + ')'); st.append(el('i'), document.createTextNode(p.status === 'Present' ? 'In office' : p.status));
          row.append(el('span', 'st-n', p.name), el('span', 'st-role', p.role), st, el('span', 'st-x', p.detail || ''));
          tbl.appendChild(row);
        }
        b.appendChild(tbl);
        grid.appendChild(b);
      }
      parts.push(grid);
    } else if (view.kind === 'power') {
      const sum = (ok('outage_summary') || [{}])[0];
      const all = outs || [];
      const on = all.filter((o) => o.state === 'Ongoing'), sch = all.filter((o) => o.state === 'Scheduled'), past = all.filter((o) => o.state === 'Restored');
      parts.push(topBar('Power interruptions', 'Electricity supply across SCRD islands · ' + (sum.month_label || '')));
      const tiles = el('div', 'tiles');
      tiles.append(tile(on.length, 'Without power now', on.length ? 'bad' : 'good'), tile(sch.length, 'Shutdowns scheduled', sch.length ? 'hold' : ''), tile(sum.month_count ?? '—', 'Interruptions this month'),
        tile(sum.month_unplanned ?? '—', 'Breakdowns this month'), tile(sum.month_hours_label ?? '—', 'Without power this month'), tile(sum.avg_restore_label ?? '—', 'Average restore time'));
      parts.push(tiles);
      const row = el('div', 'drow');
      for (const o of on) { const al = el('div', 'alert'); al.dataset.oid = o.id; al.append(el('b', '', o.island + ': off since ' + o.start_label + '. '), o.cause + ' (' + o.unit + ')'); row.appendChild(al); }
      for (const o of sch) { const al = el('div', 'alert'); al.dataset.oid = o.id; al.style.setProperty('--c', css('--amber')); al.append(el('b', '', o.island + ': shutdown ' + o.start_label + ', ' + o.duration_label + '. '), o.cause + ' (' + o.unit + ')'); row.appendChild(al); }
      if (!on.length && !sch.length) row.appendChild(el('p', 'quiet', all.length ? 'All islands have power and no shutdowns are scheduled.' : 'No interruptions logged yet. Use + Add to record one.'));
      parts.push(row);
      const ch = el('div'); ch.style.flex = 'none'; ch.style.display = 'flex'; ch.style.flexDirection = 'column'; ch.style.gap = '.4em';
      const chh = el('div', 'sec-h'); chh.append(el('span', '', 'Hours without power each day'), el('span', '', 'Red: breakdown · Amber: planned'));
      const cbox = el('div', 'big-chart'); cbox.setAttribute('data-source', 'outage_daily');
      ch.append(chh, cbox); parts.push(ch);
      const log = el('div', 'log');
      const tbl = el('table'); tbl.setAttribute('data-source', 'outage_list'); tbl.setAttribute('data-row-key', 'id');
      const thr = el('tr');
      for (const [f, l] of [['island', 'Island'], ['type', 'Type'], ['start_label', 'Started'], ['end_label', 'Restored'], ['duration_label', 'Duration'], ['cause', 'Cause'], ['unit', 'Unit']]) { const th = el('th', '', l); th.setAttribute('data-field', f); thr.appendChild(th); }
      const thead = el('thead'); thead.appendChild(thr); tbl.appendChild(thead);
      const tb = el('tbody');
      for (const o of past) { const tr = el('tr'); tr.dataset.key = o.id; tr.append(el('td', 'nw', o.island), el('td', '', o.type), el('td', 'nw', o.start_label), el('td', 'nw', o.end_label), el('td', 'nw', o.duration_label), el('td', '', o.cause), el('td', '', o.unit)); tb.appendChild(tr); }
      tbl.appendChild(tb); log.append(el('div', 'sec-h', 'Restored this month'), tbl); parts.push(log);
      after = () => drawMonthInto(cbox);
    } else {
      const team = ok('team_list') || [];
      const known = new Set(islands.map((r) => r.island));
      let title, sub, isl = [], ts = [], back = null;
      if (view.kind === 'atoll') {
        const a = atolls.find((x) => x.atoll === view.atoll);
        title = a.atoll_name + ' atoll'; sub = a.atoll + ' · ' + a.islands + ' islands, ' + a.islands_with_tasks + ' with open tasks';
        isl = islands.filter((r) => r.atoll === view.atoll);
        const names = new Set(isl.map((r) => r.island)); ts = board.filter((t) => names.has(t.island));
      } else if (view.kind === 'island') {
        const r = islands.find((x) => x.island === view.island); const a = atolls.find((x) => x.atoll === r.atoll);
        title = short(r.island); sub = a.atoll_name + ' atoll';
        isl = [r]; ts = board.filter((t) => t.island === r.island);
        back = { label: a.atoll_name + ' atoll', view: { kind: 'atoll', atoll: a.atoll } };
      } else if (view.kind === 'unit') {
        title = view.unit; sub = 'Tasks across all atolls';
        ts = board.filter((t) => t.unit === view.unit);
        const names = new Set(ts.map((t) => t.island)); isl = islands.filter((r) => names.has(r.island));
        back = { label: 'All units', view: { kind: 'list', tab: 'units' } };
      } else if (view.kind === 'status') {
        const isOver = view.status === 'Overdue';
        title = isOver ? 'Overdue tasks' : view.status === 'In progress' ? 'Ongoing tasks' : view.status === 'Planned' ? 'Planned tasks' : 'On hold';
        sub = isOver ? 'Past their due date and not yet complete' : view.status === 'On hold' ? 'Tasks waiting on something before work can continue' : view.status === 'Planned' ? 'Scheduled work that has not started yet' : 'Work under way now, across all atolls';
        ts = board.filter((t) => (isOver ? t.state === 'overdue' : t.status === view.status));
        const names = new Set(ts.map((t) => t.island)); isl = islands.filter((r) => names.has(r.island));
      } else { title = 'Office and other locations'; sub = 'SCRD office and workshop, and islands outside the seven atolls on the map'; ts = board.filter((t) => !known.has(t.island)); }
      const open = ts.filter((t) => t.state !== 'done').sort(sortTasks);
      const done = ts.filter((t) => t.state === 'done');
      const n = (st) => open.filter((t) => t.status === st).length;
      const overdue = open.filter((t) => t.state === 'overdue').length;
      const avg = open.length ? Math.round(open.reduce((s, t) => s + t.progress, 0) / open.length) : 0;
      const names = new Set(isl.map((r) => r.island));
      const onO = (outs || []).filter((o) => names.has(o.island) && o.state === 'Ongoing');
      const schO = (outs || []).filter((o) => names.has(o.island) && o.state === 'Scheduled');
      const staff = team.filter((p) => p.location && (names.has(p.location) || isl.some((r) => String(p.location).includes(short(r.island)))));

      parts.push(topBar(title, sub, back, view.kind === 'island' ? view.island : null));
      const tiles = el('div', 'tiles');
      const locs = new Set(open.map((t) => t.island)).size;
      const week = open.filter((t) => t.days >= 0 && t.days <= 7).length;
      if (view.kind === 'status') {
        const isHold = view.status === 'On hold', isOverV = view.status === 'Overdue', isPlan = view.status === 'Planned';
        tiles.append(tile(open.length, isOverV ? 'Overdue' : isHold ? 'On hold' : isPlan ? 'Planned' : 'Ongoing', isOverV ? 'bad' : isHold ? 'hold' : isPlan ? 'plan' : 'prog'), tile(locs, locs === 1 ? 'Location' : 'Locations'));
        if (isPlan) { const wk = open.filter((t) => t.starts_in != null && t.starts_in >= 0 && t.starts_in <= 7).length; const late = open.filter((t) => t.starts_in != null && t.starts_in < 0).length; tiles.append(tile(wk, 'Start in 7 days', 'plan'), tile(late, 'Past start date', late ? 'hold' : 'good'), tile(overdue, 'Overdue', overdue ? 'bad' : 'good')); }
        else if (isOverV) { const worst = open.reduce((m, t) => Math.min(m, t.days), 0); tiles.append(tile(-worst + (worst === -1 ? ' day' : ' days'), 'Most overdue', 'bad')); }
        else if (!isHold) tiles.append(tile(overdue, 'Overdue', overdue ? 'bad' : 'good'), tile(week, 'Due in 7 days'));
        if (!isPlan) tiles.append(tile(avg + '%', 'Average progress'));
      } else {
        tiles.append(tile(n('In progress'), 'Ongoing', 'prog'), tile(n('On hold'), 'On hold', n('On hold') ? 'hold' : ''), tile(n('Planned'), 'Planned', n('Planned') ? 'plan' : ''), tile(overdue, 'Overdue', overdue ? 'bad' : 'good'), tile(avg + '%', 'Average progress'));
        if (view.kind === 'atoll' || view.kind === 'island') tiles.append(tile(onO.length ? onO.length : 'OK', onO.length ? 'Without power' : 'Power supply', onO.length ? 'bad' : 'good'));
      }
      parts.push(tiles);
      const placeView = view.kind === 'atoll' || view.kind === 'island';
      if (placeView && (onO.length || schO.length)) {
        const row = el('div', 'drow');
        for (const o of onO) { const al = el('div', 'alert'); al.append(el('b', '', short(o.island) + ': power off since ' + o.start_label + '. '), o.cause + ' (' + o.unit + ')'); row.appendChild(al); }
        for (const o of schO) { const al = el('div', 'alert'); al.style.setProperty('--c', css('--amber')); al.append(el('b', '', short(o.island) + ': shutdown ' + o.start_label + ', ' + o.duration_label + '. '), o.cause); row.appendChild(al); }
        parts.push(row);
      }
      if (placeView && staff.length) {
        const s = el('div', 'staff'); s.appendChild(el('span', '', 'SCRD staff here today'));
        for (const p of staff) { const c = el('span', 'chip', p.name); c.style.setProperty('--c', 'var(--st-island)'); c.appendChild(el('em', '', p.unit.replace(/ Services? Unit| Unit/, ''))); c.setAttribute('data-tip', p.name + ', ' + p.role + '\n' + p.detail); s.appendChild(c); }
        parts.push(s);
      }
      const grid = el('div', 'dgrid');
      const groups = [];
      if (view.kind === 'office') { const locs = [...new Set(open.map((t) => t.island))]; for (const l of locs) groups.push({ label: short(l), tasks: open.filter((t) => t.island === l) }); }
      else {
        for (const r of isl) { const t = open.filter((x) => x.island === r.island); if (t.length || view.kind === 'island') groups.push({ label: short(r.island), tasks: t, r }); }
        if (view.kind === 'status' || view.kind === 'unit') { const offT = open.filter((t) => !known.has(t.island)); for (const l of [...new Set(offT.map((t) => t.island))]) groups.push({ label: short(l), tasks: offT.filter((t) => t.island === l) }); }
      }
      const od = (g) => g.tasks.filter((t) => t.state === 'overdue').length;
      groups.sort((x, y) => (od(y) - od(x)) || y.tasks.length - x.tasks.length);
      for (const g of groups) {
        const b = el('div', 'iblock' + (g.r && g.r.power_off ? ' is-off' : ''));
        const hb = el('button', 'ihead'); hb.type = 'button';
        hb.append(el('b', '', g.label), el('span', g.r && g.r.power_off ? 'off' : '', (g.r && g.r.power_off ? 'Power off · ' : '') + g.tasks.length + ' open'));
        if (g.r && view.kind !== 'island') hb.addEventListener('click', () => go({ kind: 'island', island: g.r.island }));
        b.appendChild(hb);
        g.tasks.forEach((t) => b.appendChild(taskCard(t)));
        if (!g.tasks.length) b.appendChild(el('p', 'quiet', 'No open tasks.'));
        if (view.kind === 'island' && done.length) { b.appendChild(el('div', 'tgroup', 'Completed')); done.forEach((t) => b.appendChild(taskCard(t))); }
        grid.appendChild(b);
      }
      if (!groups.length) grid.appendChild(el('p', 'quiet', 'No open tasks.'));
      parts.push(grid);
      if (view.kind === 'atoll') { const q = isl.filter((r) => !r.open).map((r) => short(r.island)); if (q.length) parts.push(el('p', 'quiet', 'No open tasks on ' + q.join(', ') + '.')); }
    }
    side.classList.toggle('swap', !!animate && !reduce());
    if (animate) { side.classList.remove('swap'); void side.offsetWidth; if (!reduce()) side.classList.add('swap'); }
    side.replaceChildren(...parts);
    if (after) setTimeout(after, MODE === 'tv' && animate ? 620 : 0);
  }

  // ---------- map ----------
  let zoom = 1;
  let cur = null; let anim = 0;
  const convexHull = (points) => {
    const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [], upper = [];
    for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
    for (const q of p.slice().reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
  };
  document.getElementById('z-in').addEventListener('click', () => { zoom = Math.min(6, zoom * 1.4); animateMap(); });
  document.getElementById('z-out').addEventListener('click', () => { zoom = Math.max(0.6, zoom / 1.4); animateMap(); });
  document.getElementById('z-home').addEventListener('click', () => { zoom = 1; go({ kind: 'list', tab: view.tab || 'atolls' }); });
  mapBox.addEventListener('click', () => { if (view.kind !== 'list') { zoom = 1; go({ kind: 'list', tab: 'atolls' }); } });

  // atoll outlines traced from Natural Earth 1:10m reefs (public domain), adjusted so every island sits inside; lon/lat
  const ATOLL_SHAPES = {"V":[[[73.279,3.488],[73.278,3.508],[73.2939,3.5767],[73.305,3.6],[73.32,3.62],[73.385,3.683],[73.4143,3.698],[73.465,3.67],[73.481,3.655],[73.489,3.632],[73.4847,3.5593],[73.496,3.551],[73.517,3.5074],[73.5492,3.5021],[73.5731,3.4627],[73.5905,3.4623],[73.657,3.494],[73.6802,3.4923],[73.695,3.504],[73.716,3.501],[73.764,3.474],[73.757,3.451],[73.735,3.416],[73.706,3.395],[73.6657,3.3779],[73.62,3.368],[73.5797,3.3668],[73.564,3.353],[73.5317,3.3539],[73.503,3.345],[73.4857,3.3345],[73.484,3.3078],[73.4677,3.298],[73.4555,3.3031],[73.4471,3.3226],[73.427,3.334],[73.4101,3.3538],[73.3983,3.3774],[73.3527,3.4352],[73.3242,3.4548],[73.3153,3.4669],[73.297,3.471]]],"M":[[[73.337,2.799],[73.3507,2.8797],[73.345,2.9053],[73.358,2.9779],[73.361,3.175],[73.434,3.186],[73.461,3.183],[73.5106,3.1415],[73.5247,3.1346],[73.5447,3.1274],[73.5679,3.1323],[73.5832,3.1212],[73.618,3.115],[73.6267,3.1032],[73.6451,3.1049],[73.6559,3.0995],[73.6609,3.0855],[73.6542,3.0729],[73.6415,3.0691],[73.6233,3.0754],[73.613,3.0672],[73.6023,2.9913],[73.6125,2.9752],[73.6137,2.9648],[73.5845,2.8831],[73.5741,2.8781],[73.5541,2.8798],[73.5357,2.8669],[73.4366,2.8215],[73.4239,2.8071],[73.436,2.7797],[73.4328,2.7698],[73.4235,2.7629],[73.392,2.758],[73.366,2.764],[73.346,2.779]]],"F":[[[72.81,3.269],[72.811,3.29],[72.8236,3.2982],[72.825,3.325],[72.83,3.334],[72.8696,3.343],[72.9043,3.3414],[72.913,3.347],[72.947,3.343],[72.974,3.332],[72.9972,3.3147],[73.0237,3.2783],[73.047,3.265],[73.059,3.232],[73.054,3.195],[73.0326,3.172],[73.036,3.154],[73.029,3.139],[72.9966,3.1043],[72.9751,3.0944],[72.9746,3.0742],[72.9682,3.0639],[72.9467,3.0597],[72.9282,3.0453],[72.9101,3.0481],[72.8897,3.039],[72.8759,3.0458],[72.872,3.0573],[72.8771,3.0695],[72.8879,3.0749],[72.9092,3.0733],[72.9163,3.0804],[72.9171,3.0898],[72.8732,3.1406],[72.862,3.148],[72.829,3.2],[72.824,3.214],[72.8226,3.2506]]],"Dh":[[[72.825,2.919],[72.83,2.936],[72.8447,2.9448],[72.8705,2.9417],[72.8921,2.9573],[72.8951,2.9661],[72.891,2.991],[72.899,3.002],[72.9164,3.0004],[72.9538,3.0229],[72.978,3.03],[73.005,3.032],[73.026,3.02],[73.037,2.992],[73.045,2.898],[73.0363,2.8201],[73.038,2.749],[73.029,2.727],[72.9812,2.7083],[72.9731,2.6883],[72.9652,2.6815],[72.9542,2.6804],[72.9334,2.6881],[72.9153,2.6793],[72.9027,2.6553],[72.8919,2.6531],[72.8815,2.6581],[72.8744,2.6772],[72.855,2.699],[72.844,2.724],[72.83,2.819],[72.8369,2.8297],[72.8344,2.8658],[72.8443,2.8855]]],"Th":[[[72.908,2.453],[72.934,2.498],[72.961,2.522],[72.988,2.538],[73.0093,2.5321],[73.0271,2.5354],[73.053,2.552],[73.0787,2.5546],[73.0918,2.5708],[73.1058,2.5736],[73.1247,2.5587],[73.173,2.552],[73.1981,2.5346],[73.222,2.529],[73.227,2.524],[73.226,2.5074],[73.2371,2.4976],[73.278,2.517],[73.313,2.522],[73.3206,2.5167],[73.33,2.507],[73.3388,2.4761],[73.371,2.433],[73.379,2.401],[73.3726,2.3522],[73.3652,2.3412],[73.3398,2.3297],[73.3282,2.3102],[73.305,2.3055],[73.2343,2.2562],[73.2232,2.2392],[73.2035,2.2347],[73.1711,2.2122],[73.1577,2.1943],[73.1403,2.1906],[73.1017,2.1639],[73.063,2.154],[73.0315,2.1586],[73.0166,2.1493],[73.0062,2.1484],[72.9952,2.1558],[72.989,2.1726],[72.956,2.201],[72.9604,2.2235],[72.9578,2.2322],[72.9268,2.2399],[72.9109,2.2705],[72.9107,2.2809],[72.9189,2.2971],[72.9061,2.3205],[72.9101,2.3376],[72.901,2.401]]],"AA":[[[72.681,3.734],[72.692,3.757],[72.716,3.7735],[72.7199,3.7819],[72.7158,3.7913],[72.687,3.813],[72.6906,3.8311],[72.687,3.875],[72.6988,3.901],[72.698,3.917],[72.7048,3.9252],[72.7019,3.939],[72.71,3.9444],[72.7135,3.957],[72.7099,3.9686],[72.687,3.998],[72.6965,4.0139],[72.687,4.046],[72.6993,4.0735],[72.687,4.097],[72.69,4.107],[72.716,4.1187],[72.7183,4.1275],[72.714,4.138],[72.719,4.151],[72.7354,4.1572],[72.7403,4.1648],[72.7384,4.1737],[72.726,4.185],[72.72,4.21],[72.727,4.276],[72.747,4.292],[72.7623,4.2939],[72.7892,4.2799],[72.934,4.318],[72.9229,4.292],[72.94,4.265],[72.9332,4.1303],[72.9366,4.1214],[72.947,4.114],[72.9448,4.0965],[72.958,4.068],[72.9471,4.0503],[72.95,3.964],[72.9425,3.9334],[72.961,3.892],[72.958,3.8761],[72.9717,3.8512],[72.9626,3.829],[72.9632,3.8162],[72.9827,3.7966],[72.9804,3.7746],[72.987,3.7573],[72.9724,3.7333],[72.975,3.704],[72.9558,3.6731],[72.9567,3.6316],[72.9707,3.6167],[72.9723,3.6031],[72.9632,3.592],[72.9385,3.5868],[72.9309,3.5592],[72.9324,3.5503],[72.9446,3.5348],[72.9407,3.5194],[72.9267,3.513],[72.9054,3.5206],[72.8921,3.5127],[72.8882,3.502],[72.8954,3.4798],[72.8827,3.4663],[72.8653,3.4707],[72.8583,3.4934],[72.8486,3.4992],[72.8089,3.4976],[72.7917,3.4743],[72.7815,3.4721],[72.7714,3.4763],[72.7654,3.4862],[72.7644,3.5089],[72.73,3.528],[72.704,3.556],[72.7137,3.5864],[72.7139,3.6045],[72.694,3.647],[72.692,3.665],[72.6994,3.6695],[72.7017,3.6785]],[[73.025,4.263],[73.0223,4.2496],[73.0147,4.2383],[73.0034,4.2307],[72.99,4.228],[72.9766,4.2307],[72.9653,4.2383],[72.9577,4.2496],[72.955,4.263],[72.9577,4.2764],[72.9653,4.2877],[72.9766,4.2953],[72.99,4.298],[73.0034,4.2953],[73.0147,4.2877],[73.0223,4.2764]],[[72.978,4.437],[72.9721,4.4229],[72.958,4.417],[72.9439,4.4229],[72.938,4.437],[72.9439,4.4511],[72.958,4.457],[72.9721,4.4511]]],"ADh":[[[72.681,3.734],[72.692,3.757],[72.716,3.7735],[72.7199,3.7819],[72.7158,3.7913],[72.687,3.813],[72.6906,3.8311],[72.687,3.875],[72.6988,3.901],[72.698,3.917],[72.7048,3.9252],[72.7019,3.939],[72.71,3.9444],[72.7135,3.957],[72.7099,3.9686],[72.687,3.998],[72.6965,4.0139],[72.687,4.046],[72.6993,4.0735],[72.687,4.097],[72.69,4.107],[72.716,4.1187],[72.7183,4.1275],[72.714,4.138],[72.719,4.151],[72.7354,4.1572],[72.7403,4.1648],[72.7384,4.1737],[72.726,4.185],[72.72,4.21],[72.727,4.276],[72.747,4.292],[72.7623,4.2939],[72.7892,4.2799],[72.934,4.318],[72.9229,4.292],[72.94,4.265],[72.9332,4.1303],[72.9366,4.1214],[72.947,4.114],[72.9448,4.0965],[72.958,4.068],[72.9471,4.0503],[72.95,3.964],[72.9425,3.9334],[72.961,3.892],[72.958,3.8761],[72.9717,3.8512],[72.9626,3.829],[72.9632,3.8162],[72.9827,3.7966],[72.9804,3.7746],[72.987,3.7573],[72.9724,3.7333],[72.975,3.704],[72.9558,3.6731],[72.9567,3.6316],[72.9707,3.6167],[72.9723,3.6031],[72.9632,3.592],[72.9385,3.5868],[72.9309,3.5592],[72.9324,3.5503],[72.9446,3.5348],[72.9407,3.5194],[72.9267,3.513],[72.9054,3.5206],[72.8921,3.5127],[72.8882,3.502],[72.8954,3.4798],[72.8827,3.4663],[72.8653,3.4707],[72.8583,3.4934],[72.8486,3.4992],[72.8089,3.4976],[72.7917,3.4743],[72.7815,3.4721],[72.7714,3.4763],[72.7654,3.4862],[72.7644,3.5089],[72.73,3.528],[72.704,3.556],[72.7137,3.5864],[72.7139,3.6045],[72.694,3.647],[72.692,3.665],[72.6994,3.6695],[72.7017,3.6785]]]};
  // Ari is one reef ring shared by AA (north) and ADh (south)
  const ATOLL_SPLIT = { AA: { lat: 3.875, keep: 'north' }, ADh: { lat: 3.875, keep: 'south' } };
  const fsNow = () => parseFloat(getComputedStyle(root).fontSize) || 15;
  // map area that stays clear of panels, worked out from the final layout so animations aim at the right place
  const area = (W, H, fs) => {
    if (MODE !== 'tv') return { x0: fs, x1: W - fs, y0: fs, y1: H - fs };
    const edge = 1.15 * fs, gap = fs, top = edge + 4.6 * fs + gap;
    const detail = view.kind !== 'list';
    const x0 = detail ? edge : edge + 24 * fs + gap;
    const rw = detail ? 0.6 * W : 29 * fs;
    return { x0: x0 + fs * 0.6, x1: W - edge - rw - gap - fs * 0.6, y0: top + fs * 0.4, y1: H - edge - 3 * fs };
  };
  const focusOf = (islands) => view.kind === 'atoll' ? view.atoll : view.kind === 'island' ? (islands.find((r) => r.island === view.island) || {}).atoll : null;
  const target = () => {
    const islands = ok('island_tasks'); if (!islands) return null;
    const W = mapBox.clientWidth, H = mapBox.clientHeight, fs = fsNow();
    const a = area(W, H, fs);
    const fa = focusOf(islands);
    const shown = fa ? islands.filter((r) => r.atoll === fa) : islands;
    const shownA = new Set(shown.map((r) => r.atoll));
    const rp = Object.entries(ATOLL_SHAPES).filter(([k]) => shownA.has(k)).flatMap(([, rs]) => rs.flat());
    const lon = d3.extent([...shown.map((r) => r.lon), ...rp.map((p) => p[0])]), lat = d3.extent([...shown.map((r) => r.lat), ...rp.map((p) => p[1])]);
    const dLon = Math.max(lon[1] - lon[0], 0.15), dLat = Math.max(lat[1] - lat[0], 0.15);
    const lw = fs * 7, lh = fs * 1.5;
    const fitX = Math.max(60, a.x1 - a.x0 - lw * 2) / dLon, fitY = Math.max(60, a.y1 - a.y0 - lh * 2) / dLat;
    const base = Math.min(fitX, fitY) * zoom * (fa ? 0.78 : 1);
    // same scale both ways so distances and shapes stay true (cos 3°N ≈ 1)
    const ky = base, kx = base;
    return { cx: (lon[0] + lon[1]) / 2, cy: (lat[0] + lat[1]) / 2, k: ky, kx, ky, ox: (a.x0 + a.x1) / 2, oy: (a.y0 + a.y1) / 2 };
  };
  function animateMap() {
    const t = target(); if (!t) { drawMapAt(null, true); return; }
    cancelAnimationFrame(anim);
    if (!cur || reduce() || MODE !== 'tv') { cur = t; drawMapAt(cur, true); return; }
    const from = cur; const t0 = performance.now(); const D = 650;
    const ease = (x) => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    const step = (now) => {
      const p = Math.min(1, (now - t0) / D), e = ease(p);
      const lg = (p, q) => Math.exp(Math.log(p) + (Math.log(q) - Math.log(p)) * e);
      cur = { cx: from.cx + (t.cx - from.cx) * e, cy: from.cy + (t.cy - from.cy) * e, k: lg(from.k, t.k), kx: lg(from.kx, t.kx), ky: lg(from.ky, t.ky), ox: from.ox + (t.ox - from.ox) * e, oy: from.oy + (t.oy - from.oy) * e };
      drawMapAt(cur, p === 1);
      if (p < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }

  function drawMapAt(P, final) {
    const it = dash.data('island_tasks'), at = dash.data('atoll_summary');
    if (it.status !== 'ok' || at.status !== 'ok' || !P) { mapBox.replaceChildren(); if (isBad(it) || isBad(at)) mapBox.appendChild(el('div', 'failed', 'Failed to load')); return; }
    const W = mapBox.clientWidth, H = mapBox.clientHeight;
    if (W < 50 || H < 50) return;
    const fs = fsNow();
    const islands = it.data, atolls = at.data.filter((a) => a.atoll !== 'Office');
    const fa = focusOf(islands);
    const selIsland = view.kind === 'island' ? view.island : null;
    const brd = ok('board') || [];
    const sel = view.kind === 'unit' || view.kind === 'status' ? new Set(brd.filter((t) => t.state !== 'done' && (view.kind === 'unit' ? t.unit === view.unit : view.status === 'Overdue' ? t.state === 'overdue' : t.status === view.status)).map((t) => t.island)) : null;
    const pw = view.kind === 'power' ? new Set((ok('outage_list') || []).filter((o) => o.state !== 'Restored').map((o) => o.island)) : null;
    const KX = P.kx || P.k, KY = P.ky || P.k;
    const gx = (lon) => P.ox + (lon - P.cx) * KX;
    const gy = (lat) => P.oy - (lat - P.cy) * KY;

    // display positions: true positions, with overlapping task markers nudged apart
    const rTask = fs * 0.72, rQuiet = fs * 0.26;
    const pos = new Map(islands.map((r) => [r.island, { x: gx(r.lon), y: gy(r.lat), r: r.open ? rTask : rQuiet, fixed: !r.open }]));
    const arr = [...pos.values()];
    for (let iter = 0; iter < 40; iter++) {
      let moved = false;
      for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i], b = arr[j]; if (a.fixed && b.fixed) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01, need = a.r + b.r + 3;
        if (d < need) { const push = (need - d) / 2, ux = dx / d, uy = dy / d;
          if (!a.fixed) { a.x -= ux * push * (b.fixed ? 2 : 1); a.y -= uy * push * (b.fixed ? 2 : 1); }
          if (!b.fixed) { b.x += ux * push * (a.fixed ? 2 : 1); b.y += uy * push * (a.fixed ? 2 : 1); }
          moved = true; }
      }
      if (!moved) break;
    }
    const px = (r) => pos.get(r.island).x, py = (r) => pos.get(r.island).y;

    const svg = d3.create('svg').attr('viewBox', `0 0 ${W} ${H}`);
    mapBox.replaceChildren(svg.node());

    // chart frame, graticule, ticks
    const A = area(W, H, fs);
    const F = { x0: Math.max(4, A.x0 - fs * 0.4), x1: Math.min(W - 4, A.x1 + fs * 0.4), y0: Math.max(4, A.y0 - fs * 0.2), y1: Math.min(H - 4, A.y1 + fs * 2.2) };
    const lon0 = P.cx + (F.x0 - P.ox) / KX, lon1 = P.cx + (F.x1 - P.ox) / KX, lat1 = P.cy + (P.oy - F.y0) / KY, lat0 = P.cy - (F.y1 - P.oy) / KY;
    const span = Math.max(lon1 - lon0, lat1 - lat0);
    const step = span > 3 ? 1 : span > 1.2 ? 0.5 : span > 0.5 ? 0.25 : 0.1;
    const fmtDeg = (v, ns) => { const a = Math.abs(v); const dd = Math.floor(a + 1e-9), mm = Math.round((a - dd) * 60); return dd + '°' + (mm ? String(mm).padStart(2, '0') + '′' : '') + (ns ? (v >= 0 ? 'N' : 'S') : 'E'); };
    const gG = svg.append('g').attr('class', 'grat');
    gG.append('rect').attr('class', 'frame').attr('x', F.x0).attr('y', F.y0).attr('width', F.x1 - F.x0).attr('height', F.y1 - F.y0);
    for (let v = Math.ceil(lat0 / step) * step; v <= lat1 + 1e-9; v += step) {
      const y = gy(v); if (y < F.y0 + 2 || y > F.y1 - 2) continue;
      gG.append('line').attr('x1', F.x0).attr('x2', F.x1).attr('y1', y).attr('y2', y);
      gG.append('line').attr('class', 'tick').attr('x1', F.x0).attr('x2', F.x0 + 6).attr('y1', y).attr('y2', y);
      gG.append('line').attr('class', 'tick').attr('x1', F.x1 - 6).attr('x2', F.x1).attr('y1', y).attr('y2', y);
      gG.append('text').attr('x', F.x0 + 9).attr('y', y - 4).text(fmtDeg(v, true));
    }
    for (let v = Math.ceil(lon0 / step) * step; v <= lon1 + 1e-9; v += step) {
      const x = gx(v); if (x < F.x0 + 2 || x > F.x1 - 2) continue;
      gG.append('line').attr('x1', x).attr('x2', x).attr('y1', F.y0).attr('y2', F.y1);
      gG.append('line').attr('class', 'tick').attr('x1', x).attr('x2', x).attr('y1', F.y0).attr('y2', F.y0 + 6);
      gG.append('line').attr('class', 'tick').attr('x1', x).attr('x2', x).attr('y1', F.y1 - 6).attr('y2', F.y1);
      gG.append('text').attr('x', x + 4).attr('y', F.y0 + 14).text(fmtDeg(v, false));
    }
    // scale bar + north arrow (top right inside the frame)
    const pxPerKm = KY / 111.32;
    const kmNice = [5, 10, 20, 25, 50, 100].find((km) => km * pxPerKm >= fs * 5) || 100;
    const sbw = kmNice * pxPerKm, sx = F.x1 - fs * 1.2 - sbw, sy = F.y0 + fs * 2.4;
    const gS = svg.append('g').attr('class', 'scale');
    gS.append('rect').attr('x', sx).attr('y', sy).attr('width', sbw / 2).attr('height', 4).attr('class', 'sb1');
    gS.append('rect').attr('x', sx + sbw / 2).attr('y', sy).attr('width', sbw / 2).attr('height', 4).attr('class', 'sb2');
    gS.append('text').attr('x', sx).attr('y', sy - 5).attr('text-anchor', 'start').text('0');
    gS.append('text').attr('x', sx + sbw).attr('y', sy - 5).attr('text-anchor', 'end').text(kmNice + ' km');
    const nx = sx - fs * 1.6, ny = sy - fs * 0.2;
    gS.append('path').attr('class', 'north').attr('d', `M${nx},${ny - fs * 0.95} L${nx + fs * 0.42},${ny + fs * 0.45} L${nx},${ny + fs * 0.15} L${nx - fs * 0.42},${ny + fs * 0.45} Z`);
    gS.append('text').attr('x', nx).attr('y', ny + fs * 1.35).attr('text-anchor', 'middle').text('N');

    const gH = svg.append('g'), gL = svg.append('g'), gD = svg.append('g'), gN = svg.append('g').attr('class', final ? 'names' : '');
    const placed = [];
    const hits = (b) => placed.some((p) => b.x0 < p.x1 && b.x1 > p.x0 && b.y0 < p.y1 && b.y1 > p.y0);
    for (const [nm, v] of pos) { const r0 = islands.find((q) => q.island === nm); if (!r0.open && !r0.power_off && fa !== r0.atoll) continue; const rr = v.r + fs * 0.12; placed.push({ x0: v.x - rr, x1: v.x + rr, y0: v.y - rr, y1: v.y + rr }); }
    const counts = atollCounts();
    const pad = Math.max(fs * 1.05, Math.min(fs * 2.2, P.k * 0.03));
    const curve = d3.line().curve(d3.curveCatmullRomClosed.alpha(0.6));

    const allPts = islands.map((r) => ({ a: r.atoll, p: [gx(r.lon), gy(r.lat)] }));
    const shapes = new Map();
    const closed = d3.line().curve(d3.curveCatmullRomClosed.alpha(0.5));
    // defs: lagoon gradient + soft reef glow
    const defs = svg.append('defs');
    const lg = defs.append('linearGradient').attr('id', 'lagoon').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 1);
    lg.append('stop').attr('offset', 0).attr('stop-color', 'rgb(120 170 220)').attr('stop-opacity', 0.16);
    lg.append('stop').attr('offset', 1).attr('stop-color', 'rgb(90 140 200)').attr('stop-opacity', 0.07);
    const lgOn = defs.append('linearGradient').attr('id', 'lagoonOn').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 1);
    lgOn.append('stop').attr('offset', 0).attr('stop-color', 'rgb(140 190 240)').attr('stop-opacity', 0.26);
    lgOn.append('stop').attr('offset', 1).attr('stop-color', 'rgb(100 150 210)').attr('stop-opacity', 0.12);
    const gf = defs.append('filter').attr('id', 'reefGlow').attr('x', '-20%').attr('y', '-20%').attr('width', '140%').attr('height', '140%');
    gf.append('feGaussianBlur').attr('stdDeviation', Math.max(2, fs * 0.25));
    for (const a of atolls) {
      const rs = (ATOLL_SHAPES[a.atoll] || []).map((ring) => ring.map((p) => [gx(p[0]), gy(p[1])]));
      if (!rs.length) continue;
      const sp = ATOLL_SPLIT[a.atoll];
      const cutY = sp ? gy(sp.lat) : null;
      const keep = (p) => !sp || (sp.keep === 'north' ? p[1] <= cutY : p[1] >= cutY);
      let clip = null;
      if (sp) {
        clip = 'clip-' + a.atoll;
        const cr = defs.append('clipPath').attr('id', clip);
        if (sp.keep === 'north') cr.append('rect').attr('x', -W).attr('y', -H).attr('width', W * 3).attr('height', cutY + H);
        else cr.append('rect').attr('x', -W).attr('y', cutY).attr('width', W * 3).attr('height', H * 2);
      }
      const outer = rs[0].filter(keep);
      const d = closed(rs[0]);
      const dExtra = rs.slice(1).map((ring) => closed(ring)).join(' ');
      shapes.set(a.atoll, { outer, rs, d, dExtra, clip, cutY, cxh: d3.mean(outer, (p) => p[0]), cyh: d3.mean(outer, (p) => p[1]) });
      // outline as obstacles so labels never cross an atoll rim
      for (const ring of rs.map((r0, i) => (i === 0 ? r0.filter(keep) : r0))) {
        const rr = ring.concat([ring[0]]);
        for (let i = 0; i + 1 < rr.length; i++) {
          const [x0, y0] = rr[i], [x1, y1] = rr[i + 1], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 8));
          for (let s = 0; s <= n; s++) { const x = x0 + (x1 - x0) * s / n, y = y0 + (y1 - y0) * s / n; placed.push({ x0: x - 2, x1: x + 2, y0: y - 2, y1: y + 2, rim: a.atoll }); }
        }
      }
    }
    for (const a of atolls) {
      const sh = shapes.get(a.atoll); if (!sh) continue;
      const { outer, d, dExtra, clip, cutY, cxh, cyh } = sh;
      const cn = counts[a.atoll] || { prog: 0, hold: 0, not: 0, over: 0 };
      const status = a.power_off ? 'off' : cn.over ? 'over' : cn.hold ? 'hold' : 'ok';
      const c = css(status === 'off' ? '--red' : status === 'over' ? '--t-over' : status === 'hold' ? '--t-hold' : '--green');
      const dim = (fa && fa !== a.atoll) || (sel && !islands.some((r) => r.atoll === a.atoll && sel.has(r.island))) || (pw && !islands.some((r) => r.atoll === a.atoll && pw.has(r.island)));
      const on = fa === a.atoll;
      const g = gH.append('g').attr('class', 'hullg' + (on ? ' on' : '')).attr('opacity', dim ? 0.3 : 1).on('click', (ev) => { ev.stopPropagation(); zoom = 1; go({ kind: 'atoll', atoll: a.atoll }); });
      const gc = g.append('g').attr('clip-path', clip ? 'url(#' + clip + ')' : null);
      gc.append('path').attr('class', 'reef-glow').attr('d', d).attr('fill', 'none').attr('stroke', on ? 'rgba(170,210,245,.5)' : 'rgba(140,185,230,.28)').attr('stroke-width', fs * 0.5).attr('filter', 'url(#reefGlow)');
      gc.append('path').attr('class', 'rim-fill').attr('d', d).attr('fill', on ? 'url(#lagoonOn)' : 'url(#lagoon)').attr('stroke', 'none');
      gc.append('path').attr('class', 'rim').attr('d', d).attr('fill', 'none').attr('stroke', on ? 'rgba(225,238,250,.95)' : 'rgba(175,205,232,.62)').attr('stroke-width', on ? 1.8 : 1.2).attr('stroke-linejoin', 'round');
      if (dExtra) {
        g.append('path').attr('class', 'rim-fill').attr('d', dExtra).attr('fill', on ? 'url(#lagoonOn)' : 'url(#lagoon)');
        g.append('path').attr('class', 'rim').attr('d', dExtra).attr('fill', 'none').attr('stroke', on ? 'rgba(225,238,250,.95)' : 'rgba(175,205,232,.62)').attr('stroke-width', on ? 1.6 : 1.1);
      }
      if (clip && ATOLL_SPLIT[a.atoll].keep === 'north') {
        // dashed AA / ADh boundary across the Ari lagoon
        const xsCut = []; const r0 = sh.rs[0];
        for (let i = 0; i < r0.length; i++) { const p = r0[i], q = r0[(i + 1) % r0.length]; if ((p[1] - cutY) * (q[1] - cutY) <= 0 && p[1] !== q[1]) xsCut.push(p[0] + (q[0] - p[0]) * (cutY - p[1]) / (q[1] - p[1])); }
        if (xsCut.length >= 2) gH.append('line').attr('class', 'ari-cut').attr('x1', d3.min(xsCut) + 3).attr('x2', d3.max(xsCut) - 3).attr('y1', cutY).attr('y2', cutY)
          .attr('stroke', 'rgba(175,205,232,.38)').attr('stroke-width', 1).attr('stroke-dasharray', '4 4').attr('pointer-events', 'none').attr('opacity', fa && fa !== 'AA' && fa !== 'ADh' ? 0.3 : 1);
      }
      const xs = outer.length ? outer.map((p) => p[0]) : [cxh], ys = outer.length ? outer.map((p) => p[1]) : [cyh];
      const maxX = d3.max(xs), minX = d3.min(xs), midY = (d3.min(ys) + d3.max(ys)) / 2;
      const lab = gL.append('g').attr('class', 'a-lab').attr('opacity', dim ? 0.4 : 1).on('click', (ev) => { ev.stopPropagation(); zoom = 1; go({ kind: 'atoll', atoll: a.atoll }); });
      lab.attr('data-tip', a.atoll_name + ' atoll\n' + cn.prog + ' ongoing, ' + cn.hold + ' on hold, ' + cn.over + ' overdue\n' + a.islands_with_tasks + ' of ' + a.islands + ' islands have open tasks' + (a.power_off ? '\n' + a.power_off + ' island without power' : '') + '\nTap to open');
      const t1 = lab.append('text').attr('class', 'a-code').attr('font-size', fs * 1.2);
      t1.append('tspan').text(a.atoll);
      const small = W < 700;
      if (!small) t1.append('tspan').attr('class', 'a-name').attr('dx', fs * 0.35).text(a.atoll_name);
      const t2 = lab.append('text').attr('class', 'a-sub').attr('font-size', fs * 0.88);
      if (!small) t2.append('tspan').text(a.open ? a.open + ' open' : 'No open tasks');
      if (!small && cn.hold) t2.append('tspan').attr('class', 'hl').text(' · ' + cn.hold + (small ? ' hold' : ' on hold'));
      if (!small && cn.over) t2.append('tspan').attr('class', 'ov').text(' · ' + cn.over + ' overdue');
      if (!small && a.power_off) t2.append('tspan').attr('class', 'ov').text(small ? ' · off' : ' · power off');
      const dot = lab.append('rect').attr('width', fs * 0.42).attr('height', fs * 0.42).attr('rx', 2).attr('fill', c);
      const w = Math.max(t1.node().getComputedTextLength() + fs * 0.95, (small ? 0 : t2.node().getComputedTextLength())) + 8, hh = small ? fs * 2.1 : fs * 2.9;
      const sides = [];
      for (const gap of [0.6, 1.6, 3]) sides.push(['start', maxX + fs * gap], ['end', minX - fs * gap]);
      let best = null;
      search: for (const dy of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7]) {
        for (const [anc, sx] of sides) {
          const bx0 = anc === 'start' ? sx : sx - w, yy = midY + dy * hh * 0.6;
          const box = { x0: bx0 - 4, x1: bx0 + w + 4, y0: yy - hh * 0.55, y1: yy + hh * 0.55 };
          if (box.x0 < 2 || box.x1 > W - 2 || box.y0 < 2 || box.y1 > H - 2) continue;
          if (!hits(box)) { best = { anc, sx, yy, box }; break search; }
        }
      }
      if (!best) { const [anc, sx] = sides[0]; const bx0 = anc === 'start' ? sx : sx - w; best = { anc, sx, yy: midY, box: { x0: bx0 - 4, x1: bx0 + w + 4, y0: midY - hh * 0.55, y1: midY + hh * 0.55 } }; }
      const left = best.anc === 'start';
      const codeX = left ? best.sx + fs * 0.75 : best.sx;
      t1.attr('text-anchor', best.anc).attr('x', codeX).attr('y', best.yy - fs * 0.05);
      t2.attr('text-anchor', best.anc).attr('x', best.sx).attr('y', best.yy + fs * 1.3);
      dot.attr('x', left ? best.sx : best.sx - t1.node().getComputedTextLength() - fs * 0.95).attr('y', best.yy - fs * 0.62);
      placed.push(best.box);
    }

    const C = { 'Overdue': '--t-over', 'In progress': '--t-prog', 'On hold': '--t-hold', 'Planned': '--t-plan' };
    const order = islands.slice().sort((a, b) => (a.open - b.open) || (a.overdue - b.overdue));
    for (const r of order) {
      const x = px(r), y = py(r), tx = gx(r.lon), ty = gy(r.lat);
      if (x < -50 || x > W + 50 || y < -50 || y > H + 50) continue;
      const tiny = !r.open && !r.power_off && fa !== r.atoll;
      if (tiny) { gD.append('circle').attr('class', 'qdot').attr('cx', tx).attr('cy', ty).attr('r', Math.max(1.6, fs * 0.13)).attr('fill', 'rgba(205,216,228,.42)').attr('opacity', (fa && fa !== r.atoll) || sel || pw ? 0.4 : 1); continue; }
      const dim = (fa && fa !== r.atoll) || (sel && !sel.has(r.island)) || (pw && !pw.has(r.island));
      const g = gD.append('g').attr('opacity', dim ? 0.25 : 1);
      if (Math.hypot(x - tx, y - ty) > 2) g.append('line').attr('x1', tx).attr('y1', ty).attr('x2', x).attr('y2', y).attr('stroke', 'rgba(232,238,245,.35)').attr('stroke-width', 1);
      if (r.power_off) {
        g.append('circle').attr('cx', x).attr('cy', y).attr('r', rTask + fs * 0.32).attr('fill', 'none').attr('stroke', css('--red')).attr('stroke-width', 2.25);
        g.append('circle').attr('class', 'ring').attr('cx', x).attr('cy', y).attr('r', rTask + fs * 0.32).attr('fill', 'none').attr('stroke', css('--red')).attr('stroke-width', 1.5);
      }
      if (r.open) {
        const c = css(C[r.top_status] || '--t-prog');
        g.append('circle').attr('cx', x).attr('cy', y).attr('r', rTask).attr('fill', c).attr('stroke', '#0F141B').attr('stroke-width', 2.5);
        g.append('circle').attr('cx', x).attr('cy', y).attr('r', rTask + 1.5).attr('fill', 'none').attr('stroke', 'rgba(232,238,245,.55)').attr('stroke-width', 1);
        if (r.open > 1) g.append('text').attr('class', 'badge').attr('x', x).attr('y', y).attr('dy', '0.35em').attr('text-anchor', 'middle').attr('font-size', fs * 0.78).text(r.open);
      } else g.append('circle').attr('cx', x).attr('cy', y).attr('r', rQuiet * 0.85).attr('fill', r.power_off ? css('--red') : 'rgba(205,216,228,.62)');
      if (selIsland === r.island) g.append('circle').attr('cx', x).attr('cy', y).attr('r', fs * 1.05).attr('fill', 'none').attr('stroke', '#fff').attr('stroke-width', 2);
      g.append('circle').attr('class', 'hit').attr('cx', x).attr('cy', y).attr('r', fs * 1.05).attr('fill', 'transparent')
        .attr('data-tip', r.island + (r.power_off ? ', power off' : '') + '\n' + (r.open ? r.task_lines : 'No open tasks') + '\nTap to open')
        .on('click', (ev) => { ev.stopPropagation(); go({ kind: 'island', island: r.island }); });
    }
    if (final) {
      const leaders = [];
      const dots = islands.filter((q) => q.open || q.power_off || fa === q.atoll).map((q) => ({ x: px(q), y: py(q), r: (q.open ? rTask : rQuiet) + 3, id: q.island }));
      const cross = (a, b, c, d) => { const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])); return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b); };
      const segDist = (p, a, b) => { const vx = b[0] - a[0], vy = b[1] - a[1], L = vx * vx + vy * vy || 1; let t = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - (a[0] + vx * t), p[1] - (a[1] + vy * t)); };
      const leaderOk = (A, B, self) => !leaders.some(([c, d]) => cross(A, B, c, d)) && !dots.some((dt) => dt.id !== self && segDist([dt.x, dt.y], A, B) < dt.r);
      const named = islands.filter((r) => !((fa && fa !== r.atoll) || (sel && !sel.has(r.island)) || (pw && !pw.has(r.island))) && (r.open || r.power_off || fa === r.atoll))
        .sort((a, b) => (b.overdue - a.overdue) || (b.power_off - a.power_off) || (b.open - a.open));
      for (const r of named) {
        const x = px(r), y = py(r);
        const fsz = fs * (fa ? 0.9 : 0.84);
        const tn = gN.append('text').attr('class', 'i-name').attr('font-size', fsz).text(short(r.island));
        const w = tn.node().getComputedTextLength() + 4;
        const off = (r.open ? rTask : rQuiet) + fs * 0.32;
        const tryAt = (lx, ly, anchor) => {
          const x0 = anchor === 'start' ? lx : anchor === 'end' ? lx - w : lx - w / 2;
          const b = { x0: x0 - 3, x1: x0 + w + 3, y0: ly - fsz * 1.05, y1: ly + fsz * 0.4 };
          if (b.x0 < 2 || b.x1 > W - 2 || b.y0 < 2 || b.y1 > H - 2 || placed.some((p) => p.rim !== r.atoll && b.x0 < p.x1 && b.x1 > p.x0 && b.y0 < p.y1 && b.y1 > p.y0)) return null;
          return b;
        };
        let okP = false;
        // 1) right next to the dot
        for (const [lx, ly, anchor] of [[x + off, y + fsz * 0.35, 'start'], [x - off, y + fsz * 0.35, 'end'], [x, y - off - fsz * 0.25, 'middle'], [x, y + off + fsz * 0.95, 'middle']]) {
          const b = tryAt(lx, ly, anchor);
          if (b) { placed.push(b); tn.attr('x', lx).attr('y', ly).attr('text-anchor', anchor); okP = true; break; }
        }
        // 2) further out, with a thin leader line back to the dot
        if (!okP) {
          search: for (const dist of [1.8, 2.6, 3.4, 4.4, 5.8]) {
            for (const ang of [0, 180, -35, 35, 145, -145, -90, 90, -60, 60, 120, -120]) {
              const rad = ang * Math.PI / 180, R = dist * fs;
              const ex = x + Math.cos(rad) * R, ey = y + Math.sin(rad) * R;
              const anchor = Math.cos(rad) > 0.3 ? 'start' : Math.cos(rad) < -0.3 ? 'end' : 'middle';
              const ly = ey + fsz * 0.35;
              const b = tryAt(ex, ly, anchor);
              if (!b) continue;
              const lx2 = anchor === 'start' ? ex - 3 : anchor === 'end' ? ex + 3 : ex;
              const ly2 = anchor === 'middle' ? (Math.sin(rad) < 0 ? ly + 3 : ly - fsz * 0.95) : ey;
              const rr = (r.open ? rTask : rQuiet) + 2;
              const d0 = Math.hypot(lx2 - x, ly2 - y) || 1;
              const A = [x + (lx2 - x) / d0 * rr, y + (ly2 - y) / d0 * rr], B = [lx2, ly2];
              if (!leaderOk(A, B, r.island)) continue;
              leaders.push([A, B]);
              gN.insert('line', ':first-child').attr('class', 'leader').attr('x1', x + (lx2 - x) / d0 * rr).attr('y1', y + (ly2 - y) / d0 * rr).attr('x2', lx2).attr('y2', ly2);
              placed.push(b); tn.attr('x', ex).attr('y', ly).attr('text-anchor', anchor); okP = true; break search;
            }
          }
        }
        if (!okP) tn.remove();
      }
    }
  }

  // ---------- render ----------
  const render = () => {
    size();
    ['summary', 'outage_summary', 'team_summary', 'task_status'].forEach(fill);
    drawPower(); drawTasks(); drawTeam(); drawSide(false);
    cancelAnimationFrame(anim); cur = target(); drawMapAt(cur, true);
  };
  let rz = null;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(render, 150); });
  const fsb = document.getElementById('fs-btn');
  if (fsb) { if (!root.requestFullscreen) fsb.hidden = true; fsb.addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else root.requestFullscreen().catch(() => { fsb.hidden = true; }); });
    document.addEventListener('fullscreenchange', () => { fsb.textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen'; clearTimeout(rz); rz = setTimeout(render, 100); }); }
  dash.onData(render);
})();

// Add and edit tasks and power interruptions straight from the board.
(async () => {
  const UNITS = ['Electrical Services Unit', 'Mechanical Services Unit', 'Water and Sewage Services Unit', 'Administration and Support Service Unit', 'Logistics Unit'];
  const AREAS = ['Mechanical', 'Electrical', 'Infrastructure', 'Office/CS', 'Maintenance', 'Store', 'Workshop', 'Staff area'];
  const STATUSES = ['Planned', 'In progress', 'On hold', 'Completed'];
  const OFFSITE = ['SCRD office', 'SCRD workshop'];
  const TZ = 'Indian/Maldives';

  const root = document.getElementById('gx');
  const addBtn = document.getElementById('add-btn');
  const menu = document.getElementById('add-menu');
  const back = document.getElementById('ed');
  const sampleBadge = document.querySelector('.top .sample');

  const db = await claude.use('db');
  const user = await claude.use('user');
  let canWrite = false;
  if (db) {
    const c = user ? await user.can('data.write') : null;
    canWrite = c !== false; // null: not told, keep the controls and let a refused write decide
  }
  const uid = user ? await user.id() : null;

  // ---- sample badge follows the data ----
  const hasSample = () => [...(SCRD.get('tasks') || []), ...(SCRD.get('outages') || [])].some((r) => r.sample);
  const syncSample = () => {
    if (sampleBadge) sampleBadge.hidden = !hasSample();
    const rm = document.getElementById('m-clear');
    if (rm) rm.hidden = !(canWrite && hasSample());
  };
  dash.onData(syncSample);

  if (!db || !canWrite) { addBtn.hidden = true; return; }
  addBtn.hidden = false;
  root.classList.add('can-edit');

  // ---- helpers ----
  const h = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null) n.append(c);
    return n;
  };
  const pad = (n) => String(n).padStart(2, '0');
  const toInput = (iso) => {
    if (!iso) return '';
    const t = Date.parse(iso); if (!Number.isFinite(t)) return '';
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(t).map((x) => [x.type, x.value]));
    return p.year + '-' + p.month + '-' + p.day + 'T' + (p.hour === '24' ? '00' : p.hour) + ':' + p.minute;
  };
  const fromInput = (v) => (v ? v + ':00+05:00' : '');
  const nowInput = () => toInput(new Date().toISOString());
  const todayISO = () => nowInput().slice(0, 10);
  const nextId = (rows, prefix) => {
    const max = rows.reduce((m, r) => { const k = String(r.id || '').match(/(\d+)$/); return k ? Math.max(m, Number(k[1])) : m; }, 0);
    return prefix + String(max + 1).padStart(3, '0');
  };
  const islandSelect = (id, value, extra) => {
    const sel = h('select', { id, required: true });
    sel.append(h('option', { value: '', text: 'Choose an island' }));
    const isl = (SCRD.get('islands') || []).slice().sort((a, b) => a.island.localeCompare(b.island));
    const byAtoll = new Map();
    for (const r of isl) { const k = r.atoll_name ? r.atoll + ' · ' + r.atoll_name : r.atoll; if (!byAtoll.has(k)) byAtoll.set(k, []); byAtoll.get(k).push(r.island); }
    if (extra) { const g = h('optgroup', { label: 'Office and other locations' }); extra.forEach((x) => g.append(h('option', { value: x, text: x }))); sel.append(g); }
    for (const [k, list] of byAtoll) { const g = h('optgroup', { label: k }); list.forEach((x) => g.append(h('option', { value: x, text: x }))); sel.append(g); }
    if (value && ![...sel.options].some((o) => o.value === value)) sel.append(h('option', { value, text: value }));
    sel.value = value || '';
    return sel;
  };
  const listSelect = (id, list, value, blank) => {
    const sel = h('select', { id, required: !blank });
    if (blank) sel.append(h('option', { value: '', text: blank }));
    list.forEach((x) => sel.append(h('option', { value: x, text: x })));
    if (value && !list.includes(value)) sel.append(h('option', { value, text: value }));
    sel.value = value || (blank ? '' : list[0]);
    return sel;
  };
  const field = (label, control, hint, wide) => h('label', { class: 'ed-f' + (wide ? ' wide' : ''), for: control.id }, h('span', { class: 'ed-l', text: label }), control, hint ? h('span', { class: 'ed-h', text: hint }) : null);

  // ---- the form shell ----
  let lastFocus = null;
  const close = () => { back.hidden = true; back.replaceChildren(); if (lastFocus && lastFocus.focus) lastFocus.focus(); };
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !back.hidden) close(); });

  const openForm = ({ title, sub, fields, onSave, onDelete, extraButtons }) => {
    lastFocus = document.activeElement;
    const msg = h('p', { class: 'ed-msg', role: 'status' });
    const save = h('button', { type: 'submit', class: 'ed-b primary', text: 'Save' });
    const cancel = h('button', { type: 'button', class: 'ed-b', text: 'Cancel' });
    cancel.addEventListener('click', close);
    const left = h('div', { class: 'ed-left' });
    if (onDelete) {
      const del = h('button', { type: 'button', class: 'ed-b danger', text: 'Delete' });
      let armed = false;
      del.addEventListener('click', async () => {
        if (!armed) { armed = true; del.textContent = 'Tap again to delete'; setTimeout(() => { armed = false; del.textContent = 'Delete'; }, 4000); return; }
        del.disabled = true; msg.textContent = 'Deleting…';
        try { await onDelete(); close(); } catch (e) { del.disabled = false; msg.textContent = 'Could not delete: ' + (e && e.message || 'try again.'); }
      });
      left.append(del);
    }
    (extraButtons || []).forEach((b) => left.append(b(msg)));
    const form = h('form', { class: 'ed-card', novalidate: true, 'aria-labelledby': 'ed-title' },
      h('div', { class: 'ed-top' }, h('h2', { id: 'ed-title', text: title }), sub ? h('p', { class: 'ed-sub', text: sub }) : null),
      h('div', { class: 'ed-grid' }, fields),
      msg,
      h('div', { class: 'ed-actions' }, left, h('div', { class: 'ed-right' }, cancel, save)));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const problem = onSave.check();
      if (problem) { msg.textContent = problem; return; }
      save.disabled = true; msg.textContent = 'Saving…';
      try { await onSave.write(); close(); }
      catch (err) {
        save.disabled = false;
        msg.textContent = err && err.code === 'invalid_argument' ? 'You can view this board but not change it.' : err && err.code === 'quota_exceeded' ? 'The board’s storage is full. Delete old records first.' : 'Could not save. Check the connection and try again.';
      }
    });
    back.replaceChildren(form);
    back.hidden = false;
    const first = form.querySelector('input, select, textarea');
    if (first) first.focus();
  };

  // ---- task form ----
  const taskForm = (t, preset) => {
    const rows = SCRD.get('tasks') || [];
    const isNew = !t;
    t = t || Object.assign({ status: 'Planned', progress: 0, start: todayISO(), due: '', unit: UNITS[0], category: AREAS[0] }, preset || {});
    const f = {
      task: h('input', { id: 'f-task', type: 'text', required: true, maxlength: 120, value: t.task || '', placeholder: 'e.g. Genset #2 top overhaul' }),
      island: islandSelect('f-island', t.island, [...new Set(OFFSITE.concat(rows.map((r) => r.island).filter((x) => x && !(SCRD.get('islands') || []).some((i) => i.island === x))))].sort((a, b) => (OFFSITE.includes(b) - OFFSITE.includes(a)) || a.localeCompare(b))),
      unit: listSelect('f-unit', UNITS, t.unit),
      category: listSelect('f-area', AREAS, t.category),
      status: listSelect('f-status', STATUSES, t.status === 'Not started' ? 'Planned' : t.status),
      progress: h('input', { id: 'f-progress', type: 'number', min: 0, max: 100, step: 5, value: Number(t.progress) || 0 }),
      start: h('input', { id: 'f-start', type: 'date', value: String(t.start || '').slice(0, 10) }),
      due: h('input', { id: 'f-due', type: 'date', value: String(t.due || '').slice(0, 10) }),
      assigned: h('input', { id: 'f-assigned', type: 'text', maxlength: 200, value: t.assigned || '', placeholder: 'e.g. Ali Nabeeh Waseem, Haisham Jaufar' }),
      note: h('textarea', { id: 'f-note', rows: 2, maxlength: 240, placeholder: 'Latest update. For on-hold work, what it is waiting for.' }, t.note || ''),
    };
    f.status.addEventListener('change', () => {
      if (f.status.value === 'Completed') f.progress.value = 100;
      if (f.status.value === 'Planned' && !Number(f.progress.value)) f.progress.value = 0;
    });
    openForm({
      title: isNew ? 'New task' : 'Edit task',
      sub: isNew ? 'It appears on the board as soon as you save.' : t.id,
      fields: [field('Task', f.task, null, true), field('Island', f.island), field('Unit', f.unit), field('Work area', f.category), field('Status', f.status),
        field('Progress (%)', f.progress), field('Start date', f.start), field('Due date', f.due), field('Assigned staff', f.assigned, null, true), field('Note', f.note, null, true)],
      onSave: {
        check: () => {
          if (!f.task.value.trim()) return 'Give the task a name.';
          if (!f.island.value) return 'Choose the island, or the office or workshop.';
          if (f.start.value && f.due.value && f.start.value > f.due.value) return 'The start date is after the due date.';
          const p = Number(f.progress.value); if (!(p >= 0 && p <= 100)) return 'Progress must be between 0 and 100.';
          return '';
        },
        write: () => {
          const id = isNew ? nextId(rows, 'SCRD-') : t.id;
          return db.doc('tasks/' + id).set({
            task: f.task.value.trim(), island: f.island.value, unit: f.unit.value, category: f.category.value, status: f.status.value,
            progress: Math.round(Number(f.progress.value) || 0), start: f.start.value, due: f.due.value, assigned: f.assigned.value.trim(), note: f.note.value.trim(),
            updated_at: new Date().toISOString(), updated_by: uid || '',
          });
        },
      },
      onDelete: isNew ? null : () => db.doc('tasks/' + t.id).delete(),
    });
  };

  // ---- power interruption form ----
  const outageForm = (o, preset) => {
    const rows = SCRD.get('outages') || [];
    const isNew = !o;
    o = o || Object.assign({ type: 'Unplanned', start: new Date().toISOString(), end: '', unit: UNITS[1] }, preset || {});
    const f = {
      island: islandSelect('f-oisland', o.island),
      type: listSelect('f-otype', ['Unplanned', 'Planned'], o.type),
      start: h('input', { id: 'f-ostart', type: 'datetime-local', required: true, value: toInput(o.start) }),
      end: h('input', { id: 'f-oend', type: 'datetime-local', value: toInput(o.end) }),
      cause: h('input', { id: 'f-ocause', type: 'text', required: true, maxlength: 140, value: o.cause || '', placeholder: 'e.g. Genset #1 tripped on high water temperature' }),
      unit: listSelect('f-ounit', UNITS, o.unit),
    };
    const ongoing = !isNew && Date.parse(o.start) <= Date.now() && (!o.end || Date.parse(o.end) > Date.now());
    const restoreBtn = (msg) => {
      const b = h('button', { type: 'button', class: 'ed-b ok', text: 'Power restored now' });
      b.addEventListener('click', async () => {
        b.disabled = true; msg.textContent = 'Saving…';
        try { await db.doc('outages/' + o.id).update({ end: new Date().toISOString(), updated_at: new Date().toISOString(), updated_by: uid || '' }); close(); }
        catch (e) { b.disabled = false; msg.textContent = 'Could not save. Check the connection and try again.'; }
      });
      return b;
    };
    openForm({
      title: isNew ? 'New power interruption' : 'Edit power interruption',
      sub: isNew ? 'Leave “Restored” empty while the island is still without power. For a planned shutdown, set the times ahead.' : o.id,
      fields: [field('Island', f.island), field('Type', f.type), field('Power off from', f.start, 'Maldives time'), field('Restored', f.end, 'Leave empty while still off'),
        field('Cause', f.cause, null, true), field('Unit', f.unit)],
      onSave: {
        check: () => {
          if (!f.island.value) return 'Choose the island.';
          if (!f.start.value) return 'Set when the power went off.';
          if (!f.cause.value.trim()) return 'Say what caused it.';
          if (f.end.value && f.end.value < f.start.value) return 'The restore time is before the start.';
          return '';
        },
        write: () => {
          const id = isNew ? nextId(rows, 'INT-') : o.id;
          return db.doc('outages/' + id).set({
            island: f.island.value, service: 'Electricity', type: f.type.value, start: fromInput(f.start.value), end: fromInput(f.end.value),
            cause: f.cause.value.trim(), unit: f.unit.value, updated_at: new Date().toISOString(), updated_by: uid || '',
          });
        },
      },
      onDelete: isNew ? null : () => db.doc('outages/' + o.id).delete(),
      extraButtons: ongoing ? [restoreBtn] : [],
    });
  };

  // ---- remove the sample records ----
  const clearSample = () => {
    const tasks = (SCRD.get('tasks') || []).filter((r) => r.sample), outs = (SCRD.get('outages') || []).filter((r) => r.sample);
    const msg = h('p', { class: 'ed-msg', role: 'status' });
    const go = h('button', { type: 'button', class: 'ed-b danger', text: 'Remove sample data' });
    const cancel = h('button', { type: 'button', class: 'ed-b', text: 'Keep it' });
    cancel.addEventListener('click', close);
    go.addEventListener('click', async () => {
      go.disabled = true; cancel.disabled = true;
      try {
        let n = 0; const total = tasks.length + outs.length;
        for (const r of tasks) { await db.doc('tasks/' + r.id).delete(); msg.textContent = 'Removing… ' + (++n) + ' of ' + total; }
        for (const r of outs) { await db.doc('outages/' + r.id).delete(); msg.textContent = 'Removing… ' + (++n) + ' of ' + total; }
        const att = await db.collection('attendance').where('sample', '==', true).get();
        for (const d of att.docs) await db.doc('attendance/' + d.id).delete();
        close();
      } catch (e) { go.disabled = false; cancel.disabled = false; msg.textContent = 'Stopped before finishing. Try again to remove the rest.'; }
    });
    lastFocus = document.activeElement;
    back.replaceChildren(h('div', { class: 'ed-card narrowc', role: 'dialog', 'aria-labelledby': 'ed-title' },
      h('div', { class: 'ed-top' }, h('h2', { id: 'ed-title', text: 'Remove sample data?' }),
        h('p', { class: 'ed-sub', text: 'This deletes the ' + tasks.length + ' example tasks and ' + outs.length + ' example power interruptions for everyone. Records you added or edited stay.' })),
      msg, h('div', { class: 'ed-actions' }, h('div', { class: 'ed-left' }), h('div', { class: 'ed-right' }, cancel, go))));
    back.hidden = false; cancel.focus();
  };

  // ---- add menu ----
  // the header clips anything that hangs below it, so the menu lives on the board itself
  root.appendChild(menu);
  const placeMenu = () => {
    const r = addBtn.getBoundingClientRect(), g = root.getBoundingClientRect();
    menu.style.top = (r.bottom - g.top + 6) + 'px';
    menu.style.right = Math.max(8, g.right - r.right) + 'px';
  };
  const toggleMenu = (open) => { if (open) placeMenu(); menu.hidden = !open; addBtn.setAttribute('aria-expanded', String(open)); };
  window.addEventListener('resize', () => { if (!menu.hidden) placeMenu(); });
  addBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(menu.hidden); });
  document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target)) toggleMenu(false); });
  document.getElementById('m-task').addEventListener('click', () => { toggleMenu(false); taskForm(null); });
  document.getElementById('m-outage').addEventListener('click', () => { toggleMenu(false); outageForm(null); });
  document.getElementById('m-clear').addEventListener('click', () => { toggleMenu(false); clearSample(); });
  syncSample();

  // ---- tap a task or an interruption on a detail screen to edit it ----
  const raw = (kind, id) => (SCRD.get(kind) || []).find((r) => r.id === id);
  document.getElementById('side').addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    if (add) { e.stopPropagation(); if (add.dataset.add === 'outage') outageForm(null, { island: add.dataset.island }); else taskForm(null, { island: add.dataset.island }); return; }
    const tc = e.target.closest('[data-tid]');
    if (tc) { const t = raw('tasks', tc.dataset.tid); if (t) { e.stopPropagation(); taskForm(t); } return; }
    const oc = e.target.closest('[data-oid], .log tr[data-key]');
    if (oc) { const o = raw('outages', oc.dataset.oid || oc.dataset.key); if (o) { e.stopPropagation(); outageForm(o); } }
  });
})();

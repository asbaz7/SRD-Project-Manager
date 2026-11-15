// Small stand-in for the old dashboard runtime: datasets come from the board's own database,
// calculations are recomputed whenever a dataset changes.
(() => {
  const src = { tasks: null, outages: null, team: null, islands: null };
  const err = {};
  const calcs = new Map();
  const memo = new Map();
  const subs = [];
  let raf = 0;
  const fire = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => subs.forEach((f) => { try { f(); } catch (e) { console.error(e); } }));
  };
  const dash = {
    calc(id, o) { calcs.set(id, o); },
    data(id) {
      if (id in src) {
        if (err[id]) return { status: 'error', data: [], message: err[id] };
        return src[id] == null ? { status: 'loading', data: [] } : { status: 'ok', data: src[id] };
      }
      const c = calcs.get(id);
      if (!c) return { status: 'missing', data: [] };
      if (memo.has(id)) return memo.get(id);
      const ins = c.inputs.map((x) => dash.data(x));
      const bad = ins.find((s) => s.status !== 'ok');
      let r;
      if (bad) r = { status: bad.status, data: [], message: bad.message };
      else {
        try { r = { status: 'ok', data: c.fn(...ins.map((s) => s.data)) }; }
        catch (e) { console.error(id, e); r = { status: 'error', data: [], message: String(e && e.message || e) }; }
      }
      memo.set(id, r);
      return r;
    },
    onData(fn) { subs.push(fn); try { fn(); } catch (e) { console.error(e); } },
    colors: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
  };
  window.dash = dash;
  window.SCRD = {
    set(id, rows) { src[id] = rows; delete err[id]; memo.clear(); fire(); },
    fail(id, m) { err[id] = m || 'Could not load'; memo.clear(); fire(); },
    get(id) { return src[id]; },
    refresh() { memo.clear(); fire(); },
  };
  // times move on: recompute "overdue", "ongoing" and the clock-based figures every minute
  setInterval(() => { memo.clear(); fire(); }, 60000);
})();

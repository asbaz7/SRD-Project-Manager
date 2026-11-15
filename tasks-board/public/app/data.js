// Reads the board's shared database live and hands each list to the board.
(async () => {
  const note = document.getElementById('db-note');
  const say = (t) => { if (!note) return; note.textContent = t || ''; note.hidden = !t; };
  const db = await claude.use('db');
  if (!db) {
    ['tasks', 'outages', 'team', 'islands'].forEach((k) => SCRD.fail(k, 'No data connection'));
    say('');
    return;
  }
  window.SCRD_DB = db;
  const pending = new Set(['tasks', 'outages', 'team', 'islands']);
  const timer = setTimeout(() => { if (pending.size) say('Can’t reach the board’s data yet. It will appear once the connection returns.'); }, 10000);
  const settle = (k, snap) => {
    if (!snap.metadata.fromCache) pending.delete(k);
    if (!pending.size) { clearTimeout(timer); say(''); }
  };
  const fail = (k) => (e) => { SCRD.fail(k, e && e.message); pending.delete(k); say('Some of the board’s data could not be loaded. Reopen the board to try again.'); };

  db.collection('tasks').onSnapshot((s) => {
    SCRD.set('tasks', s.docs.map((d) => Object.assign({}, d.data(), { id: d.id })));
    settle('tasks', s);
  }, fail('tasks'));

  db.collection('outages').onSnapshot((s) => {
    SCRD.set('outages', s.docs.map((d) => Object.assign({ service: 'Electricity' }, d.data(), { id: d.id })));
    settle('outages', s);
  }, fail('outages'));

  // attendance: one document per day, the board shows the latest day
  db.collection('attendance').orderBy('date', 'desc').limit(1).onSnapshot((s) => {
    const d = s.docs[0];
    const day = d ? d.data() : null;
    SCRD.set('team', day && Array.isArray(day.rows) ? day.rows.map((r) => Object.assign({ date: day.date }, r)) : []);
    settle('team', s);
  }, fail('team'));

  db.doc('ref/islands').onSnapshot((d) => {
    const v = d.exists ? d.data() : null;
    SCRD.set('islands', v && Array.isArray(v.rows) ? v.rows : []);
    settle('islands', d);
  }, fail('islands'));
})();

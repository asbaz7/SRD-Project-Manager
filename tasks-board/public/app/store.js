// Connects the board to Supabase. It offers the same small interface the board's
// data and editing scripts were written against (collections, documents, live
// snapshots), so those scripts run unchanged.
(() => {
  const cfg = window.SCRD_CONFIG || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseKey) {
    window.claude = { use: async () => null };
    return;
  }
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  window.SCRD_SB = sb;

  const TABLE = { tasks: 'scrd_board_tasks', outages: 'scrd_board_outages', attendance: 'scrd_board_attendance', islands: 'scrd_board_islands' };

  // database row -> what the board reads
  const fromRow = {
    tasks: (r) => ({
      task: r.task, island: r.island, unit: r.unit, category: r.category, status: r.status, progress: r.progress,
      start: r.start_date || '', due: r.due_date || '', assigned: r.assigned || '', note: r.note || '',
      source: r.source || undefined, sample: r.sample || undefined, updated_at: r.updated_at,
    }),
    outages: (r) => ({
      island: r.island, service: r.service, type: r.type, start: r.start_at, end: r.end_at || '',
      cause: r.cause || '', unit: r.unit, sample: r.sample || undefined, updated_at: r.updated_at,
    }),
    attendance: (r) => ({ date: r.date, rows: r.rows || [], sample: r.sample || undefined }),
  };
  // what the board writes -> database row
  const toRow = {
    tasks: (d) => ({
      task: d.task, island: d.island, unit: d.unit, category: d.category, status: d.status, progress: d.progress,
      start_date: d.start || null, due_date: d.due || null, assigned: d.assigned || '', note: d.note || '',
    }),
    outages: (d) => {
      const o = {};
      if ('island' in d) o.island = d.island;
      if ('service' in d) o.service = d.service;
      if ('type' in d) o.type = d.type;
      if ('start' in d) o.start_at = d.start || null;
      if ('end' in d) o.end_at = d.end || null;
      if ('cause' in d) o.cause = d.cause;
      if ('unit' in d) o.unit = d.unit;
      return o;
    },
    attendance: (d) => ({ date: d.date, rows: d.rows || [] }),
  };
  const fail = (error) => { const e = new Error(error.message || 'Request failed'); e.code = error.code === '42501' ? 'invalid_argument' : (error.code || 'unavailable'); throw e; };

  const docSnap = (kind, r) => ({ id: kind === 'attendance' ? r.id : r.id, exists: true, data: () => fromRow[kind](r), metadata: { fromCache: false } });

  // one live channel per table: any change reloads that table
  const listeners = { tasks: new Set(), outages: new Set(), attendance: new Set(), islands: new Set() };
  let channel = null;
  const ensureChannel = () => {
    if (channel) return;
    channel = sb.channel('scrd-board');
    for (const [kind, table] of Object.entries(TABLE)) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => listeners[kind].forEach((f) => f()));
    }
    channel.subscribe();
    // safety net: reload everything every 2 minutes in case a live message was missed
    setInterval(() => Object.values(listeners).forEach((set) => set.forEach((f) => f())), 120000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) Object.values(listeners).forEach((set) => set.forEach((f) => f())); });
  };

  const query = (kind, opts = {}) => ({
    where: (f, op, v) => query(kind, Object.assign({}, opts, { where: (opts.where || []).concat([[f, op, v]]) })),
    orderBy: (f, dir = 'asc') => query(kind, Object.assign({}, opts, { order: [f, dir] })),
    limit: (n) => query(kind, Object.assign({}, opts, { limit: n })),
    async get() {
      let q = sb.from(TABLE[kind]).select('*');
      for (const [f, op, v] of opts.where || []) if (op === '==') q = q.eq(f, v);
      if (opts.order) q = q.order(opts.order[0], { ascending: opts.order[1] !== 'desc' });
      if (opts.limit) q = q.limit(opts.limit);
      else q = q.limit(5000);
      const { data, error } = await q;
      if (error) fail(error);
      const docs = data.map((r) => docSnap(kind, r));
      return { docs, size: docs.length, empty: !docs.length, metadata: { fromCache: false } };
    },
    onSnapshot(next, onError) {
      const self = this;
      const load = () => self.get().then(next, (e) => onError && onError(e));
      listeners[kind].add(load); ensureChannel(); load();
      return () => listeners[kind].delete(load);
    },
  });

  const doc = (path) => {
    const [col, id] = path.split('/');
    if (col === 'ref' && id === 'islands') {
      return {
        onSnapshot(next, onError) {
          const load = async () => {
            const { data, error } = await sb.from(TABLE.islands).select('island,atoll,atoll_name,lat,lon').order('island');
            if (error) { if (onError) onError(error); return; }
            next({ id: 'islands', exists: true, data: () => ({ rows: data }), metadata: { fromCache: false } });
          };
          listeners.islands.add(load); ensureChannel(); load();
          return () => listeners.islands.delete(load);
        },
      };
    }
    const table = TABLE[col];
    return {
      id,
      async set(d) { const row = Object.assign({ id }, toRow[col](d)); const { error } = await sb.from(table).upsert(row, { onConflict: 'id' }); if (error) fail(error); },
      async update(d) { const { error } = await sb.from(table).update(toRow[col](d)).eq('id', id); if (error) fail(error); },
      async delete() { const { error } = await sb.from(table).delete().eq('id', id); if (error) fail(error); },
    };
  };

  const db = { collection: (c) => query(c), doc };

  // who is signed in, and may they view or edit?
  const rpcTrue = async (fn) => {
    const { data: s } = await sb.auth.getSession();
    if (!s.session) return false;
    const { data, error } = await sb.rpc(fn);
    return !error && data === true;
  };
  let memberCheck = null, editorCheck = null;
  const isMember = () => memberCheck || (memberCheck = rpcTrue('is_scrd_board_member'));
  const isEditor = () => editorCheck || (editorCheck = rpcTrue('is_scrd_board_editor'));
  const user = {
    can: async (what) => (what === 'data.write' ? isEditor() : false),
    id: async () => { const { data } = await sb.auth.getSession(); return data.session ? data.session.user.id : null; },
    canEdit: async () => isEditor(),
    isOwner: async () => false,
  };

  // the board's data is only handed out to approved, signed-in people
  window.claude = { use: async (name) => (name === 'db' ? ((await isMember()) ? db : null) : name === 'user' ? user : null) };
  window.SCRD_AUTH = { isMember, isEditor, sb };
})();

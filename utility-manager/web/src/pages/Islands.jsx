import { useEffect, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { Async, ErrorBox, Field, Modal, PageHead, Select } from '../components/ui.jsx';
import AtollMap from '../components/AtollMap.jsx';
import IslandsTabs from '../components/IslandsTabs.jsx';
import { IslandDetail } from './Island.jsx';
import ServicesOverview from '../components/ServicesOverview.jsx';
import { Icon } from '../components/icons.jsx';
import { SERVICES, num } from '../format.js';
import { api, qs } from '../api.js';
import { useApi, useFilters, useSubmit } from '../hooks.js';

// The islands page is the map: every island of the department where it is,
// named. Tap an atoll to ease onto it, an
// island to open it. Gensets, plants and work have their own pages.
export default function Islands() {
  const { can } = useAuth();
  const [modal, setModal] = useState(null);
  const [filters, setFilter] = useFilters();
  const atolls = useApi('/atolls');
  const state = useApi('/islands');

  return <>
    <PageHead title="Services" subtitle="Electricity, water and sewerage on every island. Drag to move, scroll or pinch to zoom; tap an atoll or an island to see its services." icon="island" actions={can('admin') && <>
      <button className="btn ghost" onClick={() => setModal('atoll')}>Add atoll</button>
      <button className="btn primary" onClick={() => setModal('island')}>Add island</button>
    </>} />
    <IslandsTabs />
    {modal === 'atoll' && <AtollForm onClose={() => setModal(null)} onSaved={() => { setModal(null); atolls.reload(); }} />}
    {modal === 'island' && <IslandForm atolls={atolls.data || []} onClose={() => setModal(null)} onSaved={() => { setModal(null); state.reload(); }} />}
    <Async state={state}>{(all) => {
      // A service tab shows only that service: its islands, its figures.
      const svc = filters.service || null;
      const islands = svc ? all.filter((i) => i.services.includes(svc)) : all;
      return <>
      <SummaryCard svc={svc} islands={islands} all={all} atoll={(atolls.data || []).find((a) => a.code === filters.atoll)} />
      <section className={`glass islands-map${filters.island ? ' with-island' : ''}`} aria-label="Map of the islands">
        <EscClose on={!!(filters.island || filters.atoll)} close={() => setFilter(filters.island ? { island: '' } : { atoll: '' })} />
        <AtollMap islands={islands} atolls={atolls.data || []} focus={filters.atoll || null} onAtoll={(code) => setFilter({ atoll: code || '', island: '' })}
          selected={filters.island || null} onIsland={(i) => setFilter('island', i?.id || '')} panel={!!(filters.island || filters.atoll)} />
        {filters.island && <aside className="glass island-panel" aria-label="Island">
          <IslandDetail key={filters.island} id={filters.island} only={filters.service || null} islands={islands}
            onClose={() => setFilter({ island: '', atoll: '' })} onAtoll={(code) => setFilter({ island: '', atoll: code })}
            onShowAll={() => setFilter('service', '')} />
        </aside>}
        {filters.atoll && !filters.island && <aside className="glass island-panel" aria-label="Atoll">
          <AtollDetail key={filters.atoll} svc={svc} atoll={(atolls.data || []).find((a) => a.code === filters.atoll)} islands={islands.filter((i) => i.atoll_code === filters.atoll)}
            onClose={() => setFilter({ atoll: '', island: '' })} onIsland={(i) => setFilter('island', i.id)} />
        </aside>}
      </section></>;
    }}</Async>
  </>;
}

// An atoll beside the map, as on the TV board: its figures, a card for each
// island with open work, and the islands with none.
function AtollDetail({ atoll, islands, svc, onClose, onIsland }) {
  if (!atoll) return null;
  return <>
    <header className="ip-head">
      <div>
        <button type="button" className="ip-atoll" onClick={onClose}><Icon name="back" size={14} /> Overview</button>
        <h2>{atoll.name} atoll</h2>
        <p className="ip-sub">{atoll.code} · {num(islands.length)} islands</p>
      </div>
      <button type="button" className="btn ghost" onClick={onClose}>Close</button>
    </header>
    <ServicesOverview atollId={atoll.id} services={svc ? [svc] : [...new Set(islands.flatMap((i) => i.services))]} onIsland={onIsland} />
  </>;
}

// The figures for the tab: all services, or one, for the region or the
// chosen atoll.
function SummaryCard({ svc, islands, all, atoll }) {
  const here = atoll ? islands.filter((i) => i.atoll_code === atoll.code) : islands;
  const facs = useApi(svc ? `/services/${svc}${qs({ atoll_id: atoll?.id })}` : null);
  const outs = useApi(`/incidents${qs({ status: 'open', category: 'outage', service: svc || undefined, atoll_id: atoll?.id, limit: 200 })}`);
  const offIslands = new Set((outs.data?.items || []).map((o) => o.island_id)).size;
  const where = atoll ? `${atoll.name} atoll` : 'All atolls';
  let tiles;
  if (!svc) {
    const pool = atoll ? all.filter((i) => i.atoll_code === atoll.code) : all;
    tiles = [[num(pool.length), 'Islands'], [num(new Set(pool.map((i) => i.atoll_code)).size), 'Atolls'],
      ...Object.entries(SERVICES).map(([k, s]) => [num(pool.filter((i) => i.services.includes(k)).length), `with ${s.label.toLowerCase()}`, k])];
  } else {
    const f = facs.data?.facilities || [];
    const sum = (k) => f.reduce((n, x) => n + Number(x[k] || 0), 0);
    const due = f.filter((x) => x.report_state === 'missing' || x.report_state === 'never').length;
    tiles = [[num(here.length), 'Islands'], [num(f.length), svc === 'electricity' ? 'Powerhouses' : 'Plants'],
      [facs.data ? `${num(sum('running'))} / ${num(sum('assets'))}` : '–', svc === 'electricity' ? 'Gensets running' : 'Systems running'],
      [num(sum('down')), 'Down', sum('down') ? 'bad' : ''], [num(sum('serious') + sum('minor')), 'With faults', sum('serious') + sum('minor') ? 'warn' : ''],
      ...(svc === 'water' && sum('ro_tpd') ? [[num(sum('ro_tpd')), 't/day RO']] : []),
      ...(due ? [[num(due), 'Updates due', 'warn']] : [])];
  }
  if (offIslands) tiles.push([num(offIslands), `Island${offIslands === 1 ? '' : 's'} with supply interrupted`, 'bad']);
  return <section className={`glass sum-card${svc ? ` ${svc}` : ''}`} aria-label="Summary">
    <header><strong>{svc ? SERVICES[svc].label : 'All services'}</strong><span>{where}</span></header>
    <div className="sum-tiles">{tiles.map(([v, l, t]) => <div key={l} className={`sum-tile ${t || ''}`}><b>{v}</b><span>{l}</span></div>)}</div>
  </section>;
}

// Esc closes the island panel.
function EscClose({ on, close }) {
  useEffect(() => {
    if (!on) return undefined;
    const esc = (e) => { if (e.key === 'Escape' && !document.querySelector('.modal')) close(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  });
  return null;
}

function AtollForm({ onClose, onSaved }) {
  const [f, setF] = useState({ code: '', name: '' });
  const { submit, busy, error } = useSubmit(async () => { await api('/atolls', { method: 'POST', body: f }); onSaved(); });
  return <Modal title="Add atoll" onClose={onClose}>
    <form className="form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <ErrorBox error={error} />
      <Field label="Code" hint="As written before island names, e.g. F, Dh, Th"><input required maxLength="10" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.trim() })} /></Field>
      <Field label="Name"><input required maxLength="100" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Faafu" /></Field>
      <div className="form-actions"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>Add atoll</button></div>
    </form>
  </Modal>;
}

// A new island, usually with its powerhouse so gensets can be added to it.
function IslandForm({ atolls, onClose, onSaved }) {
  const [f, setF] = useState({ atoll_id: '', name: '', population: '', powerhouse: true });
  const { submit, busy, error } = useSubmit(async () => {
    const island = await api('/islands', { method: 'POST', body: { atoll_id: f.atoll_id, name: f.name.trim(), population: f.population === '' ? null : Number(f.population) } });
    if (f.powerhouse) await api('/facilities', { method: 'POST', body: { island_id: island.id, service: 'electricity', kind: 'powerhouse', name: `${f.name.trim()} Powerhouse` } });
    onSaved();
  });
  return <Modal title="Add island" onClose={onClose}>
    <form className="form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <ErrorBox error={error} />
      <Field label="Atoll"><Select required value={f.atoll_id} onChange={(v) => setF({ ...f, atoll_id: v })} placeholder="Choose atoll…" options={atolls.map((a) => [a.id, `${a.code} · ${a.name}`])} /></Field>
      <Field label="Island name"><input required maxLength="100" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Population (optional)"><input type="number" min="0" value={f.population} onChange={(e) => setF({ ...f, population: e.target.value })} /></Field>
      <label className="check wide"><input type="checkbox" checked={f.powerhouse} onChange={(e) => setF({ ...f, powerhouse: e.target.checked })} /> Also create its powerhouse (“{f.name.trim() || '…'} Powerhouse”)</label>
      <div className="form-actions"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>Add island</button></div>
    </form>
  </Modal>;
}

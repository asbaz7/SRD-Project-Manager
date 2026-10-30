import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Async, ErrorBox, Field, Modal, PageHead, Select } from '../components/ui.jsx';
import AtollMap from '../components/AtollMap.jsx';
import { IslandDetail } from './Island.jsx';
import { useAreaWork, AreaTiles, IslandWorkCards } from '../components/AreaWork.jsx';
import { Icon } from '../components/icons.jsx';
import { num } from '../format.js';
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
    <PageHead title="Islands" subtitle="Every island of the department. Drag to move, scroll or pinch to zoom; tap an atoll to zoom in on it, an island to open it." icon="island" actions={can('admin') && <>
      <button className="btn ghost" onClick={() => setModal('atoll')}>Add atoll</button>
      <button className="btn primary" onClick={() => setModal('island')}>Add island</button>
    </>} />
    {modal === 'atoll' && <AtollForm onClose={() => setModal(null)} onSaved={() => { setModal(null); atolls.reload(); }} />}
    {modal === 'island' && <IslandForm atolls={atolls.data || []} onClose={() => setModal(null)} onSaved={() => { setModal(null); state.reload(); }} />}
    <Async state={state}>{(islands) => {
      const atollCount = new Set(islands.map((i) => i.atoll_code)).size;
      const focused = filters.atoll && islands.filter((i) => i.atoll_code === filters.atoll);
      const name = (atolls.data || []).find((a) => a.code === filters.atoll)?.name;
      return <section className={`glass islands-map${filters.island ? ' with-island' : ''}`} aria-label="Map of the islands">
        <EscClose on={!!(filters.island || filters.atoll)} close={() => setFilter(filters.island ? { island: '', service: '' } : { atoll: '' })} />
        <AtollMap islands={islands} atolls={atolls.data || []} focus={filters.atoll || null} onAtoll={(code) => setFilter({ atoll: code || '', island: '' })}
          selected={filters.island || null} onIsland={(i) => setFilter('island', i?.id || '')} panel={!!(filters.island || filters.atoll)} />
        {filters.island && <aside className="glass island-panel" aria-label="Island">
          <IslandDetail key={filters.island} id={filters.island} only={filters.service || null} islands={islands}
            onClose={() => setFilter({ island: '', service: '', atoll: '' })} onAtoll={(code) => setFilter({ island: '', service: '', atoll: code })}
            onShowAll={() => setFilter('service', '')} />
        </aside>}
        {/* The total, floating over the map as on the TV board. */}
        {filters.atoll && !filters.island && <aside className="glass island-panel" aria-label="Atoll">
          <AtollDetail key={filters.atoll} atoll={(atolls.data || []).find((a) => a.code === filters.atoll)} islands={islands.filter((i) => i.atoll_code === filters.atoll)}
            onClose={() => setFilter({ atoll: '', island: '' })} onIsland={(i) => setFilter('island', i.id)} />
        </aside>}
        {!filters.island && !filters.atoll && <div className="glass am-total" aria-live="polite">
          {focused ? <>
            <strong>{num(focused.length)}</strong>
            <span>island{focused.length === 1 ? '' : 's'} in {name || filters.atoll}</span>
            <small>of {num(islands.length)} in {num(atollCount)} atolls</small>
          </> : <>
            <strong>{num(islands.length)}</strong>
            <span>island{islands.length === 1 ? '' : 's'} in {num(atollCount)} atoll{atollCount === 1 ? '' : 's'}</span>
          </>}
        </div>}
      </section>;
    }}</Async>
  </>;
}

// An atoll beside the map, as on the TV board: its figures, a card for each
// island with open work, and the islands with none.
function AtollDetail({ atoll, islands, onClose, onIsland }) {
  const area = useAreaWork({ atoll_id: atoll?.id });
  if (!atoll) return null;
  const withWork = area.work ? new Set(area.work.map((w) => w.island_id)).size : null;
  return <>
    <header className="ip-head">
      <div>
        <button type="button" className="ip-atoll" onClick={onClose}><Icon name="back" size={14} /> Overview</button>
        <h2>{atoll.name} atoll</h2>
        <p className="ip-sub">{atoll.code} · {num(islands.length)} islands{withWork != null && `, ${num(withWork)} with open work`}</p>
      </div>
      <button type="button" className="btn ghost" onClick={onClose}>Close</button>
    </header>
    <AreaTiles work={area.work} outages={area.outages} />
    <IslandWorkCards work={area.work} islands={islands} onIsland={onIsland} />
  </>;
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

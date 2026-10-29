import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Async, ErrorBox, Field, Modal, PageHead, Select } from '../components/ui.jsx';
import AtollMap from '../components/AtollMap.jsx';
import { FACILITY_KINDS, SERVICES, num } from '../format.js';
import { Icon } from '../components/icons.jsx';
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
    <PageHead title="Islands" subtitle="Every island of the department. Drag to move, scroll or pinch to zoom; tap an atoll to zoom in on it, an island to see its details." icon="island" actions={can('admin') && <>
      <button className="btn ghost" onClick={() => setModal('atoll')}>Add atoll</button>
      <button className="btn primary" onClick={() => setModal('island')}>Add island</button>
    </>} />
    {modal === 'atoll' && <AtollForm onClose={() => setModal(null)} onSaved={() => { setModal(null); atolls.reload(); }} />}
    {modal === 'island' && <IslandForm atolls={atolls.data || []} onClose={() => setModal(null)} onSaved={() => { setModal(null); state.reload(); }} />}
    <Async state={state}>{(islands) => {
      const atollCount = new Set(islands.map((i) => i.atoll_code)).size;
      const focused = filters.atoll && islands.filter((i) => i.atoll_code === filters.atoll);
      const name = (atolls.data || []).find((a) => a.code === filters.atoll)?.name;
      return <section className="glass islands-map" aria-label="Map of the islands">
        <AtollMap islands={islands} atolls={atolls.data || []} focus={filters.atoll || null} onAtoll={(code) => setFilter({ atoll: code || '', island: '' })}
          selected={filters.island || null} onIsland={(i) => setFilter('island', i?.id || '')} />
        {filters.island && <IslandPanel key={filters.island} id={filters.island} onClose={() => setFilter('island', '')} />}
        {/* The total, floating over the map as on the TV board. */}
        <div className="glass am-total" aria-live="polite">
          {focused ? <>
            <strong>{num(focused.length)}</strong>
            <span>island{focused.length === 1 ? '' : 's'} in {name || filters.atoll}</span>
            <small>of {num(islands.length)} in {num(atollCount)} atolls</small>
          </> : <>
            <strong>{num(islands.length)}</strong>
            <span>island{islands.length === 1 ? '' : 's'} in {num(atollCount)} atoll{atollCount === 1 ? '' : 's'}</span>
          </>}
        </div>
      </section>;
    }}</Async>
  </>;
}

// The chosen island's details, over the map: where it is and what it has.
// Its full page (gensets, plants, work) is one tap further.
function IslandPanel({ id, onClose }) {
  const navigate = useNavigate();
  const state = useApi(`/islands/${id}`);
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const open = () => (document.startViewTransition ? document.startViewTransition(() => navigate(`/islands/${id}`)) : navigate(`/islands/${id}`));
  return <aside className="glass island-panel" aria-label="Island details">
    <Async state={state}>{(i) => {
      const plants = (i.facilities || []).filter((f) => f.active);
      return <>
        <header>
          <div><small>{i.atoll_code} · {i.atoll_name}</small><h2>{i.name}</h2></div>
          <button type="button" className="btn ghost small" onClick={onClose} aria-label="Close"><Icon name="close" size={16} /></button>
        </header>
        <dl className="ip-facts">
          {i.population > 0 && <><dt>Population</dt><dd>{num(i.population)}</dd></>}
          {i.lat != null && <><dt>Location</dt><dd>{Number(i.lat).toFixed(3)}°N, {Number(i.lon).toFixed(3)}°E</dd></>}
        </dl>
        <h3>Services</h3>
        {i.services.length ? <ul className="ip-svcs">{i.services.map((sv) => <li key={sv}>
          <span className={`svc-badge ${sv}`}><Icon name={sv} size={14} /></span>
          <span><strong>{SERVICES[sv]?.label}</strong>
            {plants.filter((f) => f.service === sv).map((f) => <small key={f.id}>{f.name} · {FACILITY_KINDS[f.kind] || f.kind}</small>)}</span>
        </li>)}</ul> : <p className="muted small">No services recorded.</p>}
        {i.notes && <><h3>Notes</h3><p className="small pre">{i.notes}</p></>}
        <button type="button" className="btn primary block" onClick={open}>Open island page</button>
      </>;
    }}</Async>
  </aside>;
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

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Async, Card, ErrorBox, Field, Modal, PageHead, Select, Service } from '../components/ui.jsx';
import { num } from '../format.js';
import { useApi, useFilters, useSubmit } from '../hooks.js';

export default function Islands() {
  const { technical, can } = useAuth();
  const [modal, setModal] = useState(null);
  const [filters, setFilter] = useFilters();
  const atolls = useApi('/atolls');
  const state = useApi(`/islands${qs({ atoll_id: filters.atoll_id, q: filters.q })}`);

  return <>
    <PageHead title={technical ? 'Islands & assets' : 'Islands'} icon="island" actions={can('admin') && <>
      <button className="btn ghost" onClick={() => setModal('atoll')}>Add atoll</button>
      <button className="btn primary" onClick={() => setModal('island')}>Add island</button>
    </>} />
    {modal === 'atoll' && <AtollForm onClose={() => setModal(null)} onSaved={() => { setModal(null); atolls.reload(); }} />}
    {modal === 'island' && <IslandForm atolls={atolls.data || []} onClose={() => setModal(null)} onSaved={() => { setModal(null); state.reload(); }} />}
    <div className="filters">
      <Select value={filters.atoll_id} onChange={(v) => setFilter('atoll_id', v)} placeholder="All atolls"
        options={(atolls.data || []).map((a) => [a.id, `${a.code} · ${a.name}`])} aria-label="Atoll" />
      <input type="search" placeholder="Search island…" defaultValue={filters.q} onChange={(e) => setFilter('q', e.target.value)} aria-label="Search" />
    </div>
    <Async state={state}>{(islands) => (
      <Card>
        <table>
          <thead><tr><th>Island</th><th>Services</th>{technical && <><th>Gensets</th><th className="num hide-sm">Installed</th><th className="num hide-sm">Fuel capacity</th></>}<th className="num">Open incidents</th><th className="num hide-sm">Active projects</th></tr></thead>
          <tbody>{islands.map((i) => <tr key={i.id}>
            <td><Link to={`/islands/${i.id}`}><strong>{i.atoll_code}</strong> · {i.name}</Link></td>
            <td>{i.services.map((s) => <Service key={s} value={s} short />)}</td>
            {technical && <>
              <td>{i.genset_count ? <>{i.running_count} of {i.genset_count} running{i.down_count > 0 && <span className="status bad"> · ✕ {i.down_count} down</span>}</> : <span className="muted">—</span>}</td>
              <td className="num hide-sm">{i.installed_kw ? `${num(i.installed_kw)} kW` : '—'}</td>
              <td className="num hide-sm">{i.fuel_capacity_l ? `${num(i.fuel_capacity_l)} L` : <span className="muted">—</span>}</td>
            </>}
            <td className={`num ${i.open_incidents ? 'bad' : ''}`}>{i.open_incidents}</td>
            <td className="num hide-sm">{i.active_projects}</td>
          </tr>)}</tbody>
        </table>
        <p className="muted small">{islands.length} islands</p>
      </Card>
    )}</Async>
  </>;
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

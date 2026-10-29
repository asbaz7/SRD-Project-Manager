import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Async, Card, Empty, ErrorBox, Field, Modal, PageHead, Select } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { SERVICES, num } from '../format.js';
import AtollMap from '../components/AtollMap.jsx';
import { useApi, useFilters, useSubmit } from '../hooks.js';

export default function Islands() {
  const { can } = useAuth();
  const [modal, setModal] = useState(null);
  const [filters, setFilter] = useFilters();
  const atolls = useApi('/atolls');
  const state = useApi(`/islands${qs({ atoll_id: filters.atoll_id, q: filters.q })}`);

  return <>
    <PageHead title="Islands" subtitle="Where the department's islands are and the services on each" icon="island" actions={can('admin') && <>
      <button className="btn ghost" onClick={() => setModal('atoll')}>Add atoll</button>
      <button className="btn primary" onClick={() => setModal('island')}>Add island</button>
    </>} />
    {modal === 'atoll' && <AtollForm onClose={() => setModal(null)} onSaved={() => { setModal(null); atolls.reload(); }} />}
    {modal === 'island' && <IslandForm atolls={atolls.data || []} onClose={() => setModal(null)} onSaved={() => { setModal(null); state.reload(); }} />}
    <Async state={state}>{(islands) => <IslandList islands={islands} atolls={atolls.data || []} filters={filters} setFilter={setFilter} />}</Async>
  </>;
}

// The islands page is about the islands themselves: where they are and
// what services they have. Gensets, plants and work have their own pages.
// The atoll and search filters go to the server; the service filter narrows
// the list here.
function IslandList({ islands, atolls, filters, setFilter }) {
  const [folded, setFolded] = useState(() => new Set());
  const toggle = (code) => setFolded((prev) => { const next = new Set(prev); if (next.has(code)) next.delete(code); else next.add(code); return next; });
  const shown = islands.filter((i) => !filters.service || i.services.includes(filters.service));
  const groups = [];
  for (const i of shown) {
    let a = groups.at(-1);
    if (!a || a.code !== i.atoll_code) groups.push(a = { code: i.atoll_code, name: i.atoll_name, islands: [] });
    a.islands.push(i);
  }
  const count = (pred) => islands.filter(pred).length;
  const chips = [['', 'All', islands.length], ...Object.entries(SERVICES).map(([k, s]) => [k, s.label, count((i) => i.services.includes(k))])];

  return <div className="islands-split">
    <section className="glass islands-map" aria-label="Map">
      <AtollMap islands={shown} atolls={atolls} focus={atolls.find((a) => a.id === filters.atoll_id)?.code || null}
        onAtoll={(code) => setFilter('atoll_id', code ? atolls.find((a) => a.code === code)?.id || '' : '')} />
    </section>
    <div className="islands-list">
      <div className="filters toolbar">
        <Select value={filters.atoll_id} onChange={(v) => setFilter('atoll_id', v)} placeholder="All atolls"
          options={atolls.map((a) => [a.id, `${a.code} · ${a.name}`])} aria-label="Atoll" />
        <input type="search" placeholder="Search island…" defaultValue={filters.q} onChange={(e) => setFilter('q', e.target.value)} aria-label="Search" />
        <div className="chips">
          {chips.map(([k, l, n]) => <button key={k} className={`chip ${(filters.service || '') === k ? 'on' : ''}`} onClick={() => setFilter('service', k)}>
            {k && <span className={`svc-dot ${k}`} aria-hidden="true" />}{l}<strong>{n}</strong></button>)}
        </div>
      </div>
      <p className="muted small">{num(shown.length)} island{shown.length === 1 ? '' : 's'} in {num(groups.length)} atoll{groups.length === 1 ? '' : 's'}</p>
      {groups.length === 0 && <Card><Empty>No islands match these filters.</Empty></Card>}
      {groups.map((a) => {
        const shut = folded.has(a.code);
        return <section key={a.code} className="atoll-group">
          <button type="button" className={`atoll-head${shut ? ' collapsed' : ''}`} aria-expanded={!shut} onClick={() => toggle(a.code)}>
            <span className="chev" aria-hidden="true"><Icon name="chevron" size={14} /></span>
            <h2>{a.code} · {a.name}</h2>
            <span className="muted small">{a.islands.length} island{a.islands.length === 1 ? '' : 's'}</span>
          </button>
          {!shut && <div className="island-grid">{a.islands.map((i) => <IslandCard key={i.id} i={i} />)}</div>}
        </section>;
      })}
    </div>
  </div>;
}

// One island: its name, the services it has, and its population if known.
function IslandCard({ i }) {
  return <Link to={`/islands/${i.id}`} className="island-card">
    <div className="top"><strong>{i.name}</strong></div>
    <div className="island-svcs">
      {i.services.length ? i.services.map((sv) => <span key={sv} className="island-svc"><span className={`svc-badge ${sv}`}><Icon name={sv} size={13} /></span>{SERVICES[sv]?.label}</span>)
        : <span className="muted small">No services recorded</span>}
    </div>
    {i.population > 0 && <div className="muted small">Population {num(i.population)}</div>}
  </Link>;
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

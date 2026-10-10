import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Async, Card, ErrorBox, Field, Modal, PageHead, Select, Service } from '../components/ui.jsx';
import { num, power } from '../format.js';
import { useApi, useFilters, useRowLink, useSubmit } from '../hooks.js';

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
    <Async state={state}>{(islands) => <IslandTable islands={islands} technical={technical} />}</Async>
  </>;
}

// Islands under their atoll, with subtotals, like the Powerhouses tab. A
// heading folds its atoll away; the atoll filter above narrows the list.
function IslandTable({ islands, technical }) {
  const rowLink = useRowLink();
  const [folded, setFolded] = useState(() => new Set());
  const toggle = (code) => setFolded((prev) => { const next = new Set(prev); if (next.has(code)) next.delete(code); else next.add(code); return next; });
  const atolls = [];
  for (const i of islands) {
    let a = atolls.at(-1);
    if (!a || a.code !== i.atoll_code) atolls.push(a = { code: i.atoll_code, name: i.atoll_name, islands: [] });
    a.islands.push(i);
  }
  const sum = (list, k) => list.reduce((n, i) => n + Number(i[k] || 0), 0);
  // Fuel capacity is set on few powerhouses yet: the column shows once any is.
  const fuel = technical && islands.some((i) => i.fuel_capacity_l);
  const cols = 3 + (technical ? 2 + (fuel ? 1 : 0) : 0) + 1;
  const gensets = (x) => (x.genset_count ? <>{num(x.running_count)} of {num(x.genset_count)} running
    {x.down_count > 0 && <span className="status bad"> · ✕ {num(x.down_count)} down</span>}
    {x.no_report_count > 0 && <span className="muted"> · {num(x.no_report_count)} no report</span>}</> : <span className="muted">—</span>);
  return <Card>
    <div className="table-scroll"><table>
      <thead><tr><th>Island</th><th className="hide-sm">Services</th>{technical && <><th>Gensets</th><th className="num hide-sm">Installed</th>{fuel && <th className="num hide-sm">Fuel capacity</th>}</>}<th className="num">Open incidents</th><th className="num hide-sm">Active projects</th></tr></thead>
      {atolls.map((a) => {
        const shut = folded.has(a.code);
        const total = { genset_count: sum(a.islands, 'genset_count'), running_count: sum(a.islands, 'running_count'),
          down_count: sum(a.islands, 'down_count'), no_report_count: sum(a.islands, 'no_report_count') };
        return <tbody key={a.code}>
          <tr className={`group-head${shut ? ' collapsed' : ''}`} onClick={() => toggle(a.code)}>
            <td colSpan={2}><button type="button" className="link" aria-expanded={!shut} onClick={(e) => { e.stopPropagation(); toggle(a.code); }}>
              <span className="chev" aria-hidden="true">▾</span> {a.code} · {a.name}</button> <span className="muted small">{a.islands.length} island{a.islands.length === 1 ? '' : 's'}</span></td>
            {technical && <><td className="small">{gensets(total)}</td><td className="num hide-sm small">{power(sum(a.islands, 'installed_kw'))}</td>{fuel && <td className="num hide-sm small">{sum(a.islands, 'fuel_capacity_l') ? `${num(sum(a.islands, 'fuel_capacity_l'))} L` : ''}</td>}</>}
            <td className="num small">{sum(a.islands, 'open_incidents') || ''}</td><td className="num hide-sm small">{sum(a.islands, 'active_projects') || ''}</td>
          </tr>
          {!shut && a.islands.map((i) => <tr key={i.id} {...rowLink(`/islands/${i.id}`)}>
            <td><Link to={`/islands/${i.id}`}><strong>{i.name}</strong></Link></td>
            <td className="hide-sm small">{i.services.map((sv) => <Service key={sv} value={sv} />)}</td>
            {technical && <>
              <td>{gensets(i)}</td>
              <td className="num hide-sm">{i.installed_kw ? `${num(i.installed_kw)} kW` : '—'}</td>
              {fuel && <td className="num hide-sm">{i.fuel_capacity_l ? `${num(i.fuel_capacity_l)} L` : ''}</td>}
            </>}
            <td className={`num ${i.open_incidents ? 'bad' : ''}`}>{i.open_incidents}</td>
            <td className="num hide-sm">{i.active_projects}</td>
          </tr>)}
        </tbody>;
      })}
    </table></div>
    <p className="muted small">{islands.length} islands in {atolls.length} atoll{atolls.length === 1 ? '' : 's'}{technical && !fuel ? ' · fuel capacity not set on any powerhouse yet' : ''}</p>
  </Card>;
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

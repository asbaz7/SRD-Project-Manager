import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Async, Card, Empty, ErrorBox, Field, Modal, PageHead, Select, Stat } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { ASSET_STATUS, SERVICES, num, power } from '../format.js';
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
    <Async state={state}>{(islands) => <IslandList islands={islands} atolls={atolls.data || []} technical={technical} filters={filters} setFilter={setFilter} />}</Async>
  </>;
}

const sum = (list, k) => list.reduce((n, i) => n + Number(i[k] || 0), 0);
const needsAttention = (i) => i.down_count > 0 || i.open_incidents > 0 || i.licences_expired > 0;

// Region totals, the filters, then each atoll's islands as cards. The atoll
// and search filters go to the server; service and "needs attention" narrow
// the list here.
function IslandList({ islands, atolls, technical, filters, setFilter }) {
  const [folded, setFolded] = useState(() => new Set());
  const toggle = (code) => setFolded((prev) => { const next = new Set(prev); if (next.has(code)) next.delete(code); else next.add(code); return next; });
  const shown = islands.filter((i) => (!filters.service || i.services.includes(filters.service)) && (!filters.attention || needsAttention(i)));
  const groups = [];
  for (const i of shown) {
    let a = groups.at(-1);
    if (!a || a.code !== i.atoll_code) groups.push(a = { code: i.atoll_code, name: i.atoll_name, islands: [] });
    a.islands.push(i);
  }
  const count = (pred) => islands.filter(pred).length;
  const chips = [['', 'All', islands.length], ...Object.entries(SERVICES).map(([k, s]) => [k, s.label, count((i) => i.services.includes(k))])];
  const attention = count(needsAttention);

  return <>
    <div className="stats">
      <Stat label="Islands" value={num(islands.length)} sub={`in ${new Set(islands.map((i) => i.atoll_code)).size} atolls`} />
      {technical && <>
        <Stat label="Installed generation" value={power(sum(islands, 'installed_kw'))} sub={`${num(sum(islands, 'genset_count'))} gensets · ${num(sum(islands, 'running_count'))} running`} />
        <Stat label="Gensets down" value={num(sum(islands, 'down_count'))} tone={sum(islands, 'down_count') ? 'alert' : ''}
          sub={`on ${count((i) => i.down_count > 0)} islands`} />
        <Stat label="Licences expired" value={num(sum(islands, 'licences_expired'))} tone={sum(islands, 'licences_expired') ? 'warn' : ''} sub="Water and sewerage" />
      </>}
      <Stat label="Open work" value={num(sum(islands, 'open_work'))} sub={`on ${count((i) => i.open_work > 0)} islands`} to="/work" />
    </div>
    <div className="filters toolbar">
      <Select value={filters.atoll_id} onChange={(v) => setFilter('atoll_id', v)} placeholder="All atolls"
        options={atolls.map((a) => [a.id, `${a.code} · ${a.name}`])} aria-label="Atoll" />
      <input type="search" placeholder="Search island…" defaultValue={filters.q} onChange={(e) => setFilter('q', e.target.value)} aria-label="Search" />
      <div className="chips">
        {chips.map(([k, l, n]) => <button key={k} className={`chip ${(filters.service || '') === k ? 'on' : ''}`} onClick={() => setFilter('service', k)}>
          {k && <span className={`svc-dot ${k}`} aria-hidden="true" />}{l}<strong>{n}</strong></button>)}
        {technical && <button className={`chip ${filters.attention ? 'on' : ''}`} onClick={() => setFilter('attention', filters.attention ? '' : '1')}>Needs attention<strong>{attention}</strong></button>}
      </div>
    </div>
    {groups.length === 0 && <Card><Empty>No islands match these filters.</Empty></Card>}
    {groups.map((a) => {
      const shut = folded.has(a.code);
      const down = sum(a.islands, 'down_count');
      return <section key={a.code} className="atoll-group">
        <button type="button" className={`atoll-head${shut ? ' collapsed' : ''}`} aria-expanded={!shut} onClick={() => toggle(a.code)}>
          <span className="chev" aria-hidden="true">▾</span>
          <h2>{a.code} · {a.name}</h2>
          <span className="muted small">{a.islands.length} island{a.islands.length === 1 ? '' : 's'}</span>
          {technical && <span className="sum small">
            {sum(a.islands, 'genset_count') > 0 && <span>{num(sum(a.islands, 'running_count'))} of {num(sum(a.islands, 'genset_count'))} gensets running</span>}
            {down > 0 && <span className="status bad">✕ {num(down)} down</span>}
            {sum(a.islands, 'installed_kw') > 0 && <strong>{power(sum(a.islands, 'installed_kw'))}</strong>}
          </span>}
        </button>
        {!shut && <div className="island-grid">{a.islands.map((i) => <IslandCard key={i.id} i={i} technical={technical} />)}</div>}
      </section>;
    })}
  </>;
}

// One island: its services, a square per genset in tag order (colour plus
// the "n of m running" text beside it), and flags for what needs a look.
function IslandCard({ i, technical }) {
  const flags = [
    technical && i.down_count > 0 && ['bad', `✕ ${i.down_count} genset${i.down_count === 1 ? '' : 's'} down`],
    i.open_incidents > 0 && ['bad', `${i.open_incidents} open interruption${i.open_incidents === 1 ? '' : 's'}`],
    technical && i.licences_expired > 0 && ['bad', `${i.licences_expired === 1 ? 'Licence' : `${i.licences_expired} licences`} expired`],
    i.open_work > 0 && ['info', `🔧 ${i.open_work} open work`],
    i.active_projects > 0 && ['', `${i.active_projects} project${i.active_projects === 1 ? '' : 's'}`],
  ].filter(Boolean);
  return <Link to={`/islands/${i.id}`} className={`island-card${technical && needsAttention(i) ? ' alert' : ''}`}>
    <div className="top">
      <strong>{i.name}</strong>
      <span className="svcs">{i.services.map((sv) => <span key={sv} className={`svc-badge ${sv}`} title={SERVICES[sv]?.label}><Icon name={sv} size={14} /></span>)}</span>
    </div>
    {technical && (i.genset_count > 0 ? <div className="gensets">
      <span className="gdots" aria-hidden="true">{(i.genset_states || []).map((st, n) => <span key={n} className={`gdot ${st}`} title={ASSET_STATUS[st]?.label} />)}</span>
      <span className="small">{i.running_count} of {i.genset_count} running{i.disconnected_count > 0 ? ` · ${i.disconnected_count} disconnected` : ''}{i.no_report_count > 0 ? ` · ${i.no_report_count} no report` : ''}</span>
      <span className="kw">{power(Number(i.installed_kw))}</span>
    </div> : <div className="gensets muted small">No gensets recorded</div>)}
    {flags.length > 0 && <div className="flags">
      {flags.map(([tone, text]) => <span key={text} className={`flag ${tone}`}>{text}</span>)}
    </div>}
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

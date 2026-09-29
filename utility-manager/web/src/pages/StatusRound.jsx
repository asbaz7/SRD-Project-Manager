// Record the status of every asset on an island in one go
// (the morning round; replaces the genset status spreadsheet tab).
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { AssetStatus, Async, Card, ErrorBox, Loading, PageHead, Select, Service } from '../components/ui.jsx';
import { ASSET_KINDS, ASSET_STATUS, date } from '../format.js';
import { useApi, useFilters, useSubmit } from '../hooks.js';

const CHOICES = Object.entries(ASSET_STATUS).filter(([k]) => k !== 'unknown').map(([k, s]) => [k, `${s.icon} ${s.label}`]);

export default function StatusRound() {
  const { canWriteIsland } = useAuth();
  const [filters, setFilter] = useFilters();
  const islands = useApi('/islands');
  const mine = useMemo(() => (islands.data || []).filter(canWriteIsland), [islands.data, canWriteIsland]);
  const islandId = filters.island_id || (mine.length === 1 ? mine[0].id : '');
  const island = useApi(islandId ? `/islands/${islandId}` : null);

  return <>
    <PageHead title="Asset status round" />
    <div className="filters">
      <Select value={islandId} onChange={(v) => setFilter('island_id', v)} placeholder="Choose island…" aria-label="Island"
        options={mine.map((i) => [i.id, `${i.atoll_code} · ${i.name}`])} />
    </div>
    {islandId && <Async state={island}>{(data) => (data.id === islandId
      ? <Round key={data.id} island={data} onSaved={island.reload} />
      : <Loading what="assets" />)}</Async>}
  </>;
}

function Round({ island, onSaved }) {
  const assets = island.facilities.filter((f) => f.active).flatMap((f) => f.assets.filter((a) => a.active).map((a) => ({ ...a, facility: f })));
  const initial = () => Object.fromEntries(assets.map((a) => [a.id, { status: a.status === 'unknown' ? '' : a.status, note: a.status_note || '' }]));
  const [rows, setRows] = useState(initial);
  const [saved, setSaved] = useState(null);
  useEffect(() => { setRows(initial()); }, [island]); // eslint-disable-line react-hooks/exhaustive-deps

  const changed = assets.filter((a) => rows[a.id].status && (rows[a.id].status !== a.status || (rows[a.id].note || '') !== (a.status_note || '')));
  const { submit, busy, error } = useSubmit(async () => {
    await api('/assets/status', { method: 'POST', body: { items: changed.map((a) => ({ asset_id: a.id, status: rows[a.id].status, note: rows[a.id].note || null })) } });
    setSaved(changed.length);
    onSaved();
  });
  const set = (id, key, value) => { setSaved(null); setRows({ ...rows, [id]: { ...rows[id], [key]: value } }); };

  return (
    <Card title={<Link to={`/islands/${island.id}`}>{island.atoll_code} · {island.name}</Link>}>
      <ErrorBox error={error} />
      {saved != null && <div className="success">Saved {saved} status update{saved === 1 ? '' : 's'}.</div>}
      {assets.length === 0 ? <p className="muted">No assets on this island.</p> :
        <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <table>
            <thead><tr><th>Asset</th><th>Current</th><th>New status</th><th>Note</th></tr></thead>
            <tbody>{assets.map((a) => <tr key={a.id} className={changed.includes(a) ? 'changed' : ''}>
              <td><Service value={a.facility.service} short /> <strong>{ASSET_KINDS[a.kind]} {a.tag}</strong><br /><small className="muted">{a.make_model}</small></td>
              <td><AssetStatus status={a.status} />{a.status_at && <><br /><small className="muted">{date(a.status_at)}</small></>}</td>
              <td><Select value={rows[a.id].status} onChange={(v) => set(a.id, 'status', v)} placeholder="—" options={CHOICES} aria-label={`Status of ${a.tag}`} /></td>
              <td><input value={rows[a.id].note} onChange={(e) => set(a.id, 'note', e.target.value)} placeholder="Reason, parts awaited…" aria-label={`Note for ${a.tag}`} /></td>
            </tr>)}</tbody>
          </table>
          <div className="form-actions">
            <span className="muted small">{changed.length} change{changed.length === 1 ? '' : 's'}</span>
            <button className="btn primary" disabled={busy || changed.length === 0}>Save statuses</button>
          </div>
        </form>}
    </Card>
  );
}

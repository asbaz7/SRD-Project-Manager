import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { AssetForm, FacilityForm } from '../components/forms.jsx';
import { AssetStatus, Async, Card, Empty, PageHead, Service, Stat } from '../components/ui.jsx';
import { ASSET_KINDS, FACILITY_KINDS, date, num, withUnit } from '../format.js';
import { useApi } from '../hooks.js';

export default function Island() {
  const { id } = useParams();
  const state = useApi(`/islands/${id}`);
  const { can } = useAuth();
  const [modal, setModal] = useState(null);
  const saved = () => { setModal(null); state.reload(); };

  return <Async state={state}>{(island) => {
    const manage = can('manager') && island.can_edit;
    return <>
      <PageHead title={island.name}
        crumbs={[{ to: '/islands', label: 'Islands' }, { to: `/islands?atoll_id=${island.atoll_id}`, label: `${island.atoll_code} · ${island.atoll_name}` }, { label: island.name }]}
        actions={<>
          {island.can_edit && <Link className="btn" to={`/status?island_id=${island.id}`}>Update asset status</Link>}
          {island.can_edit && <Link className="btn" to={`/incidents/new?island_id=${island.id}`}>Report incident</Link>}
          {manage && <button className="btn" onClick={() => setModal({ type: 'facility' })}>Add facility</button>}
        </>} />
      <div className="stats">
        <Stat label="Gensets running" value={`${island.running_count} of ${island.genset_count}`} />
        <Stat label="Down / maintenance" value={island.down_count} tone={island.down_count ? 'alert' : ''} />
        <Stat label="Installed generation" value={withUnit(island.installed_kw, 'kW')} />
        <Stat label="Fuel storage" value={island.fuel_capacity_l ? withUnit(island.fuel_capacity_l, 'L') : 'Not set'}
          sub={island.fuel_stock_l != null
            ? `Stock ${num(island.fuel_stock_l)} L${island.fuel_capacity_l ? ` (${num((100 * island.fuel_stock_l) / island.fuel_capacity_l)}%)` : ''} · ${date(island.fuel_stock_date)}`
            : island.fuel_capacity_l ? 'No stock reading yet' : manage ? 'Set it with Edit on the powerhouse' : ''} />
        <Stat label="Open incidents" value={island.open_incidents} tone={island.open_incidents ? 'alert' : ''} to={`/incidents?island_id=${island.id}&status=open`} />
        <Stat label="Active projects" value={island.active_projects} to={`/projects?island_id=${island.id}&status=active`} />
      </div>

      {island.facilities.length === 0 && <Empty>No facilities recorded for this island yet.</Empty>}
      {island.facilities.map((f) => (
        <Card key={f.id} className={f.active ? '' : 'inactive'}
          title={<><Service value={f.service} short /> {f.name} <span className="muted small">· {FACILITY_KINDS[f.kind]}{!f.active && ' · not in use'}</span></>}
          actions={<>
            <Link className="btn small" to={`/log?facility_id=${f.id}`}>Daily log</Link>
            {manage && <button className="btn small ghost" onClick={() => setModal({ type: 'asset', facilityId: f.id })}>Add asset</button>}
            {manage && <button className="btn small ghost" onClick={() => setModal({ type: 'facility', facility: f })}>Edit</button>}
          </>}>
          <p className="muted small">
            Last daily log: {f.last_reading_date ? date(f.last_reading_date) : 'none yet'}
            {f.service === 'electricity' && (f.fuel_capacity_l ? ` · Fuel storage ${num(f.fuel_capacity_l)} L` : ' · Fuel storage not set')}
            {f.water_capacity_m3 && ` · Water storage ${num(f.water_capacity_m3)} m³`}
          </p>
          {f.assets.length === 0 ? <Empty>No assets recorded.</Empty> :
            <table>
              <thead><tr><th>Asset</th><th>Status</th><th className="hide-sm">Make / model</th><th className="num">Rated</th><th className="num hide-sm">Operating</th><th className="num hide-sm">Run hours</th></tr></thead>
              <tbody>{f.assets.map((a) => <tr key={a.id} className={a.active ? '' : 'inactive'}>
                <td><Link to={`/assets/${a.id}`}><strong>{ASSET_KINDS[a.kind]} {a.tag}</strong></Link></td>
                <td className="wrap"><AssetStatus status={a.status} />
                  {a.status_note && <><br /><small className="muted">{a.status_note}</small></>}
                  {a.status_at && <><br /><small className="muted">{date(a.status_at)}{a.status_by_name && ` · ${a.status_by_name}`}</small></>}</td>
                <td className="hide-sm">{a.make_model || '—'}</td>
                <td className="num">{withUnit(a.rated_capacity, a.capacity_unit || '')}</td>
                <td className="num hide-sm">{withUnit(a.operating_capacity, a.capacity_unit || '')}</td>
                <td className="num hide-sm">{num(a.running_hours)}</td>
              </tr>)}</tbody>
            </table>}
        </Card>
      ))}
      {island.notes && <Card title="Notes"><p className="pre">{island.notes}</p></Card>}

      {modal?.type === 'facility' && <FacilityForm islandId={island.id} facility={modal.facility} onClose={() => setModal(null)} onSaved={saved} />}
      {modal?.type === 'asset' && <AssetForm facilityId={modal.facilityId} onClose={() => setModal(null)} onSaved={saved} />}
    </>;
  }}</Async>;
}

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { AssetForm, FacilityForm } from '../components/forms.jsx';
import { AssetStatus, Async, Card, Condition, Empty, Flags, PageHead, Service, Stat, WorkState } from '../components/ui.jsx';
import { ASSET_KINDS, FACILITY_KINDS, WORK_KINDS, date, month, num, withUnit } from '../format.js';
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
          {island.can_edit && <Link className="btn" to={`/status?island_id=${island.id}`}>Daily status check</Link>}
          {island.can_edit && <Link className="btn" to={`/incidents/new?island_id=${island.id}`}>Report incident</Link>}
          {island.can_edit && <Link className="btn" to={`/work/new?island_id=${island.id}`}>Log work</Link>}
          {manage && <button className="btn" onClick={() => setModal({ type: 'facility' })}>Add facility</button>}
        </>} />
      <div className="stats">
        <Stat label="Gensets running" value={`${island.running_count} of ${island.genset_count}`} />
        <Stat label="Down / maintenance" value={island.down_count} tone={island.down_count ? 'alert' : ''} />
        <Stat label="Installed generation" value={withUnit(island.installed_kw, 'kW')} />
        <Stat label="Fuel capacity" value={island.fuel_capacity_l ? withUnit(island.fuel_capacity_l, 'L') : 'Not set'}
          sub={!island.fuel_capacity_l && manage ? 'Set it with Edit on the powerhouse' : ''} />
        <Stat label="Open incidents" value={island.open_incidents} tone={island.open_incidents ? 'alert' : ''} to={`/incidents?island_id=${island.id}&status=open`} />
        <Stat label="Active projects" value={island.active_projects} to={`/projects?island_id=${island.id}&status=active`} />
      </div>

      {island.open_work.length > 0 && <Card title={`Ongoing work (${island.open_work.length})`}>
        <table><tbody>{island.open_work.map((w) => <tr key={w.id}>
          <td className="wrap"><Link to={`/work/${w.id}`}><strong>{w.title}</strong></Link><br />
            <small className="muted">{w.ref} · {WORK_KINDS[w.kind]}{w.asset_tag && ` · ${ASSET_KINDS[w.asset_kind]} ${w.asset_tag}`}{w.target_on && ` · target ${date(w.target_on)}`}</small>
            {w.last_update && <div className="small">{w.last_update}</div>}</td>
          <td><WorkState value={w.status} /></td>
        </tr>)}</tbody></table>
      </Card>}

      {island.facilities.length === 0 && <Empty>No facilities recorded for this island yet.</Empty>}
      {island.facilities.map((f) => (
        <Card key={f.id} className={f.active ? '' : 'inactive'}
          title={<><Service value={f.service} short /> {f.name} <span className="muted small">· {FACILITY_KINDS[f.kind]}{!f.active && ' · not in use'}</span></>}
          actions={<>
            {manage && <button className="btn small ghost" onClick={() => setModal({ type: 'asset', facilityId: f.id })}>Add asset</button>}
            {manage && <button className="btn small ghost" onClick={() => setModal({ type: 'facility', facility: f })}>Edit</button>}
          </>}>
          {(f.service === 'electricity' || f.water_capacity_m3) && <p className="muted small">
            {f.service === 'electricity' && (f.fuel_capacity_l ? `Fuel capacity ${num(f.fuel_capacity_l)} L` : 'Fuel capacity not set')}
            {f.water_capacity_m3 && `Water storage ${num(f.water_capacity_m3)} m³`}
            {f.kind === 'powerhouse' && (() => {
              const r = island.reports.find((x) => x.facility_id === f.id);
              return <> · Condition report: {r ? <strong>{month(r.report_month)}</strong> : 'none yet'}
                {r?.peak_load_month && ` · peak ${r.peak_load_month}`} · <Link to="/reports">upload</Link></>;
            })()}
          </p>}
          {f.assets.length === 0 ? <Empty>No assets recorded.</Empty> :
            <table>
              <thead><tr><th>Asset</th><th>Status</th>{f.kind === 'powerhouse' && <><th>Condition</th><th className="num hide-sm">Since overhaul</th><th className="hide-sm">Last overhaul</th></>}<th className="num">Rated</th><th className="num hide-sm">Operating</th></tr></thead>
              <tbody>{f.assets.map((a) => <tr key={a.id} className={a.active ? '' : 'inactive'}>
                <td className="wrap"><Link to={`/assets/${a.id}`}><strong>{ASSET_KINDS[a.kind]} {a.tag}</strong></Link><br /><small className="muted">{a.make_model || '—'}</small>
                  <div><Flags e={a} /></div></td>
                <td className="wrap"><AssetStatus status={a.status} />
                  {a.status_note && <><br /><small className="muted">{a.status_note}</small></>}
                  {a.status_at && <><br /><small className="muted">{date(a.status_at)}{a.status_by_name && ` · ${a.status_by_name}`}</small></>}</td>
                {f.kind === 'powerhouse' && <>
                  <td className="wrap"><Condition value={a.condition} text={a.report_status} />{a.fault && <><br /><small className="muted">{a.fault}</small></>}</td>
                  <td className="num hide-sm">{a.hours_since_overhaul != null ? `${num(a.hours_since_overhaul)} h` : '—'}</td>
                  <td className="hide-sm small nowrap">{date(a.last_overhaul_on)}</td>
                </>}
                <td className="num">{withUnit(a.rated_capacity, a.capacity_unit || '')}</td>
                <td className="num hide-sm">{withUnit(a.operating_capacity, a.capacity_unit || '')}</td>
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

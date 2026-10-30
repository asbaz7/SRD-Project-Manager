import { useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { AssetForm, FacilityForm } from '../components/forms.jsx';
import { AssetStatus, Async, Card, Condition, EngineState, Empty, Flags, Service } from '../components/ui.jsx';
import { ASSET_KINDS, FACILITY_KINDS, LICENCE_TYPES, SERVICES, assetLabel, date, licenceState, month, num, peakLoad, withUnit } from '../format.js';
import { GensetUpdateForm } from './GensetUpdates.jsx';
import { useApi, useRowLink } from '../hooks.js';
import { Icon } from '../components/icons.jsx';
import ServicesOverview from '../components/ServicesOverview.jsx';

// There is no separate island page: an island opens beside the map on the
// Islands page. Old links (/islands/:id) land there with the island open.
export default function Island() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const svc = SERVICES[params.get('service')] ? `&service=${params.get('service')}` : '';
  return <Navigate replace to={`/islands?island=${id}${svc}`} />;
}

// One island in full, in the panel beside the map: what is running, ongoing
// work, every plant with its assets. only: one service's plants and work
// (opened from that service's page). onAtoll: back to the island's atoll.
export function IslandDetail({ id, only, onClose, onAtoll, onShowAll, islands = [] }) {
  const state = useApi(`/islands/${id}`);
  const rowLink = useRowLink();
  const { can, allowed } = useAuth();
  const [modal, setModal] = useState(null);
  const saved = () => { setModal(null); state.reload(); };

  return <Async state={state}>{(island) => {
    const manage = can('manager') && island.can_edit;
    const facilities = island.facilities.filter((f) => !only || f.service === only);
    return <>
      <header className="ip-head">
        <div>
          <button type="button" className="ip-atoll" onClick={() => onAtoll(island.atoll_code)}><Icon name="back" size={14} /> {island.atoll_name} atoll</button>
          <h2>{island.name}</h2>
          <p className="ip-sub">{island.atoll_name} atoll{islands.length > 0 && (() => {
            const here = islands.filter((x) => x.atoll_code === island.atoll_code).length;
            return ` · one of ${num(here)} islands`;
          })()}</p>
        </div>
        <button type="button" className="btn ghost" onClick={onClose}>Close</button>
      </header>
      <div className="ip-actions">
        {allowed('incidents') && <Link className="btn small" to={`/interruptions/new?island_id=${island.id}`}>Report interruption</Link>}
        {island.can_edit && island.technical && <Link className="btn small" to={`/work/new?island_id=${island.id}`}>Log work</Link>}
        {manage && island.technical && <button className="btn small" onClick={() => setModal({ type: 'facility' })}>Add facility</button>}
      </div>
      <ServicesOverview atollId={island.atoll_id} islandId={island.id} services={only ? [only] : island.services} />
      {only && <p className="small muted">Showing {SERVICES[only].label.toLowerCase()} only · <button type="button" className="link" onClick={onShowAll}>Show everything on {island.name}</button></p>}
      {island.technical && <h3 className="ip-section">Plants and equipment{island.genset_count > 0 && <span> · {island.running_count} of {island.genset_count} gensets running · {withUnit(island.installed_kw, 'kW')}</span>}</h3>}
      {island.technical && facilities.length === 0 && <Empty>No {only ? `${SERVICES[only].label.toLowerCase()} ` : ''}facilities recorded for this island yet.</Empty>}
      {facilities.map((f) => (
        <Card key={f.id} className={f.active ? '' : 'inactive'}
          title={<><Service value={f.service} short /> {f.name} <span className="muted small">· {FACILITY_KINDS[f.kind]}{!f.active && ' · not in use'}</span></>}
          actions={<>
            {manage && island.technical && f.active && f.kind === 'powerhouse' && f.service === 'electricity' && <button className="btn small" onClick={() => setModal({ type: 'update', facilityId: f.id })}>Monthly update</button>}
            {manage && <button className="btn small ghost" onClick={() => setModal({ type: 'asset', facilityId: f.id })}>Add asset</button>}
            {manage && <button className="btn small ghost" onClick={() => setModal({ type: 'facility', facility: f })}>Edit</button>}
          </>}>
          {(f.service === 'electricity' || f.water_capacity_m3) && <p className="muted small">
            {f.water_capacity_m3 && `Water storage ${num(f.water_capacity_m3)} m³`}
            {f.kind === 'powerhouse' && (() => {
              const r = island.reports.find((x) => x.facility_id === f.id);
              return <> · Last monthly update: {r ? <strong>{month(r.report_month)}</strong> : 'none yet'}
                {peakLoad(r) && ` · peak ${peakLoad(r)}`}</>;
            })()}
          </p>}
          {f.service !== 'electricity' && (f.handover_on || licenceState(f)) && <p className="small">
            {licenceState(f) && <span className={`flag ${licenceState(f).tone}`}>{licenceState(f).text}</span>}
            <span className="muted">{[f.licence_type && `${LICENCE_TYPES[f.licence_type] || f.licence_type} licence`,
              f.licence_issued_on && `issued ${date(f.licence_issued_on)}`, f.licence_expires_on && `expires ${date(f.licence_expires_on)}`,
              f.licence_status && `status: ${f.licence_status}`, f.handover_on && `handed over ${date(f.handover_on)}`].filter(Boolean).map((x) => ` · ${x}`).join('')}</span>
          </p>}
          {f.notes && <details className="small"><summary className="muted">Notes</summary><p className="pre">{f.notes}</p></details>}
          {(() => {
            // In use first; retired (decommissioned or not in use) folded away.
            const retired = f.assets.filter((a) => !a.active || a.status === 'decommissioned');
            const current = f.assets.filter((a) => !retired.includes(a));
            return <>
          {current.length === 0 ? <Empty>No assets in use recorded.</Empty> :
            <table>
              <thead><tr><th>Asset</th><th>Status</th>{f.kind === 'powerhouse' && <><th>Condition</th><th className="num hide-sm">Since overhaul</th><th className="hide-sm">Last overhaul</th></>}<th className="num">Rated</th><th className="num hide-sm">Operating</th></tr></thead>
              <tbody>{current.map((a) => <tr key={a.id} {...rowLink(`/assets/${a.id}`)}>
                <td className="wrap"><Link to={`/assets/${a.id}`}><strong>{assetLabel(a)}</strong></Link><br /><small className="muted">{a.make_model || '—'}</small>
                  <div><Flags e={a} /></div></td>
                <td className="wrap"><AssetStatus status={a.status} />
                  {a.status_note && <><br /><small className="muted">{a.status_note}</small></>}
                  {a.status_at && <><br /><small className="muted">{date(a.status_at)}{a.status_by_name && ` · ${a.status_by_name}`}</small></>}</td>
                {f.kind === 'powerhouse' && <>
                  <td className="wrap"><EngineState e={a} compact />{(['down', 'maintenance'].includes(a.status) ? a.status_note || a.fault : a.fault) && <><br /><small className="muted">{['down', 'maintenance'].includes(a.status) ? a.status_note || a.fault : a.fault}</small></>}</td>
                  <td className="num hide-sm">{a.hours_since_overhaul != null ? `${num(a.hours_since_overhaul)} h` : '—'}</td>
                  <td className="hide-sm small nowrap">{date(a.last_overhaul_on)}</td>
                </>}
                <td className="num">{withUnit(a.rated_capacity, a.capacity_unit || '')}</td>
                <td className="num hide-sm">{withUnit(a.operating_capacity, a.capacity_unit || '')}</td>
              </tr>)}</tbody>
            </table>}
          {f.moved_away?.length > 0 && <p className="small">{f.moved_away.map((m, i) => <span key={m.id}>{i > 0 && <br />}
            {ASSET_KINDS[m.kind]} {m.from_tag} moved to <Link to={`/assets/${m.asset_id}`}>{m.to_atoll}. {m.to_island} · {ASSET_KINDS[m.kind]} {m.to_tag}</Link>
            <span className="muted"> on {date(m.moved_on)}{m.source === 'merge' ? ' (records merged)' : ''}</span></span>)}</p>}
          {retired.length > 0 && <details className="small">
            <summary className="muted">Retired or not in use ({retired.length})</summary>
            <ul className="plain">{retired.map((a) => <li key={a.id}><Link to={`/assets/${a.id}`}>{assetLabel(a)}</Link>
              <span className="muted"> · {a.make_model || '—'}{a.serial_no ? ` · S/N ${a.serial_no}` : ''}{a.status_note ? ` · ${a.status_note}` : ''}</span></li>)}</ul>
          </details>}
            </>;
          })()}
        </Card>
      ))}
      {island.notes && <Card title="Notes"><p className="pre">{island.notes}</p></Card>}

      {modal?.type === 'update' && <GensetUpdateForm facilityId={modal.facilityId} onClose={() => setModal(null)} onSaved={saved} />}
      {modal?.type === 'facility' && <FacilityForm islandId={island.id} facility={modal.facility} onClose={() => setModal(null)} onSaved={saved} />}
      {modal?.type === 'asset' && <AssetForm facilityId={modal.facilityId} onClose={() => setModal(null)} onSaved={saved} />}
    </>;
  }}</Async>;
}

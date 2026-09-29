import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { AssetForm } from '../components/forms.jsx';
import { AssetStatus, Async, Card, Empty, ErrorBox, Field, PageHead, Select, Service, Severity } from '../components/ui.jsx';
import { ASSET_KINDS, ASSET_STATUS, INCIDENT_CATEGORIES, dateTime, num, withUnit } from '../format.js';
import { useApi, useSubmit } from '../hooks.js';

export default function Asset() {
  const { id } = useParams();
  const state = useApi(`/assets/${id}`);
  const { can } = useAuth();
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState({ status: '', note: '', running_hours: '' });
  const { submit, busy, error } = useSubmit(async () => {
    await api('/assets/status', { method: 'POST', body: { items: [{
      asset_id: id, status: status.status, note: status.note || null,
      running_hours: status.running_hours === '' ? null : Number(status.running_hours),
    }] } });
    setStatus({ status: '', note: '', running_hours: '' });
    state.reload();
  });

  return <Async state={state}>{(a) => {
    const writable = a.can_edit;
    return <>
      <PageHead title={`${ASSET_KINDS[a.kind]} ${a.tag}`}
        crumbs={[{ to: '/islands', label: 'Islands' }, { to: `/islands/${a.island_id}`, label: `${a.atoll_code} · ${a.island_name}` }, { label: `${a.facility_name}` }]}
        actions={can('manager') && writable && <button className="btn" onClick={() => setEditing(true)}>Edit details</button>} />
      <div className="grid-2">
        <Card title="Details">
          <dl className="facts">
            <dt>Status</dt><dd><AssetStatus status={a.status} />{a.status_note && <div className="muted small">{a.status_note}</div>}</dd>
            <dt>Service</dt><dd><Service value={a.service} /></dd>
            <dt>Make / model</dt><dd>{a.make_model || '—'}</dd>
            <dt>Serial number</dt><dd>{a.serial_no || '—'}</dd>
            <dt>Rated capacity</dt><dd>{withUnit(a.rated_capacity, a.capacity_unit || '')}</dd>
            <dt>Operating capacity</dt><dd>{withUnit(a.operating_capacity, a.capacity_unit || '')}</dd>
            <dt>Running hours</dt><dd>{num(a.running_hours)}</dd>
            <dt>Commissioned</dt><dd>{a.commissioned_on || '—'}</dd>
            {a.notes && <><dt>Notes</dt><dd className="pre">{a.notes}</dd></>}
          </dl>
        </Card>
        {writable && can('operator') && <Card title="Report status">
          <form className="form narrow" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <ErrorBox error={error} />
            <Field label="Status"><Select required value={status.status} onChange={(v) => setStatus({ ...status, status: v })} placeholder="Choose…"
              options={Object.entries(ASSET_STATUS).filter(([k]) => k !== 'unknown').map(([k, s]) => [k, s.label])} /></Field>
            <Field label="Note"><input value={status.note} onChange={(e) => setStatus({ ...status, note: e.target.value })} placeholder="e.g. awaiting turbocharger" /></Field>
            <Field label="Running hours (optional)"><input type="number" min="0" step="any" value={status.running_hours} onChange={(e) => setStatus({ ...status, running_hours: e.target.value })} /></Field>
            <button className="btn primary" disabled={busy || !status.status}>Save status</button>
          </form>
        </Card>}
      </div>
      <Card title="Status history">
        {a.history.length === 0 ? <Empty>No status reported yet.</Empty> :
          <table><thead><tr><th>When</th><th>Status</th><th>Note</th><th className="hide-sm">By</th></tr></thead>
            <tbody>{a.history.map((h) => <tr key={h.id}>
              <td className="nowrap">{dateTime(h.reported_at)}</td><td><AssetStatus status={h.status} /></td>
              <td className="wrap">{h.note || '—'}{h.running_hours != null && <small className="muted"> · {num(h.running_hours)} h</small>}</td>
              <td className="hide-sm">{h.reported_by_name}</td>
            </tr>)}</tbody></table>}
      </Card>
      <Card title="Incidents">
        {a.incidents.length === 0 ? <Empty>No incidents linked to this asset.</Empty> :
          <table><tbody>{a.incidents.map((x) => <tr key={x.id}>
            <td><Severity value={x.severity} /></td>
            <td className="wrap"><Link to={`/incidents/${x.id}`}>{x.title}</Link><br /><small className="muted">{INCIDENT_CATEGORIES[x.category]} · {dateTime(x.started_at)} · {x.status}</small></td>
          </tr>)}</tbody></table>}
      </Card>
      {editing && <AssetForm asset={a} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); state.reload(); }} />}
    </>;
  }}</Async>;
}

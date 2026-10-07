import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Async, Card, ErrorBox, Field, PageHead, Select, Service, Severity } from '../components/ui.jsx';
import { ASSET_KINDS, INCIDENT_CATEGORIES, SERVICES, SEVERITIES, dateTime, duration, fromLocalInput, num, toLocalInput } from '../format.js';
import { useApi, useSubmit } from '../hooks.js';

export default function Incident() {
  const { id } = useParams();
  const state = useApi(id ? `/incidents/${id}` : null);
  if (!id) return <IncidentForm />;
  return <Async state={state}>{(x) => <IncidentView incident={x} reload={state.reload} />}</Async>;
}

function IncidentView({ incident: x, reload }) {
  const { canWriteIsland, technical } = useAuth();
  const [editing, setEditing] = useState(false);
  const writable = x.can_edit;
  const [resolution, setResolution] = useState({ resolved_at: toLocalInput(new Date().toISOString()), resolution: '' });
  const { submit, busy, error } = useSubmit(async (body) => { await api(`/incidents/${x.id}`, { method: 'PATCH', body }); reload(); });

  if (editing) return <IncidentForm incident={x} onDone={() => { setEditing(false); reload(); }} />;
  return <>
    <PageHead title={x.title} crumbs={[{ to: '/incidents', label: 'Incidents' }, { label: x.ref }]}
      actions={writable && <button className="btn" onClick={() => setEditing(true)}>Edit</button>} />
    <ErrorBox error={error} />
    <div className="grid-2">
      <Card title="Details">
        <dl className="facts">
          <dt>Status</dt><dd><span className={`pill inc-${x.status}`}>{x.status}</span></dd>
          <dt>Severity</dt><dd><Severity value={x.severity} /></dd>
          <dt>Service</dt><dd><Service value={x.service} /></dd>
          <dt>Category</dt><dd>{INCIDENT_CATEGORIES[x.category]}</dd>
          <dt>Location</dt><dd><Link to={`/islands/${x.island_id}`}>{x.atoll_code} · {x.island_name}</Link>{x.facility_name && ` · ${x.facility_name}`}</dd>
          {x.asset_id && <><dt>Asset</dt><dd>{technical ? <Link to={`/assets/${x.asset_id}`}>{ASSET_KINDS[x.asset_kind]} {x.asset_tag}</Link> : `${ASSET_KINDS[x.asset_kind]} ${x.asset_tag}`}</dd></>}
          <dt>Started</dt><dd>{dateTime(x.started_at)}</dd>
          <dt>Resolved</dt><dd>{dateTime(x.resolved_at)}{x.resolved_by_name && ` · ${x.resolved_by_name}`}</dd>
          <dt>Duration</dt><dd>{duration(x.duration_minutes)}{x.status === 'open' && ' so far'}</dd>
          <dt>Customers affected</dt><dd>{num(x.customers_affected)}</dd>
          <dt>Reported by</dt><dd>{x.reported_by_name || '—'} · {dateTime(x.created_at)}</dd>
        </dl>
      </Card>
      <Card title={x.status === 'open' ? 'Resolve' : 'Resolution'}>
        {x.description && <><h3>Description</h3><p className="pre">{x.description}</p></>}
        {x.status !== 'open' ? <>
          <p className="pre">{x.resolution || <span className="muted">No resolution notes.</span>}</p>
          {writable && <div className="form-actions">
            {x.status === 'resolved' && <button className="btn" disabled={busy} onClick={() => submit({ status: 'closed' })}>Close</button>}
            <button className="btn ghost" disabled={busy} onClick={() => submit({ status: 'open' })}>Reopen</button>
          </div>}
        </> : writable ? (
          <form className="form narrow" onSubmit={(e) => { e.preventDefault(); submit({ status: 'resolved', resolved_at: fromLocalInput(resolution.resolved_at), resolution: resolution.resolution || null }); }}>
            <Field label="Restored / fixed at (Maldives time)"><input type="datetime-local" required value={resolution.resolved_at} onChange={(e) => setResolution({ ...resolution, resolved_at: e.target.value })} /></Field>
            <Field label="What was done"><textarea rows="3" value={resolution.resolution} onChange={(e) => setResolution({ ...resolution, resolution: e.target.value })} /></Field>
            <button className="btn primary" disabled={busy}>Mark resolved</button>
          </form>
        ) : <p className="muted">Still open.</p>}
      </Card>
    </div>
  </>;
}

function IncidentForm({ incident, onDone }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { canWriteIsland, technical } = useAuth();
  const islands = useApi('/islands');
  const mine = useMemo(() => (islands.data || []).filter(canWriteIsland), [islands.data, canWriteIsland]);
  const [f, setF] = useState(() => incident ? {
    ...incident, started_at: toLocalInput(incident.started_at), resolved_at: toLocalInput(incident.resolved_at),
  } : {
    island_id: params.get('island_id') || '', service: params.get('service') || 'electricity', category: 'outage', severity: 'medium',
    title: '', description: '', started_at: toLocalInput(new Date().toISOString()), facility_id: '', asset_id: '', customers_affected: '',
  });
  const island = useApi(f.island_id ? `/islands/${f.island_id}` : null);
  const facilities = (island.data?.facilities || []).filter((x) => x.service === f.service);
  const assets = facilities.find((x) => x.id === f.facility_id)?.assets || [];
  const set = (k) => (v) => setF((prev) => ({ ...prev, [k]: v?.target ? v.target.value : v }));

  const { submit, busy, error } = useSubmit(async () => {
    const body = {
      service: f.service, category: f.category, severity: f.severity, title: f.title, description: f.description || null,
      facility_id: f.facility_id || null, asset_id: f.asset_id || null, started_at: fromLocalInput(f.started_at),
      customers_affected: f.customers_affected === '' || f.customers_affected == null ? null : Number(f.customers_affected),
    };
    if (incident) {
      if (f.resolved_at) body.resolved_at = fromLocalInput(f.resolved_at);
      await api(`/incidents/${incident.id}`, { method: 'PATCH', body: { ...body, resolution: f.resolution || null } });
      onDone();
    } else {
      const created = await api('/incidents', { method: 'POST', body: { ...body, island_id: f.island_id } });
      navigate(`/incidents/${created.id}`, { replace: true });
    }
  });

  return <>
    <PageHead title={incident ? `Edit ${incident.ref}` : 'Report incident'} crumbs={[{ to: '/incidents', label: 'Incidents' }, { label: incident ? incident.ref : 'New' }]} />
    <Card>
      <form className="form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <ErrorBox error={error} />
        <Field label="Island">
          <Select required disabled={!!incident} value={f.island_id} onChange={(v) => setF({ ...f, island_id: v, facility_id: '', asset_id: '' })} placeholder="Choose island…"
            options={(incident ? islands.data || [] : mine).map((i) => [i.id, `${i.atoll_code} · ${i.name}`])} />
        </Field>
        <Field label="Service"><Select value={f.service} onChange={(v) => setF({ ...f, service: v, facility_id: '', asset_id: '' })} options={Object.entries(SERVICES).map(([k, s]) => [k, s.label])} /></Field>
        {technical && <><Field label="Facility (optional)"><Select value={f.facility_id || ''} onChange={(v) => setF({ ...f, facility_id: v, asset_id: '' })} placeholder="—" options={facilities.map((x) => [x.id, x.name])} /></Field>
        <Field label="Asset (optional)"><Select value={f.asset_id || ''} onChange={set('asset_id')} placeholder="—" options={assets.map((a) => [a.id, `${ASSET_KINDS[a.kind]} ${a.tag} ${a.make_model ? `· ${a.make_model}` : ''}`])} /></Field></>}
        <Field label="Category"><Select value={f.category} onChange={set('category')} options={INCIDENT_CATEGORIES} /></Field>
        <Field label="Severity"><Select value={f.severity} onChange={set('severity')} options={SEVERITIES} /></Field>
        <Field label="Title" wide><input required maxLength="200" value={f.title} onChange={set('title')} placeholder="e.g. Genset 3 tripped, partial load shedding" /></Field>
        <Field label="Description" wide><textarea rows="4" value={f.description || ''} onChange={set('description')} /></Field>
        <Field label="Started at (Maldives time)"><input type="datetime-local" required value={f.started_at} onChange={set('started_at')} /></Field>
        <Field label="Customers affected"><input type="number" min="0" value={f.customers_affected ?? ''} onChange={set('customers_affected')} /></Field>
        {incident && incident.status !== 'open' && <>
          <Field label="Resolved at (Maldives time)"><input type="datetime-local" value={f.resolved_at || ''} onChange={set('resolved_at')} /></Field>
          <Field label="Resolution" wide><textarea rows="3" value={f.resolution || ''} onChange={set('resolution')} /></Field>
        </>}
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={() => (incident ? onDone() : navigate(-1))}>Cancel</button>
          <button className="btn primary" disabled={busy}>{incident ? 'Save changes' : 'Report incident'}</button>
        </div>
      </form>
    </Card>
  </>;
}

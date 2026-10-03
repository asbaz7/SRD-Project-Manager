import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Async, Card, Empty, ErrorBox, Field, PageHead, Select, WorkState } from '../components/ui.jsx';
import { ASSET_KINDS, WORK_KINDS, WORK_STATES, date, dateTime } from '../format.js';
import { useApi, useSubmit } from '../hooks.js';

export default function WorkItem() {
  const { id } = useParams();
  const state = useApi(id ? `/work/${id}` : null);
  if (!id) return <WorkForm />;
  return <Async state={state}>{(w) => <WorkView work={w} reload={state.reload} />}</Async>;
}

function WorkView({ work: w, reload }) {
  const { can, canWriteIsland } = useAuth();
  const [editing, setEditing] = useState(false);
  const writable = can('manager') && canWriteIsland({ id: w.island_id, atoll_id: w.atoll_id });
  const [u, setU] = useState({ body: '', status: '' });
  const { submit, busy, error } = useSubmit(async (status) => {
    await api(`/work/${w.id}/updates`, { method: 'POST', body: { body: u.body, status: (typeof status === 'string' ? status : u.status) || null } });
    setU({ body: '', status: '' });
    reload();
  });
  const open = !['completed', 'cancelled'].includes(w.status);

  if (editing) return <WorkForm work={w} onDone={() => { setEditing(false); reload(); }} />;
  return <>
    <PageHead title={w.title} crumbs={[{ to: '/work', label: 'Work' }, { label: w.ref }]}
      actions={writable && <button className="btn" onClick={() => setEditing(true)}>Edit</button>} />
    <div className="grid-2">
      <Card title="Details">
        <dl className="facts">
          <dt>Status</dt><dd><WorkState value={w.status} /></dd>
          <dt>Type</dt><dd>{WORK_KINDS[w.kind]}</dd>
          <dt>Where</dt><dd><Link to={`/islands/${w.island_id}`}>{w.atoll_code} · {w.island_name}</Link>{w.facility_name && ` · ${w.facility_name}`}</dd>
          {w.asset_id && <><dt>Asset</dt><dd><Link to={`/assets/${w.asset_id}`}>{ASSET_KINDS[w.asset_kind]} {w.asset_tag}</Link>{w.asset_model && <span className="muted"> · {w.asset_model}</span>}</dd></>}
          <dt>Assigned to</dt><dd>{w.assigned_to || '—'}</dd>
          <dt>Started</dt><dd>{date(w.started_on)}</dd>
          <dt>Target</dt><dd className={w.overdue ? 'bad' : ''}>{date(w.target_on)}{w.overdue && ' · overdue'}</dd>
          {w.completed_on && <><dt>Completed</dt><dd>{date(w.completed_on)}</dd></>}
          <dt>Logged by</dt><dd>{w.created_by_name || '—'} · {dateTime(w.created_at)}</dd>
        </dl>
        {w.description && <p className="pre">{w.description}</p>}
        {w.status === 'completed' && w.asset_id && <p className="muted small">✓ Added to the engine's maintenance history.</p>}
      </Card>
      {writable && <Card title="Post an update">
        <form className="form narrow" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <ErrorBox error={error} />
          <Field label="What's happening"><textarea required rows="3" value={u.body} onChange={(e) => setU({ ...u, body: e.target.value })} placeholder="e.g. Parts arrived, fitting tomorrow" /></Field>
          <Field label="Change status to"><Select value={u.status} onChange={(v) => setU({ ...u, status: v })} placeholder="(no change)" options={WORK_STATES} /></Field>
          <div className="form-actions">
            {open && <button type="button" className="btn" disabled={busy || !u.body} onClick={() => submit('completed')}>Post & mark completed</button>}
            <button className="btn primary" disabled={busy}>Post update</button>
          </div>
        </form>
      </Card>}
    </div>
    <Card title="Updates">
      {w.updates.length === 0 ? <Empty>No updates yet.</Empty> :
        <ol className="timeline">{w.updates.map((x) => <li key={x.id}>
          <div className="muted small">{dateTime(x.created_at)} · {x.created_by_name}{x.status && <> · <WorkState value={x.status} /></>}</div>
          <p className="pre">{x.body}</p>
        </li>)}</ol>}
    </Card>
  </>;
}

function WorkForm({ work, onDone }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { canWriteIsland } = useAuth();
  const islands = useApi('/islands');
  const mine = useMemo(() => (islands.data || []).filter(canWriteIsland), [islands.data, canWriteIsland]);
  const presetAsset = params.get('asset_id');
  const asset = useApi(presetAsset && !work ? `/assets/${presetAsset}` : null);
  const [f, setF] = useState(() => work || {
    island_id: params.get('island_id') || '', asset_id: presetAsset || '', kind: params.get('kind') || 'repair',
    title: '', description: '', status: 'in_progress', assigned_to: '', started_on: '', target_on: '',
  });
  const islandId = f.island_id || asset.data?.island_id || '';
  const island = useApi(islandId && !work ? `/islands/${islandId}` : null);
  const assets = (island.data?.facilities || []).filter((x) => x.active).flatMap((x) => x.assets.filter((a) => a.active));
  const set = (k) => (v) => setF((prev) => ({ ...prev, [k]: v?.target ? v.target.value : v }));

  const { submit, busy, error } = useSubmit(async () => {
    const body = {
      kind: f.kind, title: f.title, description: f.description || null, status: f.status, assigned_to: f.assigned_to || null,
      started_on: f.started_on || null, target_on: f.target_on || null,
    };
    if (work) {
      await api(`/work/${work.id}`, { method: 'PATCH', body: { ...body, completed_on: f.completed_on || null } });
      onDone();
    } else {
      const created = await api('/work', { method: 'POST', body: { ...body, island_id: islandId || null, asset_id: f.asset_id || null } });
      navigate(`/work/${created.id}`, { replace: true });
    }
  });

  return <>
    <PageHead title={work ? `Edit ${work.ref}` : 'Log work'} crumbs={[{ to: '/work', label: 'Work' }, { label: work ? work.ref : 'New' }]} />
    <Card>
      <form className="form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <ErrorBox error={error} />
        {!work && <>
          <Field label="Island"><Select required value={islandId} onChange={(v) => setF({ ...f, island_id: v, asset_id: '' })} placeholder="Choose island…"
            options={mine.map((i) => [i.id, `${i.atoll_code} · ${i.name}`])} /></Field>
          <Field label="Genset / asset (optional)" hint="Leave empty for work on the island or powerhouse as a whole.">
            <Select value={f.asset_id} onChange={set('asset_id')} placeholder="— whole island —" options={assets.map((a) => [a.id, `${ASSET_KINDS[a.kind]} ${a.tag}${a.make_model ? ` · ${a.make_model}` : ''}`])} /></Field>
        </>}
        <Field label="Type"><Select value={f.kind} onChange={set('kind')} options={WORK_KINDS} /></Field>
        <Field label="Status"><Select value={f.status} onChange={set('status')} options={WORK_STATES} /></Field>
        <Field label="What is the work" wide><input required maxLength="200" value={f.title} onChange={set('title')} placeholder="e.g. Genset 3 top overhaul" /></Field>
        <Field label="Details" wide><textarea rows="3" value={f.description || ''} onChange={set('description')} /></Field>
        <Field label="Assigned to"><input value={f.assigned_to || ''} onChange={set('assigned_to')} placeholder="Team or contractor" /></Field>
        <Field label="Started"><input type="date" value={f.started_on || ''} onChange={set('started_on')} /></Field>
        <Field label="Target date"><input type="date" value={f.target_on || ''} onChange={set('target_on')} /></Field>
        {work && <Field label="Completed on"><input type="date" value={f.completed_on || ''} onChange={set('completed_on')} /></Field>}
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={() => (work ? onDone() : navigate(-1))}>Cancel</button>
          <button className="btn primary" disabled={busy}>{work ? 'Save changes' : 'Log work'}</button>
        </div>
      </form>
    </Card>
  </>;
}

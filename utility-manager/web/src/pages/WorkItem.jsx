import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Async, Card, Empty, ErrorBox, Field, PageHead, Select, WorkState } from '../components/ui.jsx';
import { ASSET_KINDS, SERVICES, WORK_KINDS, WORK_STATES, date, dateTime } from '../format.js';
import { useApi, useSubmit } from '../hooks.js';

export default function WorkItem() {
  const { id } = useParams();
  const state = useApi(id ? `/work/${id}` : null);
  if (!id) return <WorkForm />;
  return <Async state={state}>{(w) => <WorkView work={w} reload={state.reload} />}</Async>;
}

function WorkView({ work: w, reload }) {
  const { technical } = useAuth();
  const [editing, setEditing] = useState(false);
  // The server decides: technical managers of the island run the work;
  // people added to it may comment.
  const writable = w.can_run;
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
          <dt>Service</dt><dd>{SERVICES[w.service]?.label}</dd>
          <dt>Type</dt><dd>{WORK_KINDS[w.kind]}</dd>
          <dt>Where</dt><dd><Link to={`/islands/${w.island_id}`}>{w.atoll_code} · {w.island_name}</Link>{w.facility_name && ` · ${w.facility_name}`}</dd>
          {w.asset_id && <><dt>Asset</dt><dd>{technical ? <Link to={`/assets/${w.asset_id}`}>{ASSET_KINDS[w.asset_kind]} {w.asset_tag}</Link> : `${ASSET_KINDS[w.asset_kind]} ${w.asset_tag}`}{w.asset_model && <span className="muted"> · {w.asset_model}</span>}</dd></>}
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
      {!writable && w.can_comment && <Card title="Add a comment">
        <form className="form narrow" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <ErrorBox error={error} />
          <Field label="Comment" hint="Everyone who can see this work will see your comment."><textarea required rows="3" value={u.body} onChange={(e) => setU({ ...u, body: e.target.value })} /></Field>
          <div className="form-actions"><button className="btn primary" disabled={busy}>Post comment</button></div>
        </form>
      </Card>}
    </div>
    <Commenters work={w} reload={reload} />
    <Card title="Updates">
      {w.updates.length === 0 ? <Empty>No updates yet.</Empty> :
        <ol className="timeline">{w.updates.map((x) => <li key={x.id}>
          <div className="muted small">{dateTime(x.created_at)} · {x.created_by_name}{x.status && <> · <WorkState value={x.status} /></>}</div>
          <p className="pre">{x.body}</p>
        </li>)}</ol>}
    </Card>
  </>;
}

// People who aren't running the work (usually non-technical staff) but may
// comment on it. Added and removed by the technical staff running it.
function Commenters({ work: w, reload }) {
  const directory = useApi(w.can_share ? '/users/directory' : null);
  const [pick, setPick] = useState('');
  const add = useSubmit(async () => { await api(`/work/${w.id}/commenters`, { method: 'POST', body: { user_id: pick } }); setPick(''); reload(); });
  const remove = useSubmit(async (userId) => { await api(`/work/${w.id}/commenters/${userId}`, { method: 'DELETE' }); reload(); });
  if (!w.can_share && w.commenters.length === 0) return null;
  const taken = new Set(w.commenters.map((c) => c.user_id));
  const options = (directory.data || []).filter((p) => !taken.has(p.id) && p.id !== w.created_by)
    .sort((a, b) => a.technical - b.technical || a.full_name.localeCompare(b.full_name))
    .map((p) => [p.id, `${p.full_name}${p.designation ? ` · ${p.designation}` : ''}${p.technical ? '' : ' (non-technical)'}`]);
  return <Card title="People who can comment">
    <ErrorBox error={add.error || remove.error} />
    {w.commenters.length === 0 ? <p className="muted small">Only technical staff on this island can post here. Add people, such as non-technical staff, who should be able to comment.</p> :
      <ul className="people">{w.commenters.map((c) => <li key={c.user_id}>
        <span><strong>{c.full_name}</strong>{c.designation && <span className="muted"> · {c.designation}</span>}<br />
          <small className="muted">Added {date(c.added_at)}{c.added_by_name && ` by ${c.added_by_name}`}</small></span>
        {w.can_share && <button className="btn ghost small" disabled={remove.busy} onClick={() => remove.submit(c.user_id)}>Remove</button>}
      </li>)}</ul>}
    {w.can_share && <form className="inline-add" onSubmit={(e) => { e.preventDefault(); if (pick) add.submit(); }}>
      <Select value={pick} onChange={setPick} placeholder="Add a person…" options={options} aria-label="Person" />
      <button className="btn" disabled={!pick || add.busy}>Add</button>
    </form>}
  </Card>;
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
    service: params.get('service') || '',
    title: '', description: '', status: 'in_progress', assigned_to: '', started_on: '', target_on: '',
  });
  const islandId = f.island_id || asset.data?.island_id || '';
  const island = useApi(islandId && !work ? `/islands/${islandId}` : null);
  const assets = (island.data?.facilities || []).filter((x) => x.active && (!f.service || x.service === f.service))
    .flatMap((x) => x.assets.filter((a) => a.active).map((a) => ({ ...a, service: x.service })));
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
      const created = await api('/work', { method: 'POST', body: { ...body, island_id: islandId || null, asset_id: f.asset_id || null, service: f.service || null } });
      navigate(`/work/${created.id}`, { replace: true });
    }
  });

  return <>
    <PageHead title={work ? `Edit ${work.ref}` : 'Log work'} crumbs={[{ to: '/work', label: 'Work' }, { label: work ? work.ref : 'New' }]} />
    <Card>
      <form className="form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <ErrorBox error={error} />
        {!work && <>
          <Field label="Service"><Select required={!f.asset_id} value={f.service} onChange={(v) => setF({ ...f, service: v, asset_id: '' })} placeholder="Choose…"
            options={Object.entries(SERVICES).map(([k, s]) => [k, s.label])} /></Field>
          <Field label="Island"><Select required value={islandId} onChange={(v) => setF({ ...f, island_id: v, asset_id: '' })} placeholder="Choose island…"
            options={mine.map((i) => [i.id, `${i.atoll_code} · ${i.name}`])} /></Field>
          <Field label="Asset (optional)" hint="Leave empty for work on the plant or island as a whole.">
            <Select value={f.asset_id} onChange={(v) => setF({ ...f, asset_id: v, service: v ? assets.find((a) => a.id === v)?.service || f.service : f.service })} placeholder="— whole island —" options={assets.map((a) => [a.id, `${ASSET_KINDS[a.kind]} ${a.tag}${a.make_model ? ` · ${a.make_model}` : ''}`])} /></Field>
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

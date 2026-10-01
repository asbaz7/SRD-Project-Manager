import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Async, Card, Empty, ErrorBox, Field, PageHead, Progress, ProjectState, Select, Service } from '../components/ui.jsx';
import { PROJECT_STATES, SERVICES, date, dateTime, num } from '../format.js';
import { useApi, useSubmit } from '../hooks.js';

export default function Project() {
  const { id } = useParams();
  const state = useApi(id ? `/projects/${id}` : null);
  if (!id) return <ProjectForm />;
  return <Async state={state}>{(p) => <ProjectView project={p} reload={state.reload} />}</Async>;
}

function ProjectView({ project: p, reload }) {
  const { can, canWriteIsland, user } = useAuth();
  const [editing, setEditing] = useState(false);
  const writable = p.island_id ? canWriteIsland({ id: p.island_id, atoll_id: p.atoll_id }) : (user.role === 'admin' || user.scope.region);
  const [u, setU] = useState({ body: '', progress_pct: '', status: '' });
  const { submit, busy, error } = useSubmit(async () => {
    await api(`/projects/${p.id}/updates`, { method: 'POST', body: {
      body: u.body, progress_pct: u.progress_pct === '' ? null : Number(u.progress_pct), status: u.status || null } });
    setU({ body: '', progress_pct: '', status: '' });
    reload();
  });

  if (editing) return <ProjectForm project={p} onDone={() => { setEditing(false); reload(); }} />;
  return <>
    <PageHead title={p.title} crumbs={[{ to: '/projects', label: 'Projects' }, { label: p.ref }]}
      actions={can('manager') && writable && <button className="btn" onClick={() => setEditing(true)}>Edit</button>} />
    <div className="grid-2">
      <Card title="Details">
        <dl className="facts">
          <dt>Status</dt><dd><ProjectState value={p.status} /></dd>
          <dt>Progress</dt><dd><Progress value={p.progress_pct} /></dd>
          <dt>Service</dt><dd><Service value={p.service} /></dd>
          <dt>Location</dt><dd>{p.island_id ? <Link to={`/islands/${p.island_id}`}>{p.atoll_code} · {p.island_name}</Link> : 'Regional'}{p.facility_name && ` · ${p.facility_name}`}</dd>
          <dt>Owner</dt><dd>{p.owner_name || '—'}</dd>
          <dt>Contractor</dt><dd>{p.contractor || '—'}</dd>
          <dt>Budget</dt><dd>{p.budget != null ? `MVR ${num(p.budget, 2)}` : '—'}</dd>
          <dt>Start</dt><dd>{date(p.start_date)}</dd>
          <dt>Target</dt><dd className={p.overdue ? 'bad' : ''}>{date(p.target_date)}{p.overdue && ' · overdue'}</dd>
          {p.completed_on && <><dt>Completed</dt><dd>{date(p.completed_on)}</dd></>}
        </dl>
        {p.description && <p className="pre">{p.description}</p>}
      </Card>
      {can('manager') && writable && <Card title="Post an update">
        <form className="form narrow" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <ErrorBox error={error} />
          <Field label="What happened"><textarea required rows="3" value={u.body} onChange={(e) => setU({ ...u, body: e.target.value })} /></Field>
          <Field label="Progress now (%)"><input type="number" min="0" max="100" value={u.progress_pct} onChange={(e) => setU({ ...u, progress_pct: e.target.value })} placeholder={String(p.progress_pct)} /></Field>
          <Field label="Change status to"><Select value={u.status} onChange={(v) => setU({ ...u, status: v })} placeholder="(no change)" options={PROJECT_STATES} /></Field>
          <button className="btn primary" disabled={busy}>Post update</button>
        </form>
      </Card>}
    </div>
    <Card title="Updates">
      {p.updates.length === 0 ? <Empty>No updates yet.</Empty> :
        <ol className="timeline">{p.updates.map((x) => <li key={x.id}>
          <div className="muted small">{dateTime(x.created_at)} · {x.created_by_name}
            {x.progress_pct != null && ` · ${x.progress_pct}%`}{x.status && <> · <ProjectState value={x.status} /></>}</div>
          <p className="pre">{x.body}</p>
        </li>)}</ol>}
    </Card>
  </>;
}

function ProjectForm({ project, onDone }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { canWriteIsland, user } = useAuth();
  const islands = useApi('/islands');
  const people = useApi('/users/directory');
  const mine = useMemo(() => (islands.data || []).filter(canWriteIsland), [islands.data, canWriteIsland]);
  const [f, setF] = useState(project || {
    service: 'electricity', island_id: params.get('island_id') || '', title: '', description: '', status: 'planned',
    progress_pct: 0, budget: '', contractor: '', start_date: '', target_date: '', owner_id: '',
  });
  const set = (k) => (v) => setF({ ...f, [k]: v?.target ? v.target.value : v });
  const { submit, busy, error } = useSubmit(async () => {
    const body = {
      service: f.service, title: f.title, description: f.description || null, status: f.status,
      progress_pct: Number(f.progress_pct) || 0, budget: f.budget === '' || f.budget == null ? null : Number(f.budget),
      contractor: f.contractor || null, start_date: f.start_date || null, target_date: f.target_date || null,
      owner_id: f.owner_id || null,
    };
    if (project) {
      await api(`/projects/${project.id}`, { method: 'PATCH', body: { ...body, completed_on: f.completed_on || null } });
      onDone();
    } else {
      const created = await api('/projects', { method: 'POST', body: { ...body, island_id: f.island_id || null } });
      navigate(`/projects/${created.id}`, { replace: true });
    }
  });
  const regional = user.role === 'admin' || user.scope.region;

  return <>
    <PageHead title={project ? `Edit ${project.ref}` : 'New project'} crumbs={[{ to: '/projects', label: 'Projects' }, { label: project ? project.ref : 'New' }]} />
    <Card>
      <form className="form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <ErrorBox error={error} />
        <Field label="Title" wide><input required maxLength="200" value={f.title} onChange={set('title')} /></Field>
        <Field label="Island"><Select disabled={!!project} value={f.island_id || ''} onChange={set('island_id')}
          placeholder={regional ? 'Regional (no single island)' : 'Choose island…'} required={!regional}
          options={(project ? islands.data || [] : mine).map((i) => [i.id, `${i.atoll_code} · ${i.name}`])} /></Field>
        <Field label="Service"><Select value={f.service} onChange={set('service')} options={Object.entries(SERVICES).map(([k, s]) => [k, s.label])} /></Field>
        <Field label="Status"><Select value={f.status} onChange={set('status')} options={PROJECT_STATES} /></Field>
        <Field label="Progress (%)"><input type="number" min="0" max="100" value={f.progress_pct} onChange={set('progress_pct')} /></Field>
        <Field label="Owner"><Select value={f.owner_id || ''} onChange={set('owner_id')} placeholder="—" options={(people.data || []).map((p) => [p.id, p.full_name])} /></Field>
        <Field label="Contractor"><input value={f.contractor || ''} onChange={set('contractor')} /></Field>
        <Field label="Budget (MVR)"><input type="number" min="0" step="any" value={f.budget ?? ''} onChange={set('budget')} /></Field>
        <Field label="Start date"><input type="date" value={f.start_date || ''} onChange={set('start_date')} /></Field>
        <Field label="Target date"><input type="date" value={f.target_date || ''} onChange={set('target_date')} /></Field>
        {project && <Field label="Completed on"><input type="date" value={f.completed_on || ''} onChange={set('completed_on')} /></Field>}
        <Field label="Description" wide><textarea rows="4" value={f.description || ''} onChange={set('description')} /></Field>
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={() => (project ? onDone() : navigate(-1))}>Cancel</button>
          <button className="btn primary" disabled={busy}>{project ? 'Save changes' : 'Create project'}</button>
        </div>
      </form>
    </Card>
  </>;
}

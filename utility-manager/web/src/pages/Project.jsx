import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Async, Card, Empty, ErrorBox, Field, PageHead, Progress, ProjectState, Select, Service } from '../components/ui.jsx';
import { PROJECT_STATES, PROJECT_TYPES, date, dateTime, num, pct } from '../format.js';
import { useApi, useSubmit } from '../hooks.js';

export default function Project() {
  const { id } = useParams();
  const state = useApi(id ? `/projects/${id}` : null);
  if (!id) return <ProjectForm />;
  return <Async state={state}>{(p) => <ProjectView project={p} reload={state.reload} />}</Async>;
}

function ProjectView({ project: p, reload }) {
  const [editing, setEditing] = useState(false);
  // Per project: its creator, owner and administrators manage it; people
  // given edit access can edit; others it is shared with can view.
  const writable = p.can_edit;
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
      actions={writable && <button className="btn" onClick={() => setEditing(true)}>{p.can_manage ? 'Edit & sharing' : 'Edit'}</button>} />
    <div className="grid-2">
      <Card title="Details">
        <dl className="facts">
          <dt>Status</dt><dd><ProjectState value={p.status} /></dd>
          <dt>Progress</dt><dd><Progress value={p.progress_pct} />{p.tasks.length > 0 && <span className="muted small"> · from {p.tasks.length} tasks</span>}</dd>
          <dt>Type</dt><dd>{PROJECT_TYPES[p.project_type] || '—'}</dd>
          {p.service && <><dt>Service</dt><dd><Service value={p.service} /></dd></>}
          <dt>Location</dt><dd>{p.island_id ? <Link to={`/islands/${p.island_id}`}>{p.atoll_code} · {p.island_name}</Link> : 'Regional'}{p.facility_name && ` · ${p.facility_name}`}</dd>
          <dt>Owner</dt><dd>{p.owner_name || '—'}</dd>
          <dt>Contractor</dt><dd>{p.contractor || '—'}</dd>
          <dt>Budget</dt><dd>{p.budget != null ? `MVR ${num(p.budget, 2)}` : '—'}</dd>
          <dt>Start</dt><dd>{date(p.start_date)}</dd>
          <dt>Target</dt><dd className={p.overdue ? 'bad' : ''}>{date(p.target_date)}{p.overdue && ' · overdue'}</dd>
          {p.completed_on && <><dt>Completed</dt><dd>{date(p.completed_on)}</dd></>}
        </dl>
      </Card>
      {writable && <Card title="Post an update">
        <form className="form narrow" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <ErrorBox error={error} />
          <Field label="What happened"><textarea required rows="3" value={u.body} onChange={(e) => setU({ ...u, body: e.target.value })} /></Field>
          {p.tasks.length === 0 && <Field label="Progress now (%)"><input type="number" min="0" max="100" step="0.1" value={u.progress_pct} onChange={(e) => setU({ ...u, progress_pct: e.target.value })} placeholder={String(p.progress_pct)} /></Field>}
          <Field label="Change status to"><Select value={u.status} onChange={(v) => setU({ ...u, status: v })} placeholder="(no change)" options={PROJECT_STATES} /></Field>
          <button className="btn primary" disabled={busy}>Post update</button>
        </form>
      </Card>}
    </div>
    {p.description && <Card title="Scope of Project"><p className="pre">{p.description}</p></Card>}
    {p.tasks.length > 0 && <Card title="Task Breakdown" actions={writable && <button className="btn small" onClick={() => setEditing(true)}>Update tasks</button>}>
      <ol className="task-progress">{p.tasks.map((t) => <li key={t.id} className={Number(t.progress) >= 100 ? 'done' : ''}>
        <span className="muted">{t.position}</span><span className="grow">{t.name}</span>
        <span className="overall-track small"><span style={{ width: `${t.progress}%` }} /></span><b>{pct(t.progress)}</b>
      </li>)}</ol>
      <div className="overall">
        <div className="grow"><strong>Overall Project Progress</strong><div className="muted small">{p.tasks.length} tasks · Equal weighting</div>
          <div className="overall-track"><span style={{ width: `${p.progress_pct}%` }} /></div></div>
        <div className="overall-figure"><b>{pct(p.progress_pct)}</b><small className="muted">Automatically calculated</small></div>
      </div>
    </Card>}
    <ProjectFiles project={p} reload={reload} />
    <Card title="Who has access">
      <p className="small">{p.visibility === 'everyone' ? 'Everyone can view this project.' : 'Only the people below can see this project.'}
        {' '}<span className="muted">Its creator{p.owner_name ? `, owner (${p.owner_name})` : ''} and administrators can always edit it.</span></p>
      {p.members.length > 0 && <ul className="people">{p.members.map((m) => <li key={m.user_id}>
        <span><strong>{m.full_name}</strong>{m.designation && <span className="muted"> · {m.designation}</span>}</span>
        <span className={`pill ${m.access === 'edit' ? 'work-in_progress' : ''}`}>{m.access === 'edit' ? 'Can edit' : 'Can view'}</span>
      </li>)}</ul>}
    </Card>
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

const size = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// Files are kept only while the project is open: once it is completed or
// cancelled they can be downloaded (or deleted at once) until the date shown,
// then the system deletes them.
function ProjectFiles({ project: p, reload }) {
  const closed = ['completed', 'cancelled'].includes(p.status);
  const upload = useSubmit(async (file) => {
    if (file.size > 10 * 1024 * 1024) throw new Error('Files can be up to 10 MB');
    const data = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.onerror = () => reject(new Error('Could not read the file'));
      r.readAsDataURL(file);
    });
    await api(`/projects/${p.id}/files`, { method: 'POST', body: { file_name: file.name, content_type: file.type || undefined, data } });
    reload();
  });
  const remove = useSubmit(async (fileId) => { await api(`/projects/${p.id}/files/${fileId}`, { method: 'DELETE' }); reload(); });
  const removeAll = useSubmit(async () => {
    if (!window.confirm(`Delete all ${p.files.length} files of ${p.ref} now? Download them first if you need them. This can't be undone.`)) return;
    await api(`/projects/${p.id}/files`, { method: 'DELETE' });
    reload();
  });
  if (closed && p.files.length === 0) return null;
  const deleteOn = p.files_delete_after && new Date(`${String(p.files_delete_after).slice(0, 10)}T00:00:00Z`)
    .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  return <Card title={`Files${p.files.length ? ` (${p.files.length} · ${size(p.files_total_bytes)})` : ''}`}
    actions={p.files.length > 1 && <a className="btn small" href={`/api/v1/projects/${p.id}/zip`}>Download all (ZIP)</a>}>
    <ErrorBox error={upload.error || remove.error || removeAll.error} />
    {closed
      ? <div className="notice">This project is {p.status}. Its files will be <strong>deleted on {deleteOn}</strong>. Download them before then
          {p.can_edit && <>, or <button className="link" onClick={removeAll.submit} disabled={removeAll.busy}>delete them now</button></>}.</div>
      : <p className="muted small">Files are kept while the project is open. When it is completed they can be downloaded for 30 days, then they are deleted.</p>}
    {p.files.length === 0 ? <Empty>No files yet.</Empty> :
      <ul className="people">{p.files.map((f) => <li key={f.id}>
        <span><a href={`/api/v1/projects/${p.id}/files/${f.id}`}><strong>{f.file_name}</strong></a><br />
          <small className="muted">{size(f.size_bytes)} · {dateTime(f.uploaded_at)}{f.uploaded_by_name && ` · ${f.uploaded_by_name}`}</small></span>
        {p.can_edit && <button className="btn ghost small" disabled={remove.busy} onClick={() => remove.submit(f.id)}>Remove</button>}
      </li>)}</ul>}
    {!closed && p.can_edit && <label className="btn small file-pick">{upload.busy ? 'Uploading…' : 'Attach a file'}
      <input type="file" hidden disabled={upload.busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload.submit(f); }} /></label>}
  </Card>;
}

function ProjectForm({ project, onDone }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { canWriteIsland, user } = useAuth();
  const islands = useApi('/islands');
  const people = useApi('/users/directory');
  const mine = useMemo(() => (islands.data || []).filter(canWriteIsland), [islands.data, canWriteIsland]);
  const [f, setF] = useState(project || {
    island_id: params.get('island_id') || '', project_type: '', title: '', description: '', status: 'planned',
    progress_pct: 0, budget: '', contractor: '', start_date: '', target_date: '', owner_id: '',
    visibility: 'members', members: [],
  });
  // Task breakdown: overall progress is the average (equal weighting).
  const [tasks, setTasks] = useState(() => (project?.tasks || []).map(({ name, progress }) => ({ name, progress: String(progress) })));
  const filled = tasks.filter((t) => t.name.trim());
  const auto = filled.length > 0;
  const overall = auto ? Math.round((filled.reduce((n, t) => n + (Number(t.progress) || 0), 0) / filled.length) * 10) / 10 : Number(f.progress_pct) || 0;
  const setTask = (i, change) => setTasks(tasks.map((t, j) => (j === i ? { ...t, ...change } : t)));
  // Sharing is set by whoever creates the project, then by its creator,
  // owner or an administrator.
  const sharing = !project || project.can_manage;
  const [members, setMembers] = useState((project?.members || []).map(({ user_id: userId, access }) => ({ user_id: userId, access })));
  const set = (k) => (v) => setF({ ...f, [k]: v?.target ? v.target.value : v });
  const { submit, busy, error } = useSubmit(async () => {
    const body = {
      title: f.title, project_type: f.project_type || null, description: f.description || null, status: f.status,
      ...(auto ? {} : { progress_pct: Number(f.progress_pct) || 0 }),
      tasks: filled.map((t) => ({ name: t.name.trim(), progress: Math.min(100, Math.max(0, Number(t.progress) || 0)) })),
      budget: f.budget === '' || f.budget == null ? null : Number(f.budget),
      contractor: f.contractor || null, start_date: f.start_date || null, target_date: f.target_date || null,
      ...(sharing ? { owner_id: f.owner_id || null, visibility: f.visibility, members: members.filter((m) => m.user_id) } : {}),
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
      <form className="project-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <ErrorBox error={error} />
        <Field label="Title" wide><input required maxLength="200" value={f.title} onChange={set('title')} /></Field>
        <div className="row5">
          <Field label="Island"><Select disabled={!!project} value={f.island_id || ''} onChange={set('island_id')}
            placeholder={regional ? 'Regional (no single island)' : 'Choose island…'} required={!regional}
            options={(project ? islands.data || [] : mine).map((i) => [i.id, `${i.atoll_code} · ${i.name}`])} /></Field>
          <Field label="Type"><Select value={f.project_type || ''} onChange={set('project_type')} placeholder="Choose…" options={PROJECT_TYPES} /></Field>
          <Field label="Status"><Select value={f.status} onChange={set('status')} options={PROJECT_STATES} /></Field>
          <Field label={auto ? 'Progress (%) · Auto' : 'Progress (%)'}>
            {auto ? <input readOnly value={pct(overall)} title="Calculated from the task breakdown" />
              : <input type="number" min="0" max="100" step="0.1" value={f.progress_pct} onChange={set('progress_pct')} />}</Field>
          {sharing ? <Field label="Owner"><Select value={f.owner_id || ''} onChange={set('owner_id')} placeholder="—" options={(people.data || []).map((p) => [p.id, p.full_name])} /></Field>
            : <Field label="Owner"><input readOnly value={project?.owner_name || '—'} /></Field>}
        </div>
        <div className="row5">
          <Field label="Contractor"><input value={f.contractor || ''} onChange={set('contractor')} /></Field>
          <Field label="Budget (MVR)"><input type="number" min="0" step="any" value={f.budget ?? ''} onChange={set('budget')} /></Field>
          <Field label="Start date"><input type="date" value={f.start_date || ''} onChange={set('start_date')} /></Field>
          <Field label="Target date"><input type="date" value={f.target_date || ''} onChange={set('target_date')} /></Field>
          <Field label="Completed on"><input type="date" value={f.completed_on || ''} onChange={set('completed_on')} disabled={!project} /></Field>
        </div>

        <h3 className="form-section">Scope of Project</h3>
        <textarea rows="4" value={f.description || ''} onChange={set('description')} aria-label="Scope of project"
          placeholder="What the project covers" />

        <h3 className="form-section">Task Breakdown</h3>
        <p className="muted small">Edit task names and percentages, add new tasks, or remove tasks as required.</p>
        <div className="task-table">
          <div className="task-head"><span>No.</span><span>Task / Stage</span><span>Progress (%)</span><span /></div>
          {tasks.map((t, i) => <div className="task-row" key={i}>
            <span className="muted">{i + 1}</span>
            <input value={t.name} onChange={(e) => setTask(i, { name: e.target.value })} placeholder="Task name" aria-label={`Task ${i + 1}`} maxLength="200" />
            <input type="number" min="0" max="100" step="0.1" value={t.progress} onChange={(e) => setTask(i, { progress: e.target.value })} aria-label={`Task ${i + 1} progress`} />
            <button type="button" className="btn ghost small" onClick={() => setTasks(tasks.filter((_, j) => j !== i))} aria-label={`Remove task ${i + 1}`}>✕</button>
          </div>)}
        </div>
        <button type="button" className="btn small" onClick={() => setTasks([...tasks, { name: '', progress: '0' }])}>+ Add Task</button>

        <div className="overall">
          <div className="grow">
            <strong>Overall Project Progress</strong>
            <div className="muted small">{auto ? `${filled.length} task${filled.length === 1 ? '' : 's'} · Equal weighting` : 'No tasks: progress is entered by hand'}</div>
            <div className="overall-track"><span style={{ width: `${overall}%` }} /></div>
          </div>
          <div className="overall-figure"><b>{pct(overall)}</b><small className="muted">{auto ? 'Automatically calculated' : 'Entered by hand'}</small></div>
        </div>

        {sharing && <div className="sharing-row">
          <span>Who can see and edit this project</span>
          <label className="check"><input type="radio" name="visibility" checked={f.visibility === 'everyone'} onChange={() => set('visibility')('everyone')} /> Everyone can view it</label>
          <label className="check"><input type="radio" name="visibility" checked={f.visibility !== 'everyone'} onChange={() => set('visibility')('members')} /> Only the people I choose</label>
        </div>}
        {sharing && (f.visibility !== 'everyone' || members.length > 0) && <fieldset className="sharing">
          <legend>People with access</legend>
          <p className="muted small">{project ? 'Its creator' : 'You'}{f.owner_id ? ', the owner' : ''} and administrators can always edit it.</p>
          {members.map((m, i) => <div className="member-row" key={i}>
            <Select value={m.user_id} onChange={(v) => setMembers(members.map((x, j) => (j === i ? { ...x, user_id: v } : x)))} placeholder="Choose person…"
              options={(people.data || []).filter((p) => p.id !== user.id && (p.id === m.user_id || !members.some((x) => x.user_id === p.id)))
                .map((p) => [p.id, `${p.full_name}${p.designation ? ` · ${p.designation}` : ''}`])} aria-label="Person" />
            <Select value={m.access} onChange={(v) => setMembers(members.map((x, j) => (j === i ? { ...x, access: v } : x)))}
              options={[['view', 'Can view'], ['edit', 'Can edit']]} aria-label="Access" />
            <button type="button" className="btn ghost small" onClick={() => setMembers(members.filter((_, j) => j !== i))} aria-label="Remove">✕</button>
          </div>)}
          <button type="button" className="btn small" onClick={() => setMembers([...members, { user_id: '', access: 'view' }])}>+ Add person</button>
        </fieldset>}
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={() => (project ? onDone() : navigate(-1))}>Cancel</button>
          <button className="btn primary" disabled={busy}>{project ? 'Save changes' : 'Create project'}</button>
        </div>
      </form>
    </Card>
  </>;
}

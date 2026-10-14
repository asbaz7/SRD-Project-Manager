// Surveys: forms of several kinds (Island Assessment for a powerhouse
// takeover, general site surveys…). The list, and starting a new one.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Async, Card, Empty, ErrorBox, Field, PageHead, Pager, Select } from '../components/ui.jsx';
import { date, dateTime, localDate } from '../format.js';
import { useApi, useFilters, useSubmit } from '../hooks.js';

const STATUS_PILL = { draft: 'work-awaiting_parts', completed: 'work-completed' };
export const SurveyStatus = ({ value }) => <span className={`pill ${STATUS_PILL[value]}`}>{value === 'draft' ? 'Draft' : 'Completed'}</span>;

export default function Surveys() {
  const { allowed } = useAuth();
  const [filters, setFilter] = useFilters();
  const templates = useApi('/survey-templates');
  const names = Object.fromEntries((templates.data || []).map((t) => [t.key, t.name]));
  const state = useApi(`/surveys${qs({ template: filters.template, status: filters.status, q: filters.q, offset: filters.offset })}`);
  return <>
    <PageHead title="Surveys" icon="survey" subtitle="Assessments and site surveys"
      actions={allowed('surveys') && <Link className="btn primary" to="/surveys/new">New survey</Link>} />
    <div className="filters">
      <Select value={filters.template} onChange={(v) => setFilter('template', v)} placeholder="All types" options={names} aria-label="Type" />
      <Select value={filters.status} onChange={(v) => setFilter('status', v)} placeholder="Any status" options={{ draft: 'Draft', completed: 'Completed' }} aria-label="Status" />
      <input type="search" placeholder="Search title or place…" defaultValue={filters.q} onChange={(e) => setFilter('q', e.target.value)} aria-label="Search" />
    </div>
    <Async state={state}>{(page) => (
      <Card>
        {page.items.length === 0 ? <Empty>No surveys yet.</Empty> :
          <table>
            <thead><tr><th>Survey</th><th className="hide-sm">Type</th><th>Place</th><th className="hide-sm">Surveyed</th><th>Status</th><th className="hide-sm">Updated</th></tr></thead>
            <tbody>{page.items.map((s) => <tr key={s.id}>
              <td className="wrap"><Link to={`/surveys/${s.id}`}><strong>{s.title}</strong></Link><br />
                <small className="muted">{s.ref}{s.file_count > 0 && ` · ${s.file_count} file${s.file_count === 1 ? '' : 's'}`}</small></td>
              <td className="hide-sm small">{names[s.template] || s.template}</td>
              <td className="small">{s.island_name ? `${s.atoll_code}. ${s.island_name}` : s.location_name}</td>
              <td className="hide-sm small nowrap">{date(s.surveyed_on)}</td>
              <td><SurveyStatus value={s.status} /></td>
              <td className="hide-sm small muted nowrap">{dateTime(s.updated_at)}{s.updated_by_name && <><br />{s.updated_by_name}</>}</td>
            </tr>)}</tbody>
          </table>}
        <Pager page={page} onOffset={(o) => setFilter('offset', o)} />
      </Card>
    )}</Async>
  </>;
}

export function NewSurvey() {
  const navigate = useNavigate();
  const templates = useApi('/survey-templates');
  const islands = useApi('/islands');
  const [f, setF] = useState({ template: '', where: 'island', island_id: '', location_name: '', surveyed_on: localDate(0), title: '' });
  const t = (templates.data || []).find((x) => x.key === f.template);
  const { submit, busy, error } = useSubmit(async () => {
    const created = await api('/surveys', { method: 'POST', body: {
      template: f.template, title: f.title || null, surveyed_on: f.surveyed_on || null,
      ...(f.where === 'island' ? { island_id: f.island_id } : { location_name: f.location_name }),
    } });
    navigate(`/surveys/${created.id}?edit=1`, { replace: true });
  });
  return <>
    <PageHead title="New survey" icon="survey" crumbs={[{ to: '/surveys', label: 'Surveys' }, { label: 'New' }]} />
    <Card>
      <form className="form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <ErrorBox error={error} />
        <Field label="Type of survey" wide hint={t?.description}>
          <Select required value={f.template} onChange={(v) => setF({ ...f, template: v })} placeholder="Choose…"
            options={(templates.data || []).map((x) => [x.key, x.name])} /></Field>
        <Field label="Where">
          <Select value={f.where} onChange={(v) => setF({ ...f, where: v })} options={[['island', 'An island in the system'], ['other', 'Somewhere else (type the name)']]} /></Field>
        {f.where === 'island'
          ? <Field label="Island"><Select required value={f.island_id} onChange={(v) => setF({ ...f, island_id: v })} placeholder="Choose island…"
              options={(islands.data || []).map((i) => [i.id, `${i.atoll_code} · ${i.name}`])} /></Field>
          : <Field label="Place"><input required value={f.location_name} onChange={(e) => setF({ ...f, location_name: e.target.value })} placeholder="e.g. Dh. Bandidhoo" /></Field>}
        <Field label="Surveyed on"><input type="date" value={f.surveyed_on} onChange={(e) => setF({ ...f, surveyed_on: e.target.value })} /></Field>
        <Field label="Title (optional)" wide><input maxLength="200" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })}
          placeholder={t ? `${t.name.replace(/\s*\(.*\)$/, '')} - …` : ''} /></Field>
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={() => navigate(-1)}>Cancel</button>
          <button className="btn primary" disabled={busy}>Start survey</button>
        </div>
      </form>
    </Card>
  </>;
}

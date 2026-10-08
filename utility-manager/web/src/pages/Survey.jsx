// One survey, drawn from its template: sections of fields, and repeating
// sections (gensets, feeders, pumping stations) as columns like the original
// spreadsheet. View, or edit (save as draft / mark completed).
import { Fragment, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { Async, Card, Empty, ErrorBox, PageHead } from '../components/ui.jsx';
import { date, dateTime } from '../format.js';
import { useApi, useSubmit } from '../hooks.js';
import { SurveyStatus } from './Surveys.jsx';

export default function Survey() {
  const { id } = useParams();
  const state = useApi(`/surveys/${id}`);
  const templates = useApi('/survey-templates');
  return <Async state={state}>{(s) => {
    const t = (templates.data || []).find((x) => x.key === s.template);
    return t ? <SurveyView survey={s} template={t} reload={state.reload} /> : null;
  }}</Async>;
}

const show = (field, v) => {
  if (v === undefined || v === null || v === '') return <span className="muted">—</span>;
  if (field.type === 'yesno') return v === 'yes' ? 'Yes' : 'No';
  if (field.type === 'date') return date(v);
  if (field.type === 'number') return `${Number(v).toLocaleString('en-GB')}${field.unit ? ` ${field.unit}` : ''}`;
  return <span className="pre">{v}</span>;
};

function Input({ field, value, onChange, compact }) {
  const v = value ?? '';
  const set = (x) => onChange(x === '' ? undefined : x);
  switch (field.type) {
    case 'yesno': return <select value={v} onChange={(e) => set(e.target.value)} aria-label={field.label}><option value="">—</option><option value="yes">Yes</option><option value="no">No</option></select>;
    case 'choice': return <select value={v} onChange={(e) => set(e.target.value)} aria-label={field.label}><option value="">—</option>{field.options.map((o) => <option key={o}>{o}</option>)}</select>;
    case 'date': return <input type="date" value={v} onChange={(e) => set(e.target.value)} aria-label={field.label} />;
    case 'number': return <input type="number" step="any" value={v} onChange={(e) => set(e.target.value === '' ? '' : Number(e.target.value))} aria-label={field.label} placeholder={compact ? '' : field.unit || ''} />;
    case 'textarea': return <textarea rows={compact ? 2 : 3} value={v} onChange={(e) => set(e.target.value)} aria-label={field.label} />;
    default: return <input value={v} onChange={(e) => set(e.target.value)} aria-label={field.label} />;
  }
}

// From the register: an island's powerhouse gensets into the genset columns.
function fromRegister(island) {
  const ph = (island.facilities || []).find((f) => f.kind === 'powerhouse' && f.active);
  if (!ph) return null;
  const condition = { ok: 'Running; OK', minor_fault: 'Running; OK', major_fault: 'Running; Faulty', not_running: 'Not running' };
  const gensets = ph.assets.filter((a) => a.kind === 'genset' && a.active)
    .sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true }))
    .map((a) => {
      const [brand, ...model] = String(a.make_model || '').split(/\s+/);
      return Object.fromEntries(Object.entries({
        fixed_asset_code: a.fixed_asset_code, engine_brand: brand || undefined, engine_model: model.join(' ') || undefined,
        engine_serial: a.serial_no, genset_kw: a.rated_capacity, max_output_kw: a.operating_capacity,
        alternator_brand: a.alt_make, alternator_frame: a.alt_frame, alternator_serial: a.alt_serial, alternator_kw: a.alt_kw,
        last_overhaul: a.last_overhaul_on, last_alt_service: a.last_alt_service_on, installed: a.commissioned_on,
        condition: condition[a.condition], connected: a.connected_to_panel == null ? undefined : a.connected_to_panel ? 'yes' : 'no',
        running_hours: a.total_hours,
      }).filter(([, v]) => v !== null && v !== undefined && v !== ''));
    });
  const installed = gensets.reduce((n, g) => n + (Number(g.genset_kw) || 0), 0);
  return { powerhouse: { name: ph.name, ...(installed ? { installed_kw: installed } : {}) }, gensets,
    fuel: ph.fuel_capacity_l ? { storage_l: Number(ph.fuel_capacity_l) } : undefined };
}

function SurveyView({ survey: s, template: t, reload }) {
  const [params, setParams] = useSearchParams();
  const editing = s.can_edit && params.get('edit') === '1';
  const [answers, setAnswers] = useState(s.answers || {});
  const [dirty, setDirty] = useState(false);
  const island = useApi(editing && s.island_id ? `/islands/${s.island_id}` : null);
  const setField = (section, key, v) => { setAnswers((a) => ({ ...a, [section]: { ...(a[section] || {}), [key]: v } })); setDirty(true); };
  const setItem = (section, i, key, v) => {
    setAnswers((a) => { const items = [...(a[section] || [])]; items[i] = { ...(items[i] || {}), [key]: v }; return { ...a, [section]: items }; });
    setDirty(true);
  };
  const addItem = (section) => { setAnswers((a) => ({ ...a, [section]: [...(a[section] || []), {}] })); setDirty(true); };
  const removeItem = (section, i) => { setAnswers((a) => ({ ...a, [section]: (a[section] || []).filter((_, j) => j !== i) })); setDirty(true); };

  const save = useSubmit(async (status) => {
    await api(`/surveys/${s.id}`, { method: 'PATCH', body: { answers, ...(status ? { status } : {}) } });
    setDirty(false);
    if (status) setParams({});
    reload();
  });
  const fill = () => {
    const r = island.data && fromRegister(island.data);
    if (!r) return;
    if (Object.keys(answers.gensets?.[0] || {}).length && !window.confirm('Replace the genset columns with what the register has?')) return;
    setAnswers((a) => ({ ...a, powerhouse: { ...r.powerhouse, ...(a.powerhouse || {}) }, gensets: r.gensets, ...(r.fuel ? { fuel: { ...r.fuel, ...(a.fuel || {}) } } : {}) }));
    setDirty(true);
  };
  const upload = useSubmit(async (file) => {
    if (file.size > 10 * 1024 * 1024) throw new Error('Files can be up to 10 MB');
    const data = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.onerror = () => reject(new Error('Could not read the file'));
      r.readAsDataURL(file);
    });
    await api(`/surveys/${s.id}/files`, { method: 'POST', body: { file_name: file.name, content_type: file.type || undefined, data } });
    reload();
  });
  const removeFile = useSubmit(async (fileId) => { await api(`/surveys/${s.id}/files/${fileId}`, { method: 'DELETE' }); reload(); });
  const hasGensets = t.sections.some((x) => x.key === 'gensets');
  const place = s.island_name ? `${s.atoll_code}. ${s.island_name}` : s.location_name;

  return <>
    <PageHead title={s.title} icon="survey" subtitle={`${t.name} · ${place}${s.surveyed_on ? ` · surveyed ${date(s.surveyed_on)}` : ''}`}
      crumbs={[{ to: '/surveys', label: 'Surveys' }, { label: s.ref }]}
      actions={<>
        <a className="btn ghost" href={`/api/v1/surveys/${s.id}/csv`}>Export CSV</a>
        {!editing && <button className="btn ghost" onClick={() => window.print()}>Print</button>}
        {s.can_edit && !editing && <button className="btn" onClick={() => setParams({ edit: '1' })}>Edit</button>}
      </>} />
    <div className="survey-bar glass">
      <SurveyStatus value={s.status} />
      <span className="muted small">Updated {dateTime(s.updated_at)}{s.updated_by_name && ` by ${s.updated_by_name}`}{s.completed_at && ` · completed ${date(s.completed_at)}`}</span>
      {editing && <span className="grow" />}
      {editing && hasGensets && s.island_id && <button className="btn small ghost" disabled={!island.data} onClick={fill} title="Fill the powerhouse and genset details from the register">Fill from register</button>}
      {editing && <button className="btn small" disabled={save.busy || !dirty} onClick={() => save.submit()}>{dirty ? 'Save draft' : 'Saved'}</button>}
      {editing && <button className="btn small primary" disabled={save.busy} onClick={() => save.submit('completed')}>{s.status === 'completed' ? 'Save' : 'Mark completed'}</button>}
      {editing && <button className="btn small ghost" onClick={() => { if (!dirty || window.confirm('Leave without saving your changes?')) { setAnswers(s.answers || {}); setDirty(false); setParams({}); } }}>Done</button>}
    </div>
    <ErrorBox error={save.error} />

    {t.sections.map((sec) => {
      const v = answers[sec.key];
      if (sec.repeat) {
        const items = v || [];
        if (!editing && !items.length) return null;
        return <Card key={sec.key} title={sec.title} actions={editing && items.length < sec.repeat.max && <button className="btn small" onClick={() => addItem(sec.key)}>+ {sec.repeat.label}</button>}>
          {items.length === 0 ? <p className="muted small">None added. Use “+ {sec.repeat.label}”.</p> :
            <div className="table-scroll"><table className="survey-grid">
              <thead><tr><th>{sec.repeat.label === 'Gen' ? 'Genset details' : ''}</th>{items.map((_, i) => <th key={i}>{sec.repeat.label} {i + 1}
                {editing && <button className="btn ghost small" onClick={() => removeItem(sec.key, i)} aria-label={`Remove ${sec.repeat.label} ${i + 1}`}>✕</button>}</th>)}</tr></thead>
              <tbody>{sec.fields.map((f) => <tr key={f.key}>
                <th scope="row">{f.label}{f.unit && <span className="muted"> ({f.unit})</span>}</th>
                {items.map((item, i) => <td key={i}>{editing ? <Input field={f} value={item[f.key]} compact onChange={(x) => setItem(sec.key, i, f.key, x)} /> : show(f, item[f.key])}</td>)}
              </tr>)}</tbody>
            </table></div>}
        </Card>;
      }
      if (!editing && !v) return null;
      return <Card key={sec.key} title={sec.title}>
        {editing
          ? <div className="survey-fields">{sec.fields.map((f) => <label key={f.key} className={`field ${f.type === 'textarea' ? 'wide' : ''}`}>
              <span className="field-label">{f.label}{f.unit && <span className="muted"> ({f.unit})</span>}</span>
              <Input field={f} value={v?.[f.key]} onChange={(x) => setField(sec.key, f.key, x)} />
            </label>)}</div>
          : <dl className="facts">{sec.fields.filter((f) => v[f.key] !== undefined).map((f) => <Fragment key={f.key}><dt>{f.label}</dt><dd>{show(f, v[f.key])}</dd></Fragment>)}</dl>}
      </Card>;
    })}
    {!editing && Object.keys(answers).length === 0 && <Card><Empty>Nothing recorded yet.{s.can_edit && ' Click Edit to fill in the survey.'}</Empty></Card>}

    <Card title="Photos and files">
      <ErrorBox error={upload.error || removeFile.error} />
      {s.files.length === 0 ? <p className="muted small">None attached.</p> :
        <ul className="people">{s.files.map((f) => <li key={f.id}>
          <span><a href={`/api/v1/surveys/${s.id}/files/${f.id}`} target={/^image\//.test(f.content_type) ? '_blank' : undefined} rel="noreferrer"><strong>{f.file_name}</strong></a><br />
            <small className="muted">{Math.max(1, Math.round(f.size_bytes / 1024))} KB · {dateTime(f.uploaded_at)}{f.uploaded_by_name && ` · ${f.uploaded_by_name}`}</small></span>
          {s.can_edit && <button className="btn ghost small" onClick={() => removeFile.submit(f.id)}>Remove</button>}
        </li>)}</ul>}
      {s.can_edit && <label className="btn small file-pick">{upload.busy ? 'Uploading…' : 'Attach a photo or file'}
        <input type="file" hidden disabled={upload.busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload.submit(f); }} /></label>}
    </Card>
  </>;
}

// One document: recipients in signing order, signing (by the recipient, or
// recorded by the sender for people without a login), files and notes.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Async, Card, Empty, ErrorBox, Field, PageHead, Select } from '../components/ui.jsx';
import { date, dateTime, localDate } from '../format.js';
import { useApi, useSubmit } from '../hooks.js';
import { DOC_STATUS, DocStatus, DocType } from './Documents.jsx';

export default function Document() {
  const { id } = useParams();
  const state = useApi(id ? `/documents/${id}` : null);
  if (!id) return <DocumentForm />;
  return <Async state={state}>{(d) => <DocumentView doc={d} reload={state.reload} />}</Async>;
}

const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function DocumentView({ doc: d, reload }) {
  const [editing, setEditing] = useState(false);
  const [signDate, setSignDate] = useState(localDate(0));
  const sign = useSubmit(async (signerId, undo) => {
    await api(`/documents/${d.id}/signers/${signerId}/sign`, { method: 'POST', body: undo ? { undo: true } : { signed_on: signDate } });
    reload();
  });
  const [note, setNote] = useState('');
  const post = useSubmit(async () => { await api(`/documents/${d.id}/updates`, { method: 'POST', body: { body: note } }); setNote(''); reload(); });
  const upload = useSubmit(async (file) => {
    if (file.size > 10 * 1024 * 1024) throw new Error('Files can be up to 10 MB');
    const data = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.onerror = () => reject(new Error('Could not read the file'));
      r.readAsDataURL(file);
    });
    await api(`/documents/${d.id}/files`, { method: 'POST', body: { file_name: file.name, content_type: file.type || undefined, data } });
    reload();
  });
  const removeFile = useSubmit(async (fileId) => { await api(`/documents/${d.id}/files/${fileId}`, { method: 'DELETE' }); reload(); });

  if (editing) return <DocumentForm doc={d} onDone={() => { setEditing(false); reload(); }} />;
  const open = d.status === 'pending';
  const nextUp = d.signers.find((s) => !s.signed_on);
  const canPost = d.can_edit || d.my_signer;

  return <>
    <PageHead title={d.ref} icon="document" subtitle={d.title || d.doc_type}
      crumbs={[{ to: '/documents', label: 'Documents' }, { label: d.ref }]}
      actions={d.can_edit && <button className="btn" onClick={() => setEditing(true)}>Edit</button>} />
    <div className="grid-2">
      <Card title="Details">
        <dl className="facts">
          <dt>Status</dt><dd><DocStatus value={d.status} /> <span className="muted small">{d.signed_count} of {d.signer_count} signed</span></dd>
          <dt>Type</dt><dd><DocType value={d.doc_type} /></dd>
          {d.title && <><dt>Subject</dt><dd>{d.title}</dd></>}
          <dt>Sent by</dt><dd>{d.sent_by_label || '—'}</dd>
          <dt>Sent</dt><dd>{date(d.sent_on)}</dd>
          <dt>Last approval</dt><dd>{date(d.last_approval_on)}</dd>
          <dt>Last updated</dt><dd>{dateTime(d.updated_at)}</dd>
          <dt>Entered by</dt><dd>{d.created_by_name || '—'} · {dateTime(d.created_at)}</dd>
        </dl>
        {d.notes && <p className="pre">{d.notes}</p>}
      </Card>
      <Card title="Signatures">
        <ErrorBox error={sign.error} />
        <ol className="sign-list">{d.signers.map((s) => {
          const mine = s.id === d.my_signer;
          return <li key={s.id} className={s.signed_on ? 'signed' : s === nextUp && open ? 'next' : ''}>
            <span className="sign-mark" aria-hidden="true">{s.signed_on ? '✓' : s.position}</span>
            <span className="grow"><strong>{s.name}</strong>{mine && <span className="muted"> (you)</span>}<br />
              <small className="muted">{s.signed_on ? <>Signed {date(s.signed_on)}{s.recorded_by_name && s.recorded_by !== s.user_id && ` · recorded by ${s.recorded_by_name}`}</>
                : s === nextUp && open ? 'Next to sign' : 'Waiting'}</small></span>
            {open && !s.signed_on && (mine || d.can_edit) && <button className="btn small primary" disabled={sign.busy} onClick={() => sign.submit(s.id)}>
              {mine ? 'Sign' : 'Record signature'}</button>}
            {s.signed_on && d.can_edit && d.status !== 'cancelled' && <button className="btn small ghost" disabled={sign.busy} onClick={() => sign.submit(s.id, true)}>Undo</button>}
          </li>;
        })}</ol>
        {open && (d.my_signer || d.can_edit) && <label className="field inline-date"><span className="field-label">Date signed</span>
          <input type="date" max={localDate(0)} value={signDate} onChange={(e) => setSignDate(e.target.value)} /></label>}
        {d.status === 'completed' && <p className="all-clear small">✓ Signed by everyone.</p>}
        {d.status === 'cancelled' && <p className="muted small">This document was cancelled.</p>}
      </Card>
    </div>

    <div className="grid-2">
      <Card title="Files">
        <ErrorBox error={upload.error || removeFile.error} />
        {d.files.length === 0 ? <Empty>No files attached.</Empty> :
          <ul className="people">{d.files.map((f) => <li key={f.id}>
            <span><a href={`/api/v1/documents/${d.id}/files/${f.id}`}><strong>{f.file_name}</strong></a><br />
              <small className="muted">{kb(f.size_bytes)} · {dateTime(f.uploaded_at)}{f.uploaded_by_name && ` · ${f.uploaded_by_name}`}</small></span>
            {d.can_edit && <button className="btn ghost small" onClick={() => removeFile.submit(f.id)}>Remove</button>}
          </li>)}</ul>}
        {canPost && <label className="btn small file-pick">{upload.busy ? 'Uploading…' : 'Attach a file'}
          <input type="file" hidden disabled={upload.busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload.submit(f); }} /></label>}
      </Card>
      <Card title="Notes">
        {canPost && <form className="form narrow" onSubmit={(e) => { e.preventDefault(); post.submit(); }}>
          <ErrorBox error={post.error} />
          <Field label="Add a note"><textarea required rows="2" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Returned for correction, resent 12 Apr" /></Field>
          <button className="btn" disabled={post.busy || !note.trim()}>Post note</button>
        </form>}
        {d.updates.length === 0 ? <p className="muted small">No notes yet.</p> :
          <ol className="timeline">{d.updates.map((x) => <li key={x.id}>
            <div className="muted small">{dateTime(x.created_at)} · {x.created_by_name}</div>
            <p className="pre">{x.body}</p>
          </li>)}</ol>}
      </Card>
    </div>
  </>;
}

function DocumentForm({ doc, onDone }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const people = useApi('/users/directory');
  const types = useApi('/documents/types');
  const [f, setF] = useState(() => (doc ? {
    ref: doc.ref, doc_type: doc.doc_type, title: doc.title || '', sent_on: doc.sent_on, notes: doc.notes || '', status: doc.status,
    sender: doc.sent_by || (doc.sent_by_name ? 'other' : ''), sent_by_name: doc.sent_by_name || '',
  } : { ref: '', doc_type: '', title: '', sent_on: localDate(0), notes: '', sender: user.id, sent_by_name: '' }));
  const [signers, setSigners] = useState(() => (doc ? doc.signers.map((s) => ({ pick: s.user_id || 'other', name: s.user_id ? '' : s.name }))
    : [{ pick: '', name: '' }]));
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });
  const setSigner = (i, change) => setSigners(signers.map((s, j) => (j === i ? { ...s, ...change } : s)));
  const move = (i, by) => { const next = [...signers]; const [s] = next.splice(i, 1); next.splice(i + by, 0, s); setSigners(next); };
  const options = [...(people.data || []).map((p) => [p.id, `${p.full_name}${p.designation ? ` · ${p.designation}` : ''}`]), ['other', 'Someone without a login…']];

  const { submit, busy, error } = useSubmit(async () => {
    const body = {
      ref: f.ref, doc_type: f.doc_type, title: f.title || null, sent_on: f.sent_on, notes: f.notes || null,
      ...(f.sender === 'other' ? { sent_by: null, sent_by_name: f.sent_by_name } : { sent_by: f.sender || null, sent_by_name: null }),
      signers: signers.filter((s) => s.pick).map((s) => (s.pick === 'other' ? { name: s.name } : { user_id: s.pick })),
    };
    if (doc) {
      await api(`/documents/${doc.id}`, { method: 'PATCH', body: { ...body, ...(f.status !== doc.status ? { status: f.status } : {}) } });
      onDone();
    } else {
      const created = await api('/documents', { method: 'POST', body });
      navigate(`/documents/${created.id}`, { replace: true });
    }
  });

  return <>
    <PageHead title={doc ? `Edit ${doc.ref}` : 'New document'} icon="document" crumbs={[{ to: '/documents', label: 'Documents' }, { label: doc ? doc.ref : 'New' }]} />
    <Card>
      <form className="form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <ErrorBox error={error} />
        <Field label="Agreement ID"><input required maxLength="100" value={f.ref} onChange={set('ref')} placeholder="e.g. RPT/2026/25" /></Field>
        <Field label="Document type"><input required list="doc-types" maxLength="100" value={f.doc_type} onChange={set('doc_type')} placeholder="Choose or type…" />
          <datalist id="doc-types">{(types.data || []).map((t) => <option key={t} value={t} />)}</datalist></Field>
        <Field label="Sent date"><input type="date" required value={f.sent_on || ''} onChange={set('sent_on')} /></Field>
        <Field label="Subject (optional)" wide><input maxLength="300" value={f.title} onChange={set('title')} placeholder="e.g. Ibrahim Rimah's job description" /></Field>
        <Field label="Sent by"><Select value={f.sender} onChange={(v) => setF({ ...f, sender: v })} options={options} /></Field>
        {f.sender === 'other' && <Field label="Sender's name"><input required value={f.sent_by_name} onChange={set('sent_by_name')} /></Field>}
        {doc && <Field label="Status"><Select value={f.status === 'cancelled' ? 'cancelled' : 'pending'} onChange={set('status')}
          options={[['pending', doc.status === 'completed' ? 'Active (completes when everyone has signed)' : DOC_STATUS.pending], ['cancelled', DOC_STATUS.cancelled]]} /></Field>}
        <fieldset className="wide sharing">
          <legend>Recipients, in signing order</legend>
          {signers.map((s, i) => <div className="member-row" key={i}>
            <span className="sign-mark" aria-hidden="true">{i + 1}</span>
            <Select value={s.pick} onChange={(v) => setSigner(i, { pick: v })} placeholder="Choose person…" options={options} aria-label={`Recipient ${i + 1}`} />
            {s.pick === 'other' && <input required placeholder="Name" value={s.name} onChange={(e) => setSigner(i, { name: e.target.value })} aria-label="Name" />}
            <button type="button" className="btn ghost small" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
            <button type="button" className="btn ghost small" disabled={i === signers.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
            <button type="button" className="btn ghost small" disabled={signers.length === 1} onClick={() => setSigners(signers.filter((_, j) => j !== i))} aria-label="Remove">✕</button>
          </div>)}
          <button type="button" className="btn small" onClick={() => setSigners([...signers, { pick: '', name: '' }])}>+ Add recipient</button>
          <p className="muted small">Recipients with a login sign it off themselves (and are told on Telegram if linked). For others, you record their signature.</p>
        </fieldset>
        <Field label="Notes" wide><textarea rows="3" value={f.notes} onChange={set('notes')} /></Field>
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={() => (doc ? onDone() : navigate(-1))}>Cancel</button>
          <button className="btn primary" disabled={busy}>{doc ? 'Save changes' : 'Save document'}</button>
        </div>
      </form>
    </Card>
  </>;
}

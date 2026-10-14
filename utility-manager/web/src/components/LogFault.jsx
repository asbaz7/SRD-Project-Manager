// Log a fault on a genset: minor or major, with what is wrong. Optionally it
// is set down (it has stopped), and repair work for it is logged straight
// after (completing that work clears the fault). Every fault is kept in the
// genset's fault log.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, qs } from '../api.js';
import { assetLabel } from '../format.js';
import { useSubmit } from '../hooks.js';
import { ErrorBox, Field, Modal, Select } from './ui.jsx';

export function LogFaultButton({ asset: a, onSaved, small = false }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className={`btn${small ? ' small ghost' : ''}`} onClick={(e) => { e.stopPropagation(); setOpen(true); }}>Log fault</button>
    {open && <LogFaultForm asset={a} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); onSaved?.(); }} />}
  </>;
}

function LogFaultForm({ asset: a, onClose, onSaved }) {
  const navigate = useNavigate();
  const [f, setF] = useState({ level: 'minor', note: '', down: false, work: false });
  const { submit, busy, error } = useSubmit(async () => {
    const note = f.note.trim();
    await api(`/assets/${a.id}/fault`, { method: 'POST', body: { level: f.level, note } });
    if (f.down && !['down', 'maintenance'].includes(a.status)) {
      await api('/assets/status', { method: 'POST', body: { items: [{ asset_id: a.id, status: 'down', note }] } });
    }
    if (f.work) {
      navigate(`/work/new${qs({ asset_id: a.id, kind: 'repair', title: `${assetLabel(a).replace(/^\S+\. \S+ /, '')}: ${note}`.slice(0, 200),
        fault_report_month: `${new Date().toISOString().slice(0, 7)}-01` })}`);
      return;
    }
    onSaved();
  });
  return <Modal title={`Log fault · ${assetLabel(a)}`} onClose={onClose}>
    <form className="form" onSubmit={(e) => { e.preventDefault(); submit(); }} onClick={(e) => e.stopPropagation()}>
      <ErrorBox error={error} />
      <Field label="Fault"><Select value={f.level} onChange={(v) => setF({ ...f, level: v })} options={[['minor', 'Minor fault: still running'], ['major', 'Major fault']]} /></Field>
      <Field label="What is wrong" wide><textarea required rows="3" maxLength="2000" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      {!['down', 'maintenance'].includes(a.status) && <label className="check wide"><input type="checkbox" checked={f.down} onChange={(e) => setF({ ...f, down: e.target.checked })} /> It has stopped: set it down (opens repair work)</label>}
      <label className="check wide"><input type="checkbox" checked={f.work} disabled={f.down} onChange={(e) => setF({ ...f, work: e.target.checked })} /> Log repair work for it next (completing the work clears the fault)</label>
      {a.fault_level && a.fault_level !== 'none' && <p className="muted small wide">It already has a {a.fault_level} fault ({a.fault_note}); this replaces it, and both stay in the fault log.</p>}
      <div className="form-actions"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy}>Log fault</button></div>
    </form>
  </Modal>;
}

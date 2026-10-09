// Users page (administrators): access tokens for other systems, such as the
// Fleet Manager connector, and the service accounts they act as.
import { useState } from 'react';
import { api } from '../api.js';
import { useApi, useSubmit } from '../hooks.js';
import { date, dateTime } from '../format.js';
import { Card, ErrorBox, Field, Modal, Select } from './ui.jsx';

export default function AccessTokens({ users, reload }) {
  const tokens = useApi('/admin/api-tokens');
  const [form, setForm] = useState(null);       // { user_id, name }
  const [svcForm, setSvcForm] = useState(null);  // { full_name, email }
  const [shown, setShown] = useState(null);      // the new token, shown once
  const services = users.filter((u) => u.service_account && u.active);
  const create = useSubmit(async () => {
    const res = await api('/admin/api-tokens', { method: 'POST', body: form });
    setForm(null); setShown(res.token); tokens.reload();
  });
  const revoke = useSubmit(async (id) => {
    if (!window.confirm('Revoke this token? The system using it stops working until it gets a new one.')) return;
    await api(`/admin/api-tokens/${id}`, { method: 'DELETE' }); tokens.reload();
  });
  const addService = useSubmit(async () => {
    await api('/admin/service-accounts', { method: 'POST', body: svcForm });
    setSvcForm(null); reload();
  });
  return <Card title="Access tokens (other systems)" actions={<>
    <button className="btn small ghost" onClick={() => setSvcForm({ full_name: '', email: '' })}>Add service account</button>
    <button className="btn small" disabled={!services.length} onClick={() => setForm({ user_id: services[0]?.id || '', name: '' })}>Create token</button>
  </>}>
    <p className="muted small">For another system (such as the Fleet Manager) to use SRD. It acts as a <strong>service account</strong>: a technical manager
      that can't sign in with a password and isn't listed among people, so its changes are clearly labelled. Revoke a token to cut it off at once.</p>
    <ErrorBox error={revoke.error} />
    {shown && <div className="notice">
      <strong>Copy this token now: it won't be shown again.</strong> Give it to whoever runs the other system, privately (not in a group chat).
      <div className="token-box"><code>{shown}</code>
        <button className="btn small" onClick={() => navigator.clipboard?.writeText(shown)}>Copy</button>
        <button className="btn small ghost" onClick={() => setShown(null)}>Done</button></div>
    </div>}
    {(tokens.data || []).length === 0 ? <p className="muted small">No tokens yet.{!services.length && ' Add a service account first.'}</p> :
      <table><thead><tr><th>Token</th><th>Acts as</th><th className="hide-sm">Created</th><th>Last used</th><th /></tr></thead>
        <tbody>{tokens.data.map((t) => <tr key={t.id} className={t.revoked_at ? 'inactive' : ''}>
          <td><strong>{t.name}</strong><br /><small className="muted">…{t.token_hint}{t.revoked_at && ` · revoked ${date(t.revoked_at)}`}</small></td>
          <td>{t.user_name}</td>
          <td className="hide-sm small">{date(t.created_at)}{t.created_by_name && <><br /><span className="muted">{t.created_by_name}</span></>}</td>
          <td className="small">{t.last_used_at ? dateTime(t.last_used_at) : <span className="muted">never</span>}</td>
          <td>{!t.revoked_at && <button className="btn small ghost" onClick={() => revoke.submit(t.id)}>Revoke</button>}</td>
        </tr>)}</tbody></table>}
    {form && <Modal title="Create access token" onClose={() => setForm(null)}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); create.submit(); }}>
        <ErrorBox error={create.error} />
        <Field label="Acts as"><Select required value={form.user_id} onChange={(v) => setForm({ ...form, user_id: v })} options={services.map((u) => [u.id, u.full_name])} /></Field>
        <Field label="Name" hint="What uses it, e.g. Fleet Manager connector"><input required maxLength="100" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <div className="form-actions"><button type="button" className="btn ghost" onClick={() => setForm(null)}>Cancel</button><button className="btn primary" disabled={create.busy}>Create</button></div>
      </form>
    </Modal>}
    {svcForm && <Modal title="Add service account" onClose={() => setSvcForm(null)}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); addService.submit(); }}>
        <ErrorBox error={addService.error} />
        <Field label="Name" hint="Shown on everything it changes"><input required value={svcForm.full_name} onChange={(e) => setSvcForm({ ...svcForm, full_name: e.target.value })} placeholder="Fleet Manager" /></Field>
        <Field label="Email (an identifier; nothing is sent)"><input required type="email" value={svcForm.email} onChange={(e) => setSvcForm({ ...svcForm, email: e.target.value })} placeholder="fleet-manager@srd.local" /></Field>
        <p className="muted small wide">It is created as a technical manager for the whole region.</p>
        <div className="form-actions"><button type="button" className="btn ghost" onClick={() => setSvcForm(null)}>Cancel</button><button className="btn primary" disabled={addService.busy}>Add</button></div>
      </form>
    </Modal>}
  </Card>;
}

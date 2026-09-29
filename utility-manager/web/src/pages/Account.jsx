import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Card, ErrorBox, Field, PageHead } from '../components/ui.jsx';
import { ROLES } from '../format.js';
import { useSubmit } from '../hooks.js';

export default function Account() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const [done, setDone] = useState(false);
  const { submit, busy, error, setError } = useSubmit(async () => {
    if (form.new_password !== form.confirm) return setError(new Error('The new passwords do not match'));
    await api('/auth/password', { method: 'POST', body: { current_password: form.current_password, new_password: form.new_password } });
    const first = user.mustChangePassword;
    await refresh();
    setForm({ current_password: '', new_password: '', confirm: '' });
    setDone(true);
    if (first) navigate('/', { replace: true });
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return <>
    <PageHead title="My account" />
    {user.mustChangePassword && <div className="notice">Welcome! Please replace your temporary password before continuing.</div>}
    <Card title="Profile">
      <dl className="facts">
        <dt>Name</dt><dd>{user.fullName}</dd>
        <dt>Email</dt><dd>{user.email}</dd>
        <dt>Role</dt><dd>{ROLES[user.role]}</dd>
      </dl>
    </Card>
    <Card title="Change password">
      <form className="form narrow" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <ErrorBox error={error} />
        {done && <div className="success">Password changed. Other devices have been signed out.</div>}
        <Field label="Current password"><input type="password" autoComplete="current-password" required value={form.current_password} onChange={set('current_password')} /></Field>
        <Field label="New password" hint="At least 10 characters, with letters and numbers."><input type="password" autoComplete="new-password" required value={form.new_password} onChange={set('new_password')} /></Field>
        <Field label="Repeat new password"><input type="password" autoComplete="new-password" required value={form.confirm} onChange={set('confirm')} /></Field>
        <button className="btn primary" disabled={busy}>Change password</button>
      </form>
    </Card>
  </>;
}

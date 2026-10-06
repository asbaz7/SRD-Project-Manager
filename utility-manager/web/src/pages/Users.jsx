import { useState } from 'react';
import { api } from '../api.js';
import { Async, Card, ErrorBox, Field, Modal, PageHead, Select } from '../components/ui.jsx';
import { ROLES, date } from '../format.js';
import { useApi, useSubmit } from '../hooks.js';

export default function Users() {
  const state = useApi('/users');
  const [editing, setEditing] = useState(null);
  return <>
    <PageHead title="Users" icon="users" actions={<button className="btn primary" onClick={() => setEditing({})}>Add user</button>} />
    <Card>
      <p className="muted small">
        <strong>Managers</strong> make changes across all islands; <strong>viewers</strong> only look;
        <strong> administrators</strong> manage everything, including users. The system is for head office staff. <strong>Technical</strong> staff also see engines,
        condition reports, assets and plants; <strong>non-technical</strong> staff see work, incidents and the projects shared with them.
      </p>
      <Async state={state}>{(users) => (
        <table>
          <thead><tr><th>Name</th><th>Role</th><th>Staff type</th><th className="hide-sm">Last sign-in</th><th /></tr></thead>
          <tbody>{users.map((u) => <tr key={u.id} className={u.active ? '' : 'inactive'}>
            <td><strong>{u.full_name}</strong>{!u.active && ' (disabled)'}<br /><small className="muted">{u.email}{u.designation && ` · ${u.designation}`}</small></td>
            <td>{ROLES[u.role]}</td>
            <td>{u.role === 'admin' ? <span className="muted">All</span> : u.technical ? 'Technical' : 'Non-technical'}</td>
            <td className="hide-sm small">{u.last_login_at ? date(u.last_login_at) : <span className="muted">never</span>}</td>
            <td><button className="btn small ghost" onClick={() => setEditing(u)}>Edit</button></td>
          </tr>)}</tbody>
        </table>
      )}</Async>
    </Card>
    {editing && <UserForm user={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); state.reload(); }} />}
  </>;
}

function UserForm({ user, onClose, onSaved }) {
  const [f, setF] = useState({
    email: user?.email || '', full_name: user?.full_name || '', designation: user?.designation || '', phone: user?.phone || '',
    role: user?.role || 'manager', technical: user?.technical ?? true, active: user?.active ?? true, password: '',
  });
  const set = (k) => (v) => setF({ ...f, [k]: v?.target ? v.target.value : v });

  const { submit, busy, error } = useSubmit(async () => {
    // Head office staff only: everyone covers the whole region.
    const scopes = [{ region: true }];
    const body = { full_name: f.full_name, designation: f.designation || null, phone: f.phone || null, role: f.role, technical: f.technical, scopes };
    if (user) await api(`/users/${user.id}`, { method: 'PATCH', body: { ...body, active: f.active, ...(f.password ? { password: f.password } : {}) } });
    else await api('/users', { method: 'POST', body: { ...body, email: f.email, password: f.password } });
    onSaved();
  });

  return (
    <Modal title={user ? `Edit ${user.full_name}` : 'Add user'} onClose={onClose}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <ErrorBox error={error} />
        <Field label="Full name"><input required value={f.full_name} onChange={set('full_name')} /></Field>
        <Field label="Email"><input type="email" required disabled={!!user} value={f.email} onChange={set('email')} /></Field>
        <Field label="Designation"><input value={f.designation} onChange={set('designation')} /></Field>
        <Field label="Phone"><input value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Role"><Select value={f.role} onChange={set('role')} options={ROLES} /></Field>
        {f.role !== 'admin' && <Field label="Staff type" hint={f.technical ? 'Sees engines, condition reports, assets and plants, and runs work.' : 'Sees work, incidents and the projects shared with them; can comment on work they are added to.'}>
          <Select value={f.technical ? 'technical' : 'non'} onChange={(v) => setF({ ...f, technical: v === 'technical' })}
            options={[['technical', 'Technical'], ['non', 'Non-technical']]} /></Field>}
        <Field label={user ? 'Reset password (optional)' : 'Temporary password'} hint="At least 10 characters with letters and numbers. They must change it at first sign-in.">
          <input type="text" autoComplete="off" required={!user} value={f.password} onChange={set('password')} /></Field>
        {user && <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => set('active')(e.target.checked)} /> Account active</label>}
        <div className="form-actions"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>Save</button></div>
      </form>
    </Modal>
  );
}

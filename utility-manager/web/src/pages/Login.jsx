import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { ErrorBox } from '../components/ui.jsx';
import { useSubmit } from '../hooks.js';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { submit, busy, error } = useSubmit(async () => {
    await login(email, password);
    navigate(location.state?.from || '/', { replace: true });
  });
  if (user) return <Navigate to="/" replace />;

  return (
    <div className="login">
      <form className="card login-card" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="brand"><span className="logo"><img src="/stelco-icon.png" alt="" width="55" height="24" /><span className="wordmark">STELCO</span></span></div>
        <h1>SRD Utility Manager</h1>
        <p className="muted">Electricity, water and sewerage operations — South Regional Department</p>
        <ErrorBox error={error} />
        <label className="field"><span className="field-label">Email</span>
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></label>
        <label className="field"><span className="field-label">Password</span>
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button className="btn primary block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="muted small">No account? Ask your system administrator.</p>
      </form>
    </div>
  );
}

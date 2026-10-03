import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { ROLES } from '../format.js';

const NAV = [
  { to: '/', label: 'Overview', end: true },
  { to: '/engines', label: 'Engines' },
  { to: '/reports', label: 'Condition reports' },
  { to: '/work', label: 'Work' },
  { to: '/islands', label: 'Islands & assets' },
  { to: '/incidents', label: 'Incidents' },
  { to: '/projects', label: 'Projects' },
  { section: 'Administration', role: 'manager' },
  { to: '/admin/users', label: 'Users', role: 'admin' },
  { to: '/admin/audit', label: 'Audit trail', role: 'manager' },
];

export default function Layout() {
  const { user, logout, can } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  // Close the mobile menu after navigating.
  const [lastPath, setLastPath] = useState(location.pathname);
  if (lastPath !== location.pathname) { setLastPath(location.pathname); setOpen(false); }

  return (
    <div className="shell">
      <header className="topbar">
        <button className="menu-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Menu">☰</button>
        <NavLink to="/" className="brand">
          <span className="logo"><img src="/stelco-icon.png" alt="" width="46" height="20" /><span className="wordmark">STELCO</span></span>
          <span>SRD Utility Manager</span>
        </NavLink>
        <div className="who">
          <NavLink to="/account" className="who-name">{user.fullName}</NavLink>
          <small className="muted">{ROLES[user.role]}</small>
          <button className="btn ghost small" onClick={logout}>Sign out</button>
        </div>
      </header>
      <nav className={`sidebar ${open ? 'open' : ''}`} aria-label="Main">
        {NAV.filter((n) => !n.role || can(n.role)).map((n) => n.section
          ? <div key={n.section} className="nav-section">{n.section}</div>
          : <NavLink key={n.to} to={n.to} end={n.end} className="nav-link">{n.label}</NavLink>)}
      </nav>
      <main className="page"><Outlet /></main>
    </div>
  );
}

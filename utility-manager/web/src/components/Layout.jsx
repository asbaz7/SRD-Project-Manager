import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { ROLES } from '../format.js';
import { Icon } from './icons.jsx';

// The region (Overview, Islands) and then the three service sections:
// everything else hangs off an island.
const ISLANDS = { to: '/islands', label: 'Islands', icon: 'island' };
const MAIN = [
  { to: '/', label: 'Overview', icon: 'home', end: true },
  ISLANDS,
  { to: '/electricity', label: 'Electricity', icon: 'electricity', svc: 'electricity' },
  { to: '/water', label: 'Water', icon: 'water', svc: 'water' },
  { to: '/sewerage', label: 'Sewerage', icon: 'sewerage', svc: 'sewerage' },
];
const MORE = [
  { to: '/work', label: 'Work', icon: 'work' },
  { to: '/incidents', label: 'Incidents', icon: 'incident' },
  { to: '/projects', label: 'Projects', icon: 'project' },
  { to: '/documents', label: 'Documents', icon: 'document' },
];
const ADMIN = [
  { to: '/admin/users', label: 'Users', icon: 'users', role: 'admin' },
  { to: '/admin/audit', label: 'Audit trail', icon: 'audit', role: 'manager' },
];

const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

function Brand() {
  return (
    <NavLink to="/" className="brand">
      <span className="logo"><img src="/stelco-icon.png" alt="" width="42" height="18" /><span className="wordmark">STELCO</span></span>
      <span className="brand-name">SRD Utility Manager<small>South Regional Department</small></span>
    </NavLink>
  );
}

const Link = ({ item, onClick }) => (
  <NavLink to={item.to} end={item.end} onClick={onClick} className={`nav-link ${item.svc ? `svc-${item.svc}` : ''}`}>
    <Icon name={item.icon} /> {item.label}
  </NavLink>
);

export default function Layout() {
  const { user, logout, can, technical } = useAuth();
  const [sheet, setSheet] = useState(false);
  const location = useLocation();
  const [lastPath, setLastPath] = useState(location.pathname);
  if (lastPath !== location.pathname) { setLastPath(location.pathname); setSheet(false); }
  const admin = ADMIN.filter((n) => can(n.role));
  // Non-technical staff don't have the service sections (engines, assets,
  // plants); work, incidents and projects move up instead.
  const main = technical ? MAIN : [MAIN[0], ISLANDS, ...MORE];
  const more = technical ? MORE : [];
  // Phones: four tabs (Overview and the services, or the main lists); the
  // rest, Islands included, sit under More.
  const tabs = main.filter((n) => n !== ISLANDS).slice(0, 4);

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Main">
        <Brand />
        {main.map((n) => <Link key={n.to} item={n} />)}
        {more.length > 0 && <><div className="nav-section">Activity</div>{more.map((n) => <Link key={n.to} item={n} />)}</>}
        {admin.length > 0 && <><div className="nav-section">Administration</div>{admin.map((n) => <Link key={n.to} item={n} />)}</>}
        <div className="nav-foot">
          <NavLink to="/account" className="who">
            <span className="avatar" aria-hidden="true">{initials(user.fullName)}</span>
            <span><span className="who-name">{user.fullName}</span><small>{ROLES[user.role]}{user.role !== 'admin' && ` · ${technical ? 'Technical' : 'Non-technical'}`}</small></span>
          </NavLink>
          <button className="nav-link link" onClick={logout} style={{ textAlign: 'left' }}><Icon name="logout" /> Sign out</button>
        </div>
      </nav>

      {/* Phones: a slim top bar and a bottom tab bar. */}
      <header className="topbar">
        <Brand />
        <NavLink to="/account" className="who-mini avatar" aria-label="My account">{initials(user.fullName)}</NavLink>
      </header>
      <main className="page"><Outlet /></main>
      <nav className="bottom-bar" aria-label="Main">
        {tabs.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={n.svc ? `svc-${n.svc}` : ''}>
            <Icon name={n.icon} size={22} />{n.label}
          </NavLink>
        ))}
        <button onClick={() => setSheet(!sheet)} aria-expanded={sheet}><Icon name="more" size={22} />More</button>
      </nav>
      {sheet && <>
        <div className="sheet-backdrop" onClick={() => setSheet(false)} />
        <div className="sheet" role="menu">
          {[...main.filter((n) => !tabs.includes(n)), ...more, ...admin].map((n) => <Link key={n.to} item={n} />)}
          <button className="nav-link link" onClick={logout} style={{ textAlign: 'left' }}><Icon name="logout" /> Sign out</button>
        </div>
      </>}
    </div>
  );
}

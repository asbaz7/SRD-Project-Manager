// Islands & assets: one page, four views. The map (islands, atolls, their
// work), and one tab per service with its gensets, plants and monthly
// updates (technical staff only).
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { SERVICES } from '../format.js';
import { Icon } from './icons.jsx';

const FIRST = { electricity: 'engines', water: 'assets', sewerage: 'assets' };

export default function IslandsTabs() {
  const { technical } = useAuth();
  const { pathname } = useLocation();
  if (!technical) return null;
  const on = (svc) => (svc ? pathname.startsWith(`/systems/${svc}`) : pathname.startsWith('/islands'));
  return <nav className="ia-tabs" aria-label="Islands and assets">
    <NavLink to="/islands" className={`ia-tab${on(null) ? ' on' : ''}`}><Icon name="island" size={17} />Map</NavLink>
    {Object.entries(SERVICES).map(([k, s]) => <NavLink key={k} to={`/systems/${k}/${FIRST[k]}`} className={`ia-tab ${k}${on(k) ? ' on' : ''}`}>
      <Icon name={k} size={17} />{s.label}</NavLink>)}
  </nav>;
}

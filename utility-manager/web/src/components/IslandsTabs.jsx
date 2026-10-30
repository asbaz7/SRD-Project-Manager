// Services: All · Electricity · Water · Sewerage. Every tab opens on the
// map (a service tab shows only that service); a service also has its
// lists (engines, monthly updates, plants) beside its map.
import { NavLink, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { SERVICES } from '../format.js';
import { Icon } from './icons.jsx';

export const SECTIONS = {
  electricity: [['engines', 'Engines'], ['reports', 'Monthly updates'], ['plants', 'Powerhouses']],
  water: [['assets', 'Assets'], ['updates', 'Monthly updates'], ['plants', 'Plants']],
  sewerage: [['assets', 'Assets'], ['updates', 'Monthly updates'], ['plants', 'Plants']],
};

// The service the page is on: /islands?service=… or /systems/:svc/….
export function useCurrentService() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const m = pathname.match(/^\/systems\/(\w+)/);
  const svc = m ? m[1] : params.get('service');
  return SERVICES[svc] ? svc : null;
}

export default function IslandsTabs() {
  const { technical } = useAuth();
  const { pathname } = useLocation();
  const svc = useCurrentService();
  if (!technical) return null;
  return <div className="ia-nav">
    <nav className="ia-tabs" aria-label="Services">
      <NavLink to="/islands" className={`ia-tab${!svc ? ' on' : ''}`}><Icon name="island" size={17} />All</NavLink>
      {Object.entries(SERVICES).map(([k, s]) => <NavLink key={k} to={`/islands?service=${k}`} className={`ia-tab ${k}${svc === k ? ' on' : ''}`}>
        <Icon name={k} size={17} />{s.label}</NavLink>)}
    </nav>
    {svc && <nav className="tabs glass" aria-label={`${SERVICES[svc].label} sections`}>
      <NavLink to={`/islands?service=${svc}`} className={`tab${pathname.startsWith('/islands') ? ' active' : ''}`}>Map</NavLink>
      {SECTIONS[svc].map(([key, label]) => <NavLink key={key} to={`/systems/${svc}/${key}`}
        className={`tab${pathname === `/systems/${svc}/${key}` ? ' active' : ''}`}>{label}</NavLink>)}
    </nav>}
  </div>;
}

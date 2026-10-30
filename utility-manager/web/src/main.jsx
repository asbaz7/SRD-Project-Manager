import { StrictMode, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AuthProvider, RequireAuth } from './auth.jsx';
import { CrashGuard } from './components/Crash.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import '@fontsource-variable/inter/wght.css';
import './styles.css';

// Pages load when first opened, so the first screen doesn't wait for all of
// them. (A page file gone after a deploy is handled by CrashGuard: reload.)
const Account = lazy(() => import('./pages/Account.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Islands = lazy(() => import('./pages/Islands.jsx'));
const Takeover = lazy(() => import('./pages/Takeover.jsx'));
const Island = lazy(() => import('./pages/Island.jsx'));
const Asset = lazy(() => import('./pages/Asset.jsx'));
const Incidents = lazy(() => import('./pages/Incidents.jsx'));
const Incident = lazy(() => import('./pages/Incident.jsx'));
const Projects = lazy(() => import('./pages/Projects.jsx'));
const Documents = lazy(() => import('./pages/Documents.jsx'));
const Document = lazy(() => import('./pages/Document.jsx'));
const Surveys = lazy(() => import('./pages/Surveys.jsx'));
const NewSurvey = lazy(() => import('./pages/Surveys.jsx').then((m) => ({ default: m.NewSurvey })));
const Survey = lazy(() => import('./pages/Survey.jsx'));
const Project = lazy(() => import('./pages/Project.jsx'));
const Users = lazy(() => import('./pages/Users.jsx'));
const Audit = lazy(() => import('./pages/Audit.jsx'));
const Service = lazy(() => import('./pages/Service.jsx'));
const Work = lazy(() => import('./pages/Work.jsx'));
const WorkItem = lazy(() => import('./pages/WorkItem.jsx'));

// Incidents were renamed interruptions: old links keep working.
function Renamed({ from, to }) {
  const { pathname, search } = useLocation();
  return <Navigate to={`${to}${pathname.slice(from.length)}${search}`} replace />;
}

// Old addresses (bookmarks) go to their place in the sections.
function Moved({ to }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
}

// The service pages became one Assets page (Oct 2026): old addresses land on
// the same section there, filters kept.
const DEFAULT_TAB = { electricity: 'engines', water: 'assets', sewerage: 'assets' };
function ServiceMoved({ svc }) {
  const { tab } = useParams();
  const { search } = useLocation();
  const map = { '': DEFAULT_TAB[svc], engines: 'engines', reports: 'reports', plants: 'plants', assets: 'assets', updates: 'updates' };
  return <Navigate to={`/systems/${svc}/${map[tab || ''] || DEFAULT_TAB[svc]}${search}`} replace />;
}

function NotFound() {
  return <><h1>Page not found</h1><p className="muted">Check the address, or use the menu.</p></>;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <CrashGuard>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<RequireAuth><Layout /></RequireAuth>}>
              <Route index element={<Dashboard />} />
              <Route path="account" element={<Account />} />
              <Route path="systems" element={<Navigate replace to="/systems/electricity/engines" />} />
              <Route path="systems/:svc" element={<Service />} />
              <Route path="systems/:svc/:tab" element={<Service />} />
              {['electricity', 'water', 'sewerage'].map((svc) => [
                <Route key={svc} path={svc} element={<ServiceMoved svc={svc} />} />,
                <Route key={`${svc}-tab`} path={`${svc}/:tab`} element={<ServiceMoved svc={svc} />} />,
              ])}
              <Route path="engines" element={<Moved to="/electricity/engines" />} />
              <Route path="reports" element={<Moved to="/electricity/reports" />} />
              <Route path="work" element={<Work />} />
              <Route path="work/new" element={<WorkItem />} />
              <Route path="work/:id" element={<WorkItem />} />
              <Route path="islands" element={<Islands />} />
              <Route path="takeover" element={<Takeover />} />
              <Route path="islands/:id" element={<Island />} />
              <Route path="assets/:id" element={<Asset />} />
              <Route path="interruptions" element={<Incidents />} />
              <Route path="interruptions/new" element={<Incident />} />
              <Route path="interruptions/:id" element={<Incident />} />
              <Route path="incidents/*" element={<Renamed from="/incidents" to="/interruptions" />} />
              <Route path="projects" element={<Projects />} />
              <Route path="projects/new" element={<Project />} />
              <Route path="projects/:id" element={<Project />} />
              <Route path="documents" element={<Documents />} />
              <Route path="documents/new" element={<Document />} />
              <Route path="documents/:id" element={<Document />} />
              <Route path="surveys" element={<Surveys />} />
              <Route path="surveys/new" element={<NewSurvey />} />
              <Route path="surveys/:id" element={<Survey />} />
              <Route path="admin/users" element={<Users />} />
              <Route path="admin/audit" element={<Audit />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </CrashGuard>
  </StrictMode>,
);

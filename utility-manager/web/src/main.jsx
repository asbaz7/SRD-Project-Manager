import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, RequireAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Account from './pages/Account.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Islands from './pages/Islands.jsx';
import Island from './pages/Island.jsx';
import Asset from './pages/Asset.jsx';
import StatusRound from './pages/StatusRound.jsx';
import Incidents from './pages/Incidents.jsx';
import Incident from './pages/Incident.jsx';
import Projects from './pages/Projects.jsx';
import Project from './pages/Project.jsx';
import Users from './pages/Users.jsx';
import Audit from './pages/Audit.jsx';
import Engines from './pages/Engines.jsx';
import ConditionReports from './pages/ConditionReports.jsx';
import Work from './pages/Work.jsx';
import WorkItem from './pages/WorkItem.jsx';
import './styles.css';

function NotFound() {
  return <><h1>Page not found</h1><p className="muted">Check the address, or use the menu.</p></>;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAuth><Layout /></RequireAuth>}>
            <Route index element={<Dashboard />} />
            <Route path="account" element={<Account />} />
            <Route path="engines" element={<Engines />} />
            <Route path="reports" element={<ConditionReports />} />
            <Route path="work" element={<Work />} />
            <Route path="work/new" element={<WorkItem />} />
            <Route path="work/:id" element={<WorkItem />} />
            <Route path="islands" element={<Islands />} />
            <Route path="islands/:id" element={<Island />} />
            <Route path="assets/:id" element={<Asset />} />
            <Route path="status" element={<StatusRound />} />
            <Route path="incidents" element={<Incidents />} />
            <Route path="incidents/new" element={<Incident />} />
            <Route path="incidents/:id" element={<Incident />} />
            <Route path="projects" element={<Projects />} />
            <Route path="projects/new" element={<Project />} />
            <Route path="projects/:id" element={<Project />} />
            <Route path="admin/users" element={<Users />} />
            <Route path="admin/audit" element={<Audit />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);

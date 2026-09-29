import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, setUnauthorizedHandler } from './api.js';

const AuthContext = createContext(null);
const RANK = { viewer: 0, operator: 1, manager: 2, admin: 3 };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading, null = signed out

  const refresh = useCallback(() => api('/auth/me').then(setUser).catch(() => setUser(null)), []);
  useEffect(() => {
    refresh();
    setUnauthorizedHandler(() => setUser(null));
  }, [refresh]);

  const login = async (email, password) => {
    await api('/auth/login', { method: 'POST', body: { email, password } });
    await refresh();
  };
  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
  };

  const can = (minimumRole) => !!user && RANK[user.role] >= RANK[minimumRole];
  // Mirrors the server rule; the server always has the final say.
  const canWriteIsland = (island) => {
    if (!user || !island) return false;
    if (user.role === 'admin') return true;
    if (user.role === 'viewer') return false;
    const { scope } = user;
    return scope.region || scope.atollIds.includes(island.atoll_id) || scope.islandIds.includes(island.id ?? island.island_id);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, refresh, can, canWriteIsland }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

export function RequireAuth({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (user === undefined) return <div className="center muted">Loading…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (user.mustChangePassword && location.pathname !== '/account') return <Navigate to="/account" replace />;
  return children;
}

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from './api.js';

// Load a GET endpoint; re-runs when `path` changes. `path` null = skip.
export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null, loading: !!path });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!path) { setState({ data: null, error: null, loading: false }); return; }
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    api(path, { signal: ctrl.signal })
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => { if (error.name !== 'AbortError') setState({ data: null, error, loading: false }); });
    return () => ctrl.abort();
  }, [path, nonce]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}

// Filters kept in the URL so views can be bookmarked and shared.
export function useFilters(defaults = {}) {
  const [params, setParams] = useSearchParams();
  const filters = { ...defaults, ...Object.fromEntries(params) };
  const setFilter = (key, value) => {
    const next = new URLSearchParams(params);
    if (value === '' || value === undefined || value === null) next.delete(key); else next.set(key, value);
    if (key !== 'offset') next.delete('offset');
    setParams(next, { replace: true });
  };
  return [filters, setFilter];
}

// Wrap an async submit: tracks busy/error state.
export function useSubmit(fn) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async (...args) => {
    setBusy(true);
    setError(null);
    try {
      return await fn(...args);
    } catch (err) {
      setError(err);
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { submit, busy, error, setError };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
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
  // setFilter('status', 'open') or setFilter({ condition: 'faults', flag: '' })
  const setFilter = (key, value) => {
    const changes = typeof key === 'object' ? key : { [key]: value };
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === '' || v === undefined || v === null) next.delete(k); else next.set(k, v);
    }
    if (!('offset' in changes)) next.delete('offset');
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

// Makes a whole table row open `to`, as its name link does. Clicks on a
// link or control inside the row, and selecting text, are left alone;
// Ctrl / ⌘-click opens a new tab.
export function useRowLink() {
  const navigate = useNavigate();
  return (to) => ({
    className: 'row-link',
    onClick: (e) => {
      if (e.target.closest('a, button, input, select, textarea, label') || window.getSelection()?.toString()) return;
      if (e.metaKey || e.ctrlKey) window.open(to, '_blank', 'noopener');
      else navigate(to);
    },
  });
}

// After a deploy, a tab that was already open keeps running the old code.
// On moving between pages (checked at most every 2 minutes), see whether the
// site now serves a different build; if so, reload so the page uses it.
export function useFreshVersion() {
  const location = useLocation();
  const last = useRef(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const current = document.querySelector('script[type="module"][src*="/assets/"]')?.getAttribute('src');
    if (!current || Date.now() - last.current < 120_000) return;
    last.current = Date.now();
    fetch('/', { cache: 'no-store' }).then((r) => (r.ok ? r.text() : null))
      .then((html) => { if (html && html.includes('/assets/') && !html.includes(current)) window.location.reload(); })
      .catch(() => {});
  }, [location.pathname, location.search]);
}

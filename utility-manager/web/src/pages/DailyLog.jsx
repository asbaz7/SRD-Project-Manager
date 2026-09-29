// Daily operations log: one facility, one day, one value per metric.
// Replaces the per-island daily Excel log sheets.
import { useEffect, useMemo, useState } from 'react';
import { api, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Async, Card, ErrorBox, Loading, PageHead, Select, Service } from '../components/ui.jsx';
import { SERVICES, date, dateTime, localDate, num } from '../format.js';
import { useApi, useFilters, useSubmit } from '../hooks.js';

const shiftDate = (d, days) => new Date(Date.parse(`${d}T12:00:00Z`) + days * 86400_000).toISOString().slice(0, 10);

export default function DailyLog() {
  const { canWriteIsland } = useAuth();
  const [filters, setFilter] = useFilters({ date: localDate(-1) });
  const facilities = useApi('/facilities');
  const mine = useMemo(() => (facilities.data || []).filter((f) => canWriteIsland({ id: f.island_id, atoll_id: f.atoll_id })),
    [facilities.data, canWriteIsland]);
  const facilityId = filters.facility_id || (mine.length === 1 ? mine[0].id : '');
  const sheet = useApi(facilityId && filters.date ? `/readings/sheet${qs({ facility_id: facilityId, date: filters.date })}` : null);
  const today = localDate(0);

  return <>
    <PageHead title="Daily log" />
    <div className="filters">
      <Select value={facilityId} onChange={(v) => setFilter('facility_id', v)} placeholder="Choose facility…" aria-label="Facility"
        options={mine.map((f) => [f.id, `${f.atoll_code} · ${f.island_name} — ${f.name} (${SERVICES[f.service].label})`])} />
      <div className="date-nav">
        <button className="btn ghost" onClick={() => setFilter('date', shiftDate(filters.date, -1))} aria-label="Previous day">‹</button>
        <input type="date" value={filters.date} max={today} onChange={(e) => setFilter('date', e.target.value)} aria-label="Date" />
        <button className="btn ghost" disabled={filters.date >= today} onClick={() => setFilter('date', shiftDate(filters.date, 1))} aria-label="Next day">›</button>
      </div>
    </div>
    {facilities.data && mine.length === 0 && <div className="notice">No facilities are assigned to you. Ask an administrator to add your island to your account.</div>}
    {facilityId && <Async state={sheet}>{(s) => (
      // While another day loads, the previous day's data is still in state: don't show it as editable.
      s.facility.id === facilityId && s.date === filters.date
        ? <Sheet key={`${s.facility.id}|${s.date}`} sheet={s} onSaved={sheet.reload} />
        : <Loading what="daily log" />
    )}</Async>}
  </>;
}

function Sheet({ sheet, onSaved }) {
  const initial = () => Object.fromEntries(sheet.metrics.map((m) => [m.code, m.value == null ? '' : String(m.value)]));
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setValues(initial()); }, [sheet]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = sheet.metrics.some((m) => (m.value == null ? '' : String(m.value)) !== values[m.code]);

  const { submit, busy, error } = useSubmit(async () => {
    const changed = {};
    for (const m of sheet.metrics) {
      const before = m.value == null ? '' : String(m.value);
      if (values[m.code] !== before) changed[m.code] = values[m.code] === '' ? null : Number(values[m.code]);
    }
    await api('/readings/sheet', { method: 'PUT', body: { facility_id: sheet.facility.id, date: sheet.date, values: changed } });
    setSaved(true);
    onSaved();
  });

  const lastEdit = sheet.metrics.filter((m) => m.entered_at).sort((a, b) => b.entered_at.localeCompare(a.entered_at))[0];
  const { facility } = sheet;

  return (
    <Card title={<><Service value={facility.service} short /> {facility.atoll_code} · {facility.island_name} — {facility.name} · {date(sheet.date)}</>}>
      {lastEdit && <p className="muted small">Last saved {dateTime(lastEdit.entered_at)} by {lastEdit.entered_by_name}</p>}
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <ErrorBox error={error} />
        {saved && !dirty && <div className="success">Saved.</div>}
        <table className="log-table">
          <thead><tr><th>Measurement</th><th>Value</th><th className="num hide-sm">Previous day</th></tr></thead>
          <tbody>{sheet.metrics.map((m) => {
            const v = values[m.code];
            // Flag values far from the previous day: likely typos.
            const jump = v !== '' && m.previous_value && Math.abs(Number(v) - m.previous_value) / m.previous_value > 0.5 && m.aggregation !== 'last';
            return <tr key={m.code}>
              <td><label htmlFor={`m-${m.code}`}>{m.name}</label> <span className="muted small">{m.unit}</span></td>
              <td>
                <input id={`m-${m.code}`} type="number" step="any" inputMode="decimal" className={`num-input ${jump ? 'warn' : ''}`}
                  value={v} onChange={(e) => { setSaved(false); setValues({ ...values, [m.code]: e.target.value }); }} />
                {jump && <small className="warn-text"> ⚠ differs a lot from yesterday</small>}
              </td>
              <td className="num muted hide-sm">{num(m.previous_value, 2)}</td>
            </tr>;
          })}</tbody>
        </table>
        <div className="form-actions">
          <span className="muted small">Leave a field empty if it was not measured. Clearing a saved value removes it.</span>
          <button className="btn primary" disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save daily log'}</button>
        </div>
      </form>
    </Card>
  );
}

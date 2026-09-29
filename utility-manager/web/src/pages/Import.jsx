// Load historical daily logs from Excel (saved as CSV).
import { useState } from 'react';
import { api } from '../api.js';
import { Card, ErrorBox, PageHead } from '../components/ui.jsx';
import { useApi, useSubmit } from '../hooks.js';

const TEMPLATE = 'atoll,island,facility,date,metric,value,note\nK,Maafushi,Maafushi Powerhouse,2026-01-01,gross_generation_kwh,125000,\n';

export default function Import() {
  const metrics = useApi('/metrics');
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState(null);
  const { submit, busy, error } = useSubmit(async (dryRun) => {
    setResult(await api('/readings/import', { method: 'POST', body: { csv, dry_run: dryRun } }));
  });
  const readFile = (file) => { const r = new FileReader(); r.onload = () => { setCsv(String(r.result)); setResult(null); }; r.readAsText(file); };
  const template = `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`;

  return <>
    <PageHead title="Import daily logs from Excel" />
    <Card title="1 · Prepare the file">
      <p>Save the sheet as <strong>CSV</strong> with these columns (one row per facility, day and measurement):</p>
      <p><code>atoll, island, facility, date, metric, value, note</code> — dates as <code>YYYY-MM-DD</code>; facility names exactly as in the system.</p>
      <p><a className="btn small" href={template} download="daily-log-template.csv">Download template</a></p>
      <details><summary>Metric codes</summary>
        <table><tbody>{(metrics.data || []).map((m) => <tr key={m.code}><td><code>{m.code}</code></td><td>{m.name} ({m.unit})</td><td className="muted">{m.service}</td></tr>)}</tbody></table>
      </details>
    </Card>
    <Card title="2 · Check and import">
      <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files[0] && readFile(e.target.files[0])} />
      <textarea className="mono" rows="8" value={csv} onChange={(e) => { setCsv(e.target.value); setResult(null); }} placeholder="…or paste CSV here" />
      <ErrorBox error={error} />
      {result && (result.ok
        ? <div className="success">{result.imported ? `Imported ${result.imported} readings.` : `All ${result.checked} rows are valid. Ready to import.`}</div>
        : <div className="error">
          <strong>{result.errors.length} problem{result.errors.length === 1 ? '' : 's'} found — nothing was imported.</strong>
          <ul>{result.errors.map((e, i) => <li key={i}>{e.line ? `Line ${e.line}: ` : ''}{e.message}</li>)}</ul>
        </div>)}
      <div className="form-actions">
        <button className="btn" disabled={busy || !csv} onClick={() => submit(true)}>Check file</button>
        <button className="btn primary" disabled={busy || !csv || !result?.ok || result.imported > 0} onClick={() => submit(false)}>Import</button>
      </div>
      <p className="muted small">Existing values for the same facility, date and measurement are replaced. Every change is recorded in the audit trail.</p>
    </Card>
  </>;
}

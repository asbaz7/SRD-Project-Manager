// Monthly engine condition reports: drop the Excel files in as they are,
// check what the system read, import. The tracker below shows which
// powerhouses still owe this month's report.
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Async, Card, Condition, ErrorBox, PageHead, Select } from '../components/ui.jsx';
import { EVENT_KINDS, dateTime, month, num } from '../format.js';
import { useApi, useFilters } from '../hooks.js';

const readBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(new Error('Could not read the file'));
  r.readAsDataURL(file);
});

export default function ConditionReports({ embedded }) {
  const { can } = useAuth();
  const [filters, setFilter] = useFilters();
  const atolls = useApi('/atolls');
  const tracker = useApi(`/condition-reports${qs({ atoll_id: filters.atoll_id })}`);
  const [items, setItems] = useState([]);
  const [over, setOver] = useState(false);
  const input = useRef(null);
  const target = useRef(null); // island chosen from a tracker row

  const update = (key, patch) => setItems((all) => all.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const preview = async (item, islandId) => {
    update(item.key, { busy: true, error: null });
    try {
      const res = await api('/condition-reports/preview', { method: 'POST', body: { file_name: item.name, data: item.data, island_id: islandId || undefined } });
      update(item.key, { busy: false, preview: res });
    } catch (error) {
      update(item.key, { busy: false, error });
    }
  };

  const addFiles = async (files) => {
    const islandId = target.current;
    target.current = null;
    for (const file of [...files].filter((f) => /\.xlsx$/i.test(f.name))) {
      const item = { key: `${file.name}-${file.size}-${Math.random()}`, name: file.name, busy: true };
      setItems((all) => [item, ...all]);
      try {
        item.data = await readBase64(file);
        update(item.key, { data: item.data });
        await preview(item, islandId);
      } catch (error) {
        update(item.key, { busy: false, error });
      }
    }
  };

  const importOne = async (item) => {
    update(item.key, { busy: true, error: null });
    try {
      const res = await api('/condition-reports/import', { method: 'POST', body: { file_name: item.name, data: item.data, island_id: item.preview.island.id } });
      update(item.key, { busy: false, done: res });
      tracker.reload();
    } catch (error) {
      update(item.key, { busy: false, error });
    }
  };
  const ready = items.filter((i) => i.preview?.ok && !i.done && !i.busy);

  return <>
    {!embedded && <PageHead title="Condition reports" icon="report" tone="electricity" />}
    {can('manager') && <Card title="Upload reports">
      <div className={`dropzone ${over ? 'over' : ''}`} role="button" tabIndex={0}
        onClick={() => input.current.click()} onKeyDown={(e) => e.key === 'Enter' && input.current.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}>
        <input ref={input} type="file" accept=".xlsx" multiple onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        <strong>Drop the monthly ENGINE CONDITION REPORT files here</strong>, or click to choose.
        <p className="muted small">Use the Excel files exactly as the islands send them. You can drop several at once. Nothing is saved until you press Import.</p>
      </div>
      {items.length > 0 && <>
        <div className="form-actions">
          <span className="muted small">{items.filter((i) => i.done).length} of {items.length} imported</span>
          {ready.length > 1 && <button className="btn primary" onClick={() => ready.forEach(importOne)}>Import all {ready.length} ready</button>}
          <button className="btn ghost" onClick={() => setItems([])}>Clear list</button>
        </div>
        {items.map((item) => <UploadItem key={item.key} item={item} onIsland={(islandId) => preview(item, islandId)} onImport={() => importOne(item)} />)}
      </>}
    </Card>}

    <div className="filters">
      <Select value={filters.atoll_id} onChange={(v) => setFilter('atoll_id', v)} placeholder="All atolls"
        options={(atolls.data || []).map((a) => [a.id, `${a.code} · ${a.name}`])} aria-label="Atoll" />
      <label className="check"><input type="checkbox" checked={filters.missing === '1'} onChange={(e) => setFilter('missing', e.target.checked ? '1' : '')} /> Only missing</label>
    </div>
    <Async state={tracker}>{(t) => {
      const rows = filters.missing === '1' ? t.powerhouses.filter((p) => p.state === 'missing' || p.state === 'never') : t.powerhouses;
      return <Card title={`Reports for ${month(t.expected_month)} · ${t.missing ? `${t.missing} missing` : 'all received'}${t.not_expected ? ` · ${t.not_expected} not surveyed yet` : ''}`}>
        <p className="muted small">Each powerhouse sends its report for the previous month by the {t.due_day}th. Reports come from Fleet Manager, which collects and checks the islands' sheets, or are uploaded here. Every month received is kept (see each engine's page); dates found in them are added to its maintenance history. Powerhouses whose latest report is from before {t.tracked_from?.slice(0, 4)} are not chased, nor are those not yet surveyed: set the month their reports start on the powerhouse (island page → Edit). A powerhouse's first report starts the chase by itself.</p>
        <table>
          <thead><tr><th>Powerhouse</th><th>Latest report</th><th className="hide-sm">Received</th><th className="num hide-sm">Gensets</th><th /></tr></thead>
          <tbody>{rows.map((p) => <tr key={p.facility_id} className={p.state === 'missing' || p.state === 'never' ? 'attention' : ''}>
            <td><Link to={`/islands/${p.island_id}`}><strong>{p.atoll_code} · {p.island_name}</strong></Link></td>
            <td><span className={`state ${p.state}`}>{p.state === 'up_to_date' ? '✓ ' : p.state === 'never' ? '✕ None yet' : p.state === 'untracked' ? '– ' : p.state === 'not_expected' ? '– ' : '✕ '}{p.report_month ? month(p.report_month) : p.state === 'not_expected' ? 'Not surveyed yet' : ''}</span>
              {p.state === 'not_expected' && p.reports_from && <><br /><small className="muted">reports from {month(p.reports_from)}</small></>}
              {p.state === 'untracked' && <><br /><small className="muted">old report, not chased</small></>}
              {p.state === 'missing' && <><br /><small className="muted">{month(t.expected_month)} missing</small></>}</td>
            <td className="hide-sm small">{p.uploaded_at ? <>{dateTime(p.uploaded_at)}<br /><span className="muted">{p.source === 'fleet_manager' ? 'Fleet Manager' : p.uploaded_by_name}</span>
              {p.held_rows?.length > 0 && <><br /><span className="warn-text" title={p.held_rows.map((h) => `${h.genset ? `G${h.genset}: ` : ''}${h.reason}`).join('\n')}>{p.held_rows.length} row{p.held_rows.length === 1 ? '' : 's'} held in Fleet Manager</span></>}</> : <span className="muted">—</span>}</td>
            <td className="num hide-sm">{p.genset_count}</td>
            <td>{can('manager') && <button className="btn small ghost" onClick={() => { target.current = p.island_id; input.current?.click(); }}>Upload</button>}</td>
          </tr>)}</tbody>
        </table>
      </Card>;
    }}</Async>
  </>;
}

function UploadItem({ item, onIsland, onImport }) {
  const p = item.preview;
  const [choosing, setChoosing] = useState(false);
  const choose = (islandId) => { setChoosing(false); onIsland(islandId); };
  return (
    <div className="upload-item">
      <div className="upload-head">
        <strong className="wrap">{item.name}</strong>
        {p?.island && <span className="muted">→ {p.island.atoll_code} · {p.island.name}{p.report_month && <> · <strong>{month(p.report_month)}</strong></>}</span>}
        <div className="actions">
          {item.busy && <span className="muted small">Working…</span>}
          {item.done && <span className="success small">✓ Imported: {item.done.gensets_updated} engines updated{item.done.gensets_added ? `, ${item.done.gensets_added} added` : ''}, {item.done.events_added} history records</span>}
          {!item.done && p?.ok && <button className="btn primary small" disabled={item.busy} onClick={onImport}>Import</button>}
        </div>
      </div>
      <ErrorBox error={item.error} />
      {p && (!p.island || choosing) && <div className="notice">
        {p.island ? 'Which island is this report for?' : `Couldn't tell which island this is${p.powerhouse ? ` ("${p.powerhouse}")` : ''}. Choose it:`}{' '}
        <Select value="" onChange={choose} placeholder="Choose island…"
          options={[...(p.candidates || []), ...(p.islands || []).filter((i) => !(p.candidates || []).some((c) => c.id === i.id))].map((i) => [i.id, `${i.atoll_code} · ${i.name}`])} />
      </div>}
      {p?.island && p.can_write === false && <div className="error">You don't have permission to upload condition reports.</div>}
      {p?.island && <>
        {p.warnings?.map((w) => <div key={w} className="notice small">{w}</div>)}
        <p className="muted small">
          {p.months?.length > 1 ? `${p.months.length} months in this file (${month(p.months[0])} – ${month(p.months.at(-1))}). ` : ''}
          {p.new_events ? `${p.new_events} new history record${p.new_events === 1 ? '' : 's'}: ${Object.entries(p.events_by_kind).map(([k, n]) => `${n} ${EVENT_KINDS[k].toLowerCase()}`).join(', ')}.` : 'No new history records.'}
          {' '}Wrong island? <button className="link" onClick={() => setChoosing(true)}>Choose another</button>
        </p>
        <div className="table-scroll"><table>
          <thead><tr><th>Genset</th><th>Condition</th><th className="num">Total h</th><th className="num">Since overhaul</th><th className="hide-sm">Fault</th></tr></thead>
          <tbody>{p.gensets.map((g) => <tr key={g.number}>
            <td>G{g.number}{g.moved_from ? <span className="flag info"> moved from {g.moved_from}</span> : !g.exists && <span className="flag info"> new</span>}<br /><small className="muted">{g.make_model}</small></td>
            <td><Condition value={g.condition} text={g.status_text} />
              {g.needs_overhaul && <><br /><span className="flag bad">Needs overhaul</span></>}
              {g.alt_needs_service && <><br /><span className="flag warn">Alternator service</span></>}</td>
            <td className="num">{num(g.total_hours)}</td>
            <td className="num">{num(g.hours_since_overhaul)}</td>
            <td className="wrap hide-sm small">{g.fault || <span className="muted">—</span>}</td>
          </tr>)}</tbody>
        </table></div>
      </>}
    </div>
  );
}

import { capacityStatus } from '../lib/island-status.mjs';

export const number = value => value == null ? 'Not supplied' : new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 }).format(value);
const kw = value => value == null ? 'Not supplied' : `${number(value)} kW`;
function Fields({ rows }) { return <dl className="island-fields">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? 'Not supplied'}</dd></div>)}</dl>; }
function Table({ caption, headings, rows }) { return <div className="table-wrap" tabIndex={0} role="region" aria-label={caption}><table><caption>{caption}</caption><thead><tr>{headings.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{rows.map((row,i) => <tr key={i}>{row.map((cell,j) => <td key={j}>{cell ?? 'Not supplied'}</td>)}</tr>)}</tbody></table></div>; }

export function IslandCard({ island }) {
  const r = island.record;
  const status = capacityStatus(r);
  const entry = r?.demand.find(d => d.year === 2026);
  return <article className={`island-status-card ${status.tone}`} id={island.id}>
    <header className="island-status-head"><div><span className="island-atoll">{island.atoll || 'Atoll not supplied'} Atoll</span><h2>{island.name}</h2></div><span className={`island-status-badge ${status.tone}`}>{status.label}</span></header>
    {!r ? <p className="island-no-data">No statistical summary supplied for this island. Operational status is unconfirmed.</p> : <>
      <div className="island-metrics"><div><span>Reported peak</span><strong>{kw(r.peak)}</strong></div><div><span>Firm capacity</span><strong>{kw(r.firm)}</strong></div><div><span>Available capacity</span><strong>{kw(r.available)}</strong></div><div><span>Firm reserve over peak</span><strong>{kw(Math.round((r.firm-r.peak)*100)/100)}</strong></div></div>
      {entry && <p className={entry.maximum > r.firm ? 'island-demand-alert' : 'island-demand-note'}>2026 demand entry: <strong>{kw(entry.maximum)}</strong>. {entry.maximum > r.firm ? `${kw(Math.round((entry.maximum-r.firm)*100)/100)} above listed firm capacity.` : `${kw(Math.round((r.firm-entry.maximum)*100)/100)} below listed firm capacity.`} Actual/forecast basis unconfirmed.</p>}
      <div className="island-services">{['Electricity','Water','Sewerage','Waste'].map(label => { const row=Object.values(r.sections).flat().find(x=>x.label===label);return <div key={label}><span>{label}</span><strong>{row?.value || 'Not supplied'}</strong></div>; })}</div>
      <p className="island-source-note">Source snapshot · Overall reporting date not supplied · {r.issues.length} data {r.issues.length === 1 ? 'check' : 'checks'}</p>
      <details className="island-details"><summary>View full island status</summary>
        <section className="island-detail-section"><h3>Data requiring confirmation</h3><ul>{r.issues.map(issue=><li key={issue}>{issue}</li>)}</ul></section>
        <section className="island-detail-section"><h3>Electricity</h3><Fields rows={[
          ['Installed capacity',kw(r.installed)],['Island population',number(r.population)],['Electricity consumers',number(r.consumers)],['Solar PV',r.solar==null?'Not supplied':`${number(r.solar)} kWp`],['Source category',r.category],['Generator condition',`${r.generators.length} listed as running in source; current status unconfirmed`]
        ]}/><Table caption="Generator register" headings={['No.','Engine model','Rated kW','Operating kW','Reported condition']} rows={r.generators.map(g=>[g.number,g.model,number(g.rated),number(g.operating),g.condition])}/></section>
        <section className="island-detail-section"><h3>Demand by year</h3><p>Values are reproduced from the source. From 2026, treat entries as unverified planning figures until their basis is confirmed. Missing minimum demand is not zero.</p>{r.demand.length ? <Table caption="Annual demand (kW)" headings={['Year','Minimum','Maximum','Basis']} rows={r.demand.map(d=>[d.year,number(d.minimum),number(d.maximum),d.year>=2026?'Actual/forecast unconfirmed':'Source record'])}/> : <p>No annual demand series supplied.</p>}</section>
        <section className="island-detail-section"><h3>Fuel</h3><Fields rows={[[r.fuel.capacityLabel,number(r.fuel.capacity)],[r.fuel.usageLabel,number(r.fuel.monthlyUsage)]]}/><p>Tank capacity is not the current fuel stock. Usage period is unspecified unless shown in the label.</p></section>
        <section className="island-detail-section"><h3>Water</h3><Fields rows={Object.values(r.sections).flat().filter(x=>['Water Consumers','Plant Capacity (TON)','Water Consumption (TON per Day)','Expansion Plans'].includes(x.label)).map(x=>[x.label,x.value])}/></section>
        {['EXISTING STAFF','IDEAL STRUCTURE','REQUIRED NO. OF STAFF','OTHERS'].filter(key=>r.sections[key]).map(key=><section className="island-detail-section" key={key}><h3>{({'EXISTING STAFF':'Existing staff','IDEAL STRUCTURE':'Ideal staffing','REQUIRED NO. OF STAFF':'Additional staffing requirement','OTHERS':'Other reported figures'})[key]}</h3><Fields rows={r.sections[key].map(x=>[x.label,x.value])}/>{key==='OTHERS'&&<p>Financial currency is not supplied. Profit/loss period is unspecified; outstanding balances are dated 31 January 2024. PWD and intern inclusion in staff totals is unconfirmed.</p>}</section>)}
        {r.consumerBreakdown && <section className="island-detail-section"><h3>Consumer categories · 13 December 2023</h3><p>Source category codes retained; descriptions were not supplied.</p><Fields rows={[...Object.entries(r.consumerBreakdown.categories).map(([k,v])=>[k,number(v)]),['Total',number(r.consumerBreakdown.total)]]}/></section>}
        <section className="island-detail-section"><h3>Projects and branch updates</h3><p>Source notes; current progress and completion dates require confirmation.</p><ul>{r.notes.split('\n').map(note=><li key={note}>{note.replace(/^\*\s*/,'')}</li>)}</ul></section>
        <footer className="island-source-note">Source: {r.source}<br/>Imported: {r.importedOn || 'Not supplied'}. Import date does not establish the reporting date.</footer>
      </details>
    </>}
  </article>;
}

export function IslandStatusSummary({ records }) {
  return <section className="card island-dashboard-summary"><div className="card-head"><div><div className="eyebrow">Island statistics</div><h2>Capacity status by island</h2></div><a href="/islands">All island statuses</a></div><div className="island-summary-grid">{records.map(r=>{const s=capacityStatus(r);return <a href={`/islands#${r.id}`} key={r.id}><strong>{r.atoll}. {r.name}</strong><span className={`island-status-badge ${s.tone}`}>{s.label}</span><span>Peak {kw(r.peak)} · Firm {kw(r.firm)}</span></a>;})}</div><p className="island-source-note">Reported snapshots, not live outage monitoring. Open an island to review dates and data checks.</p></section>;
}

import { requireApprovedUser } from '@/lib/auth';
import { getIslandStatistics } from '@/lib/island-statistics';
import { capacityStatus, mergeIslands } from '@/lib/island-status.mjs';
import { IslandCard } from '@/components/IslandStatus';
import { PageHeader } from '@/components/UI';

export default async function IslandsPage({ searchParams }) {
  const { supabase } = await requireApprovedUser();
  const params = await searchParams;
  const [result, statistics] = await Promise.all([
    supabase.from('islands').select('id,name,atolls(code)').order('name'),
    getIslandStatistics(supabase),
  ]);
  const { records } = statistics;
  const all = mergeIslands(records, result.data || []);
  const query = typeof params.q === 'string' ? params.q.trim().toLowerCase() : '';
  const atoll = typeof params.atoll === 'string' ? params.atoll : '';
  const state = typeof params.state === 'string' ? params.state : '';
  const visible = all.filter(i=>(!query||`${i.atoll} ${i.name}`.toLowerCase().includes(query))&&(!atoll||i.atoll===atoll)&&(!state||capacityStatus(i.record).code===state));
  return <div className="island-status-page">
    <PageHeader eyebrow="Branch network" title="Island status" description="Capacity, services, staffing and projects for each island."/>
    <div className="island-context"><strong>Reported statistics · Live operational status unconfirmed</strong><p>{records.length} source summaries available. Check each island for its source and import date. Islands without supplied statistics remain visible as missing data.</p></div>
    {result.error && <p role="alert" className="alert danger">The registered island list could not be loaded. Only available statistical summaries are shown. Reload to retry.</p>}
    {statistics.error && <p role="alert" className="alert danger">Island statistics could not be loaded. Capacity statuses are unavailable. Reload to retry.</p>}
    <div className="island-counts"><span><strong>{all.length}</strong> {result.error?'islands shown':'islands in overview'}</span><span><strong>{statistics.error?'Unavailable':records.length}</strong> with summaries</span><span><strong>{statistics.error?'Unknown':all.filter(i=>!i.record).length}</strong> awaiting statistics</span></div>
    <form action="/islands" method="get" className="island-filters"><label>Search island<input type="search" name="q" defaultValue={query} placeholder="Island name"/></label><label>Atoll<select name="atoll" defaultValue={atoll}><option value="">All atolls</option>{[...new Set(all.map(i=>i.atoll))].filter(Boolean).sort().map(a=><option key={a} value={a}>{a} Atoll</option>)}</select></label><label>Capacity status<select name="state" defaultValue={state}><option value="">All statuses</option><option value="shortfall">Demand above firm capacity</option><option value="limited">Limited firm reserve</option><option value="covered">Firm capacity covers demand</option><option value="unknown">No capacity data</option></select></label><button className="btn primary">Apply filters</button><a href="/islands" className="btn secondary">Reset</a></form>
    <p className="island-source-note">Showing {visible.length} of {all.length} islands</p>
    <div className="island-status-grid">{visible.map(i=><IslandCard island={i} key={i.id}/>)}</div>
    {!visible.length && <p className="card">No islands match these filters. <a href="/islands">Clear filters</a></p>}
    <details className="card island-status-method"><summary>How capacity statuses are calculated</summary><p>Firm capacity matches listed operating capacity minus the largest operating unit. A red status means the reported peak or 2026 demand entry exceeds firm capacity. Amber means the reserve over reported peak is below 10% of peak. Green means firm capacity covers both the reported peak and any supplied 2026 entry, with at least 10% reserve over peak. Grey means capacity data is unavailable.</p><p>The 10% threshold is a dashboard screening rule, not a confirmed STELCO standard. Capacity indicators do not establish whether power is currently on or off. Generators mentioned only in notes are excluded from capacity totals until their operating capacity is confirmed.</p></details>
  </div>;
}

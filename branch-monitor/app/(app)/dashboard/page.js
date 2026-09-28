import Link from "next/link";
import { getIslandStatistics } from "@/lib/island-statistics";
import { IslandStatusSummary } from "@/components/IslandStatus";
import { requireApprovedUser } from "@/lib/auth";
import { getDashboardData } from "@/lib/queries";
import { Card, Empty, PageHeader, PriorityBadge, Progress, Stat, StatusBadge } from "@/components/UI";
import { formatDate } from "@/lib/format";

export default async function DashboardPage() {
  const { supabase, profile } = await requireApprovedUser();
  const [dashboard, statistics] = await Promise.all([getDashboardData(supabase), getIslandStatistics(supabase)]);
  const { projects, works, blockers, atolls, units, delegations } = dashboard;
  const activeProjects = projects.filter((p) => ["planned", "active", "on_hold"].includes(p.status));
  const overdue = works.filter((w) => w.due_date && new Date(w.due_date) < new Date() && !["verified", "closed"].includes(w.status));
  const critical = works.filter((w) => w.priority === "critical");
  const attention = blockers.filter((b) => b.escalated_to_hod).slice(0, 8);
  return <>
    <PageHeader eyebrow="Department overview" title={`Good day, ${profile.full_name.split(" ")[0]}`} description="Live operational picture across SRD-managed branches." actions={<><Link className="btn secondary" href="/works/new">New work</Link><Link className="btn primary" href="/projects/new">New project</Link></>} />
    <div className="stats-grid">
      <Stat label="Active projects" value={activeProjects.length} hint={`${projects.length} total`} />
      <Stat label="Open works" value={works.length} hint="Across all units" />
      <Stat label="Overdue" value={overdue.length} tone={overdue.length ? "danger" : ""} hint="Needs schedule review" />
      <Stat label="Critical priority" value={critical.length} tone={critical.length ? "danger" : ""} hint="Open critical works" />
    </div>
    {statistics.error ? <p className="alert danger" role="alert">Island statistics could not be loaded. <Link href="/islands">View island status</Link></p> : <IslandStatusSummary records={statistics.records} />}
    <div className="dashboard-grid">
      <Card>
        <div className="card-head"><div><div className="eyebrow">Management attention</div><h2>Escalations & blockers</h2></div><Link href="/activity">View activity</Link></div>
        {attention.length === 0 ? <Empty title="No escalated blockers">Nothing currently requires HOD escalation.</Empty> : <div className="list">{attention.map((b) => <Link key={b.id} className="list-row" href={`/works/${b.work_items?.id}`}><div><strong>{b.work_items?.title}</strong><span>{b.work_items?.powerhouses?.islands?.atolls?.code} · {b.work_items?.powerhouses?.islands?.name} · {b.category.replaceAll("_", " ")}</span></div><PriorityBadge priority={b.work_items?.priority} /></Link>)}</div>}
      </Card>
      <Card>
        <div className="card-head"><div><div className="eyebrow">Coverage</div><h2>Unit heads</h2></div><Link href="/team">Manage</Link></div>
        <div className="compact-list">{units.map((u) => { const row = delegations.find((x) => x.unit_id === u.id); return <div key={u.id}><span>{u.name}</span><strong>{row?.acting_head_name || row?.primary_head_name || "Not assigned"}</strong>{row?.acting_head_name && <small>Acting until {formatDate(row.ends_at)}</small>}</div>; })}</div>
      </Card>
    </div>
    <div className="dashboard-grid wide-left">
      <Card>
        <div className="card-head"><div><div className="eyebrow">Portfolio</div><h2>Current projects</h2></div><Link href="/projects">All projects</Link></div>
        {activeProjects.length === 0 ? <Empty title="No active projects" /> : <div className="project-grid">{activeProjects.slice(0, 8).map((p) => <Link className="project-mini" href={`/projects/${p.id}`} key={p.id}><div className="project-mini-top"><strong>{p.code}</strong><StatusBadge status={p.status} /></div><h3>{p.title}</h3><span>{p.atoll_code || "—"} · {p.island_name || "Department-wide"}</span><Progress value={p.progress} /><small>{p.progress}% complete · due {formatDate(p.due_date)}</small></Link>)}</div>}
      </Card>
      <Card>
        <div className="card-head"><div><div className="eyebrow">Network</div><h2>Branch footprint</h2></div><Link href="/locations">Locations</Link></div>
        <div className="compact-list">{atolls.map((a) => <div key={a.id}><span>{a.code} Atoll</span><strong>{a.islands?.reduce((n, i) => n + (i.powerhouses?.length || 0), 0) || 0} branches</strong><small>{a.islands?.length || 0} islands registered</small></div>)}</div>
      </Card>
    </div>
  </>;
}

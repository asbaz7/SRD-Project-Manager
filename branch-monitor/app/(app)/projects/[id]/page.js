import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApprovedUser } from "@/lib/auth";
import { Card, Empty, PageHeader, PriorityBadge, Progress, StatusBadge } from "@/components/UI";
import { formatDate } from "@/lib/format";

export default async function ProjectDetailPage({ params }) {
  const { id } = await params;
  const { supabase } = await requireApprovedUser();
  const [{ data: project }, { data: works = [] }, { data: units = [] }] = await Promise.all([
    supabase.from("project_overview").select("*").eq("id", id).maybeSingle(),
    supabase.from("work_item_overview").select("*").eq("project_id", id).order("updated_at", { ascending: false }),
    supabase.from("project_units").select("role, units(id,name,code)").eq("project_id", id),
  ]);
  if (!project) notFound();
  return <>
    <PageHeader eyebrow={`${project.code} · ${project.lead_unit_name}`} title={project.title} description={project.description} actions={<Link className="btn primary" href={`/works/new?project=${project.id}`}>Add workstream</Link>} />
    <div className="detail-strip"><div><span>Status</span><StatusBadge status={project.status} /></div><div><span>Priority</span><PriorityBadge priority={project.priority} /></div><div><span>Progress</span><strong>{project.progress}%</strong></div><div><span>Target</span><strong>{formatDate(project.due_date)}</strong></div><div><span>Location</span><strong>{project.island_name || "Multiple"}</strong></div></div>
    <div className="dashboard-grid wide-left">
      <Card>
        <div className="card-head"><div><div className="eyebrow">Unit workstreams</div><h2>Project execution</h2></div></div>
        {works.length === 0 ? <Empty title="No workstreams yet">Add the unit work that makes up this project.</Empty> : <div className="list">{works.map((w) => <Link key={w.id} className="work-row" href={`/works/${w.id}`}><div><div className="work-title"><strong>{w.title}</strong><StatusBadge status={w.status} /></div><span>{w.owning_unit_name} · {w.island_name} · {w.powerhouse_name}</span><Progress value={w.progress} /></div><div className="right"><strong>{w.progress}%</strong><small>Due {formatDate(w.due_date)}</small></div></Link>)}</div>}
      </Card>
      <Card>
        <div className="eyebrow">Participating units</div><h2>Responsibility</h2>
        <div className="compact-list">{units.map((u) => <div key={u.units.id}><span>{u.units.name}</span><strong>{u.role === "lead" ? "Lead" : "Support"}</strong></div>)}</div>
      </Card>
    </div>
  </>;
}

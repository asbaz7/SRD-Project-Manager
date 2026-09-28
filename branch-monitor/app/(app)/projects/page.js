import Link from "next/link";
import { requireApprovedUser } from "@/lib/auth";
import { Card, Empty, PageHeader, PriorityBadge, Progress, StatusBadge } from "@/components/UI";
import { formatDate } from "@/lib/format";

export default async function ProjectsPage() {
  const { supabase } = await requireApprovedUser();
  const { data: projects = [] } = await supabase.from("project_overview").select("*").order("updated_at", { ascending: false });
  return <>
    <PageHeader eyebrow="Portfolio" title="Projects" description="Multi-unit projects and major planned works across the branch network." actions={<Link href="/projects/new" className="btn primary">New project</Link>} />
    <Card>
      {projects.length === 0 ? <Empty title="No projects yet">Create the first department project.</Empty> : <div className="table-wrap"><table><thead><tr><th>Project</th><th>Location</th><th>Lead unit</th><th>Status</th><th>Priority</th><th>Progress</th><th>Due</th></tr></thead><tbody>{projects.map((p) => <tr key={p.id}><td><Link href={`/projects/${p.id}`}><strong>{p.code}</strong><span>{p.title}</span></Link></td><td>{p.atoll_code || "—"} {p.island_name ? `· ${p.island_name}` : ""}</td><td>{p.lead_unit_name}</td><td><StatusBadge status={p.status} /></td><td><PriorityBadge priority={p.priority} /></td><td><div className="progress-cell"><Progress value={p.progress} /><small>{p.progress}%</small></div></td><td>{formatDate(p.due_date)}</td></tr>)}</tbody></table></div>}
    </Card>
  </>;
}

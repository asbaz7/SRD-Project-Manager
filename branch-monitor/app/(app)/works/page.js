import Link from "next/link";
import { requireApprovedUser } from "@/lib/auth";
import { Card, Empty, PageHeader, PriorityBadge, Progress, StatusBadge } from "@/components/UI";
import { formatDate } from "@/lib/format";

export default async function WorksPage() {
  const { supabase } = await requireApprovedUser();
  const { data: works = [] } = await supabase.from("work_item_overview").select("*").order("updated_at", { ascending: false });
  return <>
    <PageHeader eyebrow="Operations" title="Ongoing works" description="Standalone jobs and project workstreams across all branches." actions={<Link href="/works/new" className="btn primary">New work</Link>} />
    <Card>
      {works.length === 0 ? <Empty title="No works registered" /> : <div className="table-wrap"><table><thead><tr><th>Work</th><th>Branch</th><th>Unit</th><th>Status</th><th>Priority</th><th>Progress</th><th>Due</th></tr></thead><tbody>{works.map((w) => <tr key={w.id}><td><Link href={`/works/${w.id}`}><strong>{w.title}</strong><span>{w.project_code ? `${w.project_code} · ` : ""}{w.work_type.replaceAll("_", " ")}</span></Link></td><td>{w.atoll_code} · {w.island_name}<br/><small>{w.powerhouse_name}</small></td><td>{w.owning_unit_name}</td><td><StatusBadge status={w.status} /></td><td><PriorityBadge priority={w.priority} /></td><td><div className="progress-cell"><Progress value={w.progress} /><small>{w.progress}%</small></div></td><td>{formatDate(w.due_date)}</td></tr>)}</tbody></table></div>}
    </Card>
  </>;
}

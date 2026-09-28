import { requireApprovedUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/UI";
import { formatDateTime } from "@/lib/format";

export default async function ActivityPage() {
  const { supabase } = await requireApprovedUser();
  const { data: rows = [] } = await supabase.from("activity_log").select("id,entity_type,entity_id,action,summary,created_at,profiles:actor_id(full_name)").order("created_at", { ascending: false }).limit(150);
  return <><PageHeader eyebrow="Audit trail" title="Activity" description="Recent project, work, task and management actions." /><Card><div className="timeline large">{rows.map((r) => <div key={r.id}><span></span><div><strong>{r.profiles?.full_name || "System"}</strong><small>{formatDateTime(r.created_at)} · {r.entity_type.replaceAll("_", " ")} · {r.action.replaceAll("_", " ")}</small><p>{r.summary}</p></div></div>)}</div></Card></>;
}

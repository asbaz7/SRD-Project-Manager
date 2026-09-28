import { createWorkAction } from "@/app/actions";
import { Card, PageHeader } from "@/components/UI";
import { requireApprovedUser } from "@/lib/auth";
import { getReferenceData } from "@/lib/queries";

export default async function NewWorkPage({ searchParams }) {
  const params = await searchParams;
  const { supabase } = await requireApprovedUser();
  const refs = await getReferenceData(supabase);
  const atollOrder = ["ADh", "K", "M", "V"];
  const powerhouseGroups = atollOrder
    .map((code) => ({
      code,
      items: refs.powerhouses
        .filter((p) => p.islands?.atolls?.code === code)
        .sort((a, b) => (a.islands?.name || "").localeCompare(b.islands?.name || "") || (a.name || "").localeCompare(b.name || "")),
    }))
    .filter((group) => group.items.length);
  const { data: projects = [] } = await supabase.from("projects").select("id, code, title").in("status", ["planned","active","on_hold"]).order("code");
  return <>
    <PageHeader eyebrow="Operations" title="Create work" description="Register a job for a specific powerhouse and responsible unit." />
    <Card className="form-card">
      {params?.error && <div className="alert danger">{params.error}</div>}
      <form action={createWorkAction} className="form-grid">
        <label className="span-2">Title<input name="title" required /></label>
        <label>Project (optional)<select name="project_id" defaultValue={params?.project || ""}><option value="">Standalone work</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.title}</option>)}</select></label>
        <label>Work type<select name="work_type" defaultValue="project_work"><option value="project_work">Project work</option><option value="repair_breakdown">Repair / breakdown</option><option value="preventive_maintenance">Preventive maintenance</option><option value="corrective_maintenance">Corrective maintenance</option><option value="upgrade_modification">Upgrade / modification</option><option value="inspection">Inspection</option><option value="logistics_procurement">Logistics / procurement</option><option value="general_maintenance">General maintenance</option><option value="administrative">Administrative</option><option value="other">Other</option></select></label>
        <label>Powerhouse<select name="powerhouse_id" required>
          <option value="">Select powerhouse</option>
          {powerhouseGroups.map((group) => <optgroup key={group.code} label={`${group.code} Atoll`}>
            {group.items.map((p) => <option value={p.id} key={p.id}>{p.islands?.name} · {p.name}</option>)}
          </optgroup>)}
        </select></label>
        <label>Owning unit<select name="owning_unit_id" required><option value="">Select unit</option>{refs.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
        <label>Supervisor<select name="supervisor_id"><option value="">Use active Unit Head</option>{refs.profiles.filter((p) => ["developer","hod","unit_head"].includes(p.role)).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>
        <label>Priority<select name="priority" defaultValue="medium"><option>low</option><option>medium</option><option>high</option><option>critical</option></select></label>
        <label>Status<select name="status" defaultValue="new"><option value="new">New</option><option value="planned">Planned</option><option value="in_progress">In progress</option><option value="waiting_blocked">Waiting / blocked</option></select></label>
        <label>Weight<input name="weight" type="number" min="0.1" step="0.1" defaultValue="1" /></label>
        <label>Start date<input name="start_date" type="date" /></label>
        <label>Target date<input name="due_date" type="date" /></label>
        <label className="span-2">Scope / description<textarea name="description" rows={5} /></label>
        <div className="span-2 form-actions"><button className="btn primary">Create work</button></div>
      </form>
    </Card>
  </>;
}

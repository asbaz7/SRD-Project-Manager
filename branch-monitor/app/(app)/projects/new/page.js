import { createProjectAction } from "@/app/actions";
import { PageHeader, Card } from "@/components/UI";
import { requireApprovedUser } from "@/lib/auth";
import { getReferenceData } from "@/lib/queries";

export default async function NewProjectPage({ searchParams }) {
  const { supabase } = await requireApprovedUser();
  const refs = await getReferenceData(supabase);
  const params = await searchParams;
  return <>
    <PageHeader eyebrow="Portfolio" title="Create project" description="Set the lead unit, location, supporting units and management dates." />
    <Card className="form-card">
      {params?.error && <div className="alert danger">{params.error}</div>}
      <form action={createProjectAction} className="form-grid">
        <label>Project code<input name="code" placeholder="e.g. K-DHI-GEN-01" required /></label>
        <label>Project title<input name="title" required /></label>
        <label className="span-2">Description<textarea name="description" rows={4} /></label>
        <label>Lead unit<select name="lead_unit_id" required><option value="">Select unit</option>{refs.units.map((u) => <option value={u.id} key={u.id}>{u.name}</option>)}</select></label>
        <label>Project lead<select name="lead_user_id"><option value="">Use active Unit Head</option>{refs.profiles.filter((p) => ["hod","unit_head"].includes(p.role)).map((p) => <option value={p.id} key={p.id}>{p.full_name}</option>)}</select></label>
        <label>Branch<select name="powerhouse_id"><option value="">Department-wide / multiple</option>{refs.powerhouses.map((p) => <option value={p.id} key={p.id}>{p.islands?.atolls?.code} · {p.islands?.name} · {p.name}</option>)}</select></label>
        <label>Priority<select name="priority" defaultValue="medium"><option>low</option><option>medium</option><option>high</option><option>critical</option></select></label>
        <label>Status<select name="status" defaultValue="planned"><option value="planned">Planned</option><option value="active">Active</option><option value="on_hold">On hold</option></select></label>
        <label>Start date<input name="start_date" type="date" /></label>
        <label>Target date<input name="due_date" type="date" /></label>
        <fieldset className="span-2"><legend>Supporting units</legend><div className="check-grid">{refs.units.map((u) => <label className="check" key={u.id}><input type="checkbox" name="support_unit_ids" value={u.id} />{u.name}</label>)}</div></fieldset>
        <div className="span-2 form-actions"><button className="btn primary">Create project</button></div>
      </form>
    </Card>
  </>;
}

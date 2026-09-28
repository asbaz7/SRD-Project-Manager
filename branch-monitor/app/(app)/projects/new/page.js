import { createProjectAction } from "@/app/actions";
import { PageHeader, Card } from "@/components/UI";
import { requireApprovedUser } from "@/lib/auth";
import { getReferenceData } from "@/lib/queries";

export default async function NewProjectPage({ searchParams }) {
  const { supabase } = await requireApprovedUser();
  const refs = await getReferenceData(supabase);
  const params = await searchParams;
  return <>
    <PageHeader
      eyebrow="Projects & maintenance"
      title="Create project record"
      description="Create the digital project record sheet, including scope, financials, dates and project-control checks."
    />
    <Card className="form-card project-record-form">
      {params?.error && <div className="alert danger">{params.error}</div>}
      <form action={createProjectAction} className="form-grid">
        <div className="span-2 form-section-title"><span>Project identity</span><p>Core information shown at the top of the record sheet.</p></div>
        <label>Project code<input name="code" placeholder="e.g. SRPR001/2026" required /></label>
        <label>Project name<input name="title" required /></label>
        <label>Location / site<input name="location_text" placeholder="e.g. ADh. Dhidhdhoo Branch" /></label>
        <label>Branch<select name="powerhouse_id"><option value="">No linked branch / multiple</option>{refs.powerhouses.map((p) => <option value={p.id} key={p.id}>{p.islands?.atolls?.code} · {p.islands?.name} · {p.name}</option>)}</select></label>
        <label className="span-2">Scope<textarea name="scope" rows={4} placeholder="Describe the complete project scope." /></label>
        <label className="span-2">Internal description / notes<textarea name="description" rows={3} /></label>

        <div className="span-2 form-section-title"><span>Ownership & status</span></div>
        <label>Lead unit<select name="lead_unit_id" required><option value="">Select unit</option>{refs.units.map((u) => <option value={u.id} key={u.id}>{u.name}</option>)}</select></label>
        <label>Project lead<select name="lead_user_id"><option value="">Use active Unit Head</option>{refs.profiles.filter((p) => ["hod","unit_head"].includes(p.role)).map((p) => <option value={p.id} key={p.id}>{p.full_name}</option>)}</select></label>
        <label>Priority<select name="priority" defaultValue="medium"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
        <label>Status<select name="status" defaultValue="planned"><option value="planned">Planned</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option></select></label>
        <label>Start date<input name="start_date" type="date" /></label>
        <label>Target completion<input name="due_date" type="date" /></label>
        <label>Actual completion<input name="completion_date" type="date" /></label>
        <label>Last progress update<input name="last_progress_update" type="date" /></label>
        <label>Manual progress %<input name="progress_override" type="number" min="0" max="100" placeholder="Auto if blank" /></label>

        <div className="span-2 form-section-title"><span>Financial record (MVR)</span></div>
        <label>Budget<input name="budget" type="number" min="0" step="0.01" /></label>
        <label>SRD expenditure<input name="exp_srd" type="number" min="0" step="0.01" /></label>
        <label>Corporate expenditure<input name="exp_corporate" type="number" min="0" step="0.01" /></label>
        <label>Allowance<input name="allowance" type="number" min="0" step="0.01" /></label>
        <label>Total cost<input name="total_cost" type="number" min="0" step="0.01" /></label>

        <div className="span-2 form-section-title"><span>Project-control record</span><p>Match the survey, drawing and work-schedule fields used in the paper record.</p></div>
        <div className="record-check-field"><label className="check"><input type="checkbox" name="site_survey_done" />Site visit / survey completed</label><input name="site_survey_date" type="date" aria-label="Site survey date" /></div>
        <div className="record-check-field"><label className="check"><input type="checkbox" name="structural_drawing_done" />Structural drawing completed</label><input name="structural_drawing_date" type="date" aria-label="Structural drawing date" /></div>
        <div className="record-check-field"><label className="check"><input type="checkbox" name="work_schedule_done" />Work schedule completed</label><input name="work_schedule_date" type="date" aria-label="Work schedule date" /></div>

        <fieldset className="span-2"><legend>Supporting units</legend><div className="check-grid">{refs.units.map((u) => <label className="check" key={u.id}><input type="checkbox" name="support_unit_ids" value={u.id} />{u.name}</label>)}</div></fieldset>
        <div className="span-2 form-actions"><button className="btn primary">Create project record</button></div>
      </form>
    </Card>
  </>;
}

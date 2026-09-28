import { approveProfileAction, createDelegationAction } from "@/app/actions";
import { requireApprovedUser } from "@/lib/auth";
import { Card, PageHeader, StatusBadge } from "@/components/UI";
import { formatDateTime } from "@/lib/format";

export default async function TeamPage() {
  const { supabase, profile } = await requireApprovedUser();
  const [{ data: units = [] }, { data: people = [] }, { data: heads = [] }, { data: delegations = [] }] = await Promise.all([
    supabase.from("units").select("id,name,code").eq("active", true).order("sort_order"),
    supabase.from("profiles").select("id,full_name,staff_no,designation,role,approved,active,primary_unit_id,units:primary_unit_id(name)").order("full_name"),
    supabase.from("profiles").select("id,full_name,role,primary_unit_id").eq("approved", true).eq("active", true).in("role", ["hod","unit_head"]).order("full_name"),
    supabase.from("unit_head_delegations").select("id,starts_at,ends_at,note,units(name),profiles:acting_head_id(full_name)").gte("ends_at", new Date().toISOString()).order("starts_at", { ascending: false }),
  ]);
  return <>
    <PageHeader eyebrow="People & responsibility" title="Team" description="Staff roles, unit ownership and temporary Unit Head coverage." />
    {["developer", "hod"].includes(profile.role) && <Card>
      <div className="card-head"><div><div className="eyebrow">Access requests</div><h2>Pending approval</h2></div></div>
      <div className="approval-grid">{people.filter((p) => !p.approved).map((p) => <form className="approval-card" key={p.id} action={approveProfileAction.bind(null, p.id)}><div><strong>{p.full_name}</strong><span>New account</span></div><label>Role<select name="role" defaultValue="staff"><option value="staff">Staff</option><option value="unit_head">Unit Head</option><option value="viewer">Viewer</option></select></label><label>Unit<select name="primary_unit_id"><option value="">No unit</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label><label>Designation<input name="designation" /></label><button className="btn primary">Approve</button></form>)}</div>
      {people.every((p) => p.approved) && <p className="muted">No pending access requests.</p>}
    </Card>}
    <div className="dashboard-grid wide-left">
      <Card>
        <div className="eyebrow">Department directory</div><h2>Approved staff</h2>
        <div className="table-wrap"><table><thead><tr><th>Name</th><th>Role</th><th>Unit</th><th>Designation</th></tr></thead><tbody>{people.filter((p) => p.approved).map((p) => <tr key={p.id}><td><strong>{p.full_name}</strong><br/><small>{p.staff_no || "—"}</small></td><td>{p.role.replaceAll("_", " ")}</td><td>{p.units?.name || "—"}</td><td>{p.designation || "—"}</td></tr>)}</tbody></table></div>
      </Card>
      <div>
        <Card>
          <div className="eyebrow">Leave coverage</div><h2>Active delegations</h2>
          <div className="compact-list">{delegations.map((d) => <div key={d.id}><span>{d.units?.name}</span><strong>{d.profiles?.full_name}</strong><small>{formatDateTime(d.starts_at)} → {formatDateTime(d.ends_at)}</small></div>)}</div>
        </Card>
        {["developer", "hod"].includes(profile.role) && <Card>
          <div className="eyebrow">Temporary authority</div><h2>Assign Acting Unit Head</h2>
          <form action={createDelegationAction} className="form-stack compact"><label>Unit<select name="unit_id" required><option value="">Select unit</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label><label>Acting Unit Head<select name="acting_head_id" required><option value="">Select person</option>{heads.map((h) => <option key={h.id} value={h.id}>{h.full_name}</option>)}</select></label><label>Starts<input name="starts_at" type="datetime-local" required /></label><label>Ends<input name="ends_at" type="datetime-local" required /></label><label>Note<textarea name="note" rows={2} /></label><button className="btn primary">Create delegation</button></form>
        </Card>}
      </div>
    </div>
  </>;
}

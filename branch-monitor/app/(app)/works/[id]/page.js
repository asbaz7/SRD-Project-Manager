import { notFound } from "next/navigation";
import { addBlockerAction, addWorkUpdateAction, createTaskAction, resolveBlockerAction, toggleChecklistAction, updateTaskStatusAction } from "@/app/actions";
import { requireApprovedUser } from "@/lib/auth";
import { getReferenceData } from "@/lib/queries";
import { Badge, Card, Empty, PageHeader, PriorityBadge, Progress, StatusBadge } from "@/components/UI";
import { formatDate, formatDateTime } from "@/lib/format";

export default async function WorkDetailPage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireApprovedUser();
  const [workRes, tasksRes, updatesRes, blockersRes, refs] = await Promise.all([
    supabase.from("work_item_overview").select("*").eq("id", id).maybeSingle(),
    supabase.from("task_overview").select("*").eq("work_item_id", id).order("created_at"),
    supabase.from("work_updates").select("id,note,update_type,created_at,profiles:author_id(full_name)").eq("work_item_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("blockers").select("id,category,note,status,escalated_to_hod,created_at,profiles:raised_by(full_name)").eq("work_item_id", id).order("created_at", { ascending: false }),
    getReferenceData(supabase),
  ]);
  const work = workRes.data;
  if (!work) notFound();
  const tasks = tasksRes.data || [];
  const taskIds = tasks.map((t) => t.id);
  const [{ data: checklist = [] }, { data: assignments = [] }] = taskIds.length ? await Promise.all([
    supabase.from("task_checklist").select("id,task_id,title,weight,completed,completed_at").in("task_id", taskIds).order("sort_order"),
    supabase.from("task_assignments").select("task_id,profile_id,profiles:profile_id(full_name,primary_unit_id)").in("task_id", taskIds),
  ]) : [{ data: [] }, { data: [] }];

  return <>
    <PageHeader eyebrow={`${work.atoll_code} · ${work.island_name} · ${work.powerhouse_name}`} title={work.title} description={work.description} />
    {sp?.error && <div className="alert danger">{sp.error}</div>}
    <div className="detail-strip"><div><span>Status</span><StatusBadge status={work.status} /></div><div><span>Priority</span><PriorityBadge priority={work.priority} /></div><div><span>Unit</span><strong>{work.owning_unit_name}</strong></div><div><span>Progress</span><strong>{work.progress}%</strong></div><div><span>Target</span><strong>{formatDate(work.due_date)}</strong></div></div>
    <div className="dashboard-grid wide-left">
      <div>
        <Card>
          <div className="card-head"><div><div className="eyebrow">Execution plan</div><h2>Tasks</h2></div></div>
          {tasks.length === 0 ? <Empty title="No tasks yet">Break this work into unit tasks so progress can be calculated automatically.</Empty> : <div className="task-stack">{tasks.map((task) => {
            const items = checklist.filter((c) => c.task_id === task.id);
            const people = assignments.filter((a) => a.task_id === task.id);
            return <article className="task-card" key={task.id}>
              <div className="task-head"><div><strong>{task.title}</strong><span>{task.assigned_unit_name} · weight {task.weight}</span></div><div><StatusBadge status={task.status} /><strong>{task.progress}%</strong></div></div>
              <Progress value={task.progress} />
              {task.description && <p>{task.description}</p>}
              {people.length > 0 && <div className="chips">{people.map((a) => <Badge key={a.profile_id}>{a.profiles?.full_name}</Badge>)}</div>}
              {items.length > 0 && <div className="checklist">{items.map((item) => <form key={item.id} action={toggleChecklistAction.bind(null, id, item.id, !item.completed)}><button className={`check-item ${item.completed ? "done" : ""}`}><span>{item.completed ? "✓" : "○"}</span>{item.title}</button></form>)}</div>}
              <form action={updateTaskStatusAction.bind(null, id, task.id)} className="inline-form"><select name="status" defaultValue={task.status}><option value="planned">Planned</option><option value="in_progress">In progress</option><option value="waiting_blocked">Waiting / blocked</option><option value="completed">Completed</option></select><input name="note" placeholder="Optional progress note" /><button className="btn secondary">Update</button></form>
            </article>;
          })}</div>}
        </Card>
        <Card>
          <div className="eyebrow">Progress history</div><h2>Updates</h2>
          <form action={addWorkUpdateAction.bind(null, id)} className="update-form"><textarea name="note" rows={3} placeholder="Add progress note, site update or coordination note..." required /><select name="update_type"><option value="note">General note</option><option value="progress">Progress</option><option value="site_visit">Site visit</option><option value="decision">Decision</option></select><button className="btn primary">Post update</button></form>
          <div className="timeline">{(updatesRes.data || []).map((u) => <div key={u.id}><span></span><div><strong>{u.profiles?.full_name || "Staff"}</strong><small>{formatDateTime(u.created_at)} · {u.update_type.replaceAll("_", " ")}</small><p>{u.note}</p></div></div>)}</div>
        </Card>
      </div>
      <div>
        <Card>
          <div className="eyebrow">Add execution task</div><h2>New task</h2>
          <form action={createTaskAction.bind(null, id)} className="form-stack compact">
            <label>Task title<input name="title" required /></label>
            <label>Assigned unit<select name="assigned_unit_id" defaultValue={work.owning_unit_id} required>{refs.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
            <label>Assigned staff<select name="assignee_ids" multiple size={5}>{refs.profiles.filter((p) => p.role !== "viewer").map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>
            <label>Weight<input name="weight" type="number" step="0.1" min="0.1" defaultValue="1" /></label>
            <label>Due date<input name="due_date" type="date" /></label>
            <label>Description<textarea name="description" rows={3} /></label>
            <label>Checklist items<textarea name="checklist" rows={5} placeholder={'One item per line\nInspect alignment\nInstall coupling\nTest run'} /></label>
            <button className="btn primary">Add task</button>
          </form>
        </Card>
        <Card>
          <div className="eyebrow">Risks & blockers</div><h2>Management attention</h2>
          {(blockersRes.data || []).filter((b) => b.status === "open").map((b) => <div className="blocker" key={b.id}><div><Badge tone={b.escalated_to_hod ? "danger" : ""}>{b.category.replaceAll("_", " ")}</Badge><strong>{b.note}</strong><small>{b.profiles?.full_name} · {formatDateTime(b.created_at)}</small></div><form action={resolveBlockerAction.bind(null, id, b.id)}><button className="link-btn">Resolve</button></form></div>)}
          <form action={addBlockerAction.bind(null, id)} className="form-stack compact top-gap"><label>Reason<select name="category"><option value="awaiting_parts">Awaiting parts</option><option value="awaiting_procurement">Awaiting procurement</option><option value="awaiting_transport">Awaiting transport</option><option value="awaiting_contractor">Awaiting contractor</option><option value="awaiting_approval">Awaiting approval</option><option value="technical_issue">Technical issue</option><option value="staff_unavailable">Staff unavailable</option><option value="other">Other</option></select></label><label>Details<textarea name="note" rows={3} required /></label><label className="check"><input type="checkbox" name="escalated_to_hod" /> Escalate to HOD</label><button className="btn secondary">Add blocker</button></form>
        </Card>
      </div>
    </div>
  </>;
}

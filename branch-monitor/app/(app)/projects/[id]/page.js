import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApprovedUser } from "@/lib/auth";
import { Badge, Card, PageHeader } from "@/components/UI";
import { formatDate } from "@/lib/format";

function money(value) {
  if (value == null || value === "") return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value));
}

function yesNo(done, date) {
  if (!done) return { label: "Not recorded", tone: "status-planned", detail: "—" };
  return { label: "Completed", tone: "status-completed", detail: date ? formatDate(date) : "Date not recorded" };
}

export default async function ProjectDetailPage({ params }) {
  const { id } = await params;
  const { supabase } = await requireApprovedUser();

  const [projectRes, tasksRes, responsibilityRes, timelineRes, sectionsRes] = await Promise.all([
    supabase.from("projects").select("*,units:lead_unit_id(id,code,name),powerhouses(id,name,islands(id,name,atolls(code,name)))").eq("id", id).maybeSingle(),
    supabase.from("project_record_tasks").select("*").eq("project_id", id).order("sort_order"),
    supabase.from("project_responsibilities").select("*").eq("project_id", id).order("sort_order"),
    supabase.from("project_timeline_entries").select("*").eq("project_id", id).order("event_date"),
    supabase.from("project_record_sections").select("*").eq("project_id", id).order("sort_order"),
  ]);

  const project = projectRes.data;
  if (!project) notFound();

  const tasks = tasksRes.data || [];
  const responsibilities = responsibilityRes.data || [];
  const timeline = timelineRes.data || [];
  const sections = sectionsRes.data || [];
  const drawings = sections.filter((x) => x.section_type === "drawing");
  const workPhotos = sections.filter((x) => x.section_type === "work_photo");
  const progressPhotos = sections.filter((x) => x.section_type === "progress_photo");

  const survey = yesNo(project.site_survey_done, project.site_survey_date);
  const structural = yesNo(project.structural_drawing_done, project.structural_drawing_date);
  const schedule = yesNo(project.work_schedule_done, project.work_schedule_date);

  return <div className="project-record-page">
    <div className="breadcrumbs">
      <Link href="/projects">Projects</Link><span>›</span><strong>{project.code}</strong>
    </div>

    <PageHeader
      eyebrow={project.code}
      title={project.title}
      description={project.location_text || project.powerhouses?.name}
    />

    <div className="project-record-hero">
      <div>
        <span>Current status</span>
        <Badge tone={project.status === "completed" ? "status-completed" : `status-${project.status}`}>
          {String(project.status).replaceAll("_", " ")}
        </Badge>
      </div>
      <div><span>Progress</span><strong>{project.progress_override ?? (project.status === "completed" ? 100 : 0)}%</strong></div>
      <div><span>Start date</span><strong>{formatDate(project.start_date)}</strong></div>
      <div><span>Completion date</span><strong>{formatDate(project.completion_date)}</strong></div>
      <div><span>Last update</span><strong>{formatDate(project.last_progress_update)}</strong></div>
    </div>

    <div className="project-record-grid">
      <Card className="project-record-span">
        <div className="eyebrow">Project scope</div>
        <h2>Scope of works</h2>
        <p className="project-scope">{project.scope || "No scope recorded."}</p>
      </Card>

      <Card>
        <div className="eyebrow">Financial record</div>
        <h2>Budget & expenditure</h2>
        <dl className="record-kv">
          <div><dt>Budget</dt><dd>MVR {money(project.budget)}</dd></div>
          <div><dt>Exp SRD</dt><dd>MVR {money(project.exp_srd)}</dd></div>
          <div><dt>Exp Corporate</dt><dd>{project.exp_corporate == null ? "—" : `MVR ${money(project.exp_corporate)}`}</dd></div>
          <div><dt>Allowance</dt><dd>{project.allowance == null ? "—" : `MVR ${money(project.allowance)}`}</dd></div>
          <div><dt>Total Cost</dt><dd>{project.total_cost == null ? "—" : `MVR ${money(project.total_cost)}`}</dd></div>
        </dl>
      </Card>

      <Card>
        <div className="eyebrow">Project information</div>
        <h2>Record details</h2>
        <dl className="record-kv">
          <div><dt>Location</dt><dd>{project.location_text || "—"}</dd></div>
          <div><dt>Lead unit</dt><dd>{project.units?.name || "—"}</dd></div>
          <div><dt>Powerhouse</dt><dd>{project.powerhouses?.name || "—"}</dd></div>
          <div><dt>Atoll / Island</dt><dd>{project.powerhouses?.islands ? `${project.powerhouses.islands.atolls?.code} · ${project.powerhouses.islands.name}` : "—"}</dd></div>
        </dl>
      </Card>

      <Card className="project-record-span">
        <div className="eyebrow">Project controls</div>
        <h2>Survey, drawing & schedule</h2>
        <div className="project-control-grid">
          <div><span>Site Visit / Survey</span><Badge tone={survey.tone}>{survey.label}</Badge><strong>{survey.detail}</strong></div>
          <div><span>Structural Drawing</span><Badge tone={structural.tone}>{structural.label}</Badge><strong>{structural.detail}</strong></div>
          <div><span>Work Schedule</span><Badge tone={schedule.tone}>{schedule.label}</Badge><strong>{schedule.detail}</strong></div>
        </div>
      </Card>

      <Card className="project-record-span">
        <div className="card-head">
          <div><div className="eyebrow">Work record</div><h2>Project work sections</h2></div>
          <Badge tone="status-completed">{tasks.length} sections</Badge>
        </div>
        <div className="table-wrap">
          <table className="project-task-table">
            <thead><tr><th>#</th><th>Task</th><th>Details</th><th>Progress</th></tr></thead>
            <tbody>
              {tasks.map((task) => <tr key={task.id}>
                <td><strong>{task.sort_order}</strong></td>
                <td><strong>{task.title}</strong></td>
                <td>{task.details || "—"}</td>
                <td><Badge tone={task.progress === 100 ? "status-completed" : "status-active"}>{task.progress}%</Badge></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div className="eyebrow">Responsibility</div>
        <h2>Project personnel</h2>
        <div className="responsibility-list">
          {responsibilities.map((person) => <div key={person.id}>
            <span>{person.responsibility_role}</span>
            <strong>{person.person_name}</strong>
            <small>{person.designation || "—"}</small>
          </div>)}
        </div>
      </Card>

      <Card>
        <div className="eyebrow">Record contents</div>
        <h2>Drawings & photo record</h2>
        <div className="record-media-index">
          {drawings.map((item) => <div key={item.id}><strong>{item.title}</strong><span>{item.details || "Recorded"}</span></div>)}
          {workPhotos.length > 0 && <div className="record-media-group"><strong>Work details in photos</strong><span>{workPhotos.length} recorded categories</span></div>}
          {progressPhotos.length > 0 && <div className="record-media-group"><strong>Progress in pictures</strong><span>{progressPhotos.length} recorded months</span></div>}
        </div>
      </Card>

      <Card className="project-record-span">
        <div className="eyebrow">Timeline & notes</div>
        <h2>Project history</h2>
        <div className="project-history">
          {timeline.map((entry) => <div key={entry.id}>
            <time>{formatDate(entry.event_date)}</time>
            <p>{entry.note}</p>
          </div>)}
        </div>
      </Card>

      <Card className="project-record-span">
        <div className="eyebrow">Photo record index</div>
        <h2>Work details in photos</h2>
        <div className="photo-index-grid">
          {workPhotos.map((item) => <div key={item.id}>
            <strong>{item.title}</strong>
            <span>{item.period_text || "Period not recorded"}</span>
            {item.details && <small>{item.details}</small>}
          </div>)}
        </div>
        <div className="record-divider" />
        <div className="eyebrow">Progress in pictures</div>
        <div className="progress-months">
          {progressPhotos.map((item) => <span key={item.id}>{item.period_text}</span>)}
        </div>
      </Card>
    </div>
  </div>;
}

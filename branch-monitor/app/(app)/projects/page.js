import Link from "next/link";
import { requireApprovedUser } from "@/lib/auth";
import { Badge, PageHeader, Stat } from "@/components/UI";
import { formatDate } from "@/lib/format";

function money(value) {
  if (value == null || value === "") return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value));
}

export default async function ProjectsPage() {
  const { supabase, profile } = await requireApprovedUser();

  const { data: projects = [], error } = await supabase
    .from("projects")
    .select("id,code,title,status,scope,location_text,budget,exp_srd,exp_corporate,allowance,total_cost,start_date,completion_date,last_progress_update,progress_override,units:lead_unit_id(name),powerhouses(id,name,islands(id,name,atolls(code,name))),project_record_tasks(id)")
    .order("start_date", { ascending: false });

  const completed = projects.filter((p) => p.status === "completed").length;
  const active = projects.filter((p) => p.status === "active").length;
  const totalBudget = projects.reduce((sum, p) => sum + Number(p.budget || 0), 0);
  const totalExp = projects.reduce((sum, p) => sum + Number(p.exp_srd || 0), 0);
  const canCreate = ["developer", "hod", "unit_head"].includes(profile?.role);

  return <>
    <PageHeader
      eyebrow="Project records"
      title="Projects"
      description="Digital project records for SRD projects and major works."
      actions={canCreate ? <Link href="/projects/new" className="btn primary">New project record</Link> : null}
    />

    {error && <p className="alert danger" role="alert">Project records could not be loaded. Reload the page to retry.</p>}

    <div className="stats-grid">
      <Stat label="Projects" value={projects.length} hint="Digital project records" />
      <Stat label="Active" value={active} hint="Currently recorded as active" />
      <Stat label="Completed" value={completed} hint="Completed project records" />
      <Stat label="Recorded budget" value={`MVR ${money(totalBudget)}`} hint={totalExp ? `SRD expenditure MVR ${money(totalExp)}` : "No expenditure recorded"} />
    </div>

    <div className="project-register-list">
      {projects.map((project) => {
        const atoll = project.powerhouses?.islands?.atolls?.code;
        const island = project.powerhouses?.islands?.name;
        const location = project.location_text || [atoll, island].filter(Boolean).join(" · ") || "Location not recorded";
        return <Link key={project.id} href={`/projects/${project.id}`} className="project-register-card">
          <div className="project-register-top">
            <div>
              <div className="eyebrow">{project.code}</div>
              <h2>{project.title}</h2>
              <p>{location}</p>
            </div>
            <Badge tone={project.status === "completed" ? "status-completed" : project.status === "active" ? "status-active" : `status-${project.status}`}>
              {String(project.status).replaceAll("_", " ")}
            </Badge>
          </div>

          <div className="project-register-metrics">
            <div><span>Start</span><strong>{formatDate(project.start_date)}</strong></div>
            <div><span>Completion</span><strong>{formatDate(project.completion_date)}</strong></div>
            <div><span>Progress</span><strong>{project.progress_override ?? (project.status === "completed" ? 100 : 0)}%</strong></div>
            <div><span>Budget</span><strong>MVR {money(project.budget)}</strong></div>
            <div><span>SRD expenditure</span><strong>MVR {money(project.exp_srd)}</strong></div>
            <div><span>Work sections</span><strong>{project.project_record_tasks?.length || 0}</strong></div>
          </div>

          <div className="project-register-bottom">
            <span>{project.scope || "Scope not recorded"}</span>
            <strong>Open project record →</strong>
          </div>
        </Link>;
      })}
    </div>
  </>;
}

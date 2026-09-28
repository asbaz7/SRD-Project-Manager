import Link from "next/link";
import { requireApprovedUser } from "@/lib/auth";
import { Badge, PageHeader, Stat } from "@/components/UI";

function monthLabel(value) {
  if (!value) return "No report";
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value + "T00:00:00Z"));
}

export default async function EngineReportsPage() {
  const { supabase } = await requireApprovedUser();
  const [{ data: powerhouses = [] }, { data: reports = [] }] = await Promise.all([
    supabase.from("powerhouses").select("id,name,islands(id,name,atolls(code,name))").eq("active", true),
    supabase.from("engine_condition_reports").select("id,powerhouse_id,report_month,record_updated_date,report_status").order("report_month", { ascending: false }),
  ]);

  const latest = new Map();
  for (const report of reports) if (!latest.has(report.powerhouse_id)) latest.set(report.powerhouse_id, report);

  const atollOrder = ["ADh", "K", "M", "V"];
  const rows = [...powerhouses].sort((a, b) => {
    const ac = a.islands?.atolls?.code || "";
    const bc = b.islands?.atolls?.code || "";
    return atollOrder.indexOf(ac) - atollOrder.indexOf(bc) ||
      (a.islands?.name || "").localeCompare(b.islands?.name || "") ||
      (a.name || "").localeCompare(b.name || "");
  });

  const reported = rows.filter((p) => latest.has(p.id)).length;

  return <>
    <PageHeader
      eyebrow="Monthly reporting"
      title="Engine condition reports"
      description="Website replacement for the monthly powerhouse engine-condition spreadsheets."
    />

    <div className="stats-grid">
      <Stat label="Powerhouses" value={rows.length} hint="Available for monthly reporting" />
      <Stat label="With reports" value={reported} hint="At least one digital report" />
      <Stat label="Awaiting first report" value={rows.length - reported} hint="No digital report yet" />
      <Stat label="Report fields" value="Complete" hint="Engine, dynamo, maintenance, hours & load" />
    </div>

    <div className="engine-report-index">
      {atollOrder.map((code) => {
        const group = rows.filter((p) => p.islands?.atolls?.code === code);
        if (!group.length) return null;
        return <section key={code} className="engine-report-atoll">
          <div className="engine-report-atoll-head">
            <div><div className="eyebrow">Atoll</div><h2>{code} · {group[0]?.islands?.atolls?.name}</h2></div>
            <span>{group.length} powerhouses</span>
          </div>
          <div className="engine-report-powerhouse-list">
            {group.map((powerhouse) => {
              const report = latest.get(powerhouse.id);
              return <Link key={powerhouse.id} href={`/powerhouses/${powerhouse.id}/engine-reports`} className="engine-report-powerhouse-row">
                <div>
                  <strong>{powerhouse.islands?.name}</strong>
                  <span>{powerhouse.name}</span>
                </div>
                <div className="engine-report-latest">
                  <span>Latest report</span>
                  <strong>{monthLabel(report?.report_month)}</strong>
                </div>
                <Badge tone={report ? "status-completed" : "status-planned"}>{report ? "Reporting" : "Not started"}</Badge>
                <b>→</b>
              </Link>;
            })}
          </div>
        </section>;
      })}
    </div>
  </>;
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApprovedUser } from "@/lib/auth";
import { Badge, Card, PageHeader, Stat } from "@/components/UI";
import { formatDate } from "@/lib/format";

function monthLabel(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(value + "T00:00:00Z"));
}

export default async function PowerhouseEngineReportsPage({ params }) {
  const { id } = await params;
  const { supabase, profile } = await requireApprovedUser();
  const canEdit = ["developer", "hod", "unit_head"].includes(profile?.role);

  const [{ data: powerhouse }, { data: reports = [] }, { count: gensetCount = 0 }] = await Promise.all([
    supabase.from("powerhouses").select("id,name,islands(id,name,atolls(code,name))").eq("id", id).maybeSingle(),
    supabase.from("engine_condition_reports").select("id,report_month,maximum_peak_kw,monthly_peak_kw,record_updated_date,report_status").eq("powerhouse_id", id).order("report_month", { ascending: false }),
    supabase.from("gensets").select("id", { count: "exact", head: true }).eq("powerhouse_id", id),
  ]);
  if (!powerhouse) notFound();

  const latest = reports[0];

  return <>
    <div className="breadcrumbs">
      <Link href="/engine-reports">Engine reports</Link><span>›</span>
      <Link href={`/atolls/${encodeURIComponent(powerhouse.islands.atolls.code)}`}>{powerhouse.islands.atolls.code}</Link><span>›</span>
      <Link href={`/islands/${powerhouse.islands.id}`}>{powerhouse.islands.name}</Link><span>›</span>
      <strong>{powerhouse.name}</strong>
    </div>

    <PageHeader
      eyebrow="Engine condition reports"
      title={powerhouse.name}
      description={`${powerhouse.islands.atolls.code} Atoll · ${powerhouse.islands.name}`}
      actions={canEdit ? <Link href={`/powerhouses/${id}/engine-reports/new`} className="btn primary">New monthly report</Link> : null}
    />

    <div className="stats-grid">
      <Stat label="Gensets" value={gensetCount} hint="Listed under this powerhouse" />
      <Stat label="Reports" value={reports.length} hint="Digital monthly records" />
      <Stat label="Latest month" value={latest ? monthLabel(latest.report_month) : "—"} />
      <Stat label="Latest update" value={latest ? formatDate(latest.record_updated_date) : "—"} />
    </div>

    <Card>
      <div className="card-head"><div><div className="eyebrow">Report history</div><h2>Monthly engine condition records</h2></div></div>
      {reports.length === 0 ? <p className="muted">No digital engine-condition reports have been entered for this powerhouse yet.</p> :
        <div className="table-wrap"><table>
          <thead><tr><th>Month</th><th>Record status</th><th>Maximum island peak</th><th>Monthly peak</th><th>Updated</th><th></th></tr></thead>
          <tbody>{reports.map((report) => <tr key={report.id}>
            <td><strong>{monthLabel(report.report_month)}</strong></td>
            <td><Badge tone={report.report_status === "submitted" ? "status-completed" : "status-planned"}>{report.report_status}</Badge></td>
            <td>{report.maximum_peak_kw == null ? "—" : `${report.maximum_peak_kw} kW`}</td>
            <td>{report.monthly_peak_kw == null ? "—" : `${report.monthly_peak_kw} kW`}</td>
            <td>{formatDate(report.record_updated_date)}</td>
            <td>{canEdit ? <Link href={`/powerhouses/${id}/engine-reports/new?month=${report.report_month.slice(0,7)}`} className="btn secondary">Open / edit</Link> : null}</td>
          </tr>)}</tbody>
        </table></div>}
    </Card>
  </>;
}

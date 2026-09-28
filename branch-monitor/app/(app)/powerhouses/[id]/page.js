import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApprovedUser } from "@/lib/auth";
import { Badge, Card, PageHeader, Stat } from "@/components/UI";

function conditionTone(status) {
  if (status === "normal") return "status-completed";
  if (status === "attention") return "priority-high";
  if (status === "critical" || status === "out_of_service") return "priority-critical";
  return "status-planned";
}

function conditionLabel(status) {
  if (status === "normal") return "Running";
  if (status === "attention") return "Minor fault";
  if (status === "critical") return "Major fault";
  if (status === "out_of_service") return "Out of service";
  return "No report";
}

function sortGensets(a, b) {
  const ai = Number.parseInt(String(a.genset_number).replace(/\D/g, ""), 10);
  const bi = Number.parseInt(String(b.genset_number).replace(/\D/g, ""), 10);
  if (Number.isFinite(ai) && Number.isFinite(bi) && ai !== bi) return ai - bi;
  return String(a.genset_number).localeCompare(String(b.genset_number));
}

export default async function PowerhousePage({ params }) {
  const { id } = await params;
  const { supabase, profile } = await requireApprovedUser();
  const canEditReports = ["developer", "hod", "unit_head"].includes(profile?.role);

  const [{ data: powerhouse }, { data: latestReport }] = await Promise.all([
    supabase
      .from("powerhouses")
      .select("id,name,operational_status,islands(id,name,atolls(id,code,name)),gensets(id,genset_number,model,rated_kw,operating_kw,reported_condition,condition_status,issue_note)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("engine_condition_reports")
      .select("report_month")
      .eq("powerhouse_id", id)
      .eq("report_status", "submitted")
      .order("report_month", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!powerhouse) notFound();

  const gensets = [...(powerhouse.gensets || [])].sort(sortGensets);
  const running = gensets.filter((g) => g.condition_status === "normal").length;
  const attention = gensets.filter((g) => g.condition_status === "attention").length;
  const critical = gensets.filter((g) => ["critical", "out_of_service"].includes(g.condition_status)).length;
  const unreported = gensets.filter((g) => g.condition_status === "unknown").length;
  const issueCount = attention + critical;
  const reportMonth = latestReport?.report_month
    ? new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(latestReport.report_month + "T00:00:00Z"))
    : null;
  const island = powerhouse.islands;
  const atoll = island.atolls;

  return <>
    <div className="breadcrumbs">
      <Link href="/dashboard">Atolls</Link><span>›</span>
      <Link href={`/atolls/${encodeURIComponent(atoll.code)}`}>{atoll.code}</Link><span>›</span>
      <Link href={`/islands/${island.id}`}>{island.name}</Link><span>›</span>
      <strong>{powerhouse.name}</strong>
    </div>

    <PageHeader
      eyebrow={`${atoll.code} Atoll · ${island.name} · Powerhouse`}
      title={powerhouse.name}
      description={reportMonth
        ? `Genset conditions are taken from the latest submitted engine condition report (${reportMonth}).`
        : "No engine condition report has been submitted yet, so genset conditions are unknown."}
      actions={<>
        <Link href={`/powerhouses/${id}/engine-reports`} className="btn secondary">Engine condition reports</Link>
        {canEditReports && <Link href={`/powerhouses/${id}/engine-reports/new`} className="btn primary">Update via monthly report</Link>}
      </>}
    />

    <div className="stats-grid">
      <Stat label="Gensets" value={gensets.length} />
      <Stat label="Running" value={running} />
      <Stat label="Minor faults" value={attention} tone={attention ? "danger" : ""} />
      <Stat label="Major / unavailable" value={critical} tone={critical ? "danger" : ""} />
      {unreported > 0 && <Stat label="No report" value={unreported} hint="Not in a submitted engine report" />}
    </div>

    {issueCount > 0 && <Card>
      <div className="card-head">
        <div>
          <div className="eyebrow">Requires attention</div>
          <h2>Current genset issues</h2>
        </div>
      </div>
      <div className="compact-list">
        {gensets.filter((g) => ["attention", "critical", "out_of_service"].includes(g.condition_status)).map((g) => <div key={g.id}>
          <span>Genset {g.genset_number} · {g.model}</span>
          <Badge tone={conditionTone(g.condition_status)}>{conditionLabel(g.condition_status)}</Badge>
          <small>{g.issue_note || g.reported_condition || "No fault details recorded"}</small>
        </div>)}
      </div>
    </Card>}

    <Card>
      <div className="card-head">
        <div>
          <div className="eyebrow">Gensets</div>
          <h2>{powerhouse.name}</h2>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Genset</th>
              <th>Model</th>
              <th>Rated</th>
              <th>Operating</th>
              <th>Condition</th>
              <th>Reported status</th>
            </tr>
          </thead>
          <tbody>
            {gensets.map((g) => <tr key={g.id}>
              <td><strong>{g.genset_number}</strong></td>
              <td>{g.model}</td>
              <td>{g.rated_kw == null ? "—" : `${g.rated_kw} kW`}</td>
              <td>{g.operating_kw == null ? "—" : `${g.operating_kw} kW`}</td>
              <td>
                <Badge tone={conditionTone(g.condition_status)}>{conditionLabel(g.condition_status)}</Badge>
                {g.issue_note && <><br/><small>{g.issue_note}</small></>}
              </td>
              <td><span className="muted">{g.reported_condition || "—"}</span></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </Card>
  </>;
}

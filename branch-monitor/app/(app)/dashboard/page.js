import Link from "next/link";
import { requireApprovedUser } from "@/lib/auth";
import { Badge, PageHeader, Stat } from "@/components/UI";

function faultTone(critical, attention) {
  if (critical) return "priority-critical";
  if (attention) return "priority-high";
  return "status-completed";
}

export default async function DashboardPage() {
  const { supabase } = await requireApprovedUser();

  const { data: summaries = [], error } = await supabase
    .from("operations_atoll_summary")
    .select("id,code,name,island_count,powerhouse_count,genset_count,attention_count,critical_count")
    .in("code", ["ADh", "K", "M", "V"]);

  const atollOrder = ["ADh", "K", "M", "V"];
  summaries.sort((a, b) => atollOrder.indexOf(a.code) - atollOrder.indexOf(b.code));

  const totalPowerhouses = summaries.reduce((sum, x) => sum + Number(x.powerhouse_count || 0), 0);
  const totalGensets = summaries.reduce((sum, x) => sum + Number(x.genset_count || 0), 0);
  const totalIssues = summaries.reduce((sum, x) => sum + Number(x.attention_count || 0) + Number(x.critical_count || 0), 0);
  const totalCritical = summaries.reduce((sum, x) => sum + Number(x.critical_count || 0), 0);

  return <>
    <PageHeader
      eyebrow="Electricity continuity"
      title="Powerhouse operations"
      description="Navigate by operational hierarchy: Atoll → Island → Powerhouse → Genset."
    />

    {error && <p className="alert danger" role="alert">The powerhouse register could not be loaded. Reload the page to retry.</p>}

    <div className="stats-grid">
      <Stat label="Atolls" value={summaries.length} hint="Operational areas" />
      <Stat label="Powerhouses" value={totalPowerhouses} hint="Land powerhouses" />
      <Stat label="Gensets" value={totalGensets} hint="Registered units" />
      <Stat label="Issues" value={totalIssues} tone={totalIssues ? "danger" : ""} hint={totalCritical ? `${totalCritical} major / out of service` : "No current genset issues"} />
    </div>

    {totalIssues > 0 && <div className="alert danger">
      <strong>{totalIssues} genset issue{totalIssues === 1 ? "" : "s"} currently recorded.</strong> Drill down through the affected atoll to view the powerhouse and genset.
    </div>}

    <div className="atoll-list">
      {summaries.map((atoll) => {
        const issues = Number(atoll.attention_count || 0) + Number(atoll.critical_count || 0);
        return <Link key={atoll.id} href={`/atolls/${encodeURIComponent(atoll.code)}`} className="atoll-nav-card">
          <div className="atoll-nav-main">
            <div className="atoll-nav-title">
              <div className="eyebrow">Atoll</div>
              <h2>{atoll.code} · {atoll.name}</h2>
            </div>
            <Badge tone={faultTone(Number(atoll.critical_count || 0), Number(atoll.attention_count || 0))}>
              {Number(atoll.critical_count || 0) ? "Critical" : Number(atoll.attention_count || 0) ? "Attention" : "Normal"}
            </Badge>
          </div>
          <div className="atoll-nav-metrics">
            <div><strong>{atoll.island_count}</strong><span>Islands</span></div>
            <div><strong>{atoll.powerhouse_count}</strong><span>Powerhouses</span></div>
            <div><strong>{atoll.genset_count}</strong><span>Gensets</span></div>
          </div>
          <div className="atoll-nav-footer">
            <span>{issues ? `${issues} genset issue${issues === 1 ? "" : "s"}` : "No genset issues recorded"}</span>
            <span className="atoll-nav-action">View islands <b>→</b></span>
          </div>
        </Link>;
      })}
    </div>
  </>;
}

import Link from "next/link";
import { requireApprovedUser } from "@/lib/auth";
import { Badge, Card, PageHeader, Stat } from "@/components/UI";

function faultTone(critical, attention) {
  if (critical) return "priority-critical";
  if (attention) return "priority-high";
  return "status-completed";
}

export default async function DashboardPage() {
  const { supabase } = await requireApprovedUser();

  const { data: atolls = [], error } = await supabase
    .from("atolls")
    .select("id,code,name,islands(id,name,powerhouses(id,name,gensets(id,condition_status)))")
    .in("code", ["K", "ADh", "V", "M"])
    .order("code");

  const summaries = atolls.map((atoll) => {
    const islands = atoll.islands || [];
    const powerhouses = islands.flatMap((island) => island.powerhouses || []);
    const gensets = powerhouses.flatMap((powerhouse) => powerhouse.gensets || []);
    const attention = gensets.filter((g) => g.condition_status === "attention").length;
    const critical = gensets.filter((g) => ["critical", "out_of_service"].includes(g.condition_status)).length;
    return {
      ...atoll,
      islandCount: islands.length,
      powerhouseCount: powerhouses.length,
      gensetCount: gensets.length,
      attention,
      critical,
      issues: attention + critical,
    };
  });

  const totalPowerhouses = summaries.reduce((sum, x) => sum + x.powerhouseCount, 0);
  const totalGensets = summaries.reduce((sum, x) => sum + x.gensetCount, 0);
  const totalIssues = summaries.reduce((sum, x) => sum + x.issues, 0);
  const totalCritical = summaries.reduce((sum, x) => sum + x.critical, 0);

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

    <div className="hierarchy-grid">
      {summaries.map((atoll) => <Link key={atoll.id} href={`/atolls/${encodeURIComponent(atoll.code)}`} className="hierarchy-card">
        <div className="hierarchy-card-head">
          <div>
            <div className="eyebrow">Atoll</div>
            <h2>{atoll.code} · {atoll.name}</h2>
          </div>
          <Badge tone={faultTone(atoll.critical, atoll.attention)}>
            {atoll.critical ? "Critical" : atoll.attention ? "Attention" : "Normal"}
          </Badge>
        </div>
        <div className="hierarchy-metrics">
          <span><strong>{atoll.islandCount}</strong> islands</span>
          <span><strong>{atoll.powerhouseCount}</strong> powerhouses</span>
          <span><strong>{atoll.gensetCount}</strong> gensets</span>
        </div>
        <div className="hierarchy-footer">
          <span>{atoll.issues ? `${atoll.issues} genset issue${atoll.issues === 1 ? "" : "s"}` : "No genset issues recorded"}</span>
          <strong>View islands →</strong>
        </div>
      </Link>)}
    </div>
  </>;
}

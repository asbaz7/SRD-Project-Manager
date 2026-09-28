import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApprovedUser } from "@/lib/auth";
import { Badge, PageHeader, Stat } from "@/components/UI";

function faultTone(critical, attention) {
  if (critical) return "priority-critical";
  if (attention) return "priority-high";
  return "status-completed";
}

export default async function IslandPage({ params }) {
  const { id } = await params;
  const { supabase } = await requireApprovedUser();

  const { data: island } = await supabase
    .from("islands")
    .select("id,name,atolls(id,code,name),powerhouses(id,name,operational_status,gensets(id,condition_status))")
    .eq("id", id)
    .maybeSingle();

  if (!island) notFound();

  const powerhouses = (island.powerhouses || []).map((powerhouse) => {
    const gensets = powerhouse.gensets || [];
    const attention = gensets.filter((g) => g.condition_status === "attention").length;
    const critical = gensets.filter((g) => ["critical", "out_of_service"].includes(g.condition_status)).length;
    return {
      ...powerhouse,
      gensetCount: gensets.length,
      attention,
      critical,
      issues: attention + critical,
    };
  });

  const gensetCount = powerhouses.reduce((sum, x) => sum + x.gensetCount, 0);
  const issueCount = powerhouses.reduce((sum, x) => sum + x.issues, 0);

  return <>
    <div className="breadcrumbs">
      <Link href="/dashboard">Atolls</Link><span>›</span>
      <Link href={`/atolls/${encodeURIComponent(island.atolls.code)}`}>{island.atolls.code}</Link><span>›</span>
      <strong>{island.name}</strong>
    </div>
    <PageHeader
      eyebrow={`${island.atolls.code} Atoll · Island`}
      title={island.name}
      description="Select a powerhouse to view its gensets and recorded conditions."
    />

    <div className="stats-grid">
      <Stat label="Powerhouses" value={powerhouses.length} />
      <Stat label="Gensets" value={gensetCount} />
      <Stat label="Running" value={gensetCount - issueCount} />
      <Stat label="Issues" value={issueCount} tone={issueCount ? "danger" : ""} hint={issueCount ? "Requires review" : "No current genset issues"} />
    </div>

    <div className="hierarchy-grid">
      {powerhouses.map((powerhouse) => <Link key={powerhouse.id} href={`/powerhouses/${powerhouse.id}`} className="hierarchy-card">
        <div className="hierarchy-card-head">
          <div>
            <div className="eyebrow">Powerhouse</div>
            <h2>{powerhouse.name}</h2>
          </div>
          <Badge tone={faultTone(powerhouse.critical, powerhouse.attention)}>
            {powerhouse.critical ? "Critical" : powerhouse.attention ? "Attention" : "Normal"}
          </Badge>
        </div>
        <div className="hierarchy-metrics">
          <span><strong>{powerhouse.gensetCount}</strong> gensets</span>
          <span><strong>{powerhouse.gensetCount - powerhouse.issues}</strong> running</span>
        </div>
        <div className="hierarchy-footer">
          <span>{powerhouse.issues ? `${powerhouse.issues} genset issue${powerhouse.issues === 1 ? "" : "s"}` : "No genset issues recorded"}</span>
          <strong>View gensets →</strong>
        </div>
      </Link>)}
    </div>
  </>;
}

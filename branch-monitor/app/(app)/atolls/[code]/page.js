import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApprovedUser } from "@/lib/auth";
import { Badge, PageHeader, Stat } from "@/components/UI";

function faultTone(critical, attention) {
  if (critical) return "priority-critical";
  if (attention) return "priority-high";
  return "status-completed";
}

export default async function AtollPage({ params }) {
  const { code } = await params;
  const { supabase } = await requireApprovedUser();

  const { data: atoll } = await supabase
    .from("atolls")
    .select("id,code,name")
    .eq("code", decodeURIComponent(code))
    .maybeSingle();

  if (!atoll) notFound();

  const { data: islands = [] } = await supabase
    .from("islands")
    .select("id,name,powerhouses(id,name,gensets(id,condition_status))")
    .eq("atoll_id", atoll.id)
    .eq("active", true)
    .order("name");

  const rows = islands.map((island) => {
    const powerhouses = island.powerhouses || [];
    const gensets = powerhouses.flatMap((p) => p.gensets || []);
    const attention = gensets.filter((g) => g.condition_status === "attention").length;
    const critical = gensets.filter((g) => ["critical", "out_of_service"].includes(g.condition_status)).length;
    return {
      ...island,
      powerhouseCount: powerhouses.length,
      gensetCount: gensets.length,
      attention,
      critical,
      issues: attention + critical,
    };
  });

  const gensetCount = rows.reduce((sum, x) => sum + x.gensetCount, 0);
  const issueCount = rows.reduce((sum, x) => sum + x.issues, 0);

  return <>
    <div className="breadcrumbs">
      <Link href="/dashboard">Atolls</Link><span>›</span><strong>{atoll.code}</strong>
    </div>
    <PageHeader
      eyebrow="Atoll"
      title={`${atoll.code} · ${atoll.name}`}
      description="Select an island to view its powerhouse operations."
    />

    <div className="stats-grid">
      <Stat label="Islands" value={rows.length} hint="With registered powerhouses" />
      <Stat label="Powerhouses" value={rows.reduce((sum, x) => sum + x.powerhouseCount, 0)} />
      <Stat label="Gensets" value={gensetCount} />
      <Stat label="Issues" value={issueCount} tone={issueCount ? "danger" : ""} hint={issueCount ? "Requires review" : "No current genset issues"} />
    </div>

    <div className="hierarchy-grid">
      {rows.map((island) => <Link key={island.id} href={`/islands/${island.id}`} className="hierarchy-card">
        <div className="hierarchy-card-head">
          <div>
            <div className="eyebrow">Island</div>
            <h2>{island.name}</h2>
          </div>
          <Badge tone={faultTone(island.critical, island.attention)}>
            {island.critical ? "Critical" : island.attention ? "Attention" : "Normal"}
          </Badge>
        </div>
        <div className="hierarchy-metrics">
          <span><strong>{island.powerhouseCount}</strong> powerhouse{island.powerhouseCount === 1 ? "" : "s"}</span>
          <span><strong>{island.gensetCount}</strong> gensets</span>
        </div>
        <div className="hierarchy-footer">
          <span>{island.issues ? `${island.issues} genset issue${island.issues === 1 ? "" : "s"}` : "No genset issues recorded"}</span>
          <strong>View powerhouse →</strong>
        </div>
      </Link>)}
    </div>
  </>;
}

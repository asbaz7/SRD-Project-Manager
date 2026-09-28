import Link from "next/link";
import { notFound } from "next/navigation";
import { getIsland, kw } from "@/lib/data";
import { Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function conditionLabel(status) {
  if (status === "attention") return "Minor fault";
  if (status === "critical") return "Major fault";
  if (status === "out_of_service") return "Out of service";
  return "Running";
}

function conditionClass(status) {
  if (status === "attention") return "condition attention";
  if (status === "critical" || status === "out_of_service") return "condition critical";
  return "condition running";
}

export default async function IslandPage({ params }) {
  const { id } = await params;
  const island = UUID.test(id) ? await getIsland(id) : null;
  if (!island) notFound();
  const { atoll } = island;
  const issueCount = island.attentionCount + island.criticalCount;
  const allRunning = issueCount === 0 && island.gensetCount > 0;

  return <>
    <nav className="crumbs">
      <Link href="/">Overview</Link> › <Link href={`/atolls/${encodeURIComponent(atoll.code)}`}>{atoll.code}</Link> › {island.name}
    </nav>
    <h1>{island.name}</h1>

    <div className={allRunning ? "health-banner healthy" : "health-banner alert"}>
      <div>
        <span>Powerhouse genset condition</span>
        <strong>{allRunning ? "ALL GENSETS RUNNING" : `${issueCount} GENSETS REQUIRE ATTENTION`}</strong>
      </div>
      <div className="health-count">{island.runningCount} / {island.gensetCount} running</div>
    </div>

    <div className="stats">
      <Stat label="Gensets" value={island.gensetCount} />
      <Stat label="Running" value={`${island.runningCount} / ${island.gensetCount}`} />
      <Stat label="Issues / unavailable" value={issueCount} />
      <Stat label="Operating capacity" value={kw(island.operatingKw)} />
      <Stat label="Installed capacity" value={kw(island.ratedKw)} />
    </div>

    <section className="card">
      <h2>Gensets</h2>
      {island.gensets.length === 0 ? <p className="muted">No gensets recorded for this island.</p> :
        <table>
          <thead><tr><th>Genset</th><th>Condition</th><th className="hide-sm">Model</th><th className="num">Rated</th><th className="num">Operating</th></tr></thead>
          <tbody>{island.gensets.map((g) => <tr key={g.id}>
            <td><strong>{g.genset_number}</strong></td>
            <td>
              <span className={conditionClass(g.condition_status)}>
                <i aria-hidden="true" />{conditionLabel(g.condition_status)}
              </span>
              {g.condition_note && <div className="condition-note">{g.condition_note}</div>}
            </td>
            <td className="hide-sm">{g.model}</td>
            <td className="num">{kw(g.rated_kw)}</td>
            <td className="num">{kw(g.operating_kw)}</td>
          </tr>)}</tbody>
        </table>}
    </section>
  </>;
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { getIsland, kw, litres } from "@/lib/data";
import { ProjectStatus, SheetNotice, Stat, Status } from "@/components/ui";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function IslandPage({ params }) {
  const { id } = await params;
  const island = UUID.test(id) ? await getIsland(id) : null;
  if (!island) notFound();
  const { atoll } = island;
  const asOf = island.gensets.map((g) => g.status_date).filter(Boolean)
    .sort((a, b) => (Date.parse(a) || 0) - (Date.parse(b) || 0)).at(-1);
  const reported = island.runningCount + island.stoppedCount;
  const banner = reported === 0 ? null
    : island.stoppedCount > 0 ? { tone: "down", text: `✕ ${island.stoppedCount} of ${island.gensetCount} gensets not running` }
    : reported === island.gensetCount ? { tone: "ok", text: "● All gensets running" }
    : null;

  return <>
    <nav className="crumbs">
      <Link href="/">Overview</Link> › <Link href={`/atolls/${encodeURIComponent(atoll.code)}`}>{atoll.code}</Link> › {island.name}
    </nav>
    <h1>{island.name}</h1>
    <SheetNotice ok={island.sheetOk} />
    {banner && <div className={`banner ${banner.tone}`}>{banner.text}</div>}
    <div className="stats">
      <Stat label="Gensets running" value={`${island.runningCount} of ${island.gensetCount}`} />
      <Stat label="Not running" value={island.stoppedCount} tone={island.stoppedCount ? "alert" : ""} />
      <Stat label="Active projects" value={island.activeProjectCount} />
      <Stat label="Installed capacity" value={kw(island.ratedKw)} />
      <Stat label="Fuel storage" value={litres(island.fuelLitres)} />
    </div>

    <section className="card">
      <h2>Gensets{asOf && <span className="muted"> · status as of {asOf}</span>}</h2>
      {island.gensets.length === 0 ? <p className="muted">No gensets recorded for this island.</p> :
        <table>
          <thead><tr><th>Genset</th><th>Status</th><th className="hide-sm">Model</th><th className="num">Rated</th><th className="num hide-sm">Operating</th></tr></thead>
          <tbody>{island.gensets.map((g) => <tr key={g.id}>
            <td><strong>{g.genset_number}</strong></td>
            <td className="wrap">
              <Status running={g.running} />
              {g.status_note && <><br /><small className="muted">{g.status_note}</small></>}
            </td>
            <td className="hide-sm">{g.model}</td>
            <td className="num">{kw(g.rated_kw)}</td>
            <td className="num hide-sm">{kw(g.operating_kw)}</td>
          </tr>)}</tbody>
        </table>}
    </section>

    <section className="card">
      <h2>Projects</h2>
      {island.projects.length === 0 ? <p className="muted">No projects recorded for this island.</p> :
        <table>
          <thead><tr><th>Project</th><th>Latest update</th></tr></thead>
          <tbody>{island.projects.map((p, n) => <tr key={n}>
            <td className="wrap"><strong>{p.name}</strong><br /><ProjectStatus status={p.status} /></td>
            <td className="wrap">{p.update || <span className="muted">—</span>}{p.date && <><br /><small className="muted nowrap">{p.date}</small></>}</td>
          </tr>)}</tbody>
        </table>}
    </section>
  </>;
}

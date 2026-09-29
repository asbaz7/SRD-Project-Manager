import Link from "next/link";
import { getAtolls, kw, litres, total } from "@/lib/data";
import { CapacityBar, ProjectStatus, RunningSummary, SheetNotice, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const { atolls, sheetOk } = await getAtolls();
  const all = total(atolls);
  const max = Math.max(0, ...atolls.map((a) => a.ratedKw));
  const islands = atolls.flatMap((a) => a.islands.map((i) => ({ ...i, atoll: a.code })));
  const down = islands.flatMap((i) => i.gensets.filter((g) => g.running === false).map((g) => ({ ...g, island: i })));
  const projects = islands.flatMap((i) => i.projects.filter((p) => p.status !== "Completed").map((p) => ({ ...p, island: i })));

  return <>
    <h1>Overview</h1>
    <SheetNotice ok={sheetOk} />
    <div className="stats">
      <Stat label="Gensets running" value={`${all.runningCount} of ${all.gensetCount}`} />
      <Stat label="Not running" value={all.stoppedCount} tone={all.stoppedCount ? "alert" : ""} />
      <Stat label="Active projects" value={all.activeProjectCount} />
      <Stat label="Installed capacity" value={kw(all.ratedKw)} />
      <Stat label="Fuel storage" value={litres(all.fuelLitres)} />
    </div>

    {down.length > 0 && <section className="card">
      <h2>Gensets not running</h2>
      <table>
        <thead><tr><th>Island</th><th>Genset</th><th className="hide-sm">Model</th><th>Note</th></tr></thead>
        <tbody>{down.map((g) => <tr key={g.id}>
          <td><Link href={`/islands/${g.island.id}`}>{g.island.atoll} · {g.island.name}</Link></td>
          <td><strong>{g.genset_number}</strong></td>
          <td className="hide-sm">{g.model}</td>
          <td className="wrap">{g.status_note || <span className="muted">—</span>}</td>
        </tr>)}</tbody>
      </table>
    </section>}

    {projects.length > 0 && <section className="card">
      <h2>Active projects</h2>
      <table>
        <thead><tr><th>Island</th><th>Project</th><th>Status</th><th className="hide-sm">Latest update</th></tr></thead>
        <tbody>{projects.map((p, n) => <tr key={n}>
          <td><Link href={`/islands/${p.island.id}`}>{p.island.atoll} · {p.island.name}</Link></td>
          <td className="wrap">{p.name}</td>
          <td><ProjectStatus status={p.status} /></td>
          <td className="wrap hide-sm">{p.update || <span className="muted">—</span>}{p.date && <small className="muted nowrap"> · {p.date}</small>}</td>
        </tr>)}</tbody>
      </table>
    </section>}

    <section className="card">
      <h2>By atoll</h2>
      <table>
        <thead><tr><th>Atoll</th><th>Running</th><th className="num">Active projects</th><th className="num hide-sm">Fuel storage</th><th className="wide hide-sm">Installed capacity</th></tr></thead>
        <tbody>{atolls.map((a) => <tr key={a.code}>
          <td><Link href={`/atolls/${encodeURIComponent(a.code)}`}><strong>{a.code}</strong> · {a.name}</Link></td>
          <td><RunningSummary running={a.runningCount} stopped={a.stoppedCount} total={a.gensetCount} /></td>
          <td className="num">{a.activeProjectCount}</td>
          <td className="num hide-sm">{litres(a.fuelLitres)}</td>
          <td className="hide-sm"><CapacityBar value={a.ratedKw} max={max} /></td>
        </tr>)}</tbody>
      </table>
    </section>
  </>;
}

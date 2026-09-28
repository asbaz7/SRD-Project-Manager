import Link from "next/link";
import { getAtolls, kw, total } from "@/lib/data";
import { CapacityBar, RunningSummary, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const atolls = await getAtolls();
  const all = total(atolls);
  const islands = atolls.reduce((sum, a) => sum + a.islandCount, 0);
  const max = Math.max(0, ...atolls.map((a) => a.ratedKw));
  const down = atolls.flatMap((a) => a.islands.flatMap((i) =>
    i.gensets.filter((g) => g.running === false).map((g) => ({ ...g, atoll: a.code, island: i }))));

  return <>
    <h1>Overview</h1>
    <div className="stats">
      <Stat label="Gensets running" value={`${all.runningCount} of ${all.gensetCount}`} />
      <Stat label="Not running" value={all.stoppedCount} tone={all.stoppedCount ? "alert" : ""} />
      <Stat label="Installed capacity" value={kw(all.ratedKw)} />
      <Stat label="Islands" value={islands} />
    </div>

    {down.length > 0 && <section className="card">
      <h2>Gensets not running</h2>
      <table>
        <thead><tr><th>Island</th><th>Genset</th><th className="hide-sm">Model</th><th>Note</th></tr></thead>
        <tbody>{down.map((g) => <tr key={g.id}>
          <td><Link href={`/islands/${g.island.id}`}>{g.atoll} · {g.island.name}</Link></td>
          <td><strong>{g.genset_number}</strong></td>
          <td className="hide-sm">{g.model}</td>
          <td className="wrap">{g.status_note || <span className="muted">—</span>}</td>
        </tr>)}</tbody>
      </table>
    </section>}

    <section className="card">
      <h2>By atoll</h2>
      <table>
        <thead><tr><th>Atoll</th><th>Running</th><th className="num hide-sm">Gensets</th><th className="wide hide-sm">Installed capacity</th></tr></thead>
        <tbody>{atolls.map((a) => <tr key={a.code}>
          <td><Link href={`/atolls/${encodeURIComponent(a.code)}`}><strong>{a.code}</strong> · {a.name}</Link></td>
          <td><RunningSummary running={a.runningCount} stopped={a.stoppedCount} total={a.gensetCount} /></td>
          <td className="num hide-sm">{a.gensetCount}</td>
          <td className="hide-sm"><CapacityBar value={a.ratedKw} max={max} /></td>
        </tr>)}</tbody>
      </table>
    </section>
  </>;
}

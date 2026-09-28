import Link from "next/link";
import { notFound } from "next/navigation";
import { getAtoll, kw } from "@/lib/data";
import { CapacityBar, RunningSummary, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AtollPage({ params }) {
  const { code } = await params;
  const atoll = await getAtoll(decodeURIComponent(code));
  if (!atoll) notFound();
  const max = Math.max(0, ...atoll.islands.map((i) => i.ratedKw));

  return <>
    <nav className="crumbs"><Link href="/">Overview</Link> › {atoll.code}</nav>
    <h1>{atoll.code} · {atoll.name}</h1>
    <div className="stats">
      <Stat label="Gensets running" value={`${atoll.runningCount} of ${atoll.gensetCount}`} />
      <Stat label="Not running" value={atoll.stoppedCount} tone={atoll.stoppedCount ? "alert" : ""} />
      <Stat label="Installed capacity" value={kw(atoll.ratedKw)} />
      <Stat label="Islands" value={atoll.islandCount} />
    </div>

    <section className="card">
      <h2>Islands</h2>
      <table>
        <thead><tr><th>Island</th><th>Running</th><th className="num hide-sm">Gensets</th><th className="wide hide-sm">Installed capacity</th></tr></thead>
        <tbody>{atoll.islands.map((i) => <tr key={i.id}>
          <td><Link href={`/islands/${i.id}`}>{i.name}</Link></td>
          <td><RunningSummary running={i.runningCount} stopped={i.stoppedCount} total={i.gensetCount} /></td>
          <td className="num hide-sm">{i.gensetCount}</td>
          <td className="hide-sm"><CapacityBar value={i.ratedKw} max={max} /></td>
        </tr>)}</tbody>
      </table>
    </section>
  </>;
}

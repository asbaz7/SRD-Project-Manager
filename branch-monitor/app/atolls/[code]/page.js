import Link from "next/link";
import { notFound } from "next/navigation";
import { getAtoll, kw } from "@/lib/data";
import { CapacityBar, Stat } from "@/components/ui";

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
      <Stat label="Islands" value={atoll.islandCount} />
      <Stat label="Gensets" value={atoll.gensetCount} />
      <Stat label="Installed capacity" value={kw(atoll.ratedKw)} />
      <Stat label="Operating capacity" value={kw(atoll.operatingKw)} />
    </div>

    <section className="card">
      <h2>Islands</h2>
      <table>
        <thead><tr><th>Island</th><th className="num">Gensets</th><th className="num hide-sm">Operating</th><th className="wide">Installed capacity</th></tr></thead>
        <tbody>{atoll.islands.map((i) => <tr key={i.id}>
          <td><Link href={`/islands/${i.id}`}>{i.name}</Link></td>
          <td className="num">{i.gensetCount}</td>
          <td className="num hide-sm">{kw(i.operatingKw)}</td>
          <td><CapacityBar value={i.ratedKw} max={max} /></td>
        </tr>)}</tbody>
      </table>
    </section>
  </>;
}

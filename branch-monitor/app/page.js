import Link from "next/link";
import { getAtolls, kw } from "@/lib/data";
import { CapacityBar, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const atolls = await getAtolls();
  const islands = atolls.reduce((sum, a) => sum + a.islandCount, 0);
  const gensets = atolls.reduce((sum, a) => sum + a.gensetCount, 0);
  const rated = atolls.reduce((sum, a) => sum + a.ratedKw, 0);
  const max = Math.max(0, ...atolls.map((a) => a.ratedKw));

  return <>
    <h1>Overview</h1>
    <div className="stats">
      <Stat label="Atolls" value={atolls.length} />
      <Stat label="Islands" value={islands} />
      <Stat label="Gensets" value={gensets} />
      <Stat label="Installed capacity" value={kw(rated)} />
    </div>

    <section className="card">
      <h2>Installed capacity by atoll</h2>
      <table>
        <thead><tr><th>Atoll</th><th className="num hide-sm">Islands</th><th className="num">Gensets</th><th className="wide">Installed capacity</th></tr></thead>
        <tbody>{atolls.map((a) => <tr key={a.code}>
          <td><Link href={`/atolls/${encodeURIComponent(a.code)}`}><strong>{a.code}</strong> · {a.name}</Link></td>
          <td className="num hide-sm">{a.islandCount}</td>
          <td className="num">{a.gensetCount}</td>
          <td><CapacityBar value={a.ratedKw} max={max} /></td>
        </tr>)}</tbody>
      </table>
    </section>
  </>;
}

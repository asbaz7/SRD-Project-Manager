import Link from "next/link";
import { notFound } from "next/navigation";
import { getIsland, kw } from "@/lib/data";
import { Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function IslandPage({ params }) {
  const { id } = await params;
  const island = UUID.test(id) ? await getIsland(id) : null;
  if (!island) notFound();
  const { atoll } = island;

  return <>
    <nav className="crumbs">
      <Link href="/">Overview</Link> › <Link href={`/atolls/${encodeURIComponent(atoll.code)}`}>{atoll.code}</Link> › {island.name}
    </nav>
    <h1>{island.name}</h1>
    <div className="stats">
      <Stat label="Gensets" value={island.gensetCount} />
      <Stat label="Installed capacity" value={kw(island.ratedKw)} />
      <Stat label="Operating capacity" value={kw(island.operatingKw)} />
    </div>

    <section className="card">
      <h2>Gensets</h2>
      {island.gensets.length === 0 ? <p className="muted">No gensets recorded for this island.</p> :
        <table>
          <thead><tr><th>Genset</th><th className="hide-sm">Model</th><th className="num">Rated</th><th className="num">Operating</th></tr></thead>
          <tbody>{island.gensets.map((g) => <tr key={g.id}>
            <td><strong>{g.genset_number}</strong></td>
            <td className="hide-sm">{g.model}</td>
            <td className="num">{kw(g.rated_kw)}</td>
            <td className="num">{kw(g.operating_kw)}</td>
          </tr>)}</tbody>
        </table>}
    </section>
  </>;
}

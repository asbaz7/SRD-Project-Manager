import { createLocationAction } from "@/app/actions";
import { requireApprovedUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/UI";
import Link from "next/link";

export default async function LocationsPage() {
  const { supabase, profile } = await requireApprovedUser();
  const [{ data: atolls = [] }, { data: islands = [] }, { data: powerhouses = [] }] = await Promise.all([
    supabase.from("atolls").select("id,code,name").order("code"),
    supabase.from("islands").select("id,name,atoll_id,atolls(code)").order("name"),
    supabase.from("powerhouses").select("id,name,code,island_id,islands(name,atolls(code))").order("name"),
  ]);
  return <>
    <PageHeader eyebrow="Asset network" title="Islands & branches" description="Location master data for all SRD-managed branch operations." actions={<Link href="/islands" className="btn primary">View island status</Link>} />
    <div className="dashboard-grid wide-left"><Card><div className="eyebrow">Registered network</div><h2>Branches</h2><div className="location-grid">{atolls.map((a) => <div className="location-group" key={a.id}><h3>{a.code} Atoll</h3>{islands.filter((i) => i.atoll_id === a.id).map((i) => <div className="island" key={i.id}><strong>{i.name}</strong>{powerhouses.filter((p) => p.island_id === i.id).map((p) => <span key={p.id}>{p.name}{p.code ? ` · ${p.code}` : ""}</span>)}</div>)}</div>)}</div></Card>
      {profile.role === "hod" && <div><Card><div className="eyebrow">Master data</div><h2>Add island</h2><form action={createLocationAction} className="form-stack compact"><input type="hidden" name="type" value="island" /><label>Atoll<select name="atoll_id" required>{atolls.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label><label>Island name<input name="name" required /></label><button className="btn secondary">Add island</button></form></Card><Card><div className="eyebrow">Master data</div><h2>Add branch</h2><form action={createLocationAction} className="form-stack compact"><input type="hidden" name="type" value="powerhouse" /><label>Island<select name="island_id" required>{islands.map((i) => <option key={i.id} value={i.id}>{i.atolls?.code} · {i.name}</option>)}</select></label><label>Branch name<input name="name" placeholder="Main Branch" required /></label><label>Code<input name="code" /></label><button className="btn secondary">Add branch</button></form></Card></div>}
    </div>
  </>;
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApprovedUser } from "@/lib/auth";
import { updateGensetConditionAction } from "@/app/actions";
import { Badge, Card, PageHeader, Stat } from "@/components/UI";

function conditionTone(status) {
  if (status === "normal") return "status-completed";
  if (status === "attention") return "priority-high";
  if (status === "critical" || status === "out_of_service") return "priority-critical";
  return "status-planned";
}

function conditionLabel(status) {
  if (status === "normal") return "Running";
  if (status === "attention") return "Minor fault";
  if (status === "critical") return "Major fault";
  if (status === "out_of_service") return "Out of service";
  return "Unknown";
}

function conditionValue(status) {
  if (status === "attention") return "minor_fault";
  if (status === "critical") return "major_fault";
  if (status === "out_of_service") return "out_of_service";
  return "running";
}

function sortGensets(a, b) {
  const ai = Number.parseInt(String(a.genset_number).replace(/\D/g, ""), 10);
  const bi = Number.parseInt(String(b.genset_number).replace(/\D/g, ""), 10);
  if (Number.isFinite(ai) && Number.isFinite(bi) && ai !== bi) return ai - bi;
  return String(a.genset_number).localeCompare(String(b.genset_number));
}

export default async function PowerhousePage({ params }) {
  const { id } = await params;
  const { supabase, profile } = await requireApprovedUser();
  const canEditCondition = ["developer", "hod", "unit_head"].includes(profile?.role);

  const { data: powerhouse } = await supabase
    .from("powerhouses")
    .select("id,name,operational_status,islands(id,name,atolls(id,code,name)),gensets(id,genset_number,model,rated_kw,operating_kw,reported_condition,condition_status,issue_note)")
    .eq("id", id)
    .maybeSingle();

  if (!powerhouse) notFound();

  const gensets = [...(powerhouse.gensets || [])].sort(sortGensets);
  const running = gensets.filter((g) => g.condition_status === "normal").length;
  const attention = gensets.filter((g) => g.condition_status === "attention").length;
  const critical = gensets.filter((g) => ["critical", "out_of_service"].includes(g.condition_status)).length;
  const issueCount = attention + critical;
  const island = powerhouse.islands;
  const atoll = island.atolls;

  return <>
    <div className="breadcrumbs">
      <Link href="/dashboard">Atolls</Link><span>›</span>
      <Link href={`/atolls/${encodeURIComponent(atoll.code)}`}>{atoll.code}</Link><span>›</span>
      <Link href={`/islands/${island.id}`}>{island.name}</Link><span>›</span>
      <strong>{powerhouse.name}</strong>
    </div>

    <PageHeader
      eyebrow={`${atoll.code} Atoll · ${island.name} · Powerhouse`}
      title={powerhouse.name}
      description="Gensets registered under this powerhouse. Unit Heads can update a condition and add an issue note."
    />

    <div className="stats-grid">
      <Stat label="Gensets" value={gensets.length} />
      <Stat label="Running" value={running} />
      <Stat label="Minor faults" value={attention} tone={attention ? "danger" : ""} />
      <Stat label="Major / unavailable" value={critical} tone={critical ? "danger" : ""} />
    </div>

    {issueCount > 0 && <Card>
      <div className="card-head">
        <div>
          <div className="eyebrow">Requires attention</div>
          <h2>Current genset issues</h2>
        </div>
      </div>
      <div className="compact-list">
        {gensets.filter((g) => g.condition_status !== "normal").map((g) => <div key={g.id}>
          <span>Genset {g.genset_number} · {g.model}</span>
          <Badge tone={conditionTone(g.condition_status)}>{conditionLabel(g.condition_status)}</Badge>
          <small>{g.issue_note || "No issue note recorded"}</small>
        </div>)}
      </div>
    </Card>}

    <Card>
      <div className="card-head">
        <div>
          <div className="eyebrow">Gensets</div>
          <h2>{powerhouse.name}</h2>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Genset</th>
              <th>Model</th>
              <th>Rated</th>
              <th>Operating</th>
              <th>Condition</th>
              <th>{canEditCondition ? "Update condition" : "Issue note"}</th>
            </tr>
          </thead>
          <tbody>
            {gensets.map((g) => <tr key={g.id}>
              <td><strong>{g.genset_number}</strong></td>
              <td>{g.model}</td>
              <td>{g.rated_kw == null ? "—" : `${g.rated_kw} kW`}</td>
              <td>{g.operating_kw == null ? "—" : `${g.operating_kw} kW`}</td>
              <td>
                <Badge tone={conditionTone(g.condition_status)}>{conditionLabel(g.condition_status)}</Badge>
                {g.issue_note && <><br/><small>{g.issue_note}</small></>}
              </td>
              <td>
                {canEditCondition ? <form action={updateGensetConditionAction.bind(null, g.id)} className="genset-condition-form">
                  <select name="condition" defaultValue={conditionValue(g.condition_status)} aria-label={`Condition for genset ${g.genset_number}`}>
                    <option value="running">Running</option>
                    <option value="minor_fault">Minor fault</option>
                    <option value="major_fault">Major fault</option>
                    <option value="out_of_service">Out of service</option>
                  </select>
                  <input
                    name="note"
                    type="text"
                    defaultValue={g.issue_note || ""}
                    placeholder="Issue note if not running"
                    aria-label={`Issue note for genset ${g.genset_number}`}
                  />
                  <button className="btn primary" type="submit">Save</button>
                </form> : <span className="muted">{g.issue_note || "No issue recorded"}</span>}
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </Card>
  </>;
}

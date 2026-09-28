import { requireApprovedUser } from "@/lib/auth";
import { Badge, Card, PageHeader, Stat } from "@/components/UI";

function conditionTone(status) {
  if (status === "normal") return "status-completed";
  if (status === "attention") return "priority-high";
  if (status === "critical" || status === "out_of_service") return "priority-critical";
  return "status-planned";
}

function conditionLabel(status) {
  if (status === "normal") return "Normal";
  if (status === "attention") return "Attention";
  if (status === "critical") return "Critical";
  if (status === "out_of_service") return "Out of service";
  return "Unknown";
}

function sortGensets(a, b) {
  const ai = Number.parseInt(String(a.genset_number).replace(/\D/g, ""), 10);
  const bi = Number.parseInt(String(b.genset_number).replace(/\D/g, ""), 10);
  if (Number.isFinite(ai) && Number.isFinite(bi) && ai !== bi) return ai - bi;
  return String(a.genset_number).localeCompare(String(b.genset_number));
}

export default async function DashboardPage() {
  const { supabase } = await requireApprovedUser();

  const { data: gensets = [], error } = await supabase
    .from("gensets")
    .select("id,genset_number,model,rated_kw,operating_kw,reported_condition,condition_status,issue_note,source_imported_on,powerhouses(id,name,islands(id,name,atolls(code,name)))");

  const rows = [...gensets].sort((a, b) => {
    const aa = a.powerhouses?.islands?.atolls?.code || "";
    const ba = b.powerhouses?.islands?.atolls?.code || "";
    const ai = a.powerhouses?.islands?.name || "";
    const bi = b.powerhouses?.islands?.name || "";
    return aa.localeCompare(ba) || ai.localeCompare(bi) || sortGensets(a, b);
  });

  const abnormal = rows.filter((g) => g.condition_status !== "normal");
  const normal = rows.filter((g) => g.condition_status === "normal");
  const critical = rows.filter((g) => ["critical", "out_of_service"].includes(g.condition_status));
  const powerhouseIds = new Set(rows.map((g) => g.powerhouses?.id).filter(Boolean));

  const groups = [];
  for (const genset of rows) {
    const ph = genset.powerhouses;
    const key = ph?.id || "unassigned";
    let group = groups.find((x) => x.key === key);
    if (!group) {
      group = {
        key,
        powerhouse: ph?.name || "Powerhouse not linked",
        island: ph?.islands?.name || "Island not linked",
        atoll: ph?.islands?.atolls?.code || "—",
        gensets: [],
      };
      groups.push(group);
    }
    group.gensets.push(genset);
  }

  return <>
    <PageHeader
      eyebrow="Electricity continuity"
      title="Genset condition monitor"
      description="Current genset register from the supplied land-powerhouse records. Any abnormal, incomplete or unverified genset condition is shown as an attention item."
    />

    {error && <p className="alert danger" role="alert">The genset register could not be loaded. Reload the page to retry.</p>}

    <div className="stats-grid">
      <Stat label="Powerhouses" value={powerhouseIds.size} hint="With genset records" />
      <Stat label="Gensets" value={rows.length} hint="Registered from supplied records" />
      <Stat label="Normal" value={normal.length} hint="Reported running / OK" />
      <Stat label="Needs attention" value={abnormal.length} tone={abnormal.length ? "danger" : ""} hint={critical.length ? `${critical.length} critical / unavailable` : "Includes incomplete or unverified records"} />
    </div>

    {abnormal.length > 0 && <Card>
      <div className="card-head">
        <div>
          <div className="eyebrow">Immediate visibility</div>
          <h2>Gensets requiring attention</h2>
        </div>
      </div>
      <div className="list">
        {abnormal.map((g) => <div className="list-row" key={g.id}>
          <div>
            <strong>{g.powerhouses?.islands?.atolls?.code} · {g.powerhouses?.islands?.name} · {g.genset_number}</strong>
            <span>{g.model} · {g.rated_kw ?? "—"} kW rated</span>
            <p>{g.issue_note || g.reported_condition || "Condition requires verification."}</p>
          </div>
          <Badge tone={conditionTone(g.condition_status)}>{conditionLabel(g.condition_status)}</Badge>
        </div>)}
      </div>
    </Card>}

    <div style={{ display: "grid", gap: "16px", marginTop: "16px" }}>
      {groups.map((group) => {
        const groupAttention = group.gensets.filter((g) => g.condition_status !== "normal").length;
        return <Card key={group.key}>
          <div className="card-head">
            <div>
              <div className="eyebrow">{group.atoll} Atoll · {group.island}</div>
              <h2>{group.powerhouse}</h2>
              <p className="muted">{group.gensets.length} genset{group.gensets.length === 1 ? "" : "s"} · {groupAttention ? `${groupAttention} requiring attention` : "No reported genset issues"}</p>
            </div>
            <Badge tone={groupAttention ? "priority-high" : "status-completed"}>{groupAttention ? "Attention" : "Normal"}</Badge>
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
                  <th>Issue</th>
                </tr>
              </thead>
              <tbody>
                {group.gensets.sort(sortGensets).map((g) => <tr key={g.id}>
                  <td><strong>{g.genset_number}</strong></td>
                  <td>{g.model}</td>
                  <td>{g.rated_kw == null ? "—" : `${g.rated_kw} kW`}</td>
                  <td>{g.operating_kw == null ? "Not supplied" : `${g.operating_kw} kW`}</td>
                  <td>
                    <Badge tone={conditionTone(g.condition_status)}>{conditionLabel(g.condition_status)}</Badge>
                    <br/><small>{g.reported_condition || "No condition supplied"}</small>
                  </td>
                  <td>{g.issue_note ? <strong>{g.issue_note}</strong> : <span className="muted">No reported issue</span>}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </Card>;
      })}
    </div>

    <p className="muted" style={{ marginTop: "16px" }}>
      This first screen uses only the genset information already present in the supplied records. “Normal” means the source reported the unit as running/OK; it is not live telemetry.
    </p>
  </>;
}

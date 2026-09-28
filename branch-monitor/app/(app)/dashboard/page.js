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
    .select("id,genset_number,model,rated_kw,operating_kw,reported_condition,condition_status,issue_note,source_name,source_imported_on,powerhouses(id,name,islands(id,name,atolls(code,name)))");

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
      description="Genset register for all land powerhouses in the supplied K, ADh, V and M statistical summaries. Any reported fault is pulled to the top automatically."
    />

    {error && <p className="alert danger" role="alert">The genset register could not be loaded. Reload the page to retry.</p>}

    <div className="stats-grid">
      <Stat label="Powerhouses" value={powerhouseIds.size} hint="Land powerhouses in supplied records" />
      <Stat label="Gensets" value={rows.length} hint="Listed in powerhouse genset tables" />
      <Stat label="Normal" value={normal.length} hint="Reported running / OK" />
      <Stat label="Needs attention" value={abnormal.length} tone={abnormal.length ? "danger" : ""} hint={critical.length ? `${critical.length} critical / major fault` : "Reported faults"} />
    </div>

    {abnormal.length > 0 && <Card>
      <div className="card-head">
        <div>
          <div className="eyebrow">Immediate visibility</div>
          <h2>Gensets requiring attention</h2>
          <p className="muted">Every genset marked with a minor or major fault in the supplied records appears here.</p>
        </div>
      </div>
      <div className="list">
        {abnormal.map((g) => <div className="list-row" key={g.id}>
          <div>
            <strong>{g.powerhouses?.islands?.atolls?.code} · {g.powerhouses?.islands?.name} · Genset {g.genset_number}</strong>
            <span>{g.model} · {g.rated_kw ?? "—"} kW rated · {g.operating_kw ?? "—"} kW operating</span>
            <p><strong>{g.reported_condition || "Condition requires verification."}</strong>{g.issue_note ? ` — ${g.issue_note}` : ""}</p>
            {g.source_name && <small className="muted">Source: {g.source_name}</small>}
          </div>
          <Badge tone={conditionTone(g.condition_status)}>{conditionLabel(g.condition_status)}</Badge>
        </div>)}
      </div>
    </Card>}

    <div style={{ display: "grid", gap: "16px", marginTop: "16px" }}>
      {groups.map((group) => {
        const groupAttention = group.gensets.filter((g) => g.condition_status !== "normal").length;
        const groupCritical = group.gensets.filter((g) => ["critical", "out_of_service"].includes(g.condition_status)).length;
        return <Card key={group.key}>
          <div className="card-head">
            <div>
              <div className="eyebrow">{group.atoll} Atoll · {group.island}</div>
              <h2>{group.powerhouse}</h2>
              <p className="muted">{group.gensets.length} genset{group.gensets.length === 1 ? "" : "s"} · {groupCritical ? `${groupCritical} major fault` : groupAttention ? `${groupAttention} minor fault${groupAttention === 1 ? "" : "s"}` : "No reported genset faults"}</p>
            </div>
            <Badge tone={groupCritical ? "priority-critical" : groupAttention ? "priority-high" : "status-completed"}>
              {groupCritical ? "Critical" : groupAttention ? "Attention" : "Normal"}
            </Badge>
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
                  <td>
                    {g.issue_note ? <strong>{g.issue_note}</strong> : <span className="muted">No reported issue</span>}
                    {g.source_name && <><br/><small className="muted">{g.source_name}</small></>}
                  </td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </Card>;
      })}
    </div>

    <p className="muted" style={{ marginTop: "16px" }}>
      Condition labels are taken from the supplied statistical-summary genset tables. “Normal” means the source reports the unit as Running or Running, OK; this screen is not live telemetry.
    </p>
  </>;
}

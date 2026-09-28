import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApprovedUser } from "@/lib/auth";
import { saveEngineConditionReportAction } from "@/app/engine-report-actions";
import { Card, PageHeader } from "@/components/UI";

const STATUS_OPTIONS = [
  "RUNNING; OK",
  "RUNNING; MINOR FAULT",
  "RUNNING; MAJOR FAULT",
  "NOT RUNNING; DISCONNECTED",
  "NOT RUNNING; MAJOR FAULT",
  "OUT OF SERVICE",
];

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}
function dateInput(value) { return value || ""; }
function textValue(value) { return value == null ? "" : String(value); }
function yn(value) { return value === true ? "yes" : value === false ? "no" : ""; }

export default async function NewEngineReportPage({ params, searchParams }) {
  const { id } = await params;
  const query = await searchParams;
  const { supabase, profile } = await requireApprovedUser();
  if (!["developer", "hod", "unit_head"].includes(profile?.role)) notFound();

  const requestedMonth = /^\d{4}-\d{2}$/.test(query?.month || "") ? query.month : currentMonth();
  const reportDate = requestedMonth + "-01";

  const [{ data: powerhouse }, { data: gensets = [] }, { data: existingReport }, { data: latestReport }] = await Promise.all([
    supabase.from("powerhouses").select("id,name,islands(id,name,atolls(code,name))").eq("id", id).maybeSingle(),
    supabase.from("gensets").select("id,genset_number,model,rated_kw").eq("powerhouse_id", id).order("genset_number"),
    supabase.from("engine_condition_reports").select("*").eq("powerhouse_id", id).eq("report_month", reportDate).maybeSingle(),
    supabase.from("engine_condition_reports").select("id,report_month").eq("powerhouse_id", id).lt("report_month", reportDate).order("report_month", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!powerhouse) notFound();

  const sourceReportId = existingReport?.id || latestReport?.id || null;
  let entries = [];
  if (sourceReportId) {
    const { data = [] } = await supabase.from("engine_condition_entries").select("*").eq("report_id", sourceReportId);
    entries = data;
  }
  const entryMap = new Map(entries.map((entry) => [entry.genset_id, entry]));

  return <>
    <div className="breadcrumbs">
      <Link href="/engine-reports">Engine reports</Link><span>›</span>
      <Link href={`/powerhouses/${id}/engine-reports`}>{powerhouse.name}</Link><span>›</span>
      <strong>{requestedMonth}</strong>
    </div>

    <PageHeader
      eyebrow="Monthly engine condition report"
      title={powerhouse.name}
      description={`${powerhouse.islands.atolls.code} Atoll · ${powerhouse.islands.name} · Enter the full monthly engine-condition record here instead of the spreadsheet.`}
    />

    <form action={saveEngineConditionReportAction.bind(null, id)} className="engine-report-form">
      <Card>
        <div className="card-head"><div><div className="eyebrow">Report information</div><h2>Powerhouse monthly record</h2></div></div>
        <div className="form-grid engine-report-header-grid">
          <label>Report month<input type="month" name="report_month" defaultValue={requestedMonth} required /></label>
          <label>Record updated date<input type="date" name="record_updated_date" defaultValue={dateInput(existingReport?.record_updated_date)} /></label>
          <div className="span-2 engine-report-subhead">Maximum peak load of island</div>
          <label>Peak load (kW)<input type="number" step="0.01" name="maximum_peak_kw" defaultValue={textValue(existingReport?.maximum_peak_kw)} /></label>
          <label>Date<input type="date" name="maximum_peak_date" defaultValue={dateInput(existingReport?.maximum_peak_date)} /></label>
          <label>Time<input type="time" name="maximum_peak_time" defaultValue={textValue(existingReport?.maximum_peak_time)?.slice(0,5)} /></label>
          <div className="span-2 engine-report-subhead">Peak load of island this month</div>
          <label>Peak load (kW)<input type="number" step="0.01" name="monthly_peak_kw" defaultValue={textValue(existingReport?.monthly_peak_kw)} /></label>
          <label>Date<input type="date" name="monthly_peak_date" defaultValue={dateInput(existingReport?.monthly_peak_date)} /></label>
          <label>Time<input type="time" name="monthly_peak_time" defaultValue={textValue(existingReport?.monthly_peak_time)?.slice(0,5)} /></label>
        </div>
      </Card>

      <div className="engine-report-gensets">
        {gensets.map((genset, index) => {
          const e = entryMap.get(genset.id) || {};
          const prefix = `g_${genset.id}_`;
          return <details key={genset.id} className="engine-report-genset" open={index === 0}>
            <summary>
              <div><span>Genset {genset.genset_number}</span><strong>{e.engine_model || genset.model || "Engine details not entered"}</strong></div>
              <div><span>Status</span><strong>{e.engine_status || "Not entered"}</strong></div>
            </summary>
            <input type="hidden" name="genset_id" value={genset.id} />
            <input type="hidden" name={prefix + "genset_number"} value={genset.genset_number} />

            <div className="engine-report-genset-body">
              <section>
                <div className="engine-report-section-title"><span>Engine & dynamo identification</span><small>Normally carried forward from the previous month; edit only when details change.</small></div>
                <div className="form-grid engine-report-fields">
                  <label>Fixed asset code<input name={prefix + "fixed_asset_code"} defaultValue={textValue(e.fixed_asset_code)} /></label>
                  <label>Engine make<input name={prefix + "engine_make"} defaultValue={textValue(e.engine_make)} /></label>
                  <label>Engine model<input name={prefix + "engine_model"} defaultValue={textValue(e.engine_model || genset.model)} /></label>
                  <label>Engine capacity (kW)<input type="number" step="0.01" name={prefix + "engine_capacity_kw"} defaultValue={textValue(e.engine_capacity_kw ?? genset.rated_kw)} /></label>
                  <label>Engine serial no.<input name={prefix + "engine_serial_no"} defaultValue={textValue(e.engine_serial_no)} /></label>
                  <label>CPL / Spec no.<input name={prefix + "cpl_spec_no"} defaultValue={textValue(e.cpl_spec_no)} /></label>
                  <label>Dynamo make<input name={prefix + "dynamo_make"} defaultValue={textValue(e.dynamo_make)} /></label>
                  <label>Dynamo frame no.<input name={prefix + "dynamo_frame_no"} defaultValue={textValue(e.dynamo_frame_no)} /></label>
                  <label>Dynamo serial no.<input name={prefix + "dynamo_serial_no"} defaultValue={textValue(e.dynamo_serial_no)} /></label>
                  <label>Dynamo capacity (kW)<input type="number" step="0.01" name={prefix + "dynamo_capacity_kw"} defaultValue={textValue(e.dynamo_capacity_kw)} /></label>
                  <label>Original commissioning date<input type="date" name={prefix + "original_commissioning_date"} defaultValue={dateInput(e.original_commissioning_date)} /></label>
                  <label>Engine installed date at this power plant<input type="date" name={prefix + "engine_installed_date"} defaultValue={dateInput(e.engine_installed_date)} /></label>
                </div>
              </section>

              <section>
                <div className="engine-report-section-title"><span>Condition & maintenance</span><small>Monthly condition, service and running-hour information.</small></div>
                <div className="form-grid engine-report-fields">
                  <label>Last battery change date<input type="date" name={prefix + "last_battery_change_date"} defaultValue={dateInput(e.last_battery_change_date)} /></label>
                  <label>Last dynamo service date<input type="date" name={prefix + "last_dynamo_service_date"} defaultValue={dateInput(e.last_dynamo_service_date)} /></label>
                  <label>Connected to panel?<select name={prefix + "connected_to_panel"} defaultValue={yn(e.connected_to_panel)}><option value="">Not recorded</option><option value="yes">Yes</option><option value="no">No</option></select></label>
                  <label>Engine status<select name={prefix + "engine_status"} defaultValue={e.engine_status || "RUNNING; OK"}>{STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}</select></label>
                  <label className="span-2">Details of any engine fault<textarea name={prefix + "fault_details"} rows={2} defaultValue={textValue(e.fault_details)} /></label>
                  <label>Last valve clearance date<input type="date" name={prefix + "last_valve_clearance_date"} defaultValue={dateInput(e.last_valve_clearance_date)} /></label>
                  <label>Running hours since last valve clearance<input name={prefix + "running_hours_since_valve_clearance"} placeholder="e.g. 59691:00" defaultValue={textValue(e.running_hours_since_valve_clearance)} /></label>
                  <label>Last overhaul date<input type="date" name={prefix + "last_overhaul_date"} defaultValue={dateInput(e.last_overhaul_date)} /></label>
                  <label>Running hours since last overhaul<input name={prefix + "running_hours_since_overhaul"} placeholder="e.g. 879:28" defaultValue={textValue(e.running_hours_since_overhaul)} /></label>
                  <label>Total running hours<input name={prefix + "total_running_hours"} placeholder="HHHHH:MM" defaultValue={textValue(e.total_running_hours)} /></label>
                  <label>Maximum load taken this month (kW)<input type="number" step="0.01" name={prefix + "max_load_month_kw"} defaultValue={textValue(e.max_load_month_kw)} /></label>
                  <label>Maximum load engine can take (kW)<input type="number" step="0.01" name={prefix + "max_load_capacity_kw"} defaultValue={textValue(e.max_load_capacity_kw)} /></label>
                  <label>Engine needs overhauling?<select name={prefix + "engine_needs_overhaul"} defaultValue={yn(e.engine_needs_overhaul)}><option value="">Not recorded</option><option value="no">No</option><option value="yes">Yes</option></select></label>
                  <label>Dynamo needs service?<select name={prefix + "dynamo_needs_service"} defaultValue={yn(e.dynamo_needs_service)}><option value="">Not recorded</option><option value="no">No</option><option value="yes">Yes</option></select></label>
                </div>
              </section>
            </div>
          </details>;
        })}
      </div>

      <div className="engine-report-savebar">
        <Link href={`/powerhouses/${id}/engine-reports`} className="btn secondary">Cancel</Link>
        <button type="submit" name="report_status" value="draft" className="btn secondary">Save draft</button>
        <button type="submit" name="report_status" value="submitted" className="btn primary">Save monthly report</button>
      </div>
    </form>
  </>;
}

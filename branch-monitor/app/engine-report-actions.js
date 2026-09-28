"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireApprovedUser } from "@/lib/auth";

function value(formData, key) {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}
function nullable(v) { return v === "" ? null : v; }
function numberOrNull(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function yesNoOrNull(v) {
  if (v === "yes") return true;
  if (v === "no") return false;
  return null;
}
function monthDate(v) {
  return /^\d{4}-\d{2}$/.test(v) ? v + "-01" : v;
}

export async function saveEngineConditionReportAction(powerhouseId, formData) {
  const { supabase, user, profile } = await requireApprovedUser();
  if (!["developer", "hod", "unit_head"].includes(profile?.role)) {
    throw new Error("You do not have permission to update engine condition reports.");
  }

  const reportMonth = monthDate(value(formData, "report_month"));
  if (!reportMonth) throw new Error("Report month is required.");

  const reportPayload = {
    powerhouse_id: powerhouseId,
    report_month: reportMonth,
    maximum_peak_kw: numberOrNull(value(formData, "maximum_peak_kw")),
    maximum_peak_date: nullable(value(formData, "maximum_peak_date")),
    maximum_peak_time: nullable(value(formData, "maximum_peak_time")),
    monthly_peak_kw: numberOrNull(value(formData, "monthly_peak_kw")),
    monthly_peak_date: nullable(value(formData, "monthly_peak_date")),
    monthly_peak_time: nullable(value(formData, "monthly_peak_time")),
    record_updated_date: nullable(value(formData, "record_updated_date")) || new Date().toISOString().slice(0, 10),
    report_status: value(formData, "report_status") || "submitted",
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await supabase
    .from("engine_condition_reports")
    .select("id,created_by")
    .eq("powerhouse_id", powerhouseId)
    .eq("report_month", reportMonth)
    .maybeSingle();

  let reportId = existing?.id;
  if (reportId) {
    const { error } = await supabase.from("engine_condition_reports").update(reportPayload).eq("id", reportId);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await supabase
      .from("engine_condition_reports")
      .insert({ ...reportPayload, created_by: user.id })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    reportId = data.id;
  }

  const gensetIds = formData.getAll("genset_id").map(String).filter(Boolean);
  const entries = gensetIds.map((gensetId) => {
    const p = `g_${gensetId}_`;
    return {
      report_id: reportId,
      genset_id: gensetId,
      genset_number: value(formData, p + "genset_number"),
      fixed_asset_code: nullable(value(formData, p + "fixed_asset_code")),
      engine_make: nullable(value(formData, p + "engine_make")),
      engine_model: nullable(value(formData, p + "engine_model")),
      engine_capacity_kw: numberOrNull(value(formData, p + "engine_capacity_kw")),
      engine_serial_no: nullable(value(formData, p + "engine_serial_no")),
      cpl_spec_no: nullable(value(formData, p + "cpl_spec_no")),
      dynamo_make: nullable(value(formData, p + "dynamo_make")),
      dynamo_frame_no: nullable(value(formData, p + "dynamo_frame_no")),
      dynamo_serial_no: nullable(value(formData, p + "dynamo_serial_no")),
      dynamo_capacity_kw: numberOrNull(value(formData, p + "dynamo_capacity_kw")),
      last_battery_change_date: nullable(value(formData, p + "last_battery_change_date")),
      last_dynamo_service_date: nullable(value(formData, p + "last_dynamo_service_date")),
      original_commissioning_date: nullable(value(formData, p + "original_commissioning_date")),
      engine_installed_date: nullable(value(formData, p + "engine_installed_date")),
      connected_to_panel: yesNoOrNull(value(formData, p + "connected_to_panel")),
      engine_status: nullable(value(formData, p + "engine_status")),
      fault_details: nullable(value(formData, p + "fault_details")),
      last_valve_clearance_date: nullable(value(formData, p + "last_valve_clearance_date")),
      running_hours_since_valve_clearance: nullable(value(formData, p + "running_hours_since_valve_clearance")),
      last_overhaul_date: nullable(value(formData, p + "last_overhaul_date")),
      running_hours_since_overhaul: nullable(value(formData, p + "running_hours_since_overhaul")),
      total_running_hours: nullable(value(formData, p + "total_running_hours")),
      max_load_month_kw: numberOrNull(value(formData, p + "max_load_month_kw")),
      max_load_capacity_kw: numberOrNull(value(formData, p + "max_load_capacity_kw")),
      engine_needs_overhaul: yesNoOrNull(value(formData, p + "engine_needs_overhaul")),
      dynamo_needs_service: yesNoOrNull(value(formData, p + "dynamo_needs_service")),
      updated_at: new Date().toISOString(),
    };
  });

  if (entries.length) {
    const { error } = await supabase
      .from("engine_condition_entries")
      .upsert(entries, { onConflict: "report_id,genset_id" });
    if (error) throw new Error(error.message);
  }

  revalidatePath("/engine-reports");
  revalidatePath(`/powerhouses/${powerhouseId}`);
  revalidatePath(`/powerhouses/${powerhouseId}/engine-reports`);
  redirect(`/powerhouses/${powerhouseId}/engine-reports`);
}

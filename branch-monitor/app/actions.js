"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase-server";
import { requireApprovedUser, requireHod } from "@/lib/auth";

function value(formData, key) {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}
function nullable(v) { return v || null; }
function bool(v) { return v === "on" || v === "true" || v === "1"; }
function list(formData, key) { return formData.getAll(key).map(String).filter(Boolean); }
function numberOrNull(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function progressValue(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
}
function safeFileName(name) {
  return String(name || "file").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 120);
}

export async function loginAction(formData) {
  const supabase = await createSupabaseServer();
  const email = value(formData, "email").toLowerCase();
  const password = value(formData, "password");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect("/dashboard");
}

export async function registerAction(formData) {
  const supabase = await createSupabaseServer();
  const fullName = value(formData, "full_name");
  const email = value(formData, "email").toLowerCase();
  const password = value(formData, "password");
  if (!fullName || password.length < 8) redirect("/register?error=Please%20enter%20your%20name%20and%20a%20password%20of%20at%20least%208%20characters.");
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error) redirect(`/register?error=${encodeURIComponent(error.message)}`);
  redirect("/pending");
}

export async function logoutAction() {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}


export async function updateGensetConditionAction(gensetId, formData) {
  const { supabase, profile } = await requireApprovedUser();
  if (!["developer", "hod", "unit_head"].includes(profile?.role)) {
    throw new Error("Only Unit Heads can update genset conditions.");
  }

  const condition = value(formData, "condition");
  const note = value(formData, "note");
  const conditionMap = {
    running: { reported_condition: "Running", condition_status: "normal" },
    minor_fault: { reported_condition: "Running, Minor Fault", condition_status: "attention" },
    major_fault: { reported_condition: "Running, Major Fault", condition_status: "critical" },
    out_of_service: { reported_condition: "Out of Service", condition_status: "out_of_service" },
  };
  const selected = conditionMap[condition];
  if (!selected) throw new Error("Choose a valid genset condition.");
  if (condition !== "running" && !note) {
    throw new Error("Add a note describing the genset issue.");
  }

  const { error } = await supabase
    .from("gensets")
    .update({
      reported_condition: selected.reported_condition,
      condition_status: selected.condition_status,
      issue_note: condition === "running" ? null : note,
      updated_at: new Date().toISOString(),
    })
    .eq("id", gensetId);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function createProjectAction(formData) {
  const { supabase, user } = await requireApprovedUser();
  const payload = {
    code: value(formData, "code").toUpperCase(),
    title: value(formData, "title"),
    description: nullable(value(formData, "description")),
    scope: nullable(value(formData, "scope")),
    location_text: nullable(value(formData, "location_text")),
    priority: value(formData, "priority") || "medium",
    status: value(formData, "status") || "planned",
    lead_unit_id: value(formData, "lead_unit_id"),
    lead_user_id: nullable(value(formData, "lead_user_id")),
    requested_by: user.id,
    created_by: user.id,
    powerhouse_id: nullable(value(formData, "powerhouse_id")),
    start_date: nullable(value(formData, "start_date")),
    due_date: nullable(value(formData, "due_date")),
    completion_date: nullable(value(formData, "completion_date")),
    last_progress_update: nullable(value(formData, "last_progress_update")),
    progress_override: numberOrNull(value(formData, "progress_override")),
    budget: numberOrNull(value(formData, "budget")),
    exp_srd: numberOrNull(value(formData, "exp_srd")),
    exp_corporate: numberOrNull(value(formData, "exp_corporate")),
    allowance: numberOrNull(value(formData, "allowance")),
    total_cost: numberOrNull(value(formData, "total_cost")),
    site_survey_done: bool(value(formData, "site_survey_done")),
    site_survey_date: nullable(value(formData, "site_survey_date")),
    structural_drawing_done: bool(value(formData, "structural_drawing_done")),
    structural_drawing_date: nullable(value(formData, "structural_drawing_date")),
    work_schedule_done: bool(value(formData, "work_schedule_done")),
    work_schedule_date: nullable(value(formData, "work_schedule_date")),
  };
  const { data, error } = await supabase.from("projects").insert(payload).select("id").single();
  if (error) redirect(`/projects/new?error=${encodeURIComponent(error.message)}`);
  const supports = list(formData, "support_unit_ids").filter((id) => id !== payload.lead_unit_id);
  const rows = [{ project_id: data.id, unit_id: payload.lead_unit_id, role: "lead" }, ...supports.map((unit_id) => ({ project_id: data.id, unit_id, role: "support" }))];
  if (rows.length) await supabase.from("project_units").upsert(rows, { onConflict: "project_id,unit_id" });
  await supabase.from("activity_log").insert({ actor_id: user.id, entity_type: "project", entity_id: data.id, action: "created", summary: `Created project ${payload.code} — ${payload.title}` });
  revalidatePath("/dashboard"); revalidatePath("/projects");
  redirect(`/projects/${data.id}`);
}

export async function createWorkAction(formData) {
  const { supabase, user } = await requireApprovedUser();
  const payload = {
    project_id: nullable(value(formData, "project_id")),
    powerhouse_id: value(formData, "powerhouse_id"),
    owning_unit_id: value(formData, "owning_unit_id"),
    supervisor_id: nullable(value(formData, "supervisor_id")),
    requested_by: user.id,
    created_by: user.id,
    work_type: value(formData, "work_type") || "project_work",
    title: value(formData, "title"),
    description: nullable(value(formData, "description")),
    priority: value(formData, "priority") || "medium",
    status: value(formData, "status") || "new",
    weight: Number(value(formData, "weight") || 1),
    start_date: nullable(value(formData, "start_date")),
    due_date: nullable(value(formData, "due_date")),
  };
  const { data, error } = await supabase.from("work_items").insert(payload).select("id").single();
  if (error) redirect(`/works/new?error=${encodeURIComponent(error.message)}`);
  await supabase.from("activity_log").insert({ actor_id: user.id, entity_type: "work_item", entity_id: data.id, action: "created", summary: `Created work: ${payload.title}` });
  revalidatePath("/dashboard"); revalidatePath("/works");
  redirect(`/works/${data.id}`);
}

export async function createTaskAction(workItemId, formData) {
  const { supabase, user } = await requireApprovedUser();
  const payload = {
    work_item_id: workItemId,
    assigned_unit_id: value(formData, "assigned_unit_id"),
    title: value(formData, "title"),
    description: nullable(value(formData, "description")),
    weight: Number(value(formData, "weight") || 1),
    due_date: nullable(value(formData, "due_date")),
    created_by: user.id,
  };
  const { data, error } = await supabase.from("tasks").insert(payload).select("id").single();
  if (error) redirect(`/works/${workItemId}?error=${encodeURIComponent(error.message)}`);
  const assignees = list(formData, "assignee_ids").map((profile_id) => ({ task_id: data.id, profile_id, assigned_by: user.id }));
  if (assignees.length) await supabase.from("task_assignments").insert(assignees);
  const checklist = value(formData, "checklist").split("\n").map((x) => x.trim()).filter(Boolean).map((title, i) => ({ task_id: data.id, title, sort_order: i + 1 }));
  if (checklist.length) await supabase.from("task_checklist").insert(checklist);
  await supabase.from("activity_log").insert({ actor_id: user.id, entity_type: "task", entity_id: data.id, action: "created", summary: `Created task: ${payload.title}` });
  revalidatePath(`/works/${workItemId}`); revalidatePath("/dashboard");
}

export async function toggleChecklistAction(workItemId, itemId, completed) {
  const { supabase, user } = await requireApprovedUser();
  const { error } = await supabase.from("task_checklist").update({
    completed,
    completed_by: completed ? user.id : null,
    completed_at: completed ? new Date().toISOString() : null,
  }).eq("id", itemId);
  if (error) throw new Error(error.message);
  revalidatePath(`/works/${workItemId}`); revalidatePath("/dashboard");
}

export async function updateTaskStatusAction(workItemId, taskId, formData) {
  const { supabase, user } = await requireApprovedUser();
  const status = value(formData, "status");
  const note = value(formData, "note");
  const { error } = await supabase.from("tasks").update({ status, updated_at: new Date().toISOString(), completed_at: status === "completed" ? new Date().toISOString() : null }).eq("id", taskId);
  if (error) throw new Error(error.message);
  if (note) await supabase.from("work_updates").insert({ work_item_id: workItemId, task_id: taskId, author_id: user.id, note, update_type: "progress" });
  revalidatePath(`/works/${workItemId}`); revalidatePath("/dashboard");
}

export async function addWorkUpdateAction(workItemId, formData) {
  const { supabase, user } = await requireApprovedUser();
  const note = value(formData, "note");
  if (!note) return;
  await supabase.from("work_updates").insert({ work_item_id: workItemId, author_id: user.id, note, update_type: value(formData, "update_type") || "note" });
  revalidatePath(`/works/${workItemId}`); revalidatePath("/activity");
}

export async function addBlockerAction(workItemId, formData) {
  const { supabase, user } = await requireApprovedUser();
  await supabase.from("blockers").insert({
    work_item_id: workItemId,
    category: value(formData, "category") || "other",
    note: value(formData, "note"),
    raised_by: user.id,
    escalated_to_hod: bool(value(formData, "escalated_to_hod")),
  });
  revalidatePath(`/works/${workItemId}`); revalidatePath("/dashboard");
}

export async function resolveBlockerAction(workItemId, blockerId) {
  const { supabase, user } = await requireApprovedUser();
  await supabase.from("blockers").update({ status: "resolved", resolved_by: user.id, resolved_at: new Date().toISOString() }).eq("id", blockerId);
  revalidatePath(`/works/${workItemId}`); revalidatePath("/dashboard");
}

export async function approveProfileAction(profileId, formData) {
  const { supabase } = await requireHod();
  const role = value(formData, "role") || "staff";
  const primary_unit_id = nullable(value(formData, "primary_unit_id"));
  const designation = nullable(value(formData, "designation"));
  const { error } = await supabase.from("profiles").update({ approved: true, active: true, role, primary_unit_id, designation }).eq("id", profileId);
  if (error) throw new Error(error.message);
  revalidatePath("/team");
}

export async function createDelegationAction(formData) {
  const { supabase, user } = await requireHod();
  const payload = {
    unit_id: value(formData, "unit_id"),
    acting_head_id: value(formData, "acting_head_id"),
    starts_at: value(formData, "starts_at"),
    ends_at: value(formData, "ends_at"),
    note: nullable(value(formData, "note")),
    created_by: user.id,
  };
  const { error } = await supabase.from("unit_head_delegations").insert(payload);
  if (error) throw new Error(error.message);
  revalidatePath("/team"); revalidatePath("/dashboard");
}

export async function createLocationAction(formData) {
  const { supabase } = await requireHod();
  const type = value(formData, "type");
  if (type === "island") {
    await supabase.from("islands").insert({ atoll_id: value(formData, "atoll_id"), name: value(formData, "name") });
  } else if (type === "powerhouse") {
    await supabase.from("powerhouses").insert({ island_id: value(formData, "island_id"), name: value(formData, "name"), code: nullable(value(formData, "code")) });
  }
  revalidatePath("/locations");
}


export async function updateProjectRecordAction(projectId, formData) {
  const { supabase, user } = await requireApprovedUser();
  const payload = {
    title: value(formData, "title"),
    description: nullable(value(formData, "description")),
    scope: nullable(value(formData, "scope")),
    location_text: nullable(value(formData, "location_text")),
    status: value(formData, "status") || "planned",
    priority: value(formData, "priority") || "medium",
    start_date: nullable(value(formData, "start_date")),
    due_date: nullable(value(formData, "due_date")),
    completion_date: nullable(value(formData, "completion_date")),
    last_progress_update: nullable(value(formData, "last_progress_update")),
    progress_override: numberOrNull(value(formData, "progress_override")),
    budget: numberOrNull(value(formData, "budget")),
    exp_srd: numberOrNull(value(formData, "exp_srd")),
    exp_corporate: numberOrNull(value(formData, "exp_corporate")),
    allowance: numberOrNull(value(formData, "allowance")),
    total_cost: numberOrNull(value(formData, "total_cost")),
    site_survey_done: bool(value(formData, "site_survey_done")),
    site_survey_date: nullable(value(formData, "site_survey_date")),
    structural_drawing_done: bool(value(formData, "structural_drawing_done")),
    structural_drawing_date: nullable(value(formData, "structural_drawing_date")),
    work_schedule_done: bool(value(formData, "work_schedule_done")),
    work_schedule_date: nullable(value(formData, "work_schedule_date")),
  };
  const { error } = await supabase.from("projects").update(payload).eq("id", projectId);
  if (error) throw new Error(error.message);
  await supabase.from("activity_log").insert({
    actor_id: user.id, entity_type: "project", entity_id: projectId, action: "edited",
    summary: `Updated project record ${value(formData, "code") || projectId}`,
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/dashboard");
}

export async function addProjectRecordTaskAction(projectId, formData) {
  const { supabase, user } = await requireApprovedUser();
  const payload = {
    project_id: projectId,
    sort_order: Number(value(formData, "sort_order") || 0),
    title: value(formData, "title"),
    details: nullable(value(formData, "details")),
    status: value(formData, "status") || "planned",
    progress: progressValue(value(formData, "progress")),
    start_date: nullable(value(formData, "start_date")),
    completion_date: nullable(value(formData, "completion_date")),
    created_by: user.id,
  };
  if (!payload.title) throw new Error("Task title is required.");
  const { error } = await supabase.from("project_record_tasks").insert(payload);
  if (error) throw new Error(error.message);
  await supabase.from("activity_log").insert({
    actor_id: user.id, entity_type: "project", entity_id: projectId, action: "record_task_added",
    summary: `Added project record task: ${payload.title}`,
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/dashboard");
}

export async function updateProjectRecordTaskAction(projectId, taskId, formData) {
  const { supabase, user } = await requireApprovedUser();
  const payload = {
    sort_order: Number(value(formData, "sort_order") || 0),
    title: value(formData, "title"),
    details: nullable(value(formData, "details")),
    status: value(formData, "status") || "planned",
    progress: progressValue(value(formData, "progress")),
    start_date: nullable(value(formData, "start_date")),
    completion_date: nullable(value(formData, "completion_date")),
  };
  const { error } = await supabase.from("project_record_tasks").update(payload).eq("id", taskId).eq("project_id", projectId);
  if (error) throw new Error(error.message);
  await supabase.from("activity_log").insert({
    actor_id: user.id, entity_type: "project", entity_id: projectId, action: "record_task_updated",
    summary: `Updated project record task: ${payload.title}`,
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/dashboard");
}

export async function deleteProjectRecordTaskAction(projectId, taskId) {
  const { supabase, user } = await requireApprovedUser();
  const { error } = await supabase.from("project_record_tasks").delete().eq("id", taskId).eq("project_id", projectId);
  if (error) throw new Error(error.message);
  await supabase.from("activity_log").insert({
    actor_id: user.id, entity_type: "project", entity_id: projectId, action: "record_task_deleted",
    summary: "Deleted a project record task",
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/dashboard");
}

export async function addProjectTimelineAction(projectId, formData) {
  const { supabase, user } = await requireApprovedUser();
  const note = value(formData, "note");
  if (!note) throw new Error("Timeline note is required.");
  const payload = {
    project_id: projectId,
    event_date: value(formData, "event_date") || new Date().toISOString().slice(0, 10),
    category: value(formData, "category") || "update",
    note,
    created_by: user.id,
  };
  const { error } = await supabase.from("project_timeline_entries").insert(payload);
  if (error) throw new Error(error.message);
  await supabase.from("activity_log").insert({
    actor_id: user.id, entity_type: "project", entity_id: projectId, action: "timeline_update",
    summary: `Project timeline: ${note.slice(0, 120)}`,
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/activity");
}

export async function addProjectResponsibilityAction(projectId, formData) {
  const { supabase, user } = await requireApprovedUser();
  const payload = {
    project_id: projectId,
    responsibility_role: value(formData, "responsibility_role"),
    person_name: value(formData, "person_name"),
    designation: nullable(value(formData, "designation")),
    sort_order: Number(value(formData, "sort_order") || 0),
    created_by: user.id,
  };
  if (!payload.responsibility_role || !payload.person_name) throw new Error("Role and person name are required.");
  const { error } = await supabase.from("project_responsibilities").insert(payload);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}`);
}

async function uploadProjectAsset({ supabase, user, projectId, formData, kind }) {
  const file = formData.get("file");
  if (!file || typeof file.arrayBuffer !== "function" || !file.size) throw new Error("Choose a file to upload.");
  const maxBytes = 15 * 1024 * 1024;
  if (file.size > maxBytes) throw new Error("File is too large. Maximum size is 15 MB.");
  if (kind === "photo" && !String(file.type || "").startsWith("image/")) throw new Error("Project photos must be image files.");
  const folder = kind === "photo" ? "photos" : "documents";
  const fileName = safeFileName(file.name);
  const storagePath = `projects/${projectId}/${folder}/${Date.now()}-${globalThis.crypto.randomUUID()}-${fileName}`;
  const body = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage.from("srd-files").upload(storagePath, body, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (uploadError) throw new Error(uploadError.message);

  const row = kind === "photo" ? {
    project_id: projectId,
    work_category: value(formData, "work_category") || "general",
    taken_date: nullable(value(formData, "taken_date")),
    caption: nullable(value(formData, "caption")),
    storage_path: storagePath,
    file_name: file.name,
    mime_type: file.type || null,
    size_bytes: file.size,
    uploaded_by: user.id,
  } : {
    project_id: projectId,
    category: value(formData, "category") || "other",
    description: nullable(value(formData, "description")),
    storage_path: storagePath,
    file_name: file.name,
    mime_type: file.type || null,
    size_bytes: file.size,
    uploaded_by: user.id,
  };
  const table = kind === "photo" ? "project_photos" : "project_documents";
  const { error } = await supabase.from(table).insert(row);
  if (error) {
    await supabase.storage.from("srd-files").remove([storagePath]);
    throw new Error(error.message);
  }
  await supabase.from("activity_log").insert({
    actor_id: user.id, entity_type: "project", entity_id: projectId, action: kind === "photo" ? "photo_uploaded" : "document_uploaded",
    summary: `Uploaded ${kind}: ${file.name}`,
  });
}

export async function uploadProjectPhotoAction(projectId, formData) {
  const { supabase, user } = await requireApprovedUser();
  await uploadProjectAsset({ supabase, user, projectId, formData, kind: "photo" });
  revalidatePath(`/projects/${projectId}`);
}

export async function uploadProjectDocumentAction(projectId, formData) {
  const { supabase, user } = await requireApprovedUser();
  await uploadProjectAsset({ supabase, user, projectId, formData, kind: "document" });
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteProjectAssetAction(projectId, kind, assetId) {
  const { supabase, user } = await requireApprovedUser();
  const table = kind === "photo" ? "project_photos" : kind === "document" ? "project_documents" : null;
  if (!table) throw new Error("Invalid asset type.");
  const { data } = await supabase.from(table).select("storage_path,file_name").eq("id", assetId).eq("project_id", projectId).maybeSingle();
  if (!data) return;
  const { error } = await supabase.from(table).delete().eq("id", assetId).eq("project_id", projectId);
  if (error) throw new Error(error.message);
  await supabase.storage.from("srd-files").remove([data.storage_path]);
  await supabase.from("activity_log").insert({
    actor_id: user.id, entity_type: "project", entity_id: projectId, action: `${kind}_deleted`,
    summary: `Deleted ${kind}: ${data.file_name}`,
  });
  revalidatePath(`/projects/${projectId}`);
}

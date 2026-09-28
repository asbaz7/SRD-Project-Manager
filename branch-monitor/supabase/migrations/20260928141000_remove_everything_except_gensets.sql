-- Strip the database down to the dashboard's data: atolls, islands,
-- powerhouses and gensets. Removes users, projects, works, tasks, units,
-- engine condition reports, island statistics, file storage and all
-- related views, functions, triggers, policies and types.

-- File storage
drop policy if exists srd_files_read on storage.objects;
drop policy if exists srd_files_insert on storage.objects;
drop policy if exists srd_files_delete on storage.objects;

-- Views
drop view if exists
  public.active_unit_heads,
  public.operations_atoll_summary,
  public.project_overview,
  public.task_overview,
  public.work_item_overview;

-- Tables
drop table if exists
  public.engine_condition_entries,
  public.engine_condition_reports,
  public.activity_log,
  public.attachments,
  public.blockers,
  public.island_statistics,
  public.project_documents,
  public.project_photos,
  public.project_record_sections,
  public.project_record_tasks,
  public.project_responsibilities,
  public.project_timeline_entries,
  public.project_units,
  public.projects,
  public.task_assignments,
  public.task_checklist,
  public.tasks,
  public.unit_head_delegations,
  public.units,
  public.work_items,
  public.work_updates,
  public.profiles
cascade;

-- Users and sign-up (after profiles/projects, which reference them)
drop trigger if exists on_auth_user_created on auth.users;
delete from auth.users;

-- Old login-based policies on the kept tables
drop policy if exists atolls_hod_delete on public.atolls;
drop policy if exists atolls_hod_insert on public.atolls;
drop policy if exists atolls_hod_update on public.atolls;
drop policy if exists atolls_read on public.atolls;
drop policy if exists islands_hod_delete on public.islands;
drop policy if exists islands_hod_insert on public.islands;
drop policy if exists islands_hod_update on public.islands;
drop policy if exists islands_read on public.islands;
drop policy if exists powerhouses_hod_delete on public.powerhouses;
drop policy if exists powerhouses_hod_insert on public.powerhouses;
drop policy if exists powerhouses_hod_update on public.powerhouses;
drop policy if exists powerhouses_read on public.powerhouses;
drop policy if exists gensets_hod_write on public.gensets;
drop policy if exists gensets_read on public.gensets;
drop policy if exists gensets_unit_heads_update on public.gensets;

-- Genset condition data and remaining logic
drop trigger if exists gensets_touch on public.gensets;
alter table public.gensets
  drop column if exists reported_condition,
  drop column if exists condition_status,
  drop column if exists issue_note,
  drop column if exists source_record_id;
alter publication supabase_realtime drop table public.gensets;

drop function if exists
  public.touch_updated_at(),
  private.can_manage_engine_reports(),
  private.can_manage_project(uuid),
  private.can_manage_unit(uuid),
  private.can_manage_work(uuid),
  private.can_update_genset_condition(),
  private.engine_entries_sync_delete(),
  private.engine_entries_sync_insert(),
  private.engine_entries_sync_update(),
  private.engine_reports_sync_trigger(),
  private.engine_status_condition(text),
  private.handle_new_auth_user(),
  private.is_approved(),
  private.is_assigned_task(uuid),
  private.is_assigned_to_work(uuid),
  private.is_hod(),
  private.is_unit_head_for(uuid),
  private.sync_genset_conditions(uuid);
drop schema if exists private;

drop type if exists
  public.app_role,
  public.project_status,
  public.priority_level,
  public.work_status,
  public.task_status,
  public.work_type,
  public.blocker_category;

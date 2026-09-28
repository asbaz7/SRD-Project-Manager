export async function getDashboardData(supabase) {
  const [projects, works, blockers, atolls, units, delegations] = await Promise.all([
    supabase.from("project_overview").select("*").neq("status", "archived").order("updated_at", { ascending: false }).limit(100),
    supabase.from("work_item_overview").select("*").not("status", "in", '("verified","closed")').order("updated_at", { ascending: false }).limit(100),
    supabase.from("blockers").select("id, category, note, escalated_to_hod, created_at, work_items(id,title,priority,powerhouses(name,islands(name,atolls(code))))").eq("status", "open").order("created_at", { ascending: false }).limit(20),
    supabase.from("atolls").select("id, code, name, islands(id, powerhouses(id))").order("code"),
    supabase.from("units").select("id, code, name").eq("active", true).order("sort_order"),
    supabase.from("active_unit_heads").select("*").order("unit_name"),
  ]);
  return {
    projects: projects.data || [],
    works: works.data || [],
    blockers: blockers.data || [],
    atolls: atolls.data || [],
    units: units.data || [],
    delegations: delegations.data || [],
  };
}

export async function getReferenceData(supabase) {
  const [units, atolls, islands, powerhouses, profiles] = await Promise.all([
    supabase.from("units").select("id, code, name").eq("active", true).order("sort_order"),
    supabase.from("atolls").select("id, code, name").eq("active", true).order("code"),
    supabase.from("islands").select("id, name, atoll_id, atolls(code)").eq("active", true).order("name"),
    supabase.from("powerhouses").select("id, name, code, island_id, islands(name, atolls(code))").eq("active", true).order("name"),
    supabase.from("profiles").select("id, full_name, role, primary_unit_id").eq("approved", true).eq("active", true).order("full_name"),
  ]);
  return {
    units: units.data || [], atolls: atolls.data || [], islands: islands.data || [],
    powerhouses: powerhouses.data || [], profiles: profiles.data || [],
  };
}

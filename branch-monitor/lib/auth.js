import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "./supabase-server";

export const getCurrentUser = cache(async function getCurrentUser() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, staff_no, designation, role, approved, primary_unit_id, units:primary_unit_id(id, name, code)")
    .eq("id", user.id)
    .maybeSingle();
  return { supabase, user, profile };
});

export async function requireApprovedUser() {
  const ctx = await getCurrentUser();
  if (!ctx.user) redirect("/login");
  if (!ctx.profile?.approved) redirect("/pending");
  return ctx;
}

export async function requireHod() {
  const ctx = await requireApprovedUser();
  if (!["developer", "hod"].includes(ctx.profile.role)) redirect("/dashboard");
  return ctx;
}

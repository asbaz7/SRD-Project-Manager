"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase-client";

export default function LiveSync() {
  const router = useRouter();
  useEffect(() => {
    const supabase = createSupabaseBrowser();
    let timer;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => router.refresh(), 350); };
    const channel = supabase.channel("srd-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "work_items" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_checklist" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "work_updates" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "blockers" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "unit_head_delegations" }, refresh)
      .subscribe();
    return () => { clearTimeout(timer); supabase.removeChannel(channel); };
  }, [router]);
  return null;
}

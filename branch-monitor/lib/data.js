import { createClient } from "@supabase/supabase-js";
import { gensetKey, getSheetData, islandKey } from "@/lib/sheet";

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false } }
  );
}

const ISLAND_FIELDS = "id,name,powerhouses(gensets(id,genset_number,model,rated_kw,operating_kw))";

// Combine an island's gensets (Supabase) with its statuses and projects (Google Sheet).
function summarize(island, sheet) {
  const gensets = (island.powerhouses || []).flatMap((p) => p.gensets || []).map((g) => ({
    ...g,
    running: null, status_note: null, status_date: null,
    ...sheet.status.get(gensetKey(island.name, g.genset_number)),
  }));
  const projects = sheet.projects.get(islandKey(island.name)) || [];
  return {
    id: island.id,
    name: island.name,
    gensets,
    projects,
    gensetCount: gensets.length,
    runningCount: gensets.filter((g) => g.running === true).length,
    stoppedCount: gensets.filter((g) => g.running === false).length,
    activeProjectCount: projects.filter((p) => p.status !== "Completed").length,
    ratedKw: gensets.reduce((sum, g) => sum + Number(g.rated_kw || 0), 0),
    operatingKw: gensets.reduce((sum, g) => sum + Number(g.operating_kw || 0), 0),
  };
}

export function total(rows) {
  const sum = (key) => rows.reduce((s, r) => s + r[key], 0);
  return {
    gensetCount: sum("gensetCount"),
    runningCount: sum("runningCount"),
    stoppedCount: sum("stoppedCount"),
    activeProjectCount: sum("activeProjectCount"),
    ratedKw: sum("ratedKw"),
    operatingKw: sum("operatingKw"),
  };
}

function atollRow(atoll, sheet) {
  const islands = (atoll.islands || []).map((i) => summarize(i, sheet)).sort((a, b) => a.name.localeCompare(b.name));
  return { code: atoll.code, name: atoll.name, islands, islandCount: islands.length, ...total(islands) };
}

export async function getAtolls() {
  const [{ data, error }, sheet] = await Promise.all([
    db().from("atolls").select(`code,name,islands(${ISLAND_FIELDS})`).eq("active", true).eq("islands.active", true).order("code"),
    getSheetData(),
  ]);
  if (error) throw new Error(error.message);
  return { atolls: data.map((a) => atollRow(a, sheet)), sheetOk: sheet.ok };
}

export async function getAtoll(code) {
  const [{ data, error }, sheet] = await Promise.all([
    db().from("atolls").select(`code,name,islands(${ISLAND_FIELDS})`).eq("code", code).eq("islands.active", true).maybeSingle(),
    getSheetData(),
  ]);
  if (error) throw new Error(error.message);
  return data && { ...atollRow(data, sheet), sheetOk: sheet.ok };
}

export async function getIsland(id) {
  const [{ data, error }, sheet] = await Promise.all([
    db().from("islands").select(`${ISLAND_FIELDS},atolls(code,name)`).eq("id", id).maybeSingle(),
    getSheetData(),
  ]);
  if (error) throw new Error(error.message);
  if (!data) return null;
  const island = summarize(data, sheet);
  island.atoll = data.atolls;
  island.sheetOk = sheet.ok;
  island.gensets.sort((a, b) => String(a.genset_number).localeCompare(String(b.genset_number), undefined, { numeric: true }));
  return island;
}

export function kw(value) {
  return value == null ? "—" : `${Math.round(Number(value)).toLocaleString("en-US")} kW`;
}

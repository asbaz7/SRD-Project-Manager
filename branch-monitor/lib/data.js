import { createClient } from "@supabase/supabase-js";

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false } }
  );
}

const ISLAND_FIELDS = "id,name,powerhouses(gensets(id,genset_number,model,rated_kw,operating_kw,running,status_note,status_date))";

function summarize(island) {
  const gensets = (island.powerhouses || []).flatMap((p) => p.gensets || []);
  return {
    id: island.id,
    name: island.name,
    gensets,
    gensetCount: gensets.length,
    runningCount: gensets.filter((g) => g.running === true).length,
    stoppedCount: gensets.filter((g) => g.running === false).length,
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
    ratedKw: sum("ratedKw"),
    operatingKw: sum("operatingKw"),
  };
}

function atollRow(atoll) {
  const islands = (atoll.islands || []).map(summarize).sort((a, b) => a.name.localeCompare(b.name));
  return { code: atoll.code, name: atoll.name, islands, islandCount: islands.length, ...total(islands) };
}

export async function getAtolls() {
  const { data, error } = await db()
    .from("atolls")
    .select(`code,name,islands(${ISLAND_FIELDS})`)
    .eq("active", true)
    .eq("islands.active", true)
    .order("code");
  if (error) throw new Error(error.message);
  return data.map(atollRow);
}

export async function getAtoll(code) {
  const { data, error } = await db()
    .from("atolls")
    .select(`code,name,islands(${ISLAND_FIELDS})`)
    .eq("code", code)
    .eq("islands.active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data && atollRow(data);
}

export async function getIsland(id) {
  const { data, error } = await db()
    .from("islands")
    .select(`${ISLAND_FIELDS},atolls(code,name)`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const island = summarize(data);
  island.atoll = data.atolls;
  island.gensets.sort((a, b) => String(a.genset_number).localeCompare(String(b.genset_number), undefined, { numeric: true }));
  return island;
}

export function kw(value) {
  return value == null ? "—" : `${Math.round(Number(value)).toLocaleString("en-US")} kW`;
}

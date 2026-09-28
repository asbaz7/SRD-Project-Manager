// Genset status and projects come from a shared Google Sheet
// (tabs "Gensets" and "Projects"), read as CSV on each request.
// The sheet must be shared as "Anyone with the link can view".

const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID;

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function readTab(name) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(name)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const [head = [], ...rows] = parseCsv(await res.text());
  const keys = head.map((h) => h.trim().toLowerCase());
  return rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] || "").trim()])));
}

export const islandKey = (island) => island.trim().toLowerCase();
export const gensetKey = (island, genset) => `${islandKey(island)}|${String(genset).trim()}`;

const PROJECT_ORDER = { Ongoing: 0, "On hold": 1, Planned: 2, Completed: 3 };

export async function getSheetData() {
  const empty = { ok: false, status: new Map(), projects: new Map() };
  if (!SHEET_ID) return { ...empty, ok: true }; // no sheet connected yet: nothing to warn about
  try {
    const [gensets, projects] = await Promise.all([readTab("Gensets"), readTab("Projects")]);

    const status = new Map();
    for (const g of gensets) {
      if (!g.island || !g.genset) continue;
      const answer = (g.running || "").toLowerCase();
      status.set(gensetKey(g.island, g.genset), {
        running: answer.startsWith("y") ? true : answer.startsWith("n") ? false : null,
        status_note: g.note || null,
        status_date: g["status date"] || null,
      });
    }

    const byIsland = new Map();
    for (const p of projects) {
      if (!p.island || !p.project) continue;
      const list = byIsland.get(islandKey(p.island)) || [];
      list.push({ name: p.project, status: p.status || "Ongoing", update: p["latest update"] || null, date: p["update date"] || null });
      byIsland.set(islandKey(p.island), list);
    }
    for (const list of byIsland.values()) {
      list.sort((a, b) => (PROJECT_ORDER[a.status] ?? 9) - (PROJECT_ORDER[b.status] ?? 9) || a.name.localeCompare(b.name));
    }

    return { ok: true, status, projects: byIsland };
  } catch (error) {
    console.error("Could not read the status sheet:", error.message);
    return empty;
  }
}

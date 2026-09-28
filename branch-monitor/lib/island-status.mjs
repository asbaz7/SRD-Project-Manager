export function capacityStatus(record) {
  if (!record || !Number.isFinite(record.firm) || !Number.isFinite(record.peak)) return { code: 'unknown', label: 'No capacity data', tone: 'neutral' };
  const entry = record.demand.find(d => d.year === 2026 && Number.isFinite(d.maximum));
  if (entry && entry.maximum > record.firm) return { code: 'shortfall', label: '2026 demand above firm capacity', tone: 'danger' };
  if (record.peak > record.firm) return { code: 'shortfall', label: 'Peak above firm capacity', tone: 'danger' };
  if (record.peak > 0 && (record.firm - record.peak) / record.peak < 0.1) return { code: 'limited', label: 'Limited firm reserve', tone: 'warning' };
  return { code: 'covered', label: 'Firm capacity covers listed demand', tone: 'positive' };
}

export const islandKey = (atoll, name) => `${String(atoll || '').replace(/[^a-z]/gi, '').toLowerCase()}:${String(name || '').trim().toLowerCase()}`;

export function mergeIslands(records, registered) {
  const map = new Map(records.map(record => [islandKey(record.atoll, record.name), { id: record.id, name: record.name, atoll: record.atoll, record }]));
  for (const island of registered) {
    const atoll = island.atolls?.code || '';
    const key = islandKey(atoll, island.name);
    if (!map.has(key)) map.set(key, { id: island.id, name: island.name, atoll, record: null });
  }
  return [...map.values()].sort((a, b) => a.atoll.localeCompare(b.atoll) || a.name.localeCompare(b.name));
}

// A genset's faults (migration 060): several at once, each logged and cleared
// on its own in fault_log. The genset's fault_level / fault_note sum up the
// open ones (kept by a trigger): the worst level, the descriptions joined.

/**
 * Records a fault. The same words as an open fault are that fault, not a new
 * one (its level is updated if it changed), so saving a form twice or saying
 * it again on Telegram doesn't log it twice.
 */
export async function noteFault(t, assetId, { level, note, userId }) {
  const text = note?.trim() || null;
  const { rows: [same] } = await t.query(`
    select id, level from fault_log
     where asset_id = $1 and cleared_at is null and lower(coalesce(note, '')) = lower(coalesce($2, '')) limit 1`, [assetId, text]);
  if (same) {
    if (same.level !== level) await t.query('update fault_log set level = $2 where id = $1', [same.id, level]);
    return { id: same.id, level, note: text, existing: true };
  }
  const { rows: [f] } = await t.query(
    'insert into fault_log (asset_id, level, note, logged_by) values ($1, $2, $3, $4) returning id, level, note, logged_at',
    [assetId, level, text, userId]);
  return f;
}

/** Clears a genset's open faults (or just one), saying why. */
export async function clearFaults(t, assetId, { reason, userId, faultId = null }) {
  const { rowCount } = await t.query(`
    update fault_log set cleared_at = now(), cleared_by = $2, cleared_reason = $3
     where asset_id = $1 and cleared_at is null and ($4::bigint is null or id = $4)`,
  [assetId, userId, reason, faultId]);
  return rowCount;
}

// Moving an asset (usually a genset) to another facility, e.g. from one
// island's powerhouse to another's. The asset row keeps its id, so its
// history goes with it; asset_moves records the move.
import { conflict, badRequest } from './errors.js';

// Serial numbers as written in reports vary ("41 316-937"): compare letters
// and digits only, and only when long enough to be meaningful.
export const normSerial = (s) => {
  const n = String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return n.length >= 5 && !/^0+$/.test(n) ? n : null;
};

// The one active genset elsewhere with this serial number, or null (none, or
// more than one: ambiguous, so not guessed).
export async function gensetBySerial(db, serial, notFacilityId) {
  const key = normSerial(serial);
  if (!key) return null;
  const { rows } = await db.query(`
    select s.id, s.tag, s.facility_id, s.serial_no, f.name as facility_name, i.name as island_name, a.code as atoll_code
      from assets s join facilities f on f.id = s.facility_id join islands i on i.id = f.island_id join atolls a on a.id = i.atoll_id
     where s.kind = 'genset' and s.active and s.facility_id <> $2
       and upper(regexp_replace(coalesce(s.serial_no, ''), '[^A-Za-z0-9]', '', 'g')) = $1`, [key, notFacilityId]);
  return rows.length === 1 ? rows[0] : null;
}

export async function moveAsset(t, { assetId, facilityId, tag, movedOn, notes = null, userId, moveOpenWork = true, source = 'manual', workId = null }) {
  const { rows: [asset] } = await t.query(
    'select s.id, s.kind, s.tag, s.facility_id, f.service from assets s join facilities f on f.id = s.facility_id where s.id = $1', [assetId]);
  if (!asset) throw badRequest('Unknown asset');
  const { rows: [dest] } = await t.query('select id, island_id, service, name from facilities where id = $1', [facilityId]);
  if (!dest) throw badRequest('Unknown destination');
  if (dest.service !== asset.service) throw badRequest(`That is a ${dest.service} facility; this asset belongs to ${asset.service}`);
  const newTag = String(tag || asset.tag).trim();
  if (dest.id === asset.facility_id && newTag === asset.tag) throw badRequest('That is where it already is');
  const { rows: clash } = await t.query(
    'select id, active from assets where facility_id = $1 and kind = $2 and tag = $3 and id <> $4', [dest.id, asset.kind, newTag, assetId]);
  if (clash.length) {
    throw conflict(`${dest.name} already has ${asset.kind === 'genset' ? 'Genset' : 'an asset numbered'} ${newTag}${clash[0].active ? '' : ' (not in use)'}. Choose another number, or move or rename that one first.`);
  }
  await t.query('update assets set facility_id = $2, tag = $3 where id = $1', [assetId, dest.id, newTag]);
  const { rows: [move] } = await t.query(`
    insert into asset_moves (asset_id, from_facility_id, to_facility_id, from_tag, to_tag, moved_on, notes, source, moved_by, work_id)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning *`,
  [assetId, asset.facility_id, dest.id, asset.tag, newTag, movedOn, notes, source, userId, workId]);
  // Ongoing work on the asset follows it; finished work stays where it happened.
  if (moveOpenWork) {
    await t.query(`update work_orders set island_id = $2, facility_id = $3
                    where asset_id = $1 and status not in ('completed', 'cancelled') and kind <> 'relocation'`, [assetId, dest.island_id, dest.id]);
  }
  return move;
}

// Checks a planned move: the destination is another facility of the same
// service and the number is free there. Returns the asset and destination.
export async function checkMovePlan(db, { assetId, destFacilityId, destTag, workId = null }) {
  const { rows: [asset] } = await db.query(`
    select s.id, s.kind, s.tag, s.facility_id, f.service, f.island_id from assets s join facilities f on f.id = s.facility_id
     where s.id = $1`, [assetId]);
  if (!asset) throw badRequest('Choose the genset or asset being moved');
  const { rows: [dest] } = await db.query(`
    select f.id, f.name, f.service, f.island_id, i.name as island_name, a.code as atoll_code
      from facilities f join islands i on i.id = f.island_id join atolls a on a.id = i.atoll_id where f.id = $1`, [destFacilityId]);
  if (!dest) throw badRequest('Choose where it is going');
  if (dest.service !== asset.service) throw badRequest(`${dest.name} is a ${dest.service} facility; this asset belongs to ${asset.service}`);
  if (dest.id === asset.facility_id) throw badRequest('That is where it already is');
  const tag = String(destTag || asset.tag).trim();
  const { rows: clash } = await db.query(
    'select id from assets where facility_id = $1 and kind = $2 and tag = $3 and id <> $4', [dest.id, asset.kind, tag, assetId]);
  if (clash.length) throw conflict(`${dest.name} already has ${asset.kind === 'genset' ? 'Genset' : 'an asset numbered'} ${tag}. Choose another number.`);
  const { rows: open } = await db.query(`
    select id from work_orders where asset_id = $1 and kind = 'relocation' and status not in ('completed', 'cancelled')
       and id is distinct from $2`, [assetId, workId]);
  if (open.length) throw conflict(`This is already being moved (WO-${String(open[0].id).padStart(4, '0')}).`);
  return { asset, dest, tag };
}

// Folds a duplicate record of a genset (`sourceId`, e.g. the decommissioned
// entry at the island it left) into the current one (`targetId`). Its
// history moves across; where both have the same record (a maintenance
// entry, a month's hours or report), the current one's is kept. The move is
// recorded, register details the current one lacks are filled in, and the
// duplicate is deleted (the audit trail keeps it).
export async function mergeAssets(t, { targetId, sourceId, movedOn, notes = null, userId }) {
  if (targetId === sourceId) throw badRequest('Choose a different record to merge in');
  const { rows } = await t.query(`
    select s.*, f.service, f.name as facility_name from assets s join facilities f on f.id = s.facility_id
     where s.id = any($1::uuid[])`, [[targetId, sourceId]]);
  const target = rows.find((r) => r.id === targetId);
  const source = rows.find((r) => r.id === sourceId);
  if (!target || !source) throw badRequest('Unknown asset');
  if (target.kind !== source.kind || target.service !== source.service) throw badRequest('Only records of the same kind of asset can be merged');
  const { rows: openMoves } = await t.query(`select id from work_orders where asset_id = any($1::uuid[]) and kind = 'relocation'
                                               and status not in ('completed', 'cancelled')`, [[targetId, sourceId]]);
  if (openMoves.length) throw conflict(`Finish or cancel the move in progress first (WO-${String(openMoves[0].id).padStart(4, '0')}).`);

  const p = [targetId, sourceId];
  await t.query(`update maintenance_events m set asset_id = $1 where asset_id = $2 and not exists (
                   select 1 from maintenance_events x where x.asset_id = $1 and x.kind = m.kind and x.done_on = m.done_on)`, p);
  await t.query(`update hours_log h set asset_id = $1 where asset_id = $2 and not exists (
                   select 1 from hours_log x where x.asset_id = $1 and x.month = h.month)`, p);
  await t.query(`update engine_reports r set asset_id = $1 where asset_id = $2 and not exists (
                   select 1 from engine_reports x where x.asset_id = $1 and x.report_month = r.report_month and x.source = r.source)`, p);
  // Latest condition: whichever report is newer.
  await t.query(`delete from engine_conditions c where c.asset_id = $1 and exists (
                   select 1 from engine_conditions s where s.asset_id = $2 and s.report_month > c.report_month)`, p);
  await t.query(`update engine_conditions set asset_id = $1 where asset_id = $2
                   and not exists (select 1 from engine_conditions x where x.asset_id = $1)`, p);
  for (const table of ['asset_status_log', 'work_orders', 'incidents', 'asset_moves']) {
    await t.query(`update ${table} set asset_id = $1 where asset_id = $2`, p);
  }
  // Blanks in the current register filled from the duplicate.
  await t.query(`
    update assets t set make_model = coalesce(t.make_model, s.make_model), serial_no = coalesce(t.serial_no, s.serial_no),
           rated_capacity = coalesce(t.rated_capacity, s.rated_capacity), operating_capacity = coalesce(t.operating_capacity, s.operating_capacity),
           commissioned_on = coalesce(t.commissioned_on, s.commissioned_on), fixed_asset_code = coalesce(t.fixed_asset_code, s.fixed_asset_code),
           cpl_spec = coalesce(t.cpl_spec, s.cpl_spec), alt_make = coalesce(t.alt_make, s.alt_make), alt_serial = coalesce(t.alt_serial, s.alt_serial),
           alt_frame = coalesce(t.alt_frame, s.alt_frame), alt_kw = coalesce(t.alt_kw, s.alt_kw)
      from assets s where t.id = $1 and s.id = $2`, p);
  const fromTag = String(source.tag).replace(/\s*\(removed[^)]*\)\s*$/, '');
  const serials = source.serial_no && target.serial_no && source.serial_no !== target.serial_no
    ? ` Serial numbers differed: ${source.serial_no} (old record) and ${target.serial_no}.` : '';
  const { rows: [move] } = await t.query(`
    insert into asset_moves (asset_id, from_facility_id, to_facility_id, from_tag, to_tag, moved_on, notes, source, moved_by)
    values ($1, $2, $3, $4, $5, $6, $7, 'merge', $8) returning *`,
  [targetId, source.facility_id, target.facility_id, fromTag, target.tag, movedOn,
    `${notes ? `${notes}. ` : ''}Merged the record kept at ${source.facility_name} as ${source.kind === 'genset' ? 'Genset' : ''} ${fromTag}.${serials}`.trim(), userId]);
  await t.query('delete from assets where id = $1', [sourceId]);
  return move;
}

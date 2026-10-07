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

export async function moveAsset(t, { assetId, facilityId, tag, movedOn, notes = null, userId, moveOpenWork = true, source = 'manual' }) {
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
    insert into asset_moves (asset_id, from_facility_id, to_facility_id, from_tag, to_tag, moved_on, notes, source, moved_by)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
  [assetId, asset.facility_id, dest.id, asset.tag, newTag, movedOn, notes, source, userId]);
  // Ongoing work on the asset follows it; finished work stays where it happened.
  if (moveOpenWork) {
    await t.query(`update work_orders set island_id = $2, facility_id = $3
                    where asset_id = $1 and status not in ('completed', 'cancelled')`, [assetId, dest.island_id, dest.id]);
  }
  return move;
}

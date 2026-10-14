// The system's vocabulary, in one place: services, asset kinds and statuses,
// work kinds and states. The database enforces the same lists (enums and
// checks in the migrations); the web app has its own labels in
// web/src/format.js.

export const SERVICES = ['electricity', 'water', 'sewerage'];
export const SERVICE_LABEL = { electricity: 'Electricity', water: 'Water', sewerage: 'Sewerage' };

export const FACILITY_KINDS = ['powerhouse', 'solar_plant', 'water_plant', 'water_storage', 'sewerage_plant', 'sewerage_system', 'pump_station', 'other'];
export const ASSET_KINDS = ['genset', 'solar_inverter', 'battery', 'transformer', 'ro_unit', 'pump', 'blower', 'tank', 'other'];
export const ASSET_LABELS = {
  genset: 'Genset', solar_inverter: 'Solar inverter', battery: 'Battery', transformer: 'Transformer',
  ro_unit: 'RO unit', pump: 'Pump', blower: 'Blower', tank: 'Tank', other: '',
};

// An asset's own status. 'disconnected': installed but not connected to the
// network; not running, but not a fault (migration 043).
export const ASSET_STATUSES = ['running', 'standby', 'down', 'maintenance', 'disconnected', 'decommissioned', 'unknown'];
// What people set by hand (website status form, Telegram, the assistant).
export const SETTABLE_STATUSES = ['running', 'standby', 'down', 'maintenance', 'disconnected'];
// Filterable on lists (everything but retired).
export const LISTED_STATUSES = ASSET_STATUSES.filter((s) => s !== 'decommissioned');

export const WORK_KINDS = ['overhaul', 'top_overhaul', 'alternator_service', 'repair', 'service', 'inspection', 'installation', 'relocation', 'other'];
// Moving a genset (kind 'relocation') has its own stages instead of
// in progress / awaiting parts.
export const MOVE_STAGES = ['dismantling', 'in_transit', 'installing'];
export const WORK_STATES = ['planned', 'in_progress', 'awaiting_parts', 'on_hold', ...MOVE_STAGES, 'completed', 'cancelled'];
export const WORK_STATE_LABEL = {
  planned: 'Planned', in_progress: 'In progress', awaiting_parts: 'Awaiting parts', on_hold: 'On hold',
  completed: 'Completed', cancelled: 'Cancelled', dismantling: 'Dismantling', in_transit: 'In transit', installing: 'Installing',
};
// SQL: work order w is still open.
export const OPEN_WORK = "w.status not in ('completed', 'cancelled')";

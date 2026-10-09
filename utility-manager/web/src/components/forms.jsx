// Create / edit forms for facilities and assets, shown in modals.
import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useSubmit } from '../hooks.js';
import { ASSET_KINDS, FACILITY_KINDS, SERVICES } from '../format.js';
import { ErrorBox, Field, Modal, Select } from './ui.jsx';

const numOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
const strOrNull = (v) => (v === '' ? null : v);

export function FacilityForm({ islandId, facility, onClose, onSaved }) {
  const [f, setF] = useState(facility || { service: 'electricity', kind: 'powerhouse', name: '', active: true });
  const set = (k) => (v) => setF({ ...f, [k]: v?.target ? v.target.value : v });
  const { submit, busy, error } = useSubmit(async () => {
    const body = {
      service: f.service, kind: f.kind, name: f.name,
      fuel_capacity_l: numOrNull(f.fuel_capacity_l), water_capacity_m3: numOrNull(f.water_capacity_m3),
      commissioned_on: strOrNull(f.commissioned_on || ''), notes: f.notes || null,
    };
    if (facility) await api(`/facilities/${facility.id}`, { method: 'PATCH', body: { ...body, active: f.active } });
    else await api('/facilities', { method: 'POST', body: { ...body, island_id: islandId } });
    onSaved();
  });
  const { can } = useAuth();
  const remove = useSubmit(async () => {
    if (!window.confirm(`Delete ${facility.name} and its ${facility.assets?.length || 0} asset(s)? Only do this for something added by mistake. It can't be undone.`)) return;
    await api(`/facilities/${facility.id}`, { method: 'DELETE' });
    onSaved();
  });
  return (
    <Modal title={facility ? `Edit ${facility.name}` : 'Add facility'} onClose={onClose}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <ErrorBox error={error || remove.error} />
        <Field label="Name" wide><input required value={f.name} onChange={set('name')} placeholder="e.g. Maafushi RO Plant" /></Field>
        <Field label="Service"><Select value={f.service} onChange={set('service')} options={Object.entries(SERVICES).map(([k, s]) => [k, s.label])} /></Field>
        <Field label="Type"><Select value={f.kind} onChange={set('kind')} options={FACILITY_KINDS} /></Field>
        {f.service === 'electricity' && <Field label="Fuel capacity (L)"><input type="number" min="0" step="any" value={f.fuel_capacity_l ?? ''} onChange={set('fuel_capacity_l')} /></Field>}
        {f.service === 'water' && <Field label="Water storage capacity (m³)"><input type="number" min="0" step="any" value={f.water_capacity_m3 ?? ''} onChange={set('water_capacity_m3')} /></Field>}
        <Field label="Commissioned on"><input type="date" value={f.commissioned_on ?? ''} onChange={set('commissioned_on')} /></Field>
        <Field label="Notes" wide><textarea rows="2" value={f.notes ?? ''} onChange={set('notes')} /></Field>
        {facility && <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => set('active')(e.target.checked)} /> In use</label>}
        <div className="form-actions">
          {facility && can('admin') && <button type="button" className="btn ghost danger" style={{ marginRight: 'auto' }} disabled={remove.busy} onClick={remove.submit}>Delete</button>}
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>Save</button></div>
      </form>
    </Modal>
  );
}

const DEFAULT_UNIT = { genset: 'kW', solar_inverter: 'kW', battery: 'kWh', transformer: 'kVA', ro_unit: 'm3/day', pump: 'm3/h', blower: 'kW', tank: 'm3' };

export function AssetForm({ facilityId, asset, onClose, onSaved }) {
  const [a, setA] = useState(asset || { kind: 'genset', tag: '', capacity_unit: 'kW', active: true });
  const set = (k) => (v) => setA({ ...a, [k]: v?.target ? v.target.value : v });
  const { submit, busy, error } = useSubmit(async () => {
    const body = {
      kind: a.kind, tag: a.tag, make_model: a.make_model || null, serial_no: a.serial_no || null,
      rated_capacity: numOrNull(a.rated_capacity), operating_capacity: numOrNull(a.operating_capacity),
      capacity_unit: a.capacity_unit || null, commissioned_on: strOrNull(a.commissioned_on || ''),
      running_hours: numOrNull(a.running_hours), notes: a.notes || null,
      ...(a.kind === 'genset' ? {
        fixed_asset_code: a.fixed_asset_code || null, alt_make: a.alt_make || null, alt_serial: a.alt_serial || null,
        alt_frame: a.alt_frame || null, cpl_spec: a.cpl_spec || null,
        alt_kw: numOrNull(a.alt_kw), next_overhaul_hours: numOrNull(a.next_overhaul_hours),
        next_overhaul_on: strOrNull(a.next_overhaul_on || ''), next_alt_service_on: strOrNull(a.next_alt_service_on || ''),
      } : {}),
    };
    if (asset) await api(`/assets/${asset.id}`, { method: 'PATCH', body: { ...body, active: a.active } });
    else await api('/assets', { method: 'POST', body: { ...body, facility_id: facilityId } });
    onSaved();
  });
  return (
    <Modal title={asset ? `Edit ${ASSET_KINDS[asset.kind]} ${asset.tag}` : 'Add asset'} onClose={onClose}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <ErrorBox error={error} />
        <Field label="Type"><Select value={a.kind} onChange={(v) => setA({ ...a, kind: v, capacity_unit: DEFAULT_UNIT[v] || a.capacity_unit })} options={ASSET_KINDS} /></Field>
        <Field label="Number / tag" hint="e.g. 3, RO-2, P-01"><input required value={a.tag} onChange={set('tag')} /></Field>
        <Field label="Make & model"><input value={a.make_model ?? ''} onChange={set('make_model')} /></Field>
        <Field label="Serial number"><input value={a.serial_no ?? ''} onChange={set('serial_no')} /></Field>
        <Field label="Rated capacity"><input type="number" min="0" step="any" value={a.rated_capacity ?? ''} onChange={set('rated_capacity')} /></Field>
        <Field label="Operating (derated) capacity"><input type="number" min="0" step="any" value={a.operating_capacity ?? ''} onChange={set('operating_capacity')} /></Field>
        <Field label="Capacity unit"><input value={a.capacity_unit ?? ''} onChange={set('capacity_unit')} /></Field>
        {a.kind !== 'genset' && <Field label="Running hours"><input type="number" min="0" step="any" value={a.running_hours ?? ''} onChange={set('running_hours')} /></Field>}
        <Field label={a.kind === 'genset' ? 'Installed on' : 'Commissioned on'}><input type="date" value={a.commissioned_on ?? ''} onChange={set('commissioned_on')} /></Field>
        {a.kind === 'genset' && <>
          <Field label="Fixed asset code"><input value={a.fixed_asset_code ?? ''} onChange={set('fixed_asset_code')} /></Field>
          <Field label="Alternator make"><input value={a.alt_make ?? ''} onChange={set('alt_make')} placeholder="e.g. STAMFORD" /></Field>
          <Field label="Alternator serial"><input value={a.alt_serial ?? ''} onChange={set('alt_serial')} /></Field>
          <Field label="Alternator frame"><input value={a.alt_frame ?? ''} onChange={set('alt_frame')} /></Field>
          <Field label="CPL / spec no."><input value={a.cpl_spec ?? ''} onChange={set('cpl_spec')} /></Field>
          <Field label="Alternator capacity (kW)"><input type="number" min="0" step="any" value={a.alt_kw ?? ''} onChange={set('alt_kw')} /></Field>
          <p className="wide muted small">Schedule (from the overhaul and alternator service schedules):</p>
          <Field label="Next overhaul at (running hours)"><input type="number" min="0" step="any" value={a.next_overhaul_hours ?? ''} onChange={set('next_overhaul_hours')} /></Field>
          <Field label="Next overhaul by (date)"><input type="date" value={a.next_overhaul_on ?? ''} onChange={set('next_overhaul_on')} /></Field>
          <Field label="Next alternator service"><input type="date" value={a.next_alt_service_on ?? ''} onChange={set('next_alt_service_on')} /></Field>
        </>}
        <Field label="Notes" wide><textarea rows="2" value={a.notes ?? ''} onChange={set('notes')} /></Field>
        {asset && <label className="check"><input type="checkbox" checked={a.active} onChange={(e) => set('active')(e.target.checked)} /> In use</label>}
        <div className="form-actions"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>Save</button></div>
      </form>
    </Modal>
  );
}

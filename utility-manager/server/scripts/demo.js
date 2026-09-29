// Private demo: builds a throwaway database full of realistic sample data and
// starts the app on this computer only (http://localhost:3000).
//
//   npm run demo          (from the utility-manager folder)
//
// Every run starts from a fresh demo database in server/data/demo. It never
// touches real data (server/data/pglite) or any Postgres server.
import { rm } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../src/auth.js';
import { createDb } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { seedRegister } from './seed.js';

const DIR = fileURLToPath(new URL('../data/demo', import.meta.url));
const PASSWORD = 'demo-password-1';
const TODAY = "(now() at time zone 'Indian/Maldives')::date";

const USERS = [
  ['admin@demo.local', 'Aishath Admin', 'admin', null, 'Administrator — can do everything'],
  ['manager@demo.local', 'Mohamed Manager', 'manager', { atoll: 'K' }, 'Manager for Kaafu (K) atoll'],
  ['operator@demo.local', 'Ibrahim Operator', 'operator', { island: 'Maafushi' }, 'Operator at Maafushi only'],
  ['viewer@demo.local', 'Fathimath Viewer', 'viewer', null, 'Can only view'],
];

const WATER_ISLANDS = ['Maafushi', 'Guraidhoo', 'Thulusdhoo', 'Mahibadhoo', 'Dhigurah', 'Mulah'];
const SEWERAGE_ISLANDS = ['Maafushi', 'Thulusdhoo', 'Mahibadhoo'];

async function build() {
  await rm(DIR, { recursive: true, force: true });
  const db = await createDb({ pgliteDir: DIR });
  await migrate(db, {});
  await seedRegister(db);

  // Users
  const hash = await hashPassword(PASSWORD);
  const ids = {};
  for (const [email, name, role, scope] of USERS) {
    const { rows } = await db.query(
      `insert into users (email, full_name, role, password_hash, must_change_password, designation)
       values ($1, $2, $3, $4, false, $5) returning id`,
      [email, name, role, hash, { admin: 'Head of Department', manager: 'Senior Engineer', operator: 'Powerhouse Operator', viewer: 'Planning Officer' }[role]]);
    ids[role] = rows[0].id;
    if (scope?.atoll) await db.query('insert into user_scopes (user_id, atoll_id) select $1, id from atolls where code = $2', [ids[role], scope.atoll]);
    if (scope?.island) await db.query('insert into user_scopes (user_id, island_id) select $1, id from islands where name = $2', [ids[role], scope.island]);
  }

  await db.tx(ids.operator, async (t) => {
    // Water and sewerage facilities on a few islands, so all three services show.
    for (const island of WATER_ISLANDS) {
      await t.query(`insert into facilities (island_id, service, kind, name, water_capacity_m3)
                     select id, 'water', 'water_plant', name || ' RO Plant', 400 from islands where name = $1`, [island]);
      for (const tag of ['RO-1', 'RO-2']) {
        await t.query(`insert into assets (facility_id, kind, tag, make_model, rated_capacity, capacity_unit)
                       select f.id, 'ro_unit', $2, 'Seawater RO 100', 100, 'm3/day'
                         from facilities f join islands i on i.id = f.island_id where i.name = $1 and f.service = 'water'`, [island, tag]);
      }
    }
    for (const island of SEWERAGE_ISLANDS) {
      await t.query(`insert into facilities (island_id, service, kind, name)
                     select id, 'sewerage', 'sewerage_plant', name || ' Sewage Plant' from islands where name = $1`, [island]);
      for (const tag of ['P-01', 'P-02']) {
        await t.query(`insert into assets (facility_id, kind, tag, make_model, rated_capacity, capacity_unit)
                       select f.id, 'pump', $2, 'Grundfos SE1', 40, 'm3/h'
                         from facilities f join islands i on i.id = f.island_id where i.name = $1 and f.service = 'sewerage'`, [island, tag]);
      }
    }
    await t.query("update facilities set fuel_capacity_l = 50000 + floor(random() * 10) * 10000 where service = 'electricity'");

    // 60 days of daily logs.
    const days = `generate_series(${TODAY} - 60, ${TODAY} - 1, interval '1 day') d`;
    await t.query(`
      insert into readings (facility_id, reading_date, metric, value, entered_by)
      select f.id, d::date, 'gross_generation_kwh', round(cap.kw * 24 * (0.26 + random() * 0.08)), $1
        from facilities f
        join (select facility_id, sum(rated_capacity) as kw from assets group by facility_id) cap on cap.facility_id = f.id
        cross join ${days}
       where f.service = 'electricity'`, [ids.operator]);
    await t.query(`
      insert into readings (facility_id, reading_date, metric, value, entered_by)
      select r.facility_id, r.reading_date, m.metric,
             case m.metric
               when 'fuel_consumed_l' then round(r.value / (3.4 + random() * 0.7))
               when 'peak_load_kw' then round(r.value / 24 * (1.45 + random() * 0.2))
               when 'aux_consumption_kwh' then round(r.value * (0.02 + random() * 0.015))
             end, r.entered_by
        from readings r
        cross join (values ('fuel_consumed_l'), ('peak_load_kw'), ('aux_consumption_kwh')) m(metric)
       where r.metric = 'gross_generation_kwh'`);
    await t.query(`
      insert into readings (facility_id, reading_date, metric, value, entered_by)
      select f.id, d::date, m.metric,
             case m.metric
               when 'water_produced_m3' then round(150 + random() * 40)
               when 'water_supplied_m3' then round(135 + random() * 30)
               when 'water_energy_kwh' then round(600 + random() * 150)
               when 'water_tds_ppm' then round(280 + random() * 120)
               when 'water_storage_m3' then round(180 + random() * 150)
             end, $1
        from facilities f cross join ${days}
        cross join (values ('water_produced_m3'), ('water_supplied_m3'), ('water_energy_kwh'), ('water_tds_ppm'), ('water_storage_m3')) m(metric)
       where f.service = 'water'`, [ids.operator]);
    await t.query(`
      insert into readings (facility_id, reading_date, metric, value, entered_by)
      select f.id, d::date, m.metric,
             case m.metric
               when 'sewage_pumped_m3' then round(110 + random() * 50)
               when 'sewer_energy_kwh' then round(45 + random() * 20)
               when 'pump_runtime_h' then round(14 + random() * 8)
             end, $1
        from facilities f cross join ${days}
        cross join (values ('sewage_pumped_m3'), ('sewer_energy_kwh'), ('pump_runtime_h')) m(metric)
       where f.service = 'sewerage'`, [ids.operator]);
    await t.query(`
      insert into readings (facility_id, reading_date, metric, value, entered_by)
      select f.id, d::date, 'fuel_stock_l', round(f.fuel_capacity_l * (0.35 + random() * 0.55)), $1
        from facilities f cross join ${days}
       where f.service = 'electricity' and f.fuel_capacity_l is not null`, [ids.operator]);
    // A few islands haven't sent yesterday's log yet (shows on the Overview).
    await t.query(`
      delete from readings where reading_date = ${TODAY} - 1 and facility_id in
        (select f.id from facilities f join islands i on i.id = f.island_id
          where i.name in ('Gulhi', 'Rakeedhoo', 'Veyvah', 'Fenfushi') and f.service = 'electricity')`);

    // Asset status from this morning's round.
    await t.query(`
      insert into asset_status_log (asset_id, status, reported_at, reported_by)
      select id, case when random() < 0.55 then 'running'::asset_status else 'standby'::asset_status end,
             now() - interval '3 hours', $1
        from assets`, [ids.operator]);
    const down = [
      ['Gulhi', 'genset', '3', 'down', 'Turbocharger failure — replacement ordered from Malé'],
      ['Maafushi', 'genset', '4', 'maintenance', '12,000-hour overhaul in progress'],
      ['Mulah', 'genset', '3', 'down', 'Radiator leak, awaiting parts'],
      ['Felidhoo', 'genset', '1', 'down', 'Alternator winding fault'],
      ['Guraidhoo', 'ro_unit', 'RO-2', 'down', 'High-pressure pump seal failure'],
    ];
    for (const [island, kind, tag, status, note] of down) {
      await t.query(`
        insert into asset_status_log (asset_id, status, note, reported_at, reported_by)
        select a.id, $4, $5, now() - interval '2 hours', $6
          from assets a join facilities f on f.id = a.facility_id join islands i on i.id = f.island_id
         where i.name = $1 and a.kind = $2 and a.tag = $3`, [island, kind, tag, status, note, ids.operator]);
    }

    // Incidents
    const incidents = [
      ['Gulhi', 'electricity', 'breakdown', 'high', 'Genset 3 turbocharger failure', "now() - interval '3 days'", null, null, 'Turbo seized during evening peak. Load shared across gensets 1, 2 and 4.'],
      ['Rakeedhoo', 'electricity', 'outage', 'critical', 'Island-wide power outage', "now() - interval '40 minutes'", null, 420, 'All feeders tripped. Team on site investigating.'],
      ['Guraidhoo', 'water', 'breakdown', 'medium', 'RO-2 high-pressure pump seal failure', "now() - interval '1 day'", null, null, 'Running on RO-1 only; supply restricted to 6am–10pm.'],
      ['Maafushi', 'electricity', 'outage', 'medium', 'Feeder 2 trip during storm', "now() - interval '9 days'", '85 minutes', 310, 'Tree branch on overhead line.'],
      ['Thulusdhoo', 'sewerage', 'quality', 'low', 'Blockage at pump station inlet', "now() - interval '14 days'", '5 hours', null, 'Cleared by vacuum truck.'],
      ['Mahibadhoo', 'electricity', 'outage', 'high', 'Partial load shedding at night', "now() - interval '20 days'", '3 hours', 800, 'Two gensets down at the same time.'],
    ];
    for (const [island, service, category, severity, title, started, duration, customers, description] of incidents) {
      await t.query(`
        insert into incidents (service, island_id, category, severity, title, description, started_at, resolved_at,
                               customers_affected, status, resolution, reported_by, resolved_by)
        select $2, i.id, $3, $4, $5, $6, ${started}, ${started} + $7::interval, $8,
               case when $7::interval is null then 'open' else 'resolved' end::incident_state,
               case when $7::interval is null then null else 'Fixed and back in service.' end, $9,
               case when $7::interval is null then null else $9::uuid end
          from islands i where i.name = $1`,
      [island, service, category, severity, title, description, duration, customers, ids.operator]);
    }
  });

  await db.tx(ids.manager, async (t) => {
    const projects = [
      ['Maafushi', 'electricity', 'Powerhouse extension and 2 MW genset', 'ongoing', 45, 12500000, 'Island Engineering Pvt Ltd', -120, 90],
      ['Guraidhoo', 'water', 'New 200 m³/day RO plant', 'ongoing', 70, 4200000, 'AquaTech Maldives', -150, 20],
      ['Thulusdhoo', 'sewerage', 'Sewer network phase 2', 'on_hold', 30, 8800000, 'Coastal Works', -200, -10],
      ['Himmafushi', 'electricity', '400 kWp rooftop solar', 'planned', 0, 3600000, null, 30, 240],
      ['Kaashidhoo', 'electricity', 'Fuel tank farm upgrade', 'completed', 100, 1900000, 'Island Engineering Pvt Ltd', -300, -60],
    ];
    for (const [island, service, title, status, pct, budget, contractor, start, target] of projects) {
      const { rows } = await t.query(`
        insert into projects (service, island_id, title, status, progress_pct, budget, contractor, start_date, target_date,
                              completed_on, owner_id, created_by)
        select $2::service_type, id, $3, $4::project_state, $5, $6, $7, current_date + $8::int, current_date + $9::int,
               case when $4::project_state = 'completed' then current_date - 65 end, $10::uuid, $10::uuid
          from islands where name = $1 returning id`,
      [island, service, title, status, pct, budget, contractor, start, target, ids.manager]);
      if (pct > 0) {
        await t.query(`insert into project_updates (project_id, body, progress_pct, created_by, created_at)
                       values ($1, 'Contract signed and site handed over.', $2, $3, now() - interval '60 days'),
                              ($1, 'Work progressing to plan. Materials delivered.', $4, $3, now() - interval '12 days')`,
        [rows[0].id, Math.round(pct / 3), ids.manager, pct]);
      }
    }
  });

  await db.close();
}

console.log('Building demo database with sample data…');
await build();

process.env.PGLITE_DIR = DIR;
process.env.HOST ||= '127.0.0.1'; // only this computer can open it
process.env.PORT ||= '3000';
process.env.LOG_LEVEL ||= 'warn';
delete process.env.DATABASE_URL;

// Tell the person running the demo who can open it, and the link to share.
function where() {
  const port = process.env.PORT;
  const local = `  Open  http://localhost:${port}`;
  if (['127.0.0.1', 'localhost', '::1'].includes(process.env.HOST)) return `${local}   (only this computer can see it)`;
  const lan = Object.values(networkInterfaces()).flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => `        http://${a.address}:${port}`);
  return `${local}

  Colleagues on the same network can open:
${lan.join('\n') || '        (no network address found)'}
  If it doesn't load for them, allow Node through this computer's firewall.`;
}

console.log(`
  SRD Utility Manager — demo
${where()}

  Sign in with any of these (password for all: ${PASSWORD}):
${USERS.map(([email, , , , what]) => `    ${email.padEnd(22)} ${what}`).join('\n')}

  Sample data: 60 days of daily logs, water and sewerage plants on a few
  islands, assets down, open incidents and projects. Running the demo again
  resets everything. Press Ctrl+C to stop.
`);
await import('../src/index.js');

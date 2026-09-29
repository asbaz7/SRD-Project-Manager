// Loads the SRD asset register (atolls, islands, powerhouses, gensets) from
// seed/srd_register.tsv. Safe to run more than once: existing rows are kept.
//   npm run seed
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db.js';
import { migrate } from '../src/migrate.js';

const ATOLLS = { K: 'Kaafu', ADh: 'Alif Dhaalu', V: 'Vaavu', M: 'Meemu' };

export async function seedRegister(db) {
  const tsv = await readFile(new URL('../seed/srd_register.tsv', import.meta.url), 'utf8');
  const rows = tsv.trim().split('\n').map((line) => {
    const [atoll, island, tag, model, rated, operating] = line.split('\t');
    return { atoll, island, tag, model, rated: Number(rated) || null, operating: Number(operating) || null };
  });

  await db.tx(null, async (t) => {
    for (const [code, name] of Object.entries(ATOLLS)) {
      await t.query('insert into atolls (code, name) values ($1, $2) on conflict (code) do nothing', [code, name]);
    }
    for (const r of rows) {
      await t.query(`
        insert into islands (atoll_id, name) select id, $2 from atolls where code = $1
        on conflict (atoll_id, name) do nothing`, [r.atoll, r.island]);
      await t.query(`
        insert into facilities (island_id, service, kind, name)
        select i.id, 'electricity', 'powerhouse', $2 || ' Powerhouse'
          from islands i join atolls a on a.id = i.atoll_id where a.code = $1 and i.name = $2
        on conflict (island_id, name) do nothing`, [r.atoll, r.island]);
      await t.query(`
        insert into assets (facility_id, kind, tag, make_model, rated_capacity, operating_capacity, capacity_unit)
        select f.id, 'genset', $3, $4, $5, $6, 'kW'
          from facilities f join islands i on i.id = f.island_id join atolls a on a.id = i.atoll_id
         where a.code = $1 and i.name = $2 and f.name = $2 || ' Powerhouse'
        on conflict (facility_id, kind, tag) do nothing`, [r.atoll, r.island, r.tag, r.model, r.rated, r.operating]);
    }
  });
  // Fuel storage capacity per island, from the old shared sheet's "Islands"
  // tab. Only fills powerhouses where it isn't set yet.
  const fuel = (await readFile(new URL('../seed/fuel_capacity.tsv', import.meta.url), 'utf8'))
    .trim().split('\n').slice(1).map((line) => line.split('\t'));
  await db.tx(null, async (t) => {
    for (const [atoll, island, litres] of fuel) {
      await t.query(`
        update facilities f set fuel_capacity_l = $3
          from islands i join atolls a on a.id = i.atoll_id
         where f.island_id = i.id and a.code = $1 and i.name = $2
           and f.kind = 'powerhouse' and f.fuel_capacity_l is null`, [atoll, island, Number(litres)]);
    }
  });
  return rows.length;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = await createDb(loadConfig());
  await migrate(db, {});
  const n = await seedRegister(db);
  console.log(`Seeded asset register (${n} gensets)`);
  await db.close();
}

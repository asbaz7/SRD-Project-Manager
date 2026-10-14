-- The national takeover (Oct 2026): utility services on every inhabited
-- island moving from FENAKA to STELCO, across the 20 atolls. A register of
-- its own (takeover_islands), apart from SRD's island register: islands
-- outside SRD are tracked here only, and an island SRD manages links to its
-- record (island_id). Atolls are listed in code (src/nationalAtolls.js).
--
-- Each service (electricity, water, sewerage) is taken over, pending (still
-- with FENAKA) or not applicable, with a date: when taken over, or when
-- planned while pending. An island counts as taken over once every service
-- that applies to it is.

create table takeover_islands (
  id                   bigint generated always as identity primary key,
  atoll_code           text not null,
  name                 text not null,
  island_id            uuid unique references islands(id) on delete set null,
  phase                text,
  electricity_status   text check (electricity_status in ('taken_over', 'pending', 'not_applicable')),
  electricity_on       date,
  water_status         text check (water_status in ('taken_over', 'pending', 'not_applicable')),
  water_on             date,
  sewerage_status      text check (sewerage_status in ('taken_over', 'pending', 'not_applicable')),
  sewerage_on          date,
  notes                text,
  updated_at           timestamptz not null default now(),
  updated_by           uuid references users(id) on delete set null,
  unique (atoll_code, name)
);
create trigger takeover_islands_touch before update on takeover_islands for each row execute function touch_updated_at();
create trigger audit after insert or update or delete on takeover_islands for each row execute function audit_row();

-- SRD's islands start it: electricity already with STELCO in AA, ADh, K, M
-- and V; F, Dh and Th pending, with their water and sewerage where they have
-- those plants. The rest is entered on the website.
insert into takeover_islands (atoll_code, name, island_id, electricity_status, water_status, sewerage_status)
select a.code, i.name, i.id,
       case when a.code in ('F', 'Dh', 'Th') then 'pending' else 'taken_over' end,
       case when a.code in ('F', 'Dh', 'Th') and exists (select 1 from facilities f where f.island_id = i.id and f.active and f.service = 'water') then 'pending' end,
       case when a.code in ('F', 'Dh', 'Th') and exists (select 1 from facilities f where f.island_id = i.id and f.active and f.service = 'sewerage') then 'pending' end
  from islands i join atolls a on a.id = i.atoll_id
 where i.active and exists (select 1 from facilities f where f.island_id = i.id and f.active)
on conflict do nothing;

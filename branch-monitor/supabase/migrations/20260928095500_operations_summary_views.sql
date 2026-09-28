create or replace view public.operations_atoll_summary
with (security_invoker=true) as
select
  a.id,
  a.code,
  a.name,
  count(distinct i.id)::int as island_count,
  count(distinct p.id)::int as powerhouse_count,
  count(g.id)::int as genset_count,
  count(g.id) filter (where g.condition_status='attention')::int as attention_count,
  count(g.id) filter (where g.condition_status in ('critical','out_of_service'))::int as critical_count
from public.atolls a
left join public.islands i on i.atoll_id=a.id and i.active
left join public.powerhouses p on p.island_id=i.id and p.active
left join public.gensets g on g.powerhouse_id=p.id
where a.active
group by a.id,a.code,a.name;

grant select on public.operations_atoll_summary to authenticated;

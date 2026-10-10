-- Work logged from a fault, and work assigned to a person (Oct 2026).
--
-- fault_report_month: the condition report whose fault this work deals
-- with. Once the work is completed, that fault leaves the Needs attention
-- list (until a newer report says otherwise).
-- assigned_user_id: who it is assigned to among SRD's users; assigned_to
-- stays as free text for contractors and teams.

alter table work_orders
  add column fault_report_month date,
  add column assigned_user_id uuid references users(id) on delete set null;
create index work_orders_assignee_idx on work_orders (assigned_user_id) where assigned_user_id is not null;

-- Merging duplicate genset records (Oct 2026).
--
-- A genset moved by decommissioning it at the old island and registering it
-- again at the new one (Dhigurah G5 -> Dhiggaru G3) ends up as two records,
-- its history split between them. Merging folds the older record into the
-- current one and records the move; asset_moves says it came from a merge.

alter table asset_moves drop constraint asset_moves_source_check;
alter table asset_moves add constraint asset_moves_source_check check (source in ('manual', 'report', 'merge'));

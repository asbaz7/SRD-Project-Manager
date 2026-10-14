-- Monthly genset updates entered in the app (Oct 2026) replace the condition
-- report workbooks: each powerhouse records, per genset, its running hours,
-- condition, fault and service flags. They are kept like reports were, with
-- source 'update'. Reports received earlier stay as history.
alter table engine_reports drop constraint engine_reports_source_check;
alter table engine_reports add constraint engine_reports_source_check check (source in ('upload', 'fleet_manager', 'update'));
alter table engine_conditions drop constraint engine_conditions_source_check;
alter table engine_conditions add constraint engine_conditions_source_check check (source in ('upload', 'fleet_manager', 'update'));
alter table powerhouse_report_history drop constraint powerhouse_report_history_source_check;
alter table powerhouse_report_history add constraint powerhouse_report_history_source_check check (source in ('upload', 'fleet_manager', 'update'));
alter table powerhouse_reports drop constraint powerhouse_reports_source_check;
alter table powerhouse_reports add constraint powerhouse_reports_source_check check (source in ('upload', 'fleet_manager', 'update'));

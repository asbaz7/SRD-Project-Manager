-- Fuel capacity isn't tracked any more (Oct 2026): the column and its values go.
alter table facilities drop column fuel_capacity_l;

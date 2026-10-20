-- Islands whose electricity is still FENAKA's have their water and sewerage
-- with FENAKA too, where no status was recorded (Oct 2026). Islands whose
-- electricity STELCO has taken over are left as they are: whether STELCO has
-- their water and sewerage is entered island by island.
update takeover_islands set water_status = 'fenaka'
 where electricity_status = 'fenaka' and water_status is null;
update takeover_islands set sewerage_status = 'fenaka'
 where electricity_status = 'fenaka' and sewerage_status is null;

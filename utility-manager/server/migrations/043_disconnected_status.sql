-- A genset can be disconnected (Oct 2026): installed but not connected to
-- the network. Not running and not available, but not a fault: it doesn't
-- count as down and doesn't open repair work (migration 017 is for 'down').
alter type asset_status add value if not exists 'disconnected' after 'maintenance';

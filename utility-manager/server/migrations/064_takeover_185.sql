-- The takeover counts 185 inhabited islands (Nov 2026): R. Dhuvaafaru (MWSC)
-- and ADh. Maamigili (private party), never part of the FENAKA to STELCO
-- takeover, were taken off the list on the website on 21 Oct 2026. This
-- does the same wherever they are still listed (a new database).
delete from takeover_islands where (atoll_code, name) in (('R', 'Dhuvaafaru'), ('ADh', 'Maamigili'));

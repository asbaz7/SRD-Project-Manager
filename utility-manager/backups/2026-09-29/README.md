# Backup of the original SRD dashboard — 29 Sept 2026

This is a snapshot of everything the original read-only dashboard
(`branch-monitor/`) used, taken before the Utility Manager was added. None of
the originals were changed; these files are copies.

| File | What it is | Source |
|---|---|---|
| `original-dashboard-code.zip` | The complete repository as it was on `main` at commit `a846ba5` | GitHub, `main` branch |
| `srd-dashboard-data (Google Sheet).xlsx` | The shared sheet the dashboard reads: tabs *How to fill*, *Gensets*, *Projects*, *Islands* | Google Sheet `srd-dashboard-data` |
| `genset-register (Supabase).csv` | 4 atolls, 34 islands, 140 gensets (model, rated and operating kW) | Supabase project *Powerhouse Manager*, read-only query |

Not included: a full database dump (internal IDs, timestamps). Take one from
the Supabase dashboard: **Database → Backups**, or **Table Editor → export
to CSV** for `atolls`, `islands`, `powerhouses` and `gensets`.

To restore the old code, unzip `original-dashboard-code.zip`, or check out
commit `a846ba5` in git.

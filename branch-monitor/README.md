# SRD Branch Monitor

Authenticated branch, project and work monitoring for K, ADh, V and M atolls. This application lives in `branch-monitor/`; the repository root contains the separate legacy task tracker.

## Cloudflare Workers deployment

Connect this GitHub repository to Cloudflare Workers Builds with:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Root directory | `branch-monitor` |
| Build command | `npm ci && npm run build:vinext` |
| Deploy command | `npm run deploy:vinext` |
| Worker name | `srd-powerhouse-monitor` |

The vinext/Vite build produces `dist/server/wrangler.json` and `dist/client`. Use Workers, not a static Pages upload. `wrangler.jsonc` contains only public Supabase connection settings; the publishable key is intended for browser use and database access is governed by authentication and row-level policies. No service-role key is needed by the application.

For local development: `npm ci`, then `npm run dev:vinext`. For a local Worker preview: `npm run build:vinext` followed by `npm run start:vinext`. The original Next.js commands remain available.

Cloudflare account authorization is required for deployment. A successful local build is not a confirmed deployment. Do not replace or disconnect a production domain until the authenticated application is verified on its Cloudflare URL.

## Island statistics

`/islands` combines the registered island list with authenticated rows from `public.island_statistics`. Dashboard also displays a capacity summary. Search, atoll/status filters and expandable detail show electricity, generators, demand, services, water, fuel, staffing, financial entries and original project notes.

Operational summaries and raw CSVs are intentionally excluded from this public repository. The supplied records have been imported into the existing Powerhouse Manager database. Approved active staff can read them; HOD users can write through the database policies. Anonymous and unapproved users cannot read them. The UI does not yet provide a statistics editing form.

Status labels describe reported capacity, not live outages. Red means peak or the 2026 demand entry exceeds firm capacity. Amber means firm reserve is below 10% of reported peak. Green means reported peak and the supplied 2026 entry are covered, with at least 10% reserve above peak. Grey means data is absent. The 10% threshold is a disclosed screening rule, not an official STELCO standard. Actual/forecast ambiguity, source dates and discrepancies remain visible.

## Database

`supabase/migrations/20260928063544_island_statistics.sql` records the additive statistics table and policies already applied to the connected database. Do not reapply the legacy `001_initial.sql` to an existing database. That file is retained as historical bootstrap source and is not a replacement for the current production schema.

## Validation

Cloudflare production build passes. All supplied generator capacities reconcile. Read access was verified as four summaries for approved active staff and zero for an unapproved identity; anonymous SELECT privileges are revoked. Live deployment and signed-in browser verification remain deployment gates. The database security advisor reports no issue for the new table; the existing Auth leaked-password-protection warning is unrelated to this change.

Local Worker startup was blocked by the execution environment (`uv_interface_addresses`); a deployed runtime smoke test is still required.

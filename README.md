# SRD Dashboard

A simple, read-only dashboard of atolls, islands, gensets and projects for SRD management.
There is no login.

- Atolls, islands and gensets (model, capacity) come from Supabase.
- Genset running status and island projects come from a shared Google Sheet
  (tabs `Gensets` and `Projects`), set by `NEXT_PUBLIC_SHEET_ID` in `branch-monitor/wrangler.jsonc`.
  The sheet must be shared as "Anyone with the link can view".

The app lives in `branch-monitor/`:

- `app/page.js` – overview: totals and installed capacity by atoll
- `app/atolls/[code]/page.js` – islands in an atoll
- `app/islands/[id]/page.js` – gensets on an island
- `lib/data.js` – Supabase queries
- `lib/sheet.js` – reads the Google Sheet

## Develop

```bash
cd branch-monitor
npm ci
npm run dev
```

## Deploy

Cloudflare Workers Builds deploys `main` automatically
(build: `npm ci && npm run build:vinext`, deploy: `npm run deploy:vinext`, root: `branch-monitor`).

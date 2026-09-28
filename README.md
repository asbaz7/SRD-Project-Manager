# SRD Genset Dashboard

A simple, read-only dashboard of atolls, islands and gensets for SRD management.
There is no login; the data is read directly from Supabase.

The app lives in `branch-monitor/`:

- `app/page.js` – overview: totals and installed capacity by atoll
- `app/atolls/[code]/page.js` – islands in an atoll
- `app/islands/[id]/page.js` – gensets on an island
- `lib/data.js` – Supabase queries

## Develop

```bash
cd branch-monitor
npm ci
npm run dev
```

## Deploy

Cloudflare Workers Builds deploys `main` automatically
(build: `npm ci && npm run build:vinext`, deploy: `npm run deploy:vinext`, root: `branch-monitor`).

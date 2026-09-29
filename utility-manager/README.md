# SRD Utility Manager

Operations system for the South Regional Department's **electricity, water
and sewerage** services. It replaces the Excel daily logs, genset status
sheets, outage registers and project trackers with a single, audited, multi-user
system.

This app is separate from the existing read-only dashboard in
`../branch-monitor` and does not touch its database.

- **Architecture, data model, API and UI design:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Step-by-step hosting on your own computer or office server:** [docs/LOCAL_HOSTING.md](docs/LOCAL_HOSTING.md)
- **Stack:** Node.js 22 · Fastify · PostgreSQL · React · Vite

## What it does

| | |
|---|---|
| Overview | What's down, open incidents, active projects, yesterday's generation / fuel / water, and which facilities haven't sent their daily log |
| Islands & assets | Register of powerhouses, RO plants, sewage plants and their gensets, RO units and pumps, with status history |
| Daily log | One form per facility per day. Flags typos by comparing with the previous day |
| Asset status round | Update every asset on an island in one go |
| Incidents | Outages, breakdowns and maintenance, with duration, customers affected and resolution |
| Projects | Status, progress, budget, contractor and a timeline of updates |
| Reports | Monthly report per facility with KPIs (kWh/L, auxiliary %, kWh/m³), exportable to CSV |
| Import | Load past Excel logs (as CSV). Every row is checked before anything is saved |
| Users & audit | Roles (viewer / operator / manager / admin) scoped to islands or atolls, and a full change history |

## Run it locally (no Postgres needed)

```bash
cd utility-manager
npm install
npm run seed -w server                      # loads 4 atolls, 34 islands, 140 gensets
npm run create-admin -w server -- you@example.mv "Your Name"   # prints a temporary password
npm run build                               # build the web app once
npm start                                   # http://localhost:3000
```

Without `DATABASE_URL`, the server uses an embedded Postgres (PGlite) in
`server/data/`. For UI development with hot reload, run `npm run dev -w server`
and `npm run dev -w web`, then open http://localhost:5173.

## Run with Docker (production-like)

```bash
cd utility-manager
echo "POSTGRES_PASSWORD=choose-a-long-password" > .env
docker compose up -d --build
docker compose exec app node server/scripts/seed.js
docker compose exec app node server/scripts/create-admin.js you@example.mv "Your Name"
```

Over plain `http://` on an office network this works as is. Once it is behind HTTPS, set `COOKIE_SECURE=true`.
All settings are listed in [.env.example](.env.example).

## Tests

```bash
npm test
```

These end-to-end API tests run against an in-memory Postgres. They cover
authentication, roles and island scope, the daily log, CSV import, reports,
incidents, projects and the audit trail.

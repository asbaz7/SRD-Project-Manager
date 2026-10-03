# SRD Utility Manager

Management system for the South Regional Department's **electricity, water
and sewerage** services, used by management staff. Managers report incidents
on their islands, keep asset status up to date and manage projects. It
replaces the genset status sheets, outage registers and project trackers with
a single, audited, multi-user system.

This app is separate from the existing read-only dashboard in
`../branch-monitor` and does not touch its database.

- **Architecture, data model, API and UI design:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Step-by-step hosting on your own computer or office server:** [docs/LOCAL_HOSTING.md](docs/LOCAL_HOSTING.md)
- **Deploying to Cloudflare (replacing the current site):** [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md)
- **Stack:** Node.js 22 or Cloudflare Workers · Hono · PostgreSQL · React · Vite

## What it does

The system is organised into three sections, **Electricity**, **Water** and
**Sewerage**, plus the shared activity lists. The overview opens with a
"Needs attention" list.

| | |
|---|---|
| Overview | Needs attention (serious incidents, engines not running or with major faults, assets out of service, missing reports, overdue work), one tile per service, engine condition, work, incidents, projects |
| Electricity | Overview · **Engines** (every genset: condition, hours since overhaul, last overhaul and alternator service, faults, open work; one-click filters) · **Condition reports** (drop in the monthly Excel files as they are; the latest condition is kept and maintenance history builds itself; missing reports are flagged after the 10th, reports from before 2024 are not chased) · Powerhouses |
| Water · Sewerage | Overview · Assets · Plants, with each service's work, incidents and projects |
| Work | Ongoing work on an asset, plant or island, per service, with updates. Completed engine work goes into its maintenance history |
| Incidents · Projects · Islands | Shared lists, filterable by service |
| Users & audit | Managers assigned to islands or atolls, administrators, optional read-only viewers, full change history |

## Try it privately (one command)

```bash
cd utility-manager
npm install
npm run demo
```

Open http://localhost:3000; only your own computer can see it. It starts
with sample data: gensets running and down, incidents and projects.
It also creates test logins for each role (password `demo-password-1`):

- `admin@demo.local`
- `manager@demo.local` (K atoll)
- `maafushi@demo.local` (manager for Maafushi only)
- `viewer@demo.local`

Running `npm run demo` again resets the demo data. Real data is never
touched.

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
authentication, roles and island scope, asset status, incidents, projects,
CSV export and the audit trail.

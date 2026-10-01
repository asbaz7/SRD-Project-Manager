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

| | |
|---|---|
| Overview | What's down, open incidents, active projects (overdue first) and fuel capacity |
| Islands & assets | Register of powerhouses, RO plants, sewage plants and their gensets, RO units and pumps, with status history |
| Daily status check | Update every asset on an island in one go |
| Incidents | Outages, breakdowns and maintenance, with duration, customers affected and resolution |
| Projects | Status, progress, budget, contractor and a timeline of updates |
| Export | Asset, incident and project lists download as CSV for Excel |
| Users & audit | Managers assigned to islands or atolls, administrators, optional read-only viewers, and a full change history |

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

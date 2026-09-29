# SRD Utility Manager — System Architecture

The system of record for the South Regional Department's electricity, water
and sewerage operations. It replaces the Excel daily logs, genset status
sheets, outage registers and project trackers, and everything that is copied
between them.

## 1. Goals and constraints

| Goal | How the design meets it |
|---|---|
| One place for the data | Each fact is entered once, by the person closest to it, and every report reads from the same tables |
| Works on island connections | Server-rendered JSON with small payloads. Each screen makes one or two requests. The whole web app is about 100 KB gzipped |
| Hundreds of users | Stateless app servers, sessions in Postgres, indexed queries, pagination on every list |
| Accountability | Every change is written to an audit trail (who, when, before → after) by database triggers |
| People can only change their own islands | Role + island/atoll scope, enforced on the server for every write |
| Excel still works | Every list exports to CSV, and past logs import from CSV with row-level validation |
| Few moving parts | One Node.js service, one PostgreSQL database, one container image |

## 2. Architecture

```
  Browsers (HQ, island powerhouses, phones)
        │  HTTPS
        ▼
  ┌───────────────────────────┐
  │ Reverse proxy / LB        │  TLS, gzip  (Cloudflare, nginx, ALB…)
  └────────────┬──────────────┘
               │
  ┌────────────▼──────────────┐   ┌───────────────────────────┐
  │ App container (×N)        │   │ App container             │  stateless: add more for load
  │  Hono API     /api/v1     │   │  ...                      │
  │  React SPA (static)       │   │                           │
  └────────────┬──────────────┘   └─────────────┬─────────────┘
               └──────────────┬─────────────────┘
                              ▼
                ┌───────────────────────────┐
                │ PostgreSQL 15+            │  data, sessions, audit trail
                │ (managed: Supabase / RDS) │  daily backups + PITR
                └───────────────────────────┘
```

* **API**: Hono, which runs unchanged on Node.js 22 and on Cloudflare Workers
  (`src/index.js` and `src/worker.js` are the two entry points). Zod validates every input. Queries are
  plain parameterised SQL through `pg`, with no ORM, so the SQL you read is
  the SQL that runs.
* **Web**: a React 19 single-page app built with Vite and served by the same
  process, so it shares the API's origin and needs no CORS.
* **Database**: PostgreSQL. Constraints, triggers and the audit log live in
  the database, so the rules hold even for scripts that bypass the API.
* **Development database**: when `DATABASE_URL` is unset, the app uses PGlite
  (Postgres compiled to WebAssembly) on disk. The tests use it in memory. The
  schema and SQL are the same as in production.

### Why this shape

* **One deployable.** A small department team can run it. There are no
  queues, caches or microservices to operate.
* **Stateless app, stateful DB.** Scaling means running more containers.
  Postgres is the only thing to back up.
* **Dependencies are few and mainstream:** hono, pg, zod, react and
  react-router. Any Node developer can take it over.

## 3. File structure

```
utility-manager/
├── Dockerfile                 one image: API + built web app
├── docker-compose.yml         Postgres + app for local/prod-like runs
├── .env.example               all configuration (12-factor, env vars)
├── docs/ARCHITECTURE.md       this document
├── server/
│   ├── migrations/            ordered SQL files, applied once each at start-up
│   │   ├── 001_core.sql       tables, enums, triggers, audit
│   │   └── 002_metrics.sql    daily-log measurement catalogue
│   ├── seed/srd_register.tsv  current SRD genset register (4 atolls, 34 islands, 140 gensets)
│   ├── scripts/               migrate, seed, create-admin CLIs
│   ├── src/
│   │   ├── app.js             API: security headers, auth, rate limits, routes
│   │   ├── index.js           Node.js entry: API + web app on one port
│   │   ├── worker.js          Cloudflare Workers entry (web app served by Cloudflare)
│   │   ├── config.js          env → config
│   │   ├── db.js              pg / PGlite adapter: query, exec, tx(userId, fn)
│   │   ├── migrate.js         migration runner (advisory-locked)
│   │   ├── auth.js            passwords, sessions, roles, island scope checks
│   │   ├── http.js            validation, paging, filters, PATCH helpers
│   │   ├── csv.js             CSV export (Excel-safe) and import parsing
│   │   ├── errors.js          HTTP errors, Postgres error mapping
│   │   └── routes/            one module per resource
│   └── test/api.test.js       end-to-end API tests (in-memory Postgres)
└── web/
    ├── index.html, vite.config.js
    └── src/
        ├── main.jsx           routes
        ├── api.js             fetch wrapper
        ├── auth.jsx           session context, role/scope helpers, route guard
        ├── hooks.js           useApi, useFilters (URL state), useSubmit
        ├── format.js          labels, number/date formatting (Maldives time)
        ├── styles.css         design tokens (light/dark), layout, components
        ├── components/        Layout, UI primitives, facility/asset forms
        └── pages/             one file per screen
```

## 4. Data model

```
atolls 1─* islands 1─* facilities 1─* assets 1─* asset_status_log
                  │            │            │
                  │            └─* readings *─1 metrics
                  ├─* incidents (optionally → facility, asset)
                  └─* projects 1─* project_updates

users 1─* user_scopes (→ atoll | island | whole region)
users 1─* sessions
audit_log   ← triggers on every business table
```

| Table | Purpose | Notes |
|---|---|---|
| `atolls`, `islands` | Location hierarchy | `unique(atoll_id, name)`, because island names repeat across atolls |
| `facilities` | Powerhouse, solar plant, RO plant, storage, sewage treatment plant, pump station | `service` is one of electricity / water / sewerage. Storage capacities are columns |
| `assets` | Gensets, RO units, pumps, transformers, … | `unique(facility_id, kind, tag)`. The current `status` is copied here for fast dashboards |
| `asset_status_log` | Every status report | A trigger copies the latest report onto `assets.status`, so history is never lost |
| `metrics` | The measurements in the daily log | New measurements are new **rows**, not columns. Each has a unit and an aggregation rule (sum, max, avg or last) |
| `readings` | Daily log values | PK `(facility_id, reading_date, metric)` means one value per day. A trigger rejects a metric from another service |
| `incidents` | Outages, breakdowns, maintenance, quality and safety events | Duration comes from start and resolve times. Ref `INC-000123` |
| `projects`, `project_updates` | Capital and maintenance projects, with a timeline | An update moves progress and status forward through a trigger. Ref `PRJ-0042` |
| `users`, `user_scopes`, `sessions` | Access | Passwords hashed with scrypt. Sessions are stored as SHA-256 hashes |
| `audit_log` | Change history | Stores JSON diffs of what changed and never logs password hashes |

Design choices:

* **Metrics as rows (a narrow table).** Excel logs grow a column whenever
  someone wants a new measurement. Here an admin adds a row to `metrics` and
  every screen, the import and the monthly report pick it up.
* **Denormalised current status.** Dashboards read `assets.status`, which is
  indexed, and never scan the history table.
* **Database-enforced integrity.** Foreign keys, checks, unique keys and
  triggers apply to every writer, including future scripts and integrations.

## 5. Access control

| Role | Can view | Can change (within assigned islands) |
|---|---|---|
| viewer | everything | nothing |
| operator | everything | daily log, asset status, incidents, project updates |
| manager | everything + audit trail | the operator's records, plus facilities, assets and projects |
| admin | everything | everything, including users, atolls, islands and metrics. Scope does not apply |

A **scope** row assigns a user to one island, a whole atoll, or the whole
region. `assertIslandWrite()` finds the island behind any island, facility or
asset id and checks the scope on **every write**. The UI hides actions a user
cannot take, but the server always makes the final decision.

## 6. API (REST, JSON, `/api/v1`)

All endpoints except `login` and `health` need a session: the httpOnly
cookie, or `Authorization: Bearer <token>` for scripts and integrations.
Lists take `limit` and `offset` and return `{ items, total, limit, offset }`.
Endpoints marked CSV also accept `?format=csv`.

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/auth/login` | public (rate-limited) | Sign in. Sets the cookie and returns a token |
| POST | `/auth/logout` | any | End the session |
| GET | `/auth/me` | any | Current user, role and scope |
| POST | `/auth/password` | any | Change password. Signs out all other sessions |
| GET | `/users` | admin | Users with their scopes |
| GET | `/users/directory` | any | Names for pickers |
| POST / PATCH | `/users`, `/users/:id` | admin | Create or update a user, role, scopes; reset password; deactivate |
| GET / POST / PATCH | `/atolls`, `/atolls/:id` | read: any · write: admin | Atolls |
| GET | `/islands?atoll_id&q` | any | Islands with rollups (gensets running or down, capacity, open incidents, projects) |
| GET | `/islands/:id` | any | An island with its facilities and assets |
| POST / PATCH | `/islands`, `/islands/:id` | admin / manager | Create; edit population and notes |
| GET | `/facilities?island_id&service&kind` | any | Facilities |
| GET / POST / PATCH | `/facilities/:id` | read: any · write: manager | Facility with its assets |
| GET | `/assets?…&status&kind&q` (CSV) | any | Asset register |
| GET | `/assets/:id` | any | Asset with status history and incidents |
| POST / PATCH | `/assets`, `/assets/:id` | manager | Register or edit an asset |
| POST | `/assets/status` | operator | Status for one or many assets (the morning round) |
| GET | `/metrics?service` | any | Measurement catalogue |
| GET | `/readings/sheet?facility_id&date` | any | Daily log form data, with the previous day's values |
| PUT | `/readings/sheet` | operator | Save a facility's daily log (upsert; `null` clears a value) |
| GET | `/readings?from&to&…` (CSV) | any | Raw readings export |
| POST | `/readings/import` | operator | Load a CSV. Every row is validated before anything is written; `dry_run` only checks |
| GET | `/incidents?status&service&…` (CSV) | any | Incident register |
| GET / POST / PATCH | `/incidents/:id` | operator | Report, update, resolve, close or reopen an incident |
| GET | `/projects?status=active&…` (CSV) | any | Projects |
| GET / POST / PATCH | `/projects/:id` | manager | Project with its update timeline |
| POST | `/projects/:id/updates` | operator | Progress update |
| GET | `/dashboard?atoll_id` | any | Overview: status by service, assets down, open incidents, missing logs, yesterday's totals |
| GET | `/reports/monthly?month&service&atoll_id` (CSV) | any | Monthly report per facility, with KPIs (kWh/L, aux %, kWh/m³ …) |
| GET | `/reports/trend?metric&from&to&…` | any | Daily series of one measurement, for charts |
| GET | `/audit?entity&entity_id&user_id` | manager | Audit trail |
| GET | `/health` | public | Liveness and database check |

Errors look like `{ "error": "message", "details": [...] }`, with status 400
(validation), 401, 403, 404, 409 (duplicate or in use) or 500 (logged, with
a generic message to the user).

## 7. UI architecture

* **Routing** (`main.jsx`): all pages sit behind `RequireAuth`. That guard
  also sends a user with a temporary password to *My account* first.
* **State**: kept to a minimum. Each page fetches with `useApi(path)`. List
  filters live in the **URL** (`useFilters`), so any view can be bookmarked
  or shared. Forms use local state and `useSubmit`. No global store is
  needed.
* **Screens**

  | Screen | Replaces |
  |---|---|
  | Overview | The morning phone calls: what's down, what's open, who hasn't reported |
  | Islands & assets | The genset register workbook |
  | Daily log | The per-island daily log sheet. Flags values far from the previous day |
  | Asset status round | The "Gensets" status tab: every asset on an island in one form |
  | Incidents | The outage and breakdown register |
  | Projects | The projects tracker, with a timeline of updates |
  | Reports | The monthly returns, exportable to CSV |
  | Import from Excel | Loading past logs |
  | Users, Audit trail | Administration |
* **Design**: plain CSS with design tokens and automatic light/dark mode.
  Status is always shown as an icon plus a word, never colour alone. The
  layout is responsive, with a collapsible menu on phones.
* **Time**: the department works in Maldives time (UTC+5, no DST). All
  "today", "yesterday" and date-time inputs are explicitly Maldives time,
  whatever time zone the device is set to.

## 8. Security

* Passwords are hashed with scrypt (N=2¹⁴) and a per-user salt. Failed
  logins take the same time whether or not the email exists. Login and
  password changes are rate-limited.
* Session tokens are 256-bit random, and only their hash is stored. They are
  sent in httpOnly, SameSite=Lax cookies (`Secure` in production). They
  expire, and they are revoked on password change, role change and
  deactivation.
* CSRF: cookie-authenticated writes from a foreign `Origin` are rejected, on
  top of SameSite.
* Security headers are set, including a strict CSP with no inline
  scripts and `frame-ancestors 'none'`.
* All SQL is parameterised. Every input is validated with Zod.
* CSV export guards against Excel formula injection.
* Logs redact `Authorization` and `Cookie` headers.

## 9. Scaling and operations

* **Load.** A few hundred users each save a few forms a day and view
  dashboards. A single small container and a small managed Postgres handle
  this easily. For more capacity, run more containers behind the load
  balancer and raise `DATABASE_POOL_SIZE`, or put PgBouncer or Supabase's
  pooler in front.
* **Data volume.** 34 islands × 3 services × ~10 metrics × 365 days is about
  370k readings a year. That is small for Postgres, and the indexes cover
  every report query.
* **Migrations** run automatically at start-up, one transaction per file,
  under an advisory lock, so a rolling deploy is safe. To change the schema,
  add a new numbered `.sql` file. Never edit an applied one.
* **Backups.** Use a managed Postgres with daily backups and point-in-time
  recovery. The application holds no other state.
* **Monitoring.** `/api/v1/health` for uptime checks. Logs are structured
  JSON, one line per request.
* **Cloudflare Workers (chosen for production).** The web app is served by
  Cloudflare and `/api/*` runs in a Worker (`src/worker.js`). The database is
  a Supabase Postgres, reached through Hyperdrive. Steps are in
  [CLOUDFLARE.md](CLOUDFLARE.md).
* **Other hosting options.** Any container host (Fly.io, Render, AWS ECS, Azure
  Container Apps, an on-prem VM with Docker) plus any Postgres 15+. A **new**
  Supabase project works as the database: set `DATABASE_URL` to its
  connection string and `DATABASE_SSL=true`.

## 10. Rollout plan (replacing the spreadsheets)

1. **Pilot** (2–4 weeks). Deploy, run `seed` to load the genset register,
   create accounts for one atoll, and run the daily log and status round
   alongside the Excel sheets.
2. **Back-fill.** Import this year's daily logs through *Import from Excel*
   using the CSV template. Add water and sewerage facilities and assets per
   island.
3. **Cut over, atoll by atoll.** Once the monthly report matches the Excel
   return, stop the sheet for that atoll.
4. **Retire the read-only dashboard**, or point it at this API, once every
   atoll is live.

## 11. Roadmap (deliberately not in the minimal version)

* Attachments (photos, engine reports) in S3-compatible object storage
* Email or SMS alerts for critical incidents and missing daily logs
* Charts on island pages (the `/reports/trend` endpoint is already there)
* Offline-capable daily log (PWA) for islands with poor connectivity
* SSO with the corporate identity provider (OIDC)
* Preventive maintenance schedules based on running hours

# SRD Utility Manager — System Architecture

The system of record for the South Regional Department's electricity, water
and sewerage services, used by **management staff**. Managers report incidents
as soon as they know of them, keep asset status current and manage projects
for their assigned islands. It replaces the genset status sheets, outage
registers and project trackers, and everything that is copied between them.

> **Scope change (Oct 2026).** The daily status check (a form to set every
> asset's status each day) was removed: engine status now comes from the
> monthly condition reports, and is changed by hand on the asset when
> something happens in between.
>
> **Earlier scope change (Oct 2026).** The first version also had a per-facility daily
> operations log (with Excel import and a monthly report) and an *operator*
> role for powerhouse staff. Both were removed to keep the system to
> management use. Migration `003_management_only.sql` retires operator
> accounts. The `metrics` and `readings` tables are kept, unused, so nothing
> entered earlier is lost.

## 1. Goals and constraints

| Goal | How the design meets it |
|---|---|
| One place for the data | Each fact is entered once, by the person closest to it, and every report reads from the same tables |
| Works on island connections | Server-rendered JSON with small payloads. Each screen makes one or two requests. The whole web app is about 100 KB gzipped |
| Hundreds of users | Stateless app servers, sessions in Postgres, indexed queries, pagination on every list |
| Accountability | Every change is written to an audit trail (who, when, before → after) by database triggers |
| People can only change their own islands | Role + island/atoll scope, enforced on the server for every write |
| Excel still works | Asset, incident and project lists export to CSV |
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
│   │   ├── 002_metrics.sql    daily-log measurements (no longer used)
│   │   └── 003_management_only.sql  retires operator accounts
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
│   │   ├── csv.js             CSV export (Excel-safe)
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
                  │            └─* readings *─1 metrics   (kept, no longer used)
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
| `metrics` | *(no longer used)* The measurements in the former daily log | New measurements are new **rows**, not columns. Each has a unit and an aggregation rule (sum, max, avg or last) |
| `readings` | *(no longer used)* Former daily log values | PK `(facility_id, reading_date, metric)` means one value per day. A trigger rejects a metric from another service |
| `incidents` | Outages, breakdowns, maintenance, quality and safety events | Duration comes from start and resolve times. Ref `INC-000123` |
| `projects`, `project_updates` | Capital and maintenance projects, with a timeline | An update moves progress and status forward through a trigger. Ref `PRJ-0042` |
| `users`, `user_scopes`, `sessions` | Access | Passwords hashed with scrypt. Sessions are stored as SHA-256 hashes |
| `audit_log` | Change history | Stores JSON diffs of what changed and never logs password hashes |

Design choices:

* **Denormalised current status.** Dashboards read `assets.status`, which is
  indexed, and never scan the history table.
* **Database-enforced integrity.** Foreign keys, checks, unique keys and
  triggers apply to every writer, including future scripts and integrations.

## UI (redesigned Oct 2026)

Glass ("glassmorphism") design: frosted panels over a soft coloured backdrop,
with separate light and dark palettes, and a solid fallback when the browser
can't blur or the user asks for reduced transparency. Navigation:

- **Desktop:** a sidebar with Overview, Electricity, Water, Sewerage, then
  Work, Incidents, Projects, Islands, then Administration.
- **Phones:** a bottom tab bar (Overview · Electricity · Water · Sewerage ·
  More).

Each service section (`pages/Service.jsx`) uses the same tabs (Overview,
assets or engines, plants), fed by `GET /services/:service`. Status colours
are fixed (good / warning / serious / critical) and always shown with an
icon and a label. Each service has its own identity colour.

Work orders carry a `service` (migration 005): taken from the asset or
facility, or chosen for island-wide work.

## Users: head office only (decided Oct 2026)

The system is used only by department staff at head office. No island
managers or island staff use it. Every user covers the whole region:
- the user form no longer offers island or atoll assignments;
- new users get the whole-region scope by default.

Island scopes stay in the database and API (`user_scopes`,
`assertIslandWrite`) and do no harm, but nothing in the app sets them.

## Access: technical and non-technical staff (Oct 2026)

There are three settings per user:
- **Role:** what they can change (admin, manager or viewer).
- **Islands:** where they can change it.
- **Staff type:** what they can see (migration 008, `users.technical`).

**Technical information:** engines, condition reports, assets, plants and the
Electricity, Water and Sewerage sections.
- Only technical staff and administrators can see it.
- It is enforced in `app.js` (`TECHNICAL_PREFIXES`). The dashboard, island
  detail, islands list, audit trail and Telegram bot also strip it for
  non-technical staff.
- Administrators always count as technical.

**Work**
- Everyone can see work.
- Technical managers of the island (and administrators) create it, edit it,
  change its status and post updates.
- The people running a work item, or its technical creator, can add
  specific people as commenters (`work_commenters`). Commenters can post
  comments but can't change the status.

**Projects** are shared per project:
- `visibility` is either `everyone` or `members`. New projects default to
  `members`; existing ones were set to `everyone`.
- `project_members` gives chosen people view or edit access.
- The creator, the owner and administrators can always edit, and they decide
  who has access. Others with edit access can edit but not change sharing.
- `projectVisible()` filters every list, count and overview, and the audit
  trail.

**Incidents:** unchanged; visible to everyone.

**Telegram**
- Technical commands (`/status`, `/down`, `/up`…) need technical access.
- Each alert chat has a `technical` flag. Technical chats get genset and
  asset alerts and the full morning summary. Other chats get incidents, work
  and a summary without engine figures.

## Engine state: one answer (Oct 2026)

A genset's state has two sources:
- the monthly condition report, a snapshot as of its "record updated" date;
- live status updates, from the website or the Telegram bot.

The view `engine_current` (migration 007) combines them, and the most recent
evidence wins:
- A status of down or maintenance recorded after the report gives
  `not_running`.
- A status of running or standby recorded after a report that said
  not_running gives `ok` ("Back in service").
- Otherwise the report's condition applies.

The report's "needs overhaul" and "alternator needs service" flags work the
same way (migration 009). They clear once that work is recorded on or after
the report's date, either by hand or by completing a work order of that
kind. The original flags remain as `report_needs_overhaul` and
`report_alt_needs_service`.

Every page, count, filter and the bot read `engine_current`, so a genset can
never show "OK" and "Down" at once. Its columns `condition_source`
('report' | 'status'), `condition_note`, `condition_at` and
`report_condition` say where the answer came from. A newer report takes over
again: the import also moves the live status when the report is newer.

## Moving gensets between islands (Oct 2026)

A move keeps the asset's identity (the same `assets.id`), so its maintenance
history, running hours, condition and status log go with it. Each move is
recorded in `asset_moves` (migration 010). Logic is in `src/assetMoves.js`.

- **By hand:** `POST /assets/:id/move` with the destination facility (same
  service), the number there (must be free), the date and notes. Ongoing
  work on it follows by default; finished work stays where it happened. A
  technical Telegram alert is sent.
- **From a report:** if a report lists a genset whose serial number matches
  exactly one active genset at another powerhouse, the preview says so and
  the import moves it instead of adding a duplicate. Serials are compared on
  letters and digits only, and only from 5 characters up. If it takes a
  number already used here by a different engine, that record is kept but
  marked not in use and decommissioned ("N (removed YYYY-MM)"). A changed
  serial with no match elsewhere is only flagged.

## Condition report parsing safeguards

- **Missing "GENSET NO." label:** if the label was typed over, the genset
  numbers are read from the row just above the first engine field. This
  happened on Thulusdhoo's April to August 2026 sheets ("pr"), which used to
  be skipped silently.
- **Upload warnings in the preview:**
  - sheets that look like reports but can't be read;
  - sheets read without the label;
  - a latest month that is the same as the one already stored;
  - a latest month older than the month now expected.

## Telegram bot (added Oct 2026)

`src/telegram.js`, `routes/telegram.js`, migration 006.

- **Linking:** a user gets a one-time code (15 minutes) on their account page
  and sends it to the bot (`/start CODE`, private chat only). This stores
  `users.telegram_user_id`.
- **Commands:** `/status <island>`, `/work [island]`, `/down`, `/up`,
  `/standby` and `/maintenance <island> <asset> [note]`,
  `/incident <island> [service] [severity] <text>`,
  `/update WO-n [status] <text>`, `/done WO-n [note]`, `/summary`,
  `/alerts on|off`, `/unlink`.
- **Acting as the user:** every command runs through the normal API as the
  linked user (`asUser` in app.js: a session that lasts one call), so role,
  island scope, validation and the audit trail are the same as on the website.
- **Alerts:** sent to chats where a manager sent `/alerts on`
  (`telegram_chats`):
  - high or critical incidents opened or resolved;
  - assets going down or back to running;
  - work completed;
  - a daily summary at 07:45 MVT (Worker cron `45 2 * * *`, `scheduled()` in
    worker.js).

  A failed delivery never undoes the change.
- **Webhook:** `POST /api/v1/telegram/webhook` is public but requires the
  `X-Telegram-Bot-Api-Secret-Token` header. Its value is derived from the
  token and registered by an administrator with "Connect bot"
  (`POST /telegram/connect`), which calls `setWebhook` and `setMyCommands`.
- **Configuration:** `TELEGRAM_BOT_TOKEN` (a Cloudflare secret) and
  `PUBLIC_URL` (wrangler vars). Without the token the bot is off.

## 4a. Engine condition (added Oct 2026)

The system's main job is now **engine condition**: what state every genset
is in, when it was last overhauled and its alternator last serviced, what
maintenance has been done, and what work is going on.

**Monthly condition reports.** Every powerhouse fills in the standard
ENGINE CONDITION REPORT Excel template every month: one column per genset,
one row per field, usually one sheet per month. Managers upload these files
unchanged (`/reports`):

1. `server/src/xlsx.js` reads the workbook (a small pure-JS reader that runs
   on Node and Workers). `server/src/conditionReport.js` interprets the
   template. It accepts the formats the islands actually use: dates such as
   `21.02.2021`, `13/07/2019` and real dates; hours such as `13886:22`,
   `4189 Hours.`, `35721 HRM` and `[h]:mm` cells; and status text such as
   `RUNNING; MINOR FAULT`. It works out which month each sheet covers, and
   corrects "hours since" figures that are really hours *at* the service.
2. `server/src/reportImport.js` matches the file to its island, tolerating
   spelling differences (`KUMBURUDHOO` → Kunburudhoo, `K. VILLINGILLI` →
   Villingili). It shows a preview, then on import:
   - keeps only the **latest** condition per genset (`engine_conditions`)
     and per powerhouse (`powerhouse_reports`). Files are not stored, and an
     older report never overwrites a newer one;
   - adds every dated event found in **any** month of the file (overhaul,
     alternator service, valve clearance, battery change) to
     `maintenance_events`, which is kept for good and de-duplicated;
   - records total running hours per month (`hours_log`) for trends;
   - fills the genset register (make/model, serials, alternator, installed
     date) and adds gensets the register lacks;
   - sets the asset's running status from the report when the report is
     newer than the last recorded status.
3. A powerhouse's report is **missing** once the 10th of the following month
   has passed (`expectedMonth()`).

**Schedules.** Next overhaul (running hours and/or date) and next alternator
service are fields on each genset (`next_overhaul_hours`, `next_overhaul_on`,
`next_alt_service_on`). They are entered by hand, or later imported from the
overhaul and alternator service schedule sheets. Until then, "due" comes from
the report's own *needs overhauling* and *dynamo needs service* answers.

**Work.** `work_orders` with `work_updates` track ongoing work on a genset,
facility or island (planned → in progress → awaiting parts → completed).
A database trigger adds completed work on an engine to its maintenance
history.

| Table | Purpose |
|---|---|
| `engine_conditions` | Latest report figures per genset: condition, fault, hours, last overhaul and services, flags |
| `powerhouse_reports` | Latest report month, peak loads and uploader per powerhouse |
| `maintenance_events` | Permanent maintenance history: `unique(asset, kind, date)`, source report / work / manual |
| `hours_log` | Total running hours per genset per month |
| `work_orders`, `work_updates` | Ongoing work and its timeline. Ref `WO-0042` |

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/engines?condition&flag&atoll_id&q&sort` (CSV) | any | Fleet view with summary counts |
| GET | `/condition-reports` | any | Every powerhouse's latest report, and whether it is missing |
| POST | `/condition-reports/preview` | manager | Read an uploaded `.xlsx` (base64), match its island and show the changes. Saves nothing |
| POST | `/condition-reports/import` | manager | Apply it for the confirmed island |
| POST | `/assets/:id/maintenance` | manager | Add a maintenance record by hand |
| DELETE | `/maintenance/:id` | manager (own manual records) / admin | Remove a record |
| GET / POST / PATCH | `/work`, `/work/:id` | read: any · write: manager | Work orders |
| POST | `/work/:id/updates` | manager | Progress update, optionally changing the status |

## 5. Access control

| Role | Can view | Can change (within assigned islands) |
|---|---|---|
| manager | everything + audit trail | incidents, asset status, projects and project updates, facilities and assets |
| admin | everything | everything, including users, atolls and islands. Scope does not apply |
| viewer (optional) | everything | nothing |

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
| POST | `/assets/status` | manager | Change an asset's status by hand (e.g. when an incident takes a genset down) |
| GET | `/incidents?status&service&…` (CSV) | any | Incident register |
| GET / POST / PATCH | `/incidents/:id` | manager | Report, update, resolve, close or reopen an incident |
| GET | `/projects?status=active&…` (CSV) | any | Projects |
| GET / POST / PATCH | `/projects/:id` | manager | Project with its update timeline |
| POST | `/projects/:id/updates` | manager | Progress update |
| GET | `/dashboard?atoll_id` | any | Overview: status by service, assets down, open incidents, active projects, fuel capacity |
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
  | Overview | The morning phone calls: what's down, what's open, which projects are late |
  | Islands & assets | The genset register workbook |
  | Incidents | The outage and breakdown register |
  | Projects | The projects tracker, with a timeline of updates |
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
* **Data volume.** Statuses, incidents and projects for 34 islands are a few
  thousand rows a year, which is small for Postgres.
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
   create manager accounts for one atoll, and use condition reports, work,
   incidents and projects alongside the existing sheets.
2. **Fill in the register.** Add fuel capacities, and water and sewerage
   facilities and assets, per island.
3. **Cut over, atoll by atoll.** Stop the status sheet and outage register for
   an atoll once its managers use the system.

## 11. Roadmap (deliberately not in the minimal version)

* Attachments (photos, engine reports) in S3-compatible object storage
* **WhatsApp:** "Share to WhatsApp" buttons were added, then removed in
  Oct 2026 in favour of the Telegram bot. Automatic WhatsApp would need the
  Meta Business Platform and can't post to group chats.
* **Telegram as an agent** (discussed, deferred): plain-language messages
  handled by Claude (Anthropic API, Haiku to start), using the existing bot
  actions as tools. Every change would need a Confirm/Cancel tap, with a
  short memory per chat and replies in groups only when mentioned. Needs an
  ANTHROPIC_API_KEY secret.
* Email or SMS alerts for critical incidents
* Offline-capable incident reporting (PWA) for islands with poor connectivity
* SSO with the corporate identity provider (OIDC)
* Preventive maintenance schedules based on running hours

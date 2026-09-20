# RD Task Tracker — Cloudflare Workers edition

Same app as before (HOD creates and assigns tasks; staff log in and update
their own progress; HOD comments, reassigns, changes due dates) — rebuilt
to run on Cloudflare Workers + D1 instead of a self-hosted Node server.
This gets you a public URL that's always on, with no server to babysit,
on Cloudflare's free tier (plenty for a department-sized team).

It's a different codebase from the plain Node.js version I sent earlier —
Cloudflare Workers don't run Express or better-sqlite3, so this uses
[Hono](https://hono.dev) (a Workers-native router) and
[D1](https://developers.cloudflare.com/d1/) (Cloudflare's built-in SQL
database) instead. Everything you see and do in the app is the same.

## What you need first

- A free [Cloudflare account](https://dash.cloudflare.com/sign-up) — no
  credit card required for this.
- Node.js installed on whatever computer you're deploying from (see the
  previous README for how to check/install it).

## Deploy it — 5 steps

Open a terminal in this folder and run these one at a time.

**1. Install dependencies:**
```
npm install
```

**2. Log in to Cloudflare** (opens a browser window to authorize):
```
npx wrangler login
```

**3. Create the database:**
```
npx wrangler d1 create rd-task-tracker-db
```
This prints a block like:
```
[[d1_databases]]
binding = "DB"
database_name = "rd-task-tracker-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```
Open `wrangler.toml` in this folder and replace
`REPLACE_WITH_YOUR_DATABASE_ID` with the `database_id` value it printed.

**4. Set up the database tables:**
```
npx wrangler d1 execute rd-task-tracker-db --remote --file=./schema.sql
```

**5. Deploy:**
```
npx wrangler deploy
```
This prints your live URL, something like
`https://rd-task-tracker.<your-subdomain>.workers.dev` — that's the
address to share with your team. Open it, and the first visit walks you
through creating your HOD account, same as before.

## Using it day to day

Identical to the Node.js version:

1. First visit creates your HOD account.
2. **Staff** → add one account per team member (name, optional staff
   ID/designation, username, starting password). Share the password with
   them directly — there's no self-service reset; you reset it for them
   from the Staff page if they forget it.
3. **Tasks → New task** to create work and assign staff.
4. Staff log in, see **My tasks**, and update status/progress/notes on
   anything assigned to them — every update lands in that task's
   activity feed, which you can see and comment on.
5. **Dashboard** gives you counts by status, overdue tasks, and workload
   per staff member.

## Making changes later

If you (or I, in a future session) need to change anything — add a
field, tweak the design, add a feature — edit the files under `src/`,
then run `npx wrangler deploy` again to push the update. The database
is separate from the code, so redeploying never touches your existing
tasks or accounts.

To see the live database directly (e.g. to double check something):
```
npx wrangler d1 execute rd-task-tracker-db --remote --command="SELECT * FROM users"
```

## Local testing before you deploy

You can try the whole app on your own computer first, without touching
Cloudflare at all:
```
npm install
npx wrangler d1 execute rd-task-tracker-db --local --file=./schema.sql
npx wrangler dev
```
Then open `http://localhost:8787`. This uses a local, throwaway copy of
the database — nothing here touches your real deployed data (that only
happens with the `--remote` flag, as in step 4 above).

## What this doesn't include (same as the Node.js version)

No self-service password reset for staff, no email notifications, no
file attachments. If any of these end up mattering, they're
straightforward to add.

## A note on data location

D1 stores your data on Cloudflare's infrastructure (you can choose a
region hint, but Cloudflare's network is global). For an internal task
tracker this is generally fine, but if STELCO has any policy about
where company data can be hosted, worth a quick check with whoever
handles that before pointing your team at the live URL.

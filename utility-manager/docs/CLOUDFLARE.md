# Deploying to Cloudflare (replacing the current dashboard)

The Utility Manager runs on Cloudflare Workers, with its data in a
**new Supabase project**. The switch-over is done without downtime:

1. Deploy it as a **second Worker**, `srd-utility-manager`, at its own
   test address. The current dashboard keeps running.
2. Test it there.
3. Take over the current dashboard's address. The old version stays in
   Cloudflare's deployment history, so it can be rolled back with one click.

```
Browser ──HTTPS──▶ Cloudflare Worker "srd-utility-manager"
                     ├─ web app files     (served by Cloudflare, web/dist)
                     └─ /api/*  ──▶ Hyperdrive ──▶ Supabase Postgres (new project)
```

## Before you start

- **Cloudflare plan: Workers Paid ($5/month).** Checking a password
  securely takes about 50 ms of processing. The free plan allows only 10 ms
  per request, so sign-in would fail on it. Upgrade under **Workers & Pages →
  Plans**.
- **The code**, either cloned with git or downloaded from GitHub, with
  `npm install` run once in the `utility-manager` folder. Your Mac from the
  demo already has this.

## 1. Create the database (Supabase)

1. In Supabase, click **New project**.
   - Name it `srd-utility-manager`.
   - Choose a strong database password and save it in your password manager.
   - For the region, pick **Mumbai (ap-south-1)**, the closest to the Maldives.
2. When the project is ready, click **Connect** and copy the
   **Session pooler** connection string. It looks like this:
   `postgresql://postgres.abcdefgh:[YOUR-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`

   Replace `[YOUR-PASSWORD]` with the password from step 1.

## 2. Load the tables, the asset register and your admin account

In the `utility-manager` folder, create a file named `.env` (or add to it):

```
DATABASE_URL=postgresql://postgres.abcdefgh:YOUR-PASSWORD@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
DATABASE_SSL=true
```

Then run:

```bash
npm run migrate -w server       # creates the tables
npm run seed -w server          # loads 4 atolls, 34 islands, 140 gensets
npm run create-admin -w server -- you@stelco.com.mv "Your Name"
```

Write down the temporary password that `create-admin` prints.

## 3. Connect Cloudflare to the database (Hyperdrive)

Hyperdrive keeps database connections warm close to the database, so each
request doesn't have to reconnect from scratch.

```bash
cd server
npx wrangler login              # opens the browser once
npx wrangler hyperdrive create srd-utility-db --connection-string="<the same connection string>"
```

It prints an `id`. (Already done for srd-utility-db.) Open `server/wrangler.jsonc` and replace
`REPLACE_WITH_HYPERDRIVE_ID` with it. You can also send me the id and I'll
commit it for you.

## 4. Deploy the test version

From the `utility-manager` folder:

```bash
npm run deploy:cloudflare
```

It prints the address, for example
`https://srd-utility-manager.<your-account>.workers.dev`. Open it and sign in
with the admin account from step 2. Then add colleagues under **Users**.

The current dashboard is untouched throughout.

## 5. Switch over

Once you're happy with the test version:

1. **Stop the old site's automatic deploys.** In Cloudflare, go to
   **Workers & Pages → srd-project-manager → Settings → Build**, and
   disconnect the Git repository. Otherwise the next push to `main` would
   redeploy the old dashboard over the new one.
2. **Take over the old address.** In `server/wrangler.jsonc`, change
   `"name": "srd-utility-manager"` to `"name": "srd-project-manager"`, then
   run `npm run deploy:cloudflare`. The old address now serves the new
   system. If you use a custom domain, it was attached to that Worker, so it
   follows.
3. **Rolling back if needed:** in Cloudflare, go to **srd-project-manager →
   Deployments** and roll back to the previous version.
4. **Tidy up** once everything works. You can delete the test Worker
   `srd-utility-manager`. Keep the old Supabase project (read-only) until
   you're sure nothing else needs it.

## Deploying a new version later

Most new versions include database changes, so always run `migrate` first.
Version 004 (engine condition) adds the engine tables and the Alif Alif atoll.

Run `git pull`, then `npm run migrate -w server`, then
`npm run deploy:cloudflare`. Migrations only add changes, so it is safe to
run them before the new code goes live.

To have Cloudflare deploy automatically on every push instead:

1. Go to **Workers & Pages → the Worker → Settings → Build → Connect**.
2. Pick this repository, with:
   - **root directory** `utility-manager`
   - **build command** `npm ci && npm run build -w web`
   - **deploy command** `npm run deploy:cloudflare -w server`
3. Remember to run migrations yourself when a new version includes them.

## Notes

- **Logs:** go to **Workers & Pages → the Worker → Logs**. Every API request
  is logged as one JSON line.
- **Backups:** Supabase takes daily backups (the retention period depends on
  the plan). For your own copy, run
  `pg_dump "<connection string>" > backup.sql`.
- **Sign-in limits:** these are counted per Cloudflare server rather than
  globally. They still slow down password guessing. For stricter limits, add
  a Cloudflare rate-limiting rule on `/api/v1/auth/login`.

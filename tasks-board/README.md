# SCRD Operations Board

The department TV board for STELCO's South Central Regional Department: tasks,
power interruptions and an interactive map of the seven atolls (AA, ADh, V, M,
F, Dh, Th). Anyone with the link can view it. Editors sign in to add and change
records.

- Site: `public/` (plain HTML, CSS and JavaScript; no build step)
- Host: a Cloudflare Worker serving static files, on the custom domain
  `tasks.islandsmanager.org` (see `wrangler.jsonc`)
- Data: the same Supabase project as islandsmanager.org, in the `scrd_board_*`
  tables created by
  `branch-monitor/supabase/migrations/20261115090000_scrd_operations_board.sql`

## Files

- `public/index.html` – page layout and styles
- `public/app/config.js` – Supabase URL and publishable key
- `public/app/store.js` – reads and writes the Supabase tables, live updates
- `public/app/board.js` – the board itself (map, cards, detail screens)
- `public/app/data.js` – loads tasks, interruptions, attendance and islands
- `public/app/editor.js` – the + Add menu and the edit forms
- `public/app/auth.js` – sign in / sign out
- `seed/2026-11-15-tasks.sql` – one-off copy of the tasks entered on the earlier Claude-hosted board

## One-time setup

1. **Database.** In the Supabase SQL editor, run the migration file above, then
   `seed/2026-11-15-tasks.sql` to bring in the existing tasks.
2. **Editors.** For each person who should edit:
   - Supabase → Authentication → Users → *Add user* (email + password, tick *Auto confirm*).
   - Add their email (lower case) to the editors list:
     `insert into public.scrd_board_editors (email, name) values ('name@stelco.com.mv', 'Name');`
   Everyone else, including the TV, views without signing in.
   Removing a row from `scrd_board_editors` takes editing rights away at once.
3. **Hosting.** In Cloudflare (the account that holds islandsmanager.org):
   Workers & Pages → Create → Import a repository → this repo, with
   - Root directory: `tasks-board`
   - Build command: *(none)*
   - Deploy command: `npx wrangler deploy`
   The custom domain in `wrangler.jsonc` creates the `tasks` DNS record on the
   first deploy. From a computer instead: `cd tasks-board && npx wrangler deploy`.

## Develop

```bash
cd tasks-board
npx wrangler dev
```

Changes go live when they are merged to `main` (once the Cloudflare project is connected).

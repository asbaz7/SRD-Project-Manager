# Hosting on your own computer or office server

There are two ways to run it:

| | Option A: Quick trial | Option B: Office server |
|---|---|---|
| For | Trying it on your own PC | Real use by the department over the office network |
| Needs | Node.js | Docker |
| Database | Built-in file database | PostgreSQL (in Docker) |
| Survives reboots | Start it again by hand | Starts automatically |

Both options need the code first:

```bash
git clone -b claude/blissful-bardeen-zmzjcl https://github.com/asbaz7/SRD-Project-Manager.git
cd SRD-Project-Manager/utility-manager
```

---

## Option A: Quick trial (about 5 minutes)

1. Install **Node.js 22 LTS** (22.9 or newer) from https://nodejs.org.
   Check with `node -v`.
2. In the `utility-manager` folder:

   ```bash
   npm install
   npm run build                                   # builds the web pages
   npm run seed -w server                          # loads 4 atolls, 34 islands, 140 gensets
   npm run create-admin -w server -- you@example.mv "Your Name"
   npm start
   ```

3. Open **http://localhost:3000**. Sign in with the email and the temporary
   password that `create-admin` printed. You will be asked to choose a new
   password.

Stop the app with `Ctrl+C` and start it again with `npm start`. The data
is kept in `server/data/`.

> This built-in database is for trying the system out. For real use, go to
> Option B.

---

## Option B: Office server with Docker (recommended)

Use any always-on PC or server on the office network (Windows, macOS or
Linux).

### 1. Install Docker

- **Windows or macOS:** install Docker Desktop from
  https://www.docker.com/products/docker-desktop. Tick *Start Docker Desktop
  when you sign in*.
- **Linux:** follow https://docs.docker.com/engine/install/.

### 2. Set a database password

In the `utility-manager` folder, create a file named `.env` containing:

```
POSTGRES_PASSWORD=pick-a-long-random-password
```

### 3. Start it

```bash
docker compose up -d --build
```

The first run takes a few minutes. Check that it's up:

```bash
docker compose ps          # both services should show "running" / "healthy"
```

### 4. Load the register and create the first administrator

```bash
docker compose exec app node server/scripts/seed.js
docker compose exec app node server/scripts/create-admin.js you@example.mv "Your Name"
```

Write down the temporary password it prints.

### 5. Open it

- **On the server itself:** http://localhost:3000
- **From other office computers:** http://SERVER-IP:3000

To find SERVER-IP:

| OS | Command |
|---|---|
| Windows | `ipconfig`, then use the IPv4 Address |
| macOS | `ipconfig getifaddr en0` |
| Linux | `hostname -I` |

If other computers can't connect, allow port 3000 through the server's
firewall:

- **Windows** (in an Administrator terminal):
  `netsh advfirewall firewall add rule name="SRD Utility Manager" dir=in action=allow protocol=TCP localport=3000`
- **Linux:** `sudo ufw allow 3000/tcp`

Ask IT to give the server a **fixed IP address**, or a name such as
`srd-ops.local`, so the link doesn't change.

### 6. Add your staff

Sign in as the administrator and go to **Users → Add user**. For each person:

1. Pick their role.
2. Tick the islands or atolls they are responsible for.
3. Give them a temporary password. They change it at first sign-in.

---

## Everyday operations

| Task | Command (in `utility-manager`) |
|---|---|
| Stop | `docker compose stop` |
| Start | `docker compose start` |
| View logs | `docker compose logs -f app` |
| Back up the database | `docker compose exec db pg_dump -U srd srd > backup-YYYY-MM-DD.sql` |
| Restore a backup | `docker compose exec -T db psql -U srd srd < backup-YYYY-MM-DD.sql` (into an empty database) |
| Update to a new version | `git pull`, then `docker compose up -d --build` (database changes apply automatically) |

**Back up daily and copy the file off the server**, for example to a shared
drive. The database is the only thing that holds your data.

Commands that will **delete all data**:
- `docker compose down -v`
- `docker volume rm …`

Don't run them unless you mean to.

---

## Security on the office network

- By default the app runs over plain `http://`, so it should only be
  reachable **inside the office network**. Do not forward port 3000 on the
  router to the internet.
- To use it from outside the office, or over HTTPS:
  1. Put it behind HTTPS. Options include a reverse proxy such as Caddy or
     nginx with a certificate, or Cloudflare Tunnel.
  2. In `.env`, set `COOKIE_SECURE=true` and `TRUST_PROXY=true`.
  3. Run `docker compose up -d`.
- Use a strong `POSTGRES_PASSWORD`. The database port is not opened
  outside Docker.

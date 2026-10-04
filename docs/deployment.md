# Deploying Elay Menu

Hosting has not been chosen yet. This guide prepares any Linux host with Docker Engine and Compose v2.
Nothing here publishes the app, changes DNS or generates QR codes.

## What runs

| Service | Image | Listens | Data |
| --- | --- | --- | --- |
| `web` | nginx (unprivileged) serving the built Vue app, proxying `/api/` to `api` | host `${WEB_PORT:-8080}` → 8080 | none |
| `api` | Node 24 (non-root), Fastify | 3000, internal only | `/data/media` → volume `media` |
| `mongo` | MongoDB 8.0 | 27017, internal only (never published) | `/data/db` → volume `mongo-data` |

Images contain only built code, runtime fonts/icons/logos and the demo seed images. Prompts, instructions,
reference screenshots, tests and secrets are excluded by `.dockerignore`.

## Coolify

| Setting | Value |
| --- | --- |
| Resource type | Docker Compose (from the Git repository) |
| Compose file | `compose.coolify.yaml` |
| Public service | `web` — the only service that gets a domain |
| Internal port | `8080` |

Give `web` the menu domain with port 8080 (for example `https://DOMAIN:8080` in Coolify's domain field, which
routes HTTPS on 443 to the container's 8080). Do not create a separate domain or route for `/api`, `api` or
`mongo`: nginx inside `web` proxies `/api` to the API on the internal network.

```
Browser → https://DOMAIN → web:8080 (nginx) → /api proxy → api:3000 → mongo:27017
```

Environment variables (Coolify → Environment Variables; see `coolify.env.example`):

| Variable | Value |
| --- | --- |
| `PUBLIC_MENU_URL` | `https://DOMAIN` — required, deployment fails without it. Must equal the URL on the printed QR codes. |
| `COOKIE_SECURE` | `true` (keep) |
| `SESSION_TTL_HOURS` | `12` (optional) |
| `LOGIN_RATE_LIMIT_PER_15M` | `10` (optional) |

Everything else is fixed in `compose.coolify.yaml`. No host ports are published; Coolify's proxy reaches `web`
on the internal network and its forwarded client address is trusted by nginx (private-range rule).

- **Migrations** run automatically when the API starts; there is no separate migrate step.
- **First super admin** (once): open a terminal for the `api` container in Coolify (or `docker exec -it
  <api-container> sh` on the server) and run `node dist/cli/create-super-admin.js`. There is no default account
  and no admin credential in any environment variable.
- **Data** lives in the fixed-name volumes `elay_mongo_data` (database) and `elay_media_data` (uploaded
  photos and logos). Redeployments reuse them. **Production backups must include both volumes** — use the
  backup and restore commands in section 6 with these volume names. Never delete them on redeploy.

The rest of this guide describes a manual Docker Compose host using `compose.yaml`.

## 1. Configure

Copy `.env.example` to `.env` next to `compose.yaml` (on Windows: `06-CREATE-LOCAL-ENV.cmd`) and set:

| Variable | Required | Meaning |
| --- | --- | --- |
| `PUBLIC_MENU_URL` | **yes, before printing/using QR codes** | The exact URL already printed on the table QR codes (for example `https://menu.<your-domain>/`). Shown read-only in SA-Settings. The app never changes it. Empty = shown as «هنوز تنظیم نشده». |
| `WEB_PORT` | no (8080) | Host port of the web container (put TLS in front of it, see below). |
| `COOKIE_SECURE` | no (`true`) | Keep `true` in production (HTTPS). Set `false` only for plain-HTTP tests on a LAN; browsers drop Secure cookies over plain HTTP except on `localhost`. |
| `SESSION_TTL_HOURS` | no (12) | Admin session lifetime. |
| `LOGIN_RATE_LIMIT_PER_15M` | no (10) | Login attempts allowed per IP + username per 15 minutes. |

`NODE_ENV`, `MONGODB_URI`, `MEDIA_DIR` and `TRUST_PROXY` are fixed in `compose.yaml` for the container setup.

## 2. Build and start

```sh
docker compose build
docker compose up -d --wait        # waits for mongo → api → web health checks
docker compose ps
```

Database migrations (indexes, foodcourt record) run automatically at API start and are recorded in the
`migrations` collection; re-running is a no-op. Interrupted stall deletions are resumed at start.

## 3. Create the first super admin (interactive, once)

```sh
docker compose exec -it api node dist/cli/create-super-admin.js
```

It asks for a username and a password (hidden; at least 8 characters with letters and digits) and refuses to
run when a super admin already exists. There is no default account. Then sign in at `/admin/login`.
Stall managers are created by the super admin (SA-StallForm), which shows each temporary password once.

Optional demo data (labelled `isDemo`, seven stalls, eight categories, nine foods, no accounts) for a test
installation only:

```sh
docker compose exec api node dist/cli/seed-demo.js --allow-production-demo
```

## 4. Reverse proxy and TLS

Terminate HTTPS in front of `web` (Caddy, Traefik, nginx, a cloud load balancer…) for the host name in
`PUBLIC_MENU_URL`, and forward to `http://<host>:${WEB_PORT}`. Requirements:

- Pass the original `Host` header (the API rejects state-changing requests whose `Origin` host differs).
- Send the client address in `X-Forwarded-For`. The web container trusts it only from private addresses
  (10/8, 172.16/12, 192.168/16, 127.0.0.1 — see `apps/web/nginx.conf`). If your proxy reaches the host from a public
  address, add its address as another `set_real_ip_from` line; otherwise every customer shares one rate-limit bucket.
- Add HSTS on the TLS front end (for example `Strict-Transport-Security: max-age=31536000`) once HTTPS works.
  The web container already sends a Content-Security-Policy, `X-Frame-Options: DENY` and `nosniff`.
- Allow request bodies up to 8 MB (image uploads are capped at 5 MB by the API).

Example (Caddy): `menu.example.com { reverse_proxy 127.0.0.1:8080 }` — replace the host with the real one.

## 5. Health and monitoring

- `GET /health/live` — process up (inside the network: `http://api:3000/health/live`).
- `GET /health/ready` — API can reach MongoDB (`503` otherwise). Used by the Compose health check.
- `web` health check fetches `/`. Logs: `docker compose logs -f api` (JSON; cookies and CSRF headers are redacted).

## 6. Data, backup and restore

| Volume | Contents |
| --- | --- |
| `<project>_mongo-data` | MongoDB database (`elay`) |
| `<project>_media` | uploaded food photos and logos (random file names) |

Backup (while running):

```sh
docker compose exec -T mongo mongodump --archive --db elay > elay-$(date +%F).archive
docker run --rm -v <project>_media:/m -v "$PWD":/b alpine tar czf /b/media-$(date +%F).tgz -C /m .
```

Restore (stop the app first so nothing writes meanwhile; the database keeps running):

```sh
docker compose stop web api
docker compose exec -T mongo mongorestore --archive --drop < elay-<date>.archive
docker run --rm -v <project>_media:/m -v "$PWD":/b alpine sh -c "tar xzf /b/media-<date>.tgz -C /m"
docker compose up -d --wait
```

## 7. Update and roll back

```sh
git pull                      # or check out the release tag
docker compose build
docker compose up -d --wait   # recreates containers; volumes are kept
```

Roll back: check out the previous release and run the same two commands. **Never** use
`docker compose down -v` or `docker volume rm` in production: they delete the database and all photos.
Migrations only add indexes/records, so an older release keeps working on the same data.

## Notes

- Passwords treat Persian/Arabic-Indic digits as ASCII digits (the menu font shows ASCII digits in Persian). A
  password created before this rule with Persian digits would need a «رمز تازه»; none exist before the first release.
- `index.html` and `sw.js` are served with `Cache-Control: no-cache` and `/assets/*` as immutable, so a redeploy is
  picked up on the next page load; customers who were offline keep the last menu until they reconnect.

## Not decided / to provide at deployment

- The real host name and the printed QR URL → `PUBLIC_MENU_URL`.
- Where TLS terminates and its certificates.
- MongoDB runs without authentication on the internal Compose network only; if the database is ever moved
  outside this network, enable MongoDB authentication and set `MONGODB_URI` with credentials.
- Backup schedule and off-site storage.

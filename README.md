# Elay Menu

Mobile web menu for the Elay food court, with a stall-admin panel and a super-admin panel.
Persian, right-to-left, light theme only. The app takes no orders and no payments: the order list stays
on the customer's phone and is read aloud to each stall's cashier.

Status: DRAGON-01. The API behind the customer menu and both panels is complete and tested
(see `docs/api.md`); the web app still has only shells. Customer screens arrive in DRAGON-02 and panel
screens in DRAGON-03/04.

## Layout

| Path | What |
| --- | --- |
| `apps/web` | Vue 3 + Vite + TypeScript. Design tokens, `bundle.css`, Rokh FaNum fonts and icons are copied from the design handoff into `src/styles` and `src/assets`. |
| `apps/api` | Fastify + TypeScript + MongoDB driver. Auth, guards, migrations, demo seed, CLI commands. |
| `packages/shared` | zod schemas, error format and the discount rule shared by both apps. |
| `docs/api.md` | Endpoint contract, error format, security model. |

The ignored `handoff/` folder is reference material only; nothing at build or run time reads it.

## Run with Docker

```sh
docker compose up -d --build        # web on http://localhost:8080 (WEB_PORT to change)
docker compose exec -it api node dist/cli/create-super-admin.js   # first super admin, interactive
docker compose exec api node dist/cli/seed-demo.js --allow-production-demo   # optional demo data
```

- Services: `web` (nginx, serves the app and proxies `/api`), `api`, `mongo`. Only `web` publishes a
  host port; MongoDB has no host port.
- Data persists in the named volumes `mongo-data` and `media`. Do not use `docker compose down -v`
  unless you intend to delete all data.
- `PUBLIC_MENU_URL` must be the URL already printed on the table QR codes. It is shown read-only and
  never generated; when empty, the panel shows it as not configured.

### Local configuration (`06-CREATE-LOCAL-ENV.cmd`)

Run `06-CREATE-LOCAL-ENV.cmd` (Windows) to copy `.env.example` to `.env`. Then edit `.env` yourself,
for example `PUBLIC_MENU_URL` or `WEB_PORT`. Compose reads it automatically; it is git-ignored.
Re-running refuses to overwrite an existing `.env` unless called with `-Force`.

## Develop without Docker

Requires Node 22.12+ and a MongoDB reachable at `MONGODB_URI`.

```sh
npm ci
npm run dev:api     # http://127.0.0.1:3000 (reads ../../.env if present)
npm run dev:web     # http://localhost:5173, proxies /api to the API
```

## Checks

```sh
npm run typecheck   # shared build + api tsc + vue-tsc
npm test            # shared unit tests + API tests (in-memory MongoDB, or MONGODB_TEST_URI)
npm run build
```

## Accounts

There is no signup and no default password. The first super admin is created with the interactive
command above (it refuses to run when a super admin already exists). Stall admin accounts and
temporary passwords are managed by the super admin (DRAGON-04).

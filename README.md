# Collecto backend

REST API for Collecto, an instalment-collection system for small shops. The owner sells goods on weekly or
monthly instalments; field riders collect payments from customers; the owner reviews collections, closings,
overdue accounts and reports.

Node.js + TypeScript, Express 5, PostgreSQL, Prisma 7, Zod 4, JWT, argon2, Pino, Vitest, OpenAPI/Swagger.

## Architecture

```
src/
  config/        env validation (zod), logger, database (Prisma + pg pool)
  middlewares/   authenticate, authorize, trusted-origin (CSRF) guard, rate limits, upload, error handler
  modules/<name>/  <name>.routes.ts      wires middleware to handlers
                   <name>.controller.ts  HTTP in/out only
                   <name>.service.ts     business rules
                   <name>.repository.ts  all database access (Prisma)
                   <name>.schema.ts      zod request schemas (also feed the OpenAPI spec)
  domain/        pure instalment maths (schedules, balances, statuses); no I/O
  jobs/          daily overdue-alert job (node-cron + advisory lock)
  db/            demo seed, owner creation
  cli/           owner-creation command
  docs/          OpenAPI generation + Swagger UI
  utils/         money (integer paise), dates, ids, uploads
prisma/          schema, migrations, seed entrypoint
tests/           unit + integration tests (real PostgreSQL)
```

Rules the code follows:

- **Layers:** routes → controller → service → repository. Only repositories talk to Prisma.
- **Ids:** integers in the database; prefixed ids in the API (`C101`, `IT3`, `R1`, `P7`).
- **Money:** `Decimal(12,2)` in the database, integer paise in the domain code, plain numbers in JSON.
  Overpayments are rejected; balances are always computed on the server.
- **Dates:** `YYYY-MM-DD` strings. "Today" follows `APP_TZ` (or `APP_TODAY` when pinned).
- **Photos:** stored on local disk under `UPLOADS_DIR` with random UUID filenames; the database stores the
  path; files are served publicly under `/uploads`.
- **Roles:** one owner (always user id 0) and any number of riders (ids 1, 2, 3 … without gaps). Riders only
  ever see their own customers and the payments on them or collected by them.

## Prerequisites

- Node.js 20 or newer
- PostgreSQL 14 or newer, with two empty databases: one for the app and one for tests
  (for example `collecto` and `collecto_test`). The database user needs permission to create tables.

## Install

```bash
npm install
cp .env.example .env        # then edit .env, see below
npm run db:generate         # generates the Prisma client into src/generated (git-ignored)
```

`src/generated` is not committed, so run `npm run db:generate` after every fresh clone and after changing
`prisma/schema.prisma`.

## Environment variables

Configuration is validated at start-up; the server exits with a readable list of problems if anything is
wrong. Empty values count as unset.

| Variable                 | Default                         | Notes                                                                                                                |
| ------------------------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`               | `development`                   | `development`, `test` or `production`. Production hides `/dev` and, by default, Swagger.                             |
| `PORT`                   | `4000`                          |                                                                                                                      |
| `DATABASE_URL`           | required                        | `postgresql://USER:PASSWORD@HOST:5432/collecto?schema=public`                                                        |
| `TEST_DATABASE_URL`      | none                            | Must differ from `DATABASE_URL`. Tests wipe and reseed it.                                                           |
| `JWT_ACCESS_SECRET`      | required                        | At least 32 characters. Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`     |
| `JWT_ACCESS_TTL`         | `15m`                           | Access-token lifetime.                                                                                               |
| `REFRESH_TTL_DAYS`       | `30`                            | Refresh-token lifetime ("remember me").                                                                              |
| `COOKIE_SECURE`          | `false`                         | Must be `true` in production (HTTPS).                                                                                |
| `COOKIE_SAMESITE`        | `lax`                           | `none` is for a frontend on another site, and requires `COOKIE_SECURE=true`.                                         |
| `COOKIE_DOMAIN`          | none                            | Set only if the cookie must be shared across subdomains.                                                             |
| `CORS_ORIGINS`           | required                        | Comma-separated frontend origins, for example `http://localhost:3000`. Also used by the CSRF origin guard.           |
| `TRUST_PROXY`            | `false`                         | `true` behind a reverse proxy, otherwise every client shares the proxy's IP for rate limiting.                       |
| `APP_TZ`                 | `Asia/Colombo`                  | Time zone that defines "today".                                                                                      |
| `APP_TODAY`              | none                            | Pin today's date (`YYYY-MM-DD`) for demos. Never set in production.                                                  |
| `LOG_LEVEL`              | `info`                          |                                                                                                                      |
| `UPLOADS_DIR`            | `./uploads`                     | Must be on persistent storage.                                                                                       |
| `UPLOADS_PUBLIC_URL`     | `http://localhost:4000/uploads` | Public base URL used in photo links.                                                                                 |
| `OVERDUE_ALERTS_ENABLED` | `true`                          | Turns the daily overdue alert job on or off.                                                                         |
| `OVERDUE_CRON`           | `0 8 * * *`                     | Schedule of the job, in `APP_TZ`.                                                                                    |
| `DB_POOL_MAX`            | `10`                            | Maximum database connections.                                                                                        |
| `BOOTSTRAP_PAYMENT_DAYS` | `90`                            | `/bootstrap` sends individual payments for this many days; older ones are summarised per item. `0` sends everything. |
| `DOCS_ENABLED`           | on outside production           | Swagger UI and `openapi.json`.                                                                                       |

## Database setup

```bash
npm run db:deploy           # apply migrations to DATABASE_URL (production-safe)
# or, while developing and changing the schema:
npm run db:migrate
npm run db:test:setup       # apply migrations to TEST_DATABASE_URL
```

### Demo data (development only)

```bash
npm run db:seed
```

Creates a demo shop (owner, riders, customers, items, payments) with dates anchored to today. Demo logins:
owner `owner` (or `owner@collecto.lk`) / `owner123`; riders `kasun`, `nimal`, … (or their phone numbers) / `1234`. **Never seed a production database.**

## Creating the owner (production)

A fresh production database has no users. Create the single owner with:

```bash
npm run build
OWNER_PASSWORD='choose-a-strong-password' npm run owner:create:prod -- \
  --name "Jane Owner" --email jane@example.com --username jane --shop "Jane's Store"
```

- In development use `npm run owner:create -- …` (same flags).
- The password is read from `OWNER_PASSWORD` or a hidden prompt (it needs a real terminal). There is no
  `--password` flag, so it never lands in shell history.
- Usernames: 3–50 characters of `a-z 0-9 . _ -`. Password: at least 8 characters.
- It refuses to run if an owner already exists. Riders are then added by the owner in the app.

## Running

|                            | Command                                                 |
| -------------------------- | ------------------------------------------------------- |
| Development (auto-restart) | `npm run dev`                                           |
| Build                      | `npm run build`                                         |
| Production                 | `npm run build && npm run db:deploy && npm start`       |
| Type check / lint / format | `npm run typecheck` / `npm run lint` / `npm run format` |

The server listens on `PORT`, runs the overdue job on its schedule, and shuts down gracefully on SIGINT/SIGTERM
(closes the HTTP server, stops the job, closes the database pool).

Production checklist:

- `NODE_ENV=production`, `COOKIE_SECURE=true`, a strong `JWT_ACCESS_SECRET`, `APP_TODAY` unset.
- `CORS_ORIGINS` set to the real frontend origin(s); `COOKIE_SAMESITE=none` only if the frontend is on a
  different site.
- `TRUST_PROXY=true` when behind a proxy; terminate TLS at the proxy.
- `UPLOADS_DIR` on a persistent volume, `UPLOADS_PUBLIC_URL` set to its public address.
- Run a single instance, or accept that each instance runs the overdue job (a database advisory lock and
  per-day de-duplication keep alerts from being duplicated).
- Never run `db:seed` against it. The `/dev` routes (demo reset) are not mounted in production.

## Testing

```bash
npm run db:test:setup       # once, and after new migrations
npm test                    # all tests (they reseed TEST_DATABASE_URL)
npm run typecheck
npm run lint
npm run perf                # optional: loads ~5,000 items / 46,000 payments into the TEST database and times endpoints
```

Tests use a real PostgreSQL database and run file by file. Coverage includes authentication and token
rotation, authorization of every documented endpoint (generated from the API registry), business rules,
concurrency (overpayment, stock), reports (locked to a golden master and cross-checked with SQL), the
frontend/backend calculation parity, and a whole working day through the API from an empty database.
Without `TEST_DATABASE_URL` the database tests are skipped, and the frontend-parity test (which runs the
frontend's own calculation code) is skipped unless `Collecto-frontend/` sits next to this folder.

## API documentation

With docs enabled: Swagger UI at `http://localhost:4000/api/docs` and the raw spec at
`/api/docs/openapi.json`. The spec is generated from the same zod schemas the routes validate with, and a test
fails if a route and the spec drift apart.

All endpoints live under `/api/v1`. Responses use one envelope:

```json
{ "success": true, "message": "…", "data": {}, "meta": { "page": 1, "limit": 20, "total": 0 } }
{ "success": false, "message": "…", "errors": [{ "path": "amount", "message": "…" }] }
```

| Group                    | Purpose                                                  |
| ------------------------ | -------------------------------------------------------- |
| `auth`                   | login, refresh, logout, current session                  |
| `bootstrap`              | everything the app needs after login, scoped to the role |
| `riders`, `shop`         | rider management, shop details, photos (owner)           |
| `products`               | catalogue and stock (owner)                              |
| `customers`              | customers, rider reassignment, payment extensions        |
| `items`                  | selling an item on instalment (owner)                    |
| `payments`               | recording and correcting collections                     |
| `closings`               | a rider's end-of-day cash closing                        |
| `notifications`, `audit` | owner notifications, audit trail of corrections          |
| `reports`                | six backend-generated reports, JSON or CSV               |
| `health`                 | liveness and database check                              |

## Authentication flow

1. `POST /auth/login` with `{ role, username, password, remember }`. The response carries a short-lived
   **access token** (JWT, 15 minutes) and the session; a long-lived **refresh token** is set as an
   `httpOnly` cookie (`collecto_rt`, path `/api/v1/auth`). Failed logins are rate limited.
2. The client sends `Authorization: Bearer <access token>` on every request and keeps that token in memory only.
3. On `401`, the client calls `POST /auth/refresh`. The refresh token **rotates**: the old one is revoked and a
   new one is issued. Reusing a revoked token revokes the whole token family (theft detection). Two browser
   tabs refreshing at once are handled by a 10-second grace window; the loser gets a `refresh_race` error and
   retries.
4. `POST /auth/logout` revokes the token and clears the cookie.
5. `refresh` and `logout` also require a trusted `Origin` (from `CORS_ORIGINS`) as CSRF protection.
6. Every request re-reads the user, so deactivating a rider locks them out immediately, even with a valid token.
7. `authorize('owner')` / `authorize('rider')` restrict endpoints by role. Riders only see their own data.

## Scheduled job

At `OVERDUE_CRON` (in `APP_TZ`) the server creates one overdue notification per customer per day for the
owner. It takes a PostgreSQL advisory lock, so only one instance runs it at a time.

## Troubleshooting

- _"Invalid environment configuration"_ on start: the printed list names each wrong variable.
- _Prisma client not found / `src/generated` missing_: run `npm run db:generate`.
- _Login works but the browser does not stay signed in_: frontend and API are on different sites; set
  `COOKIE_SAMESITE=none` and `COOKIE_SECURE=true` (HTTPS) and put the frontend origin in `CORS_ORIGINS`.
- _Tests skipped_: set `TEST_DATABASE_URL` (a different database from `DATABASE_URL`) and run `npm run db:test:setup`.

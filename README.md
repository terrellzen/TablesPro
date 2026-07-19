# TablesPro

TablesPro is a self-hosted, open-source relational table application for collaborative spreadsheet-style data management.

## Project Structure

This repo is split into two independent pnpm projects:

- `backend/apps/api` — Fastify REST API with Better Auth
- `backend/apps/worker` — Background job processor
- `backend/packages/database` — Migrations, seed data, and database helpers
- `backend/packages/contracts` — Shared API contracts
- `backend/packages/permissions` — Authorization logic
- `frontend/apps/web` — React/Vite web application
- `frontend/packages/ui` — Shared UI component library

## Prerequisites

- Node.js ≥ 20
- pnpm (via Corepack)
- PostgreSQL 14+

## Initial Setup

```sh
corepack pnpm -C backend install
corepack pnpm -C frontend install
cp .env.example .env
```

Edit `.env` as needed — the defaults work with a local PostgreSQL instance on the standard port.

### Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://tablespro:tablespro@localhost:5432/tablespro?options=-c%20search_path%3Dauth,app,public` | PostgreSQL connection string |
| `API_PORT` | `4000` | Port the API listens on |
| `BETTER_AUTH_URL` | `http://localhost:4000` | Public URL for auth callbacks |
| `BETTER_AUTH_SECRET` | *(required)* | Random string ≥ 32 characters |
| `WEB_ORIGIN` | `http://localhost:3000,...` | Comma-separated allowed CORS origins |
| `AUTH_SIGNUP_ENABLED` | `true` | Allow new user registration |

## Database Setup

Create the database and run migrations:

```sh
createdb tablespro
npm run migrate
```

Seed dev data and verify the connection:

```sh
npm run dev:seed
npm run integration:check
```

To start/stop a local PostgreSQL instance managed by the project:

```sh
npm run db:start
npm run db:stop
```

## Running for Development

### API Server (backend/apps/api)
Fastify HTTP server on port 4000. Handles all CRUD operations and auth. Routes include:
- Workspaces, bases, tables — the resource hierarchy
- Fields and records — schema and data for each table
- Views — saved filter/sort configurations
- Field groups — column grouping
- Memberships — RBAC (owner/admin/editor/commenter/viewer)
- Import/export — queues CSV jobs for the worker
- Audit log — tracks all mutations
- /health and /ready — liveness/readiness probes
- /api/auth/* — Better Auth sign-in/sign-up/sign-out

### Frontend (frontend/apps/web)
React SPA served by Vite on port 3000. The entire UI is in main.tsx — a single-file app with a virtualized spreadsheet grid, sidebar workspace nav, and an admin panel for RBAC. It talks to the API at localhost:4000 (configurable in the UI).

### Background Worker (backend/apps/worker)
Long-polling job processor. Polls the app.background_jobs table, claims jobs with FOR UPDATE SKIP LOCKED, and runs them. Currently handles:
- csv_export — streams table data to a CSV file at .local/exports/, updating progress in app.export_jobs
- csv_import — stubbed, not implemented yet
Jobs are retried with exponential backoff and dead-lettered after max attempts.

Start each service in a separate terminal:

```sh
# API server (Fastify) — http://localhost:4000
npm run backend:dev

# Frontend (Vite) — http://localhost:3000
npm run frontend:dev

# Background worker
corepack pnpm --filter @tablespro/worker dev
```

The API mounts Better Auth at `/api/auth/*` and exposes a `/health` endpoint.

### Running against a different database

```sh
DATABASE_URL=postgres://user:password@host:5432/tablespro_alt?options=-c%20search_path%3Dauth,app,public
API_PORT=4001
BETTER_AUTH_URL=http://localhost:4001
WEB_ORIGIN=http://localhost:3002
npm run backend:dev
```

Then point the frontend to `http://localhost:4001`.

## Testing & Checks

```sh
npm run typecheck        # type-check all packages
npm test                 # run unit tests (vitest)
npm run license:check    # verify dependency licenses
```

## Benchmarks

```sh
npm run perf:seed
npm run perf:api
npm run perf:queries
npm run perf:grid
npm run perf:report
```

See `docs/implementation-plan.md` for the build sequence.

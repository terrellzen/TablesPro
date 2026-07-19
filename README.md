# TablesPro

TablesPro is a self-hosted, open-source relational table application for collaborative spreadsheet-style data management.

## Development

The repo is split into deployable halves:

- `backend/`: API, worker, migrations, database helpers, contracts, permissions, and backend config packages.
- `frontend/`: React/Vite web app and frontend UI package.

```sh
corepack pnpm install
cp .env.example .env
npm run typecheck
npm test
npm run license:check
```

The API mounts Better Auth at `/api/auth/*` and exposes `/health`.

## Local Workflow

```sh
createdb tablespro
npm run migrate
npm run dev:seed
npm run integration:check
npm run backend:dev
npm run frontend:dev
corepack pnpm --filter @tablespro/worker dev
```

To point another backend instance at another PostgreSQL database, run that API with its own env values:

```sh
DATABASE_URL=postgres://user:password@host:5432/tablespro_alt?options=-c%20search_path%3Dauth,app,public
API_PORT=4001
BETTER_AUTH_URL=http://localhost:4001
WEB_ORIGIN=http://localhost:3002
npm run backend:dev
```

Then switch the frontend API server field to that API host:

```text
http://localhost:4001
```

Worker-only local command:

```sh
corepack pnpm --filter @tablespro/worker dev
```

Benchmark commands are reserved for the explicit performance profile:

```sh
npm run perf:seed
npm run perf:api
npm run perf:queries
npm run perf:grid
npm run perf:report
```

See `docs/implementation-plan.md` for the build sequence.

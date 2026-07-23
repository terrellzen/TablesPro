# TablesPro frontend

The frontend is a React application built and served with Vite. Node.js is used
for the frontend build tools only; the primary application backend is Laravel
in `../backend-laravel/`.

## Requirements

- Node.js 20 or newer
- Corepack (included with supported Node.js releases)

## Install

From this directory:

```sh
corepack pnpm install
cp .env.example .env
```

The default `.env.example` connects the frontend to the Laravel API at
`http://localhost:4000`.

## Run

Start the development server from this directory:

```sh
corepack pnpm dev
```

From the repository root, enter the frontend directory first:

```sh
cd frontend
corepack pnpm dev
```

Open `http://localhost:3000`.

The Laravel API must be running separately. From the repository root, start it
with:

```sh
cd backend-laravel
php artisan serve --host=0.0.0.0 --port=4000
```

Before starting it for the first time, complete the PostgreSQL and migration
steps in the repository root README or `backend-laravel/README.md`. Laravel
uses PostgreSQL-backed sessions, so the frontend's initial `/api/config` and
`/api/me` requests will fail if the database is unavailable.

## Checks

Run these commands from `frontend/`:

```sh
corepack pnpm build
corepack pnpm typecheck
corepack pnpm test
```

The frontend has one package manifest: `frontend/package.json`. Application
source is under `apps/web/`, while frontend-wide tests are under `tests/`.

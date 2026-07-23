# TablesPro

TablesPro is a self-hosted, open-source relational table application for collaborative spreadsheet-style data management.

The primary backend is now Laravel. The original Node.js backend remains in the repository as a fallback.

## Project structure

- `backend-laravel/`: Laravel API, authentication, authorization, database worker, and tests
- `backend/`: Original Fastify API and Node.js worker kept as a fallback
- `frontend/`: React and Vite web application, frontend dependencies, and tests
- `frontend/apps/web/`: Frontend application source
- `docs/`: Architecture, security, permissions, deployment, and operations documentation
- `scripts/`: Repository maintenance and performance scripts

## Primary stack

- PHP 8.2 or newer
- Laravel 12
- Laravel Sanctum with encrypted server-side sessions
- PostgreSQL 14 or newer
- React and Vite
- Node.js 20 or newer for the frontend
- pnpm through Corepack

## Initial setup

Create a local PostgreSQL login and database. The following development
credentials match `backend-laravel/.env.example`:

```sh
createuser --login --pwprompt tablespro
createdb --owner=tablespro tablespro
```

When `createuser` prompts for the new role's password, enter `tablespro`. Run
these commands as a PostgreSQL administrator; on Linux installations this may
require prefixing them with `sudo -u postgres`.

Install and configure the Laravel backend:

```sh
cd backend-laravel
composer install
cp .env.example .env
php artisan key:generate
```

Edit `backend-laravel/.env` and set the PostgreSQL connection values. The default frontend expects the API at `http://localhost:4000`.

Apply the database schema:

```sh
php artisan migrate
php artisan migrate:status
```

Install and configure the frontend:

```sh
cd ../frontend
corepack pnpm install
cp .env.example .env
```

Set `VITE_API_URL=http://localhost:4000` in `frontend/.env` if it is not already configured.

## Laravel environment

Important values in `backend-laravel/.env` include:

- `APP_URL`: Public URL of the Laravel API
- `WEB_ORIGIN`: Allowed frontend origin, normally `http://localhost:3000`
- `AUTH_SIGNUP_ENABLED`: Controls public account registration
- `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, and `DB_PASSWORD`: PostgreSQL connection settings
- `SESSION_DRIVER`: Use `database` outside tests
- `SESSION_LIFETIME`: Session lifetime in minutes
- `SESSION_SECURE_COOKIE`: Set to `true` when using HTTPS
- `SANCTUM_STATEFUL_DOMAINS`: Frontend hosts allowed to use session authentication
- `EXPORT_DIRECTORY`: Optional directory for generated CSV exports
- `WORKER_ID`: Optional name for the background worker

The PostgreSQL schemas are organized as follows:

- `auth`: User and email account data
- `app`: Workspaces, metadata, permissions, audit events, and jobs
- `app_data`: Physical record tables created for each TablesPro table
- `public`: Laravel migrations and session storage

The SQL files in `backend-laravel/database/schema/` are exact copies of the original backend schema migrations.

## Running in development

Start the Laravel API from `backend-laravel/`:

```sh
php artisan serve --host=0.0.0.0 --port=4000
```

Start the frontend from `frontend/`:

```sh
corepack pnpm dev
```

Start the Laravel database worker from `backend-laravel/`:

```sh
php artisan tablespro:work
```

The services are available at:

- Frontend: `http://localhost:3000`
- API: `http://localhost:4000`
- Health check: `http://localhost:4000/health`
- Readiness check: `http://localhost:4000/ready`

The API requires PostgreSQL even before sign-in because Laravel sessions are
stored in the database. If `/api/config` or `/api/me` returns HTTP 500, verify
that PostgreSQL is running, that the `DB_*` values in
`backend-laravel/.env` are correct, and that `http://localhost:4000/ready`
returns HTTP 200.

## First administrator

On a fresh database, enable signup and create the first account through the web interface. When that account saves its profile, Laravel creates the first `app.user_profiles` row with workspace creation and user management permissions.

The first administrator can then create a workspace and manage additional users from the admin panel. Disable public registration afterward by setting:

```env
AUTH_SIGNUP_ENABLED=false
```

## Authentication and security

Laravel Sanctum provides stateful session authentication. Sessions are encrypted, stored in PostgreSQL, and sent through HTTP-only cookies.

For production:

- Serve both applications over HTTPS
- Set `SESSION_SECURE_COOKIE=true`
- Set `WEB_ORIGIN` to the exact frontend URL
- Set `SANCTUM_STATEFUL_DOMAINS` to the frontend host
- Use a strong generated `APP_KEY`
- Keep `.env` files outside version control
- Restrict PostgreSQL access to the Laravel application and trusted operators

The API also applies request IDs, CORS restrictions, trusted-origin checks, content security headers, optimistic record concurrency, hierarchical permissions, and append-only audit events.

## Background jobs

The Laravel worker reads jobs from `app.background_jobs` with PostgreSQL row locking.

Current behavior:

- CSV exports stream records in batches and update progress in `app.export_jobs`
- CSV cells are protected against spreadsheet formula injection
- Failed jobs use exponential retry delays
- Exhausted jobs are marked as dead lettered
- CSV import remains a placeholder, matching the original Node.js worker

Generated exports are written to `storage/app/exports` unless `EXPORT_DIRECTORY` is configured.

## Testing and style checks

Laravel tests require an empty PostgreSQL test database configured through the backend environment:

```sh
cd backend-laravel
composer test
composer lint
```

Frontend checks:

```sh
cd frontend
corepack pnpm test
corepack pnpm typecheck
```

Repository license check:

```sh
node scripts/check-licenses.mjs
```

## Node.js fallback backend

The original backend in `backend/` has not been removed or modified. It remains available if a deployment needs to fall back while the Laravel backend is being evaluated.

Install it with:

```sh
cd backend
corepack pnpm install
cp .env.example .env
```

Run its migrations and start the API:

```sh
cd backend
corepack pnpm migrate
corepack pnpm dev
```

Start its worker in another terminal:

```sh
cd backend
corepack pnpm worker:dev
```

All Node.js fallback commands are run through `backend/package.json`. For
example, enter `backend/` and run `corepack pnpm test`. These commands do not
manage the Laravel backend.

There is intentionally no repository-root `package.json`: frontend Node.js
dependencies live in `frontend/package.json`, and fallback backend Node.js
dependencies live in `backend/package.json`.

## API compatibility

The Laravel backend preserves the existing frontend API paths and response shapes wherever practical, including:

- Email and password signup, sign-in, and sign-out routes
- Workspaces, bases, tables, fields, field groups, and saved views
- Typed record creation, filtering, sorting, pagination, updates, and deletion
- Optimistic concurrency through `rowVersion`
- Dropdown options and colors
- Workspace members and hierarchical permissions
- User administration and password management
- Audit events and database administration views
- Idempotent import and export job creation
- Deep duplication of workspaces, bases, and tables

See `backend-laravel/ANALYSIS.md` for the backend comparison and `backend-laravel/README.md` for Laravel-specific implementation notes.

## Additional documentation

- `docs/architecture.md`
- `docs/auth-and-rbac.md`
- `docs/data-model.md`
- `docs/deployment.md`
- `docs/operations.md`
- `docs/security-threat-model.md`
- `docs/backup-restore.md`

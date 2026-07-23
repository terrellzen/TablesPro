# TablesPro Laravel backend

This directory contains the Laravel/PostgreSQL replacement for the TypeScript Fastify backend in `../backend`. The Node.js implementation is intentionally unchanged and remains available as a fallback.

## Requirements

- PHP 8.2+ with `pdo_pgsql`, `mbstring`, `openssl`, and `sodium`
- Composer 2
- PostgreSQL 15+

## Setup

Create the development role and database first:

```bash
createuser --login --pwprompt tablespro
createdb --owner=tablespro tablespro
```

Use `tablespro` as the prompted development password to match `.env.example`.
The commands must be run as a PostgreSQL administrator; depending on the local
installation, prefix them with `sudo -u postgres`.

```bash
cd backend-laravel
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate
php artisan migrate:status
php artisan serve --host=0.0.0.0 --port=4000
```

Run the database-backed import/export worker in a separate process:

```bash
php artisan tablespro:work
```

Set `DB_*`, `WEB_ORIGIN`, and `SANCTUM_STATEFUL_DOMAINS` in `.env`. The frontend continues to use port 4000 by default. On first signup, save the profile through `PUT /api/me/profile`; the first profile receives user-management and workspace-creation privileges, matching the Node backend bootstrap behavior.

PostgreSQL must be available while the API is running because sessions use the
database driver. Use `GET /health` to check the PHP process and `GET /ready` to
check both PHP and the database. A 500 from `/api/config` and `/api/me`
together usually means the database is stopped, the credentials are wrong, or
the migrations have not been applied.

The API uses Laravel Sanctum's stateful session guard. The existing frontend does not send an `X-XSRF-TOKEN`, so state-changing API requests are protected with strict trusted-Origin validation and `SameSite`/HTTP-only encrypted cookies. Deployments must set `WEB_ORIGIN` exactly and should enable `SESSION_SECURE_COOKIE=true` behind HTTPS.

## Database

The five SQL files in `database/schema/` are exact copies of the existing backend migrations and remain the schema source of truth. The Laravel migration applies them in order and adds only `public.laravel_sessions`, which Laravel needs for server-side sessions. Dynamic record tables remain in `app_data`; metadata remains in `app`; authentication tables remain in `auth`.

This is designed for a fresh database. Better Auth password hashes from an old database are not converted; data migration was explicitly out of scope.

## Tests and style

Tests require an empty PostgreSQL test database configured through the usual `DB_*` variables:

```bash
php artisan migrate --env=testing
composer test
composer lint
```

Unit tests cover field values and signed cursors. Feature tests cover public endpoints, authentication, and protected-route behavior. Services are kept separate from HTTP controllers so PostgreSQL integration tests can be expanded without coupling to routing.

## Compatibility notes

- Existing `/api/auth/sign-in/email`, `/api/auth/sign-up/email`, and `/api/auth/sign-out` frontend paths are preserved.
- JSON success envelopes, error codes, 201/204 statuses, record row versions, idempotency keys, and audit writes follow the Node API.
- Dynamic schema changes and all duplication operations are transactional.
- Record filtering, sorting, field selection, and signed keyset cursors preserve the Node backend's mixed-direction and null-ordering behavior.
- Import/export endpoints enqueue the same database job records. The existing TypeScript worker can continue consuming them because the queue schema and payloads are unchanged.

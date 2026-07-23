# Deployment

TablesPro is designed for self-hosting with PostgreSQL, the Laravel API and
worker, and the web application without requiring Docker.

The default deployment path is:

1. Provision PostgreSQL.
2. Configure `backend-laravel/.env`, including the database and trusted origin.
3. From `backend-laravel/`, run `php artisan migrate`.
4. From `frontend/`, run `corepack pnpm install` and `corepack pnpm build`.
5. Run `php artisan serve` (or a production PHP server) and
   `php artisan tablespro:work` with a process manager such as systemd.
6. Serve `frontend/apps/web/dist` with a static web server or reverse proxy.

The optional Node.js fallback backend has its own deployment commands and
dependencies under `backend/`.

Container examples may be added later as optional packaging only; they are not the default runtime path.

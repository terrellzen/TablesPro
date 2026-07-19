# Deployment

TablesPro is designed for self-hosting with PostgreSQL, the API, the worker, and the web application without requiring Docker.

The default deployment path is:

1. Provision PostgreSQL.
2. Set `.env` values for the API, worker, Better Auth, and trusted origins.
3. Run `npm run migrate`.
4. Build with `npm run build`.
5. Run the API and worker with a process manager such as systemd.
6. Serve `frontend/apps/web/dist` with a static web server or reverse proxy.

Container examples may be added later as optional packaging only; they are not the default runtime path.

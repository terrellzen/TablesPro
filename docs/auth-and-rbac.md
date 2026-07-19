# Auth and RBAC

TablesPro uses Better Auth for user registration, login, logout, secure cookie-backed sessions, workspace membership, and invitations.

The product permission model lives in `@tablespro/permissions` instead of inside the API package. That package is shared by the API and worker so permission decisions stay identical across request handlers, background jobs, CSV imports, exports, and audit-event writers.

## Better Auth Scope

Better Auth owns:

- Users, accounts, sessions, verification records, organizations, members, and invitations.
- Workspace-level roles through the organization plugin.
- Session retrieval for Fastify routes through `auth.api.getSession`.

The API mounts Better Auth at `/api/auth/*`.

For local development only, `DEV_AUTH_USER_ID` may be set while `NODE_ENV=development` to exercise protected product routes before the Better Auth schema has been generated. Production ignores this path and requires real sessions.

## Product RBAC Scope

`@tablespro/permissions` owns:

- Workspace roles: `owner`, `admin`, `editor`, `commenter`, and `viewer`.
- Application permissions for workspaces, bases, tables, fields, saved views, records, and audit logs.
- Base-level and table-level overrides.

Override precedence is intentionally explicit:

1. Table deny
2. Base deny
3. Table allow
4. Base allow
5. Table role override
6. Base role override
7. Workspace role

Denies always win because base and table overrides may be used to protect sensitive tables even from broad workspace roles.

## Database Notes

Use Better Auth's CLI to generate or migrate its auth schema:

```sh
pnpm dlx auth@latest generate --config backend/apps/api/src/auth/auth.ts --output backend/infra/migrations/auth-schema.sql
```

The `DATABASE_URL` in `.env.example` sets PostgreSQL `search_path` to `auth,app,public` so Better Auth tables can live outside the application metadata schema while application metadata stays in `app`.

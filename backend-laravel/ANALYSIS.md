# Existing backend analysis

The rewrite was based on the Fastify application under `backend/apps/api`, its shared database and permission packages, its tests, and the frontend API caller.

## Architecture found

- Fastify exposes health/config/session routes and registers domain route modules.
- Better Auth stores users, email accounts, and sessions in the `auth` schema.
- Application metadata, hierarchical membership permissions, audit events, and jobs live in `app`.
- Each logical table owns a physical PostgreSQL table in `app_data`. Field creation/deletion performs DDL and record operations address generated physical columns.
- Deletion is soft for workspaces, bases, tables, fields, and records. Deleting a logical table also drops its physical table.
- Audit events are append-only by database trigger.

## Behavior recreated

| Area | Important behavior |
| --- | --- |
| Authentication | Email/password signup and login, 14-day encrypted server session, disabled-account check, profile bootstrap, logout, self/admin password changes |
| Authorization | Admin/editor/viewer/restricted workspace baseline with base/table/record grants, resource scoping, non-disclosing 404s, final-admin protection |
| Workspaces | List/create/read/rename/soft-delete and deep duplication |
| Bases | Scoped list/create/read/rename/soft-delete and deep duplication |
| Tables and fields | Dynamic table DDL, field DDL, rename, reorder, tombstoning, dropdown options/colors, duplication |
| Records | Typed values, filters, sorts, selected fields, signed cursors, soft deletion, optimistic row-version conflicts |
| Views/groups | Private/shared saved views with filters and sorts; nested field-group creation |
| Jobs | Idempotent import/export job creation and a database worker with CSV export, retry backoff, dead lettering, progress, and formula-injection protection |
| Administration | Users, global privileges, member permissions, database statistics, workspace navigation, audit filtering |
| Cross-cutting | Compatible envelopes/status codes, request IDs, CORS, security headers, append-only audit writes |

## Validation rules carried over

- All metadata names are required trimmed strings.
- Field types are limited to the 15 existing enum values.
- Record values retain the Node limits and type checks (safe integers, finite numerics, ISO dates, timestamps, HTTP(S) URLs, email format, unique multi-select arrays, and text limits).
- Record updates require a positive `rowVersion` and at least one value.
- Page limits are positive and capped at 500 (250 for audit routes).
- Permission resource IDs must belong to the selected workspace; destructive grants require explicit confirmation.
- Members cannot remove themselves or change their own grants, and the final workspace admin cannot be removed, demoted, or disabled.

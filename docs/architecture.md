# Architecture

TablesPro is a TypeScript pnpm monorepo with separate web, API, worker, and shared package boundaries.

- `backend/apps/api`: Fastify REST API, Better Auth integration, OpenAPI, domain routes, services, repositories, and authorization calls.
- `backend/apps/worker`: PostgreSQL-backed job processing for schema changes, imports, exports, retries, and dead letters.
- `frontend/apps/web`: React/Vite application with a virtualized table grid.
- `backend/packages/contracts`: shared API envelopes, filter ASTs, field types, and pagination contracts.
- `backend/packages/database`: SQL-adjacent safety helpers, cursor signing, filter compilation, CSV safety, and migration tooling.
- `backend/packages/permissions`: product RBAC and scoped permission evaluation.
- `backend/tests`: backend tests grouped by API, database, and permissions domains, outside production source trees.

The API bootstrap in `server.ts` is limited to transport configuration, health checks, and route registration. Domain route modules are organized by resource; field routes are separate from table routes, admin routes are isolated from bootstrap, and record input parsing is separate from SQL query/cursor construction.

Authorization resolves a workspace baseline and additive base/table/record grants for every request. Restricted members only receive navigation metadata for explicitly assigned resources. Membership mutations serialize on the workspace, require confirmation for destructive grants, and reject any change—including global user disablement—that would remove the final Workspace Admin.

Tests live outside production `src` directories. Dedicated test TypeScript projects keep them typechecked while preventing test modules from being emitted into application and package builds.

The API and worker must never accept raw SQL from clients. Route handlers validate input and enforce permissions before database access; dynamic query helpers accept typed domain inputs, parameterize values, and quote only server-generated identifiers.

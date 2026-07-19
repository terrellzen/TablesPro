# Architecture

TablesPro is a TypeScript pnpm monorepo with separate web, API, worker, and shared package boundaries.

- `backend/apps/api`: Fastify REST API, Better Auth integration, OpenAPI, domain routes, services, repositories, and authorization calls.
- `backend/apps/worker`: PostgreSQL-backed job processing for schema changes, imports, exports, retries, and dead letters.
- `frontend/apps/web`: React/Vite application with a virtualized table grid.
- `backend/packages/contracts`: shared API envelopes, filter ASTs, field types, and pagination contracts.
- `backend/packages/database`: SQL-adjacent safety helpers, cursor signing, filter compilation, CSV safety, audit diffs, and migration tooling.
- `backend/packages/permissions`: product RBAC and Better Auth organization access-control bridge.

The API and worker must never accept raw SQL from clients. Route handlers validate input, services enforce business rules and permissions, and repositories own parameterized SQL generation.

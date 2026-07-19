# Implementation Plan

TablesPro will be built in vertical slices, but the shared safety primitives come first so later features do not invent separate authorization, SQL, audit, or job behavior.

## Current Slice

- Monorepo and strict TypeScript foundations.
- Better Auth registration, login, logout, sessions, organizations, invitations, and workspace roles.
- Shared product RBAC in `@tablespro/permissions`.
- Application metadata migration for workspaces, bases, tables, fields, grouped headers, saved views, permission overrides, audit events, and jobs.
- Centralized identifier, cursor, filter compiler, CSV export safety, audit diff, and retry helpers.

## Next Slices

1. Workspace, base, membership, and invitation REST domains with explicit permission checks.
2. Dynamic physical table creation through schema-change jobs and advisory locks.
3. Record CRUD with cursor pagination, optimistic concurrency, and audit events.
4. Saved views, filters, sorts, field layout, and query warnings.
5. Worker-backed CSV import/export.
6. React/Vite grid with TanStack Table and TanStack Virtual.
7. Integration, security, end-to-end, local deployment, and benchmark coverage.

The full 500,000-row benchmark is intentionally outside ordinary CI. CI should use a smaller representative dataset and the explicit performance profile should generate the full dataset.

# Data Model

The product hierarchy is workspace, base, table, saved grid view, field group, field, record, and cell.

Application metadata lives in the `app` PostgreSQL schema. User records live in generated physical tables in `app_data`. Physical table and field names are derived from internal UUID-like IDs, never display names.

Every physical record table must include:

- `record_id`
- `created_at`
- `created_by`
- `updated_at`
- `updated_by`
- `row_version`
- `deleted_at` when recoverable deletion is enabled

The first storage ADR is [ADR 0001](./decisions/0001-record-storage.md).

# Data Model

The product hierarchy is workspace, base, table, saved grid view, field group, field, record, and cell.

Application metadata lives in the `app` PostgreSQL schema. User records live in generated physical tables in `app_data`. Physical table and field names are derived from internal UUID-like IDs, never display names.

Field values are validated against their declared field type before SQL execution. A `single_select` field is presented as a dynamic Dropdown: its suggestions are the distinct non-empty values already stored in that physical column. Per-value color overrides live in the field's `options.choiceColors` metadata; values remain ordinary text and users may introduce a new option by typing it.

Workspace membership keeps the legacy `role` column for compatibility and stores new hierarchical assignments in `workspace_members.permissions`. The permission document contains an optional workspace level plus base-keyed and table-keyed grants. Table grants separate table control from record-only control. A null permission document is interpreted from the legacy role; newly saved assignments always use the scoped document.

Scoped grants are additive. Workspace access supplies the baseline, base access applies within that base, and table or record access may increase—but never reduce—inherited access. Resource IDs are validated as belonging to the member's workspace before saving.

Every physical record table must include:

- `record_id`
- `created_at`
- `created_by`
- `updated_at`
- `updated_by`
- `row_version`
- `deleted_at` when recoverable deletion is enabled

The first storage ADR is [ADR 0001](./decisions/0001-record-storage.md).

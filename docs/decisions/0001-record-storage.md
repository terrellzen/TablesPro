# ADR 0001: Physical PostgreSQL Tables for User Records

Status: Accepted

## Context

TablesPro must support tables with at least 500,000 records, dozens of typed fields, server-side sorting and filtering, cursor pagination, CSV import/export, and PostgreSQL-native indexes.

## Options

### Shared JSONB Record Table

This is operationally simple because every user record has the same storage shape. It is weak for this product because arbitrary typed filtering and sorting across large datasets would either scan JSONB documents or require a large and unpredictable expression-index strategy.

### Entity-Attribute-Value Cell Storage

EAV makes schema changes easy and can represent sparse data compactly. It is a poor default for spreadsheet-like reads because reconstructing rows requires many joins or aggregations, and type-specific indexes become more complex at the scale required by the grid.

### Physical Table per User-Created Table

Each application table maps to one PostgreSQL table in `app_data`. User fields map to native PostgreSQL columns generated from internal IDs. This gives the query compiler normal columns, normal indexes, and predictable plans for filtering, sorting, keyset pagination, and batch writes.

## Decision

TablesPro will use a physical PostgreSQL table per user-created application table for this version.

## Consequences

- Schema changes must run through serialized, resumable jobs.
- All physical identifiers must come from internal IDs and be quoted by a centralized utility.
- Metadata and physical schema can drift during failed jobs, so schema jobs must keep resumable state and clear failure messages.
- Partitioning is not automatic. It will be introduced only when benchmarks show a clear benefit for the expected workload.

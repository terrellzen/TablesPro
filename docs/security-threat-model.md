# Security Threat Model

## Broken Access Control

All protected API and worker operations call `@tablespro/permissions`. Workspace membership is checked before base, table, record, or audit access.

## SQL Injection

Values use query parameters. Identifiers are generated from internal IDs and quoted by `@tablespro/database`.

## Cross-Workspace Data Leakage

Every metadata lookup must include workspace scope or join through scoped parent entities. Guessing a base, table, or view ID must not bypass workspace membership.

## CSRF and Session Theft

Better Auth provides secure HTTP-only cookie sessions. State-changing API routes must use CSRF protections and SameSite cookies.

## XSS

The web app must render cell values as text by default and use a strict Content Security Policy.

## CSV and Clipboard Attacks

CSV exports sanitize formula-like values. Clipboard/import payloads must have size limits and validation summaries.

## Expensive Filters and DoS

Filters are validated ASTs compiled centrally. Large unindexed scans should return warnings and be bounded by page limits.

## Schema Race Conditions

Schema changes run as serialized, resumable jobs using PostgreSQL advisory locks.

## Audit Tampering

Audit events are append-only at the database layer. Runtime roles should not have update/delete privileges on audit rows.

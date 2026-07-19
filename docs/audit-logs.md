# Audit Logs

Audit events are append-only and stored in `app.audit_events`.

Events include workspace, actor, action, entity, timestamp, request ID, job ID, IP address, user agent, outcome, a compact diff, and sanitized metadata.

Large imports and exports must log start/completion/failure and bounded summary metadata instead of storing entire file contents or all row changes in one audit event.

The migration installs a database trigger that rejects updates and deletes from `app.audit_events`.

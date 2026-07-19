# Operations

Operational requirements:

- Structured logs with request IDs.
- Health and readiness endpoints.
- Database connectivity and migration status checks.
- Worker heartbeat and job metrics.
- Slow-query logging with sensitive values removed.
- Graceful shutdown for API and worker processes.

The preferred local and self-hosted operation model runs directly on the host or VM with Node.js and PostgreSQL. Docker is not required.

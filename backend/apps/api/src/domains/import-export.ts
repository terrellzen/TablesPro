import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { authorizeTable, requireActor } from "./authz.js";
import { writeAuditEvent } from "./audit.js";
import { mapError, readBodyObject, readOptionalString, readUuidParam, requireReturnedRow, sendCreated } from "./http.js";

export function registerImportExportRoutes(app: FastifyInstance<any, any, any, any, any>): void {
  app.post("/api/tables/:tableId/import-jobs", async (request, reply) => {
    const client = await pool.connect();
    try {
      const actor = await requireActor(request);
      const tableId = readUuidParam(request.params, "tableId");
      const { workspaceId } = await authorizeTable(actor, tableId, { resource: "record", action: "import" });
      const body = readBodyObject(request);
      const idempotencyKey = readIdempotencyKey(request.headers["idempotency-key"]);
      const originalFilename = readOptionalString(body, "originalFilename");

      await client.query("BEGIN");
      const jobResult = await client.query<{ job_id: string }>(
        `
          INSERT INTO app.background_jobs (queue, job_type, payload, idempotency_key)
          VALUES ('imports', 'csv_import', $1::jsonb, $2)
          ON CONFLICT (queue, idempotency_key) DO UPDATE SET updated_at = app.background_jobs.updated_at
          RETURNING job_id
        `,
        [JSON.stringify({ tableId, originalFilename }), idempotencyKey]
      );
      const jobId = requireReturnedRow(jobResult.rows[0], "Import job insert did not return a row").job_id;
      await client.query(
        `
          INSERT INTO app.import_jobs (job_id, table_id)
          VALUES ($1, $2)
          ON CONFLICT (job_id) DO NOTHING
        `,
        [jobId, tableId]
      );
      await client.query("COMMIT");

      await writeAuditEvent({
        workspaceId,
        actorUserId: actor.userId,
        action: "import.create",
        entityType: "import_job",
        entityId: jobId,
        requestId: request.id,
        outcome: "success",
        metadata: { tableId, originalFilename }
      });
      return sendCreated(reply, { jobId, tableId, status: "queued" });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      return mapError(request, reply, error);
    } finally {
      client.release();
    }
  });

  app.post("/api/tables/:tableId/export-jobs", async (request, reply) => {
    const client = await pool.connect();
    try {
      const actor = await requireActor(request);
      const tableId = readUuidParam(request.params, "tableId");
      const { workspaceId } = await authorizeTable(actor, tableId, { resource: "record", action: "export" });
      const body = readBodyObject(request);
      const idempotencyKey = readIdempotencyKey(request.headers["idempotency-key"]);
      const savedViewId = readOptionalString(body, "savedViewId");

      await client.query("BEGIN");
      const jobResult = await client.query<{ job_id: string }>(
        `
          INSERT INTO app.background_jobs (queue, job_type, payload, idempotency_key)
          VALUES ('exports', 'csv_export', $1::jsonb, $2)
          ON CONFLICT (queue, idempotency_key) DO UPDATE SET updated_at = app.background_jobs.updated_at
          RETURNING job_id
        `,
        [JSON.stringify({ tableId, savedViewId }), idempotencyKey]
      );
      const jobId = requireReturnedRow(jobResult.rows[0], "Export job insert did not return a row").job_id;
      await client.query(
        `
          INSERT INTO app.export_jobs (job_id, table_id)
          VALUES ($1, $2)
          ON CONFLICT (job_id) DO NOTHING
        `,
        [jobId, tableId]
      );
      await client.query("COMMIT");

      await writeAuditEvent({
        workspaceId,
        actorUserId: actor.userId,
        action: "export.create",
        entityType: "export_job",
        entityId: jobId,
        requestId: request.id,
        outcome: "success",
        metadata: { tableId, savedViewId }
      });
      return sendCreated(reply, { jobId, tableId, status: "queued" });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      return mapError(request, reply, error);
    } finally {
      client.release();
    }
  });
}

function readIdempotencyKey(value: string | string[] | undefined): string {
  const key = Array.isArray(value) ? value[0] : value;
  return key && key.trim().length > 0 ? key.trim() : crypto.randomUUID();
}

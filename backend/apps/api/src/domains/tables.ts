import type { FastifyInstance } from "fastify";
import { quoteAppDataTable, quoteIdentifier, toPhysicalFieldName, toPhysicalTableName } from "@tablespro/database";
import { pool } from "../db/pool.js";
import { authorizeBase, authorizeTable, requireActor } from "./authz.js";
import { writeAuditEvent } from "./audit.js";
import { fieldTypeToSql, parseFieldType } from "./field-types.js";
import { mapError, readBodyObject, readRequiredString, readUuidParam, requireReturnedRow, sendCreated, sendOk, HttpError } from "./http.js";

export function registerTableRoutes(app: FastifyInstance<any, any, any, any, any>): void {
  app.get("/api/bases/:baseId/tables", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const baseId = readUuidParam(request.params, "baseId");
      await authorizeBase(actor, baseId, { resource: "table", action: "read" });
      const result = await pool.query(
        `
          SELECT table_id, base_id, name, primary_display_field_id, created_at, updated_at, row_version
          FROM app.tables
          WHERE base_id = $1 AND deleted_at IS NULL
          ORDER BY created_at ASC, table_id ASC
        `,
        [baseId]
      );
      return sendOk(result.rows);
    } catch (error) {
      return mapError(request, reply, error);
    }
  });

  app.post("/api/bases/:baseId/tables", async (request, reply) => {
    const client = await pool.connect();
    try {
      const actor = await requireActor(request);
      const baseId = readUuidParam(request.params, "baseId");
      const workspaceId = await authorizeBase(actor, baseId, { resource: "table", action: "create" });
      const body = readBodyObject(request);
      const name = readRequiredString(body, "name");

      await client.query("BEGIN");
      const tableResult = await client.query<{ table_id: string; physical_table_name: string }>(
        `
          INSERT INTO app.tables (base_id, name, physical_table_name, created_by, updated_by)
          VALUES ($1, $2, 'pending', $3, $3)
          RETURNING table_id, physical_table_name
        `,
        [baseId, name, actor.userId]
      );
      const table = requireReturnedRow(tableResult.rows[0], "Table insert did not return a row");
      const physicalTableName = toPhysicalTableName(table.table_id);

      await client.query("UPDATE app.tables SET physical_table_name = $1 WHERE table_id = $2", [
        physicalTableName,
        table.table_id
      ]);
      await client.query(
        `
          CREATE TABLE ${quoteAppDataTable(table.table_id)} (
            record_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            created_at timestamptz NOT NULL DEFAULT now(),
            created_by text NOT NULL,
            updated_at timestamptz NOT NULL DEFAULT now(),
            updated_by text NOT NULL,
            row_version bigint NOT NULL DEFAULT 1,
            deleted_at timestamptz
          )
        `
      );
      await client.query(
        `CREATE INDEX ${quoteIdentifier(`${physicalTableName}_updated_idx`)} ON ${quoteAppDataTable(table.table_id)} (updated_at DESC, record_id DESC)`
      );
      await client.query("COMMIT");

      await writeAuditEvent({
        workspaceId,
        actorUserId: actor.userId,
        action: "table.create",
        entityType: "table",
        entityId: table.table_id,
        requestId: request.id,
        outcome: "success",
        metadata: { name, physicalTableName }
      });

      return sendCreated(reply, { tableId: table.table_id, baseId, name, physicalTableName });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      return mapError(request, reply, error);
    } finally {
      client.release();
    }
  });

  app.get("/api/tables/:tableId/fields", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const tableId = readUuidParam(request.params, "tableId");
      await authorizeTable(actor, tableId, { resource: "field", action: "read" });
      const result = await pool.query(
        `
          SELECT field_id, table_id, field_group_id, name, physical_column_name, field_type, position, width, pinned, hidden, indexed, options, row_version
          FROM app.fields
          WHERE table_id = $1 AND tombstoned_at IS NULL
          ORDER BY position ASC, field_id ASC
        `,
        [tableId]
      );
      return sendOk(result.rows);
    } catch (error) {
      return mapError(request, reply, error);
    }
  });

  app.post("/api/tables/:tableId/fields", async (request, reply) => {
    const client = await pool.connect();
    try {
      const actor = await requireActor(request);
      const tableId = readUuidParam(request.params, "tableId");
      const { workspaceId } = await authorizeTable(actor, tableId, { resource: "field", action: "create" });
      const body = readBodyObject(request);
      const name = readRequiredString(body, "name");
      const fieldType = parseFieldType(body.fieldType);

      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [tableId]);
      const positionResult = await client.query<{ position: number }>(
        "SELECT COALESCE(MAX(position), -1) + 1 AS position FROM app.fields WHERE table_id = $1",
        [tableId]
      );
      const fieldResult = await client.query<{ field_id: string; position: number }>(
        `
          INSERT INTO app.fields (table_id, name, physical_column_name, field_type, position, created_by, updated_by)
          VALUES ($1, $2, 'pending', $3, $4, $5, $5)
          RETURNING field_id, position
        `,
        [tableId, name, fieldType, positionResult.rows[0]?.position ?? 0, actor.userId]
      );
      const field = requireReturnedRow(fieldResult.rows[0], "Field insert did not return a row");
      const physicalColumnName = toPhysicalFieldName(field.field_id);
      await client.query("UPDATE app.fields SET physical_column_name = $1 WHERE field_id = $2", [
        physicalColumnName,
        field.field_id
      ]);
      await client.query(
        `ALTER TABLE ${quoteAppDataTable(tableId)} ADD COLUMN ${quoteIdentifier(physicalColumnName)} ${fieldTypeToSql(fieldType)}`
      );
      await client.query("COMMIT");

      await writeAuditEvent({
        workspaceId,
        actorUserId: actor.userId,
        action: "field.create",
        entityType: "field",
        entityId: field.field_id,
        requestId: request.id,
        outcome: "success",
        metadata: { tableId, name, fieldType, physicalColumnName }
      });

      return sendCreated(reply, {
        fieldId: field.field_id,
        tableId,
        name,
        fieldType,
        physicalColumnName,
        position: field.position
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      return mapError(request, reply, error);
    } finally {
      client.release();
    }
  });

  app.delete("/api/bases/:baseId/tables/:tableId", async (request, reply) => {
    const client = await pool.connect();
    try {
      const actor = await requireActor(request);
      const baseId = readUuidParam(request.params, "baseId");
      const tableId = readUuidParam(request.params, "tableId");
      const { workspaceId } = await authorizeTable(actor, tableId, { resource: "table", action: "delete" });

      const baseCheck = await pool.query("SELECT base_id FROM app.tables WHERE table_id = $1 AND base_id = $2", [tableId, baseId]);
      if (baseCheck.rows.length === 0) {
        throw new HttpError(404, "NOT_FOUND", "Table not found in this base");
      }

      await client.query("BEGIN");
      await client.query(
        "UPDATE app.tables SET deleted_at = now(), updated_at = now(), updated_by = $2, row_version = row_version + 1 WHERE table_id = $1 AND deleted_at IS NULL",
        [tableId, actor.userId]
      );
      await client.query(`DROP TABLE IF EXISTS ${quoteAppDataTable(tableId)}`);
      await client.query("COMMIT");

      await writeAuditEvent({
        workspaceId,
        actorUserId: actor.userId,
        action: "table.delete",
        entityType: "table",
        entityId: tableId,
        requestId: request.id,
        outcome: "success",
        metadata: { baseId }
      });

      return reply.status(204).send();
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      return mapError(request, reply, error);
    } finally {
      client.release();
    }
  });
}

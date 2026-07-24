import type { FastifyInstance } from "fastify";
import { quoteAppDataTable, quoteIdentifier, toPhysicalFieldName } from "@tablespro/database";
import { pool } from "../db/pool.js";
import { authorizeTable, requireActor } from "./authz.js";
import { writeAuditEvent } from "./audit.js";
import { fieldTypeToSql, parseFieldType } from "./field-types.js";
import { mapError, readBodyObject, readRequiredString, readUuidParam, requireReturnedRow, sendCreated, sendOk, HttpError } from "./http.js";

export function registerFieldRoutes(app: FastifyInstance): void {
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
  app.patch("/api/tables/:tableId/fields/:fieldId", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const tableId = readUuidParam(request.params, "tableId");
      const fieldId = readUuidParam(request.params, "fieldId");
      const { workspaceId } = await authorizeTable(actor, tableId, { resource: "field", action: "update" });
      const body = readBodyObject(request);
      const name = readRequiredString(body, "name");
      const previousName = (await pool.query<{ name: string }>("SELECT name FROM app.fields WHERE field_id = $1 AND table_id = $2 AND tombstoned_at IS NULL", [fieldId, tableId])).rows[0]?.name;
      const result = await pool.query(
        `
          UPDATE app.fields
          SET name = $1, updated_at = now(), updated_by = $2, row_version = row_version + 1
          WHERE field_id = $3 AND table_id = $4 AND tombstoned_at IS NULL
          RETURNING field_id, table_id, field_group_id, name, physical_column_name, field_type, position, width, pinned, hidden, indexed, options, row_version
        `,
        [name, actor.userId, fieldId, tableId]
      );
      if (!result.rows[0]) {
        throw new HttpError(404, "NOT_FOUND", "Field was not found");
      }
      await writeAuditEvent({
        workspaceId,
        actorUserId: actor.userId,
        action: "field.update",
        entityType: "field",
        entityId: fieldId,
        requestId: request.id,
        outcome: "success",
        metadata: { tableId, name },
        diff: { Name: { before: previousName ?? null, after: name } }
      });
      return sendOk(result.rows[0]);
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

  app.delete("/api/tables/:tableId/fields/:fieldId", async (request, reply) => {
    const client = await pool.connect();
    try {
      const actor = await requireActor(request);
      const tableId = readUuidParam(request.params, "tableId");
      const fieldId = readUuidParam(request.params, "fieldId");
      const { workspaceId } = await authorizeTable(actor, tableId, { resource: "field", action: "delete" });

      await client.query("BEGIN");
      const fieldResult = await client.query(
        "SELECT field_id, physical_column_name, name, tombstoned_at FROM app.fields WHERE field_id = $1 AND table_id = $2 FOR UPDATE",
        [fieldId, tableId]
      );
      const field = fieldResult.rows[0];
      if (!field || field.tombstoned_at) {
        await client.query("COMMIT");
        return reply.status(204).send();
      }

      await client.query(
        "UPDATE app.fields SET tombstoned_at = now(), updated_at = now(), updated_by = $1, row_version = row_version + 1 WHERE field_id = $2 AND table_id = $3",
        [actor.userId, fieldId, tableId]
      );
      await client.query(`ALTER TABLE ${quoteAppDataTable(tableId)} DROP COLUMN IF EXISTS ${quoteIdentifier(field.physical_column_name)}`);
      await client.query("COMMIT");

      await writeAuditEvent({
        workspaceId,
        actorUserId: actor.userId,
        action: "field.delete",
        entityType: "field",
        entityId: fieldId,
        requestId: request.id,
        outcome: "success",
        metadata: { tableId, name: field.name, physicalColumnName: field.physical_column_name }
      });

      return reply.status(204).send();
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      return mapError(request, reply, error);
    } finally {
      client.release();
    }
  });

  app.post("/api/tables/:tableId/fields/reorder", async (request, reply) => {
    const client = await pool.connect();
    try {
      const actor = await requireActor(request);
      const tableId = readUuidParam(request.params, "tableId");
      const { workspaceId } = await authorizeTable(actor, tableId, { resource: "field", action: "update" });
      const body = readBodyObject(request);
      const fieldOrder = body.fieldOrder;
      if (!Array.isArray(fieldOrder) || fieldOrder.length === 0 || !fieldOrder.every((id: unknown) => typeof id === "string")) {
        throw new HttpError(400, "VALIDATION_ERROR", "fieldOrder must be a non-empty array of strings");
      }

      await client.query("BEGIN");
      for (let i = 0; i < fieldOrder.length; i++) {
        await client.query(
          "UPDATE app.fields SET position = $1, updated_at = now(), updated_by = $2, row_version = row_version + 1 WHERE field_id = $3 AND table_id = $4 AND tombstoned_at IS NULL",
          [i, actor.userId, fieldOrder[i], tableId]
        );
      }
      await client.query("COMMIT");

      await writeAuditEvent({
        workspaceId,
        actorUserId: actor.userId,
        action: "field.reorder",
        entityType: "field",
        entityId: tableId,
        requestId: request.id,
        outcome: "success",
        metadata: { tableId, fieldOrder }
      });

      return sendOk({ fieldOrder });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      return mapError(request, reply, error);
    } finally {
      client.release();
    }
  });
}

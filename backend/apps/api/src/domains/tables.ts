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

  app.patch("/api/tables/:tableId", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const tableId = readUuidParam(request.params, "tableId");
      const { workspaceId } = await authorizeTable(actor, tableId, { resource: "table", action: "update" });
      const body = readBodyObject(request);
      const name = readRequiredString(body, "name");
      const result = await pool.query(
        `
          UPDATE app.tables
          SET name = $1, updated_at = now(), updated_by = $2, row_version = row_version + 1
          WHERE table_id = $3 AND deleted_at IS NULL
          RETURNING table_id, base_id, name, primary_display_field_id, created_at, updated_at, row_version
        `,
        [name, actor.userId, tableId]
      );
      if (!result.rows[0]) {
        throw new HttpError(404, "NOT_FOUND", "Table was not found");
      }
      await writeAuditEvent({
        workspaceId,
        actorUserId: actor.userId,
        action: "table.update",
        entityType: "table",
        entityId: tableId,
        requestId: request.id,
        outcome: "success",
        metadata: { name }
      });
      return sendOk(result.rows[0]);
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
        metadata: { tableId, name }
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

  app.post("/api/tables/:tableId/duplicate", async (request, reply) => {
    const client = await pool.connect();
    try {
      const actor = await requireActor(request);
      const sourceTableId = readUuidParam(request.params, "tableId");
      const { workspaceId } = await authorizeTable(actor, sourceTableId, { resource: "table", action: "create" });

      const srcTableResult = await pool.query(
        "SELECT base_id, name FROM app.tables WHERE table_id = $1 AND deleted_at IS NULL",
        [sourceTableId]
      );
      if (srcTableResult.rows.length === 0) throw new HttpError(404, "NOT_FOUND", "Source table not found");
      const srcTable = srcTableResult.rows[0];

      const fieldsResult = await pool.query(
        "SELECT field_id, name, field_type, position, width, pinned, hidden, indexed, options FROM app.fields WHERE table_id = $1 AND tombstoned_at IS NULL ORDER BY position",
        [sourceTableId]
      );

      await client.query("BEGIN");
      const newTableResult = await client.query<{ table_id: string }>(
        `
          INSERT INTO app.tables (base_id, name, physical_table_name, created_by, updated_by)
          VALUES ($1, $2, 'pending', $3, $3)
          RETURNING table_id
        `,
        [srcTable.base_id, `${srcTable.name} (copy)`, actor.userId]
      );
      const newTable = requireReturnedRow(newTableResult.rows[0], "Table insert did not return a row");
      const physicalTableName = toPhysicalTableName(newTable.table_id);
      await client.query("UPDATE app.tables SET physical_table_name = $1 WHERE table_id = $2", [physicalTableName, newTable.table_id]);

      const columnDefs: string[] = [];
      const fieldIdMap = new Map<string, string>();
      for (const field of fieldsResult.rows) {
        const newFieldResult = await client.query<{ field_id: string }>(
          `
            INSERT INTO app.fields (table_id, name, physical_column_name, field_type, position, width, pinned, hidden, indexed, options, created_by, updated_by)
            VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $10)
            RETURNING field_id
          `,
          [newTable.table_id, field.name, field.field_type, field.position, field.width, field.pinned, field.hidden, field.indexed, JSON.stringify(field.options ?? {}), actor.userId]
        );
        const newFieldId = newFieldResult.rows[0]!.field_id;
        fieldIdMap.set(field.field_id, newFieldId);
        const physicalColumnName = toPhysicalFieldName(newFieldId);
        await client.query("UPDATE app.fields SET physical_column_name = $1 WHERE field_id = $2", [physicalColumnName, newFieldId]);
        columnDefs.push(`${quoteIdentifier(physicalColumnName)} ${fieldTypeToSql(field.field_type)}`);
      }

      await client.query(
        `CREATE TABLE ${quoteAppDataTable(newTable.table_id)} (
          record_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          created_at timestamptz NOT NULL DEFAULT now(),
          created_by text NOT NULL,
          updated_at timestamptz NOT NULL DEFAULT now(),
          updated_by text NOT NULL,
          row_version bigint NOT NULL DEFAULT 1,
          deleted_at timestamptz${columnDefs.length > 0 ? "," : ""}
          ${columnDefs.join(",\n          ")}
        )`
      );

      if (fieldsResult.rows.length > 0) {
        const srcPhysicalCols = ["record_id", "created_at", "created_by", "updated_at", "updated_by", "row_version", "deleted_at"];
        const dstPhysicalCols = ["record_id", "created_at", "created_by", "updated_at", "updated_by", "row_version", "deleted_at"];
        for (const field of fieldsResult.rows) {
          const srcCol = toPhysicalFieldName(field.field_id);
          const newFieldId = fieldIdMap.get(field.field_id)!;
          const dstCol = toPhysicalFieldName(newFieldId);
          srcPhysicalCols.push(quoteIdentifier(srcCol));
          dstPhysicalCols.push(quoteIdentifier(dstCol));
        }
        await client.query(
          `INSERT INTO ${quoteAppDataTable(newTable.table_id)} (${dstPhysicalCols.join(", ")})
           SELECT ${srcPhysicalCols.join(", ")} FROM ${quoteAppDataTable(sourceTableId)} WHERE deleted_at IS NULL`
        );
      }

      await client.query("COMMIT");

      await writeAuditEvent({
        workspaceId,
        actorUserId: actor.userId,
        action: "table.create",
        entityType: "table",
        entityId: newTable.table_id,
        requestId: request.id,
        outcome: "success",
        metadata: { name: `${srcTable.name} (copy)`, baseId: srcTable.base_id, duplicatedFrom: sourceTableId }
      });

      return sendCreated(reply, { tableId: newTable.table_id, baseId: srcTable.base_id, name: `${srcTable.name} (copy)` });
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

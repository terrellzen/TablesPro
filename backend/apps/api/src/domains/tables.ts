import type { FastifyInstance } from "fastify";
import type { FieldType } from "@tablespro/contracts";
import { quoteAppDataTable, quoteIdentifier, toPhysicalFieldName, toPhysicalTableName } from "@tablespro/database";
import { pool } from "../db/pool.js";
import { authorizeBase, authorizeTable, requireActor } from "./authz.js";
import { writeAuditEvent } from "./audit.js";
import { fieldTypeToSql } from "./field-types.js";
import { mapError, readBodyObject, readRequiredString, readUuidParam, requireReturnedRow, sendCreated, sendOk, HttpError } from "./http.js";

export function registerTableRoutes(app: FastifyInstance): void {
  app.get("/api/bases/:baseId/tables", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const baseId = readUuidParam(request.params, "baseId");
      await authorizeBase(actor, baseId, { resource: "table", action: "read" });
      const result = await pool.query(
        `
          SELECT t.table_id, t.base_id, t.name, t.primary_display_field_id, t.created_at, t.updated_at, t.row_version
          FROM app.tables t
          JOIN app.bases b ON b.base_id = t.base_id
          JOIN app.workspace_members wm ON wm.workspace_id = b.workspace_id AND wm.user_id = $2
          WHERE t.base_id = $1 AND t.deleted_at IS NULL
            AND (
              wm.permissions IS NULL
              OR wm.permissions->>'workspace' IS NOT NULL
              OR wm.permissions->'bases' ? t.base_id::text
              OR wm.permissions->'tables' ? t.table_id::text
            )
          ORDER BY t.created_at ASC, t.table_id ASC
        `,
        [baseId, actor.userId]
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

  app.patch("/api/tables/:tableId", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const tableId = readUuidParam(request.params, "tableId");
      const { workspaceId } = await authorizeTable(actor, tableId, { resource: "table", action: "update" });
      const body = readBodyObject(request);
      const name = readRequiredString(body, "name");
      const previousName = (await pool.query<{ name: string }>("SELECT name FROM app.tables WHERE table_id = $1 AND deleted_at IS NULL", [tableId])).rows[0]?.name;
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
        metadata: { name },
        diff: { Name: { before: previousName ?? null, after: name } }
      });
      return sendOk(result.rows[0]);
    } catch (error) {
      return mapError(request, reply, error);
    }
  });

  app.post("/api/tables/:tableId/duplicate", async (request, reply) => {
    const client = await pool.connect();
    try {
      const actor = await requireActor(request);
      const sourceTableId = readUuidParam(request.params, "tableId");
      const { workspaceId } = await authorizeTable(actor, sourceTableId, { resource: "table", action: "create" });

      const srcTableResult = await pool.query<{ base_id: string; name: string }>(
        "SELECT base_id, name FROM app.tables WHERE table_id = $1 AND deleted_at IS NULL",
        [sourceTableId]
      );
      const srcTable = srcTableResult.rows[0];
      if (!srcTable) throw new HttpError(404, "NOT_FOUND", "Source table not found");

      const fieldsResult = await pool.query<{
        field_id: string;
        name: string;
        field_type: FieldType;
        position: number;
        width: number;
        pinned: boolean;
        hidden: boolean;
        indexed: boolean;
        options: unknown;
      }>(
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
        const newFieldId = requireReturnedRow(
          newFieldResult.rows[0],
          "Duplicated field insert did not return a row"
        ).field_id;
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
          const newFieldId = requireReturnedRow(
            fieldIdMap.get(field.field_id),
            "Duplicated field mapping was not found"
          );
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

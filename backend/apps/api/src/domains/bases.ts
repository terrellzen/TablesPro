import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { authorizeBase, authorizeWorkspace, requireActor } from "./authz.js";
import { writeAuditEvent } from "./audit.js";
import { mapError, readBodyObject, readRequiredString, readUuidParam, requireReturnedRow, sendCreated, sendOk, HttpError } from "./http.js";
import { quoteAppDataTable, quoteIdentifier, toPhysicalFieldName, toPhysicalTableName } from "@tablespro/database";
import { fieldTypeToSql } from "./field-types.js";

export function registerBaseRoutes(app: FastifyInstance): void {
  app.get("/api/workspaces/:workspaceId/bases", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const workspaceId = readUuidParam(request.params, "workspaceId");
      await authorizeWorkspace(actor, workspaceId, { resource: "workspace", action: "read" });
      const result = await pool.query(
        `
          SELECT b.base_id, b.workspace_id, b.name, b.created_at, b.updated_at, b.row_version
          FROM app.bases b
          JOIN app.workspace_members wm ON wm.workspace_id = b.workspace_id AND wm.user_id = $2
          WHERE b.workspace_id = $1 AND b.deleted_at IS NULL
            AND (
              wm.permissions IS NULL
              OR wm.permissions->>'workspace' IS NOT NULL
              OR wm.permissions->'bases' ? b.base_id::text
              OR EXISTS (
                SELECT 1 FROM app.tables scoped_table
                WHERE scoped_table.base_id = b.base_id
                  AND wm.permissions->'tables' ? scoped_table.table_id::text
              )
            )
          ORDER BY b.updated_at DESC, b.base_id DESC
        `,
        [workspaceId, actor.userId]
      );
      return sendOk(result.rows);
    } catch (error) {
      return mapError(request, reply, error);
    }
  });

  app.post("/api/workspaces/:workspaceId/bases", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const workspaceId = readUuidParam(request.params, "workspaceId");
      await authorizeWorkspace(actor, workspaceId, { resource: "base", action: "create" });
      const body = readBodyObject(request);
      const name = readRequiredString(body, "name");
      const result = await pool.query(
        `
          INSERT INTO app.bases (workspace_id, name, created_by, updated_by)
          VALUES ($1, $2, $3, $3)
          RETURNING base_id, workspace_id, name, created_at, updated_at, row_version
        `,
        [workspaceId, name, actor.userId]
      );
      const base = result.rows[0];
      await writeAuditEvent({
        workspaceId,
        actorUserId: actor.userId,
        action: "base.create",
        entityType: "base",
        entityId: base.base_id,
        requestId: request.id,
        outcome: "success",
        metadata: { name }
      });
      return sendCreated(reply, base);
    } catch (error) {
      return mapError(request, reply, error);
    }
  });

  app.post("/api/bases/:baseId/duplicate", async (request, reply) => {
    const client = await pool.connect();
    try {
      const actor = await requireActor(request);
      const sourceBaseId = readUuidParam(request.params, "baseId");
      const workspaceId = await authorizeBase(actor, sourceBaseId, { resource: "base", action: "create" });

      const srcBaseResult = await pool.query("SELECT workspace_id, name FROM app.bases WHERE base_id = $1 AND deleted_at IS NULL", [sourceBaseId]);
      if (srcBaseResult.rows.length === 0) throw new HttpError(404, "NOT_FOUND", "Source base not found");
      const srcBase = srcBaseResult.rows[0];

      const tablesResult = await pool.query(
        "SELECT table_id, name FROM app.tables WHERE base_id = $1 AND deleted_at IS NULL ORDER BY created_at",
        [sourceBaseId]
      );

      await client.query("BEGIN");
      const newBaseResult = await client.query<{ base_id: string }>(
        "INSERT INTO app.bases (workspace_id, name, created_by, updated_by) VALUES ($1, $2, $3, $3) RETURNING base_id",
        [srcBase.workspace_id, `${srcBase.name} (copy)`, actor.userId]
      );
      const newBaseId = requireReturnedRow(newBaseResult.rows[0], "Base insert did not return a row").base_id;

      for (const srcTable of tablesResult.rows) {
        const fieldsResult = await client.query(
          "SELECT field_id, name, field_type, position, width, pinned, hidden, indexed, options FROM app.fields WHERE table_id = $1 AND tombstoned_at IS NULL ORDER BY position",
          [srcTable.table_id]
        );

        const newTableResult = await client.query<{ table_id: string }>(
          "INSERT INTO app.tables (base_id, name, physical_table_name, created_by, updated_by) VALUES ($1, $2, 'pending', $3, $3) RETURNING table_id",
          [newBaseId, `${srcTable.name} (copy)`, actor.userId]
        );
        const newTableId = requireReturnedRow(newTableResult.rows[0], "Table insert did not return a row").table_id;
        const physicalTableName = toPhysicalTableName(newTableId);
        await client.query("UPDATE app.tables SET physical_table_name = $1 WHERE table_id = $2", [physicalTableName, newTableId]);

        const columnDefs: string[] = [];
        const fieldIdPairs: { srcFieldId: string; newFieldId: string }[] = [];
        for (const field of fieldsResult.rows) {
          const newFieldResult = await client.query<{ field_id: string }>(
            `INSERT INTO app.fields (table_id, name, physical_column_name, field_type, position, width, pinned, hidden, indexed, options, created_by, updated_by)
             VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $10) RETURNING field_id`,
            [newTableId, field.name, field.field_type, field.position, field.width, field.pinned, field.hidden, field.indexed, JSON.stringify(field.options ?? {}), actor.userId]
          );
          const newFieldId = requireReturnedRow(newFieldResult.rows[0], "Field insert did not return a row").field_id;
          fieldIdPairs.push({ srcFieldId: field.field_id, newFieldId });
          const physicalColumnName = toPhysicalFieldName(newFieldId);
          await client.query("UPDATE app.fields SET physical_column_name = $1 WHERE field_id = $2", [physicalColumnName, newFieldId]);
          columnDefs.push(`${quoteIdentifier(physicalColumnName)} ${fieldTypeToSql(field.field_type)}`);
        }

        await client.query(
          `CREATE TABLE ${quoteAppDataTable(newTableId)} (
            record_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            created_at timestamptz NOT NULL DEFAULT now(),
            created_by text NOT NULL,
            updated_at timestamptz NOT NULL DEFAULT now(),
            updated_by text NOT NULL,
            row_version bigint NOT NULL DEFAULT 1,
            deleted_at timestamptz${columnDefs.length > 0 ? "," : ""}
            ${columnDefs.join(",\n            ")}
          )`
        );

        if (fieldIdPairs.length > 0) {
          const srcCols = ["record_id", "created_at", "created_by", "updated_at", "updated_by", "row_version", "deleted_at"];
          const dstCols = ["record_id", "created_at", "created_by", "updated_at", "updated_by", "row_version", "deleted_at"];
          for (const pair of fieldIdPairs) {
            srcCols.push(quoteIdentifier(toPhysicalFieldName(pair.srcFieldId)));
            dstCols.push(quoteIdentifier(toPhysicalFieldName(pair.newFieldId)));
          }
          await client.query(
            `INSERT INTO ${quoteAppDataTable(newTableId)} (${dstCols.join(", ")})
             SELECT ${srcCols.join(", ")} FROM ${quoteAppDataTable(srcTable.table_id)} WHERE deleted_at IS NULL`
          );
        }
      }

      await client.query("COMMIT");

      await writeAuditEvent({
        workspaceId,
        actorUserId: actor.userId,
        action: "base.create",
        entityType: "base",
        entityId: newBaseId,
        requestId: request.id,
        outcome: "success",
        metadata: { name: `${srcBase.name} (copy)`, duplicatedFrom: sourceBaseId }
      });

      return sendCreated(reply, { base_id: newBaseId, workspace_id: srcBase.workspace_id, name: `${srcBase.name} (copy)` });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      return mapError(request, reply, error);
    } finally {
      client.release();
    }
  });

  app.get("/api/bases/:baseId", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const baseId = readUuidParam(request.params, "baseId");
      await authorizeBase(actor, baseId, { resource: "base", action: "read" });
      const result = await pool.query(
        `
          SELECT base_id, workspace_id, name, created_at, updated_at, row_version
          FROM app.bases
          WHERE base_id = $1 AND deleted_at IS NULL
        `,
        [baseId]
      );
      return sendOk(result.rows[0]);
    } catch (error) {
      return mapError(request, reply, error);
    }
  });

  app.patch("/api/bases/:baseId", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const baseId = readUuidParam(request.params, "baseId");
      const workspaceId = await authorizeBase(actor, baseId, { resource: "base", action: "update" });
      const body = readBodyObject(request);
      const name = readRequiredString(body, "name");
      const previousName = (await pool.query<{ name: string }>("SELECT name FROM app.bases WHERE base_id = $1 AND deleted_at IS NULL", [baseId])).rows[0]?.name;
      const result = await pool.query(
        `
          UPDATE app.bases
          SET name = $1, updated_at = now(), updated_by = $2, row_version = row_version + 1
          WHERE base_id = $3 AND deleted_at IS NULL
          RETURNING base_id, workspace_id, name, created_at, updated_at, row_version
        `,
        [name, actor.userId, baseId]
      );
      if (!result.rows[0]) {
        throw new HttpError(404, "NOT_FOUND", "Base was not found");
      }
      await writeAuditEvent({
        workspaceId,
        actorUserId: actor.userId,
        action: "base.update",
        entityType: "base",
        entityId: baseId,
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

  app.delete("/api/workspaces/:workspaceId/bases/:baseId", async (request, reply) => {
    const client = await pool.connect();
    try {
      const actor = await requireActor(request);
      const workspaceId = readUuidParam(request.params, "workspaceId");
      const baseId = readUuidParam(request.params, "baseId");
      await authorizeBase(actor, baseId, { resource: "base", action: "delete" });

      const wsCheck = await pool.query("SELECT base_id FROM app.bases WHERE base_id = $1 AND workspace_id = $2", [baseId, workspaceId]);
      if (wsCheck.rows.length === 0) {
        throw new HttpError(404, "NOT_FOUND", "Base not found in this workspace");
      }

      await client.query("BEGIN");
      await client.query(
        "UPDATE app.tables SET deleted_at = now(), updated_at = now(), updated_by = $2, row_version = row_version + 1 WHERE base_id = $1 AND deleted_at IS NULL",
        [baseId, actor.userId]
      );
      await client.query(
        "UPDATE app.bases SET deleted_at = now(), updated_at = now(), updated_by = $2, row_version = row_version + 1 WHERE base_id = $1 AND deleted_at IS NULL",
        [baseId, actor.userId]
      );
      await client.query("COMMIT");

      await writeAuditEvent({
        workspaceId,
        actorUserId: actor.userId,
        action: "base.delete",
        entityType: "base",
        entityId: baseId,
        requestId: request.id,
        outcome: "success",
        metadata: {}
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

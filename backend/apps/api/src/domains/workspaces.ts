import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { requireActor, authorizeWorkspace } from "./authz.js";
import { mapError, readBodyObject, readRequiredString, readUuidParam, requireReturnedRow, sendCreated, sendOk, HttpError } from "./http.js";
import { writeAuditEvent } from "./audit.js";
import { requireCanCreateWorkspaces } from "./users.js";
import { quoteAppDataTable, quoteIdentifier, toPhysicalFieldName, toPhysicalTableName } from "@tablespro/database";
import { fieldTypeToSql } from "./field-types.js";

export function registerWorkspaceRoutes(app: FastifyInstance): void {
  app.get("/api/workspaces", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const result = await pool.query(
        `
          SELECT w.workspace_id, w.name,
                 CASE WHEN wm.permissions IS NOT NULL AND wm.permissions->>'workspace' IS NULL
                   THEN 'restricted' ELSE wm.role::text END AS role,
                 w.created_at, w.updated_at, w.row_version
          FROM app.workspaces w
          JOIN app.workspace_members wm ON wm.workspace_id = w.workspace_id
          WHERE wm.user_id = $1 AND w.deleted_at IS NULL
          ORDER BY w.updated_at DESC, w.workspace_id DESC
        `,
        [actor.userId]
      );
      return sendOk(result.rows);
    } catch (error) {
      return mapError(request, reply, error);
    }
  });

  app.post("/api/workspaces", async (request, reply) => {
    const client = await pool.connect();
    try {
      const actor = await requireActor(request);
      await requireCanCreateWorkspaces(actor.userId);
      const body = readBodyObject(request);
      const name = readRequiredString(body, "name");

      await client.query("BEGIN");
      const workspace = await client.query<{ workspace_id: string }>(
        `
          INSERT INTO app.workspaces (name, created_by, updated_by)
          VALUES ($1, $2, $2)
          RETURNING workspace_id, name, created_at, updated_at, row_version
        `,
        [name, actor.userId]
      );
      const row = requireReturnedRow(workspace.rows[0], "Workspace insert did not return a row");
      await client.query(
        `
          INSERT INTO app.workspace_members (workspace_id, user_id, role, created_by, updated_by)
          VALUES ($1, $2, 'admin', $2, $2)
        `,
        [row.workspace_id, actor.userId]
      );
      await client.query("COMMIT");

      await writeAuditEvent({
        workspaceId: row.workspace_id,
        actorUserId: actor.userId,
        action: "workspace.create",
        entityType: "workspace",
        entityId: row.workspace_id,
        requestId: request.id,
        outcome: "success",
        metadata: { name }
      });

      return sendCreated(reply, row);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      return mapError(request, reply, error);
    } finally {
      client.release();
    }
  });

  app.post("/api/workspaces/:workspaceId/duplicate", async (request, reply) => {
    const client = await pool.connect();
    try {
      const actor = await requireActor(request);
      const sourceWorkspaceId = readUuidParam(request.params, "workspaceId");
      await authorizeWorkspace(actor, sourceWorkspaceId, { resource: "workspace", action: "read" });

      const srcWsResult = await pool.query("SELECT name FROM app.workspaces WHERE workspace_id = $1 AND deleted_at IS NULL", [sourceWorkspaceId]);
      if (srcWsResult.rows.length === 0) throw new HttpError(404, "NOT_FOUND", "Source workspace not found");
      const srcWs = srcWsResult.rows[0];

      const basesResult = await pool.query(
        "SELECT base_id, name FROM app.bases WHERE workspace_id = $1 AND deleted_at IS NULL ORDER BY created_at",
        [sourceWorkspaceId]
      );

      await client.query("BEGIN");
      const newWsResult = await client.query<{ workspace_id: string }>(
        "INSERT INTO app.workspaces (name, created_by, updated_by) VALUES ($1, $2, $2) RETURNING workspace_id",
        [`${srcWs.name} (copy)`, actor.userId]
      );
      const newWorkspaceId = newWsResult.rows[0]!.workspace_id;
      await client.query(
        "INSERT INTO app.workspace_members (workspace_id, user_id, role, created_by, updated_by) VALUES ($1, $2, 'admin', $2, $2)",
        [newWorkspaceId, actor.userId]
      );

      for (const srcBase of basesResult.rows) {
        const tablesResult = await client.query(
          "SELECT table_id, name FROM app.tables WHERE base_id = $1 AND deleted_at IS NULL ORDER BY created_at",
          [srcBase.base_id]
        );

        const newBaseResult = await client.query<{ base_id: string }>(
          "INSERT INTO app.bases (workspace_id, name, created_by, updated_by) VALUES ($1, $2, $3, $3) RETURNING base_id",
          [newWorkspaceId, srcBase.name, actor.userId]
        );
        const newBaseId = newBaseResult.rows[0]!.base_id;

        for (const srcTable of tablesResult.rows) {
          const fieldsResult = await client.query(
            "SELECT field_id, name, field_type, position, width, pinned, hidden, indexed, options FROM app.fields WHERE table_id = $1 AND tombstoned_at IS NULL ORDER BY position",
            [srcTable.table_id]
          );

          const newTableResult = await client.query<{ table_id: string }>(
            "INSERT INTO app.tables (base_id, name, physical_table_name, created_by, updated_by) VALUES ($1, $2, 'pending', $3, $3) RETURNING table_id",
            [newBaseId, srcTable.name, actor.userId]
          );
          const newTableId = newTableResult.rows[0]!.table_id;
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
            const newFieldId = newFieldResult.rows[0]!.field_id;
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
              ${columnDefs.join(",\n              ")}
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
      }

      await client.query("COMMIT");

      await writeAuditEvent({
        workspaceId: newWorkspaceId,
        actorUserId: actor.userId,
        action: "workspace.create",
        entityType: "workspace",
        entityId: newWorkspaceId,
        requestId: request.id,
        outcome: "success",
        metadata: { name: `${srcWs.name} (copy)`, duplicatedFrom: sourceWorkspaceId }
      });

      return sendCreated(reply, { workspace_id: newWorkspaceId, name: `${srcWs.name} (copy)` });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      return mapError(request, reply, error);
    } finally {
      client.release();
    }
  });

  app.get("/api/workspaces/:workspaceId", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const workspaceId = readUuidParam(request.params, "workspaceId");
      await authorizeWorkspace(actor, workspaceId, { resource: "workspace", action: "read" });
      const result = await pool.query(
        `
          SELECT workspace_id, name, created_at, updated_at, row_version
          FROM app.workspaces
          WHERE workspace_id = $1 AND deleted_at IS NULL
        `,
        [workspaceId]
      );
      return sendOk(result.rows[0]);
    } catch (error) {
      return mapError(request, reply, error);
    }
  });

  app.patch("/api/workspaces/:workspaceId", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const workspaceId = readUuidParam(request.params, "workspaceId");
      await authorizeWorkspace(actor, workspaceId, { resource: "workspace", action: "update" });
      const body = readBodyObject(request);
      const name = readRequiredString(body, "name");
      const result = await pool.query(
        `
          UPDATE app.workspaces
          SET name = $1, updated_at = now(), updated_by = $2, row_version = row_version + 1
          WHERE workspace_id = $3 AND deleted_at IS NULL
          RETURNING workspace_id, name, created_at, updated_at, row_version
        `,
        [name, actor.userId, workspaceId]
      );
      if (!result.rows[0]) {
        throw new HttpError(404, "NOT_FOUND", "Workspace was not found");
      }
      await writeAuditEvent({
        workspaceId,
        actorUserId: actor.userId,
        action: "workspace.update",
        entityType: "workspace",
        entityId: workspaceId,
        requestId: request.id,
        outcome: "success",
        metadata: { name }
      });
      return sendOk(result.rows[0]);
    } catch (error) {
      return mapError(request, reply, error);
    }
  });

  app.delete("/api/workspaces/:workspaceId", async (request, reply) => {
    const client = await pool.connect();
    try {
      const actor = await requireActor(request);
      const workspaceId = readUuidParam(request.params, "workspaceId");
      await authorizeWorkspace(actor, workspaceId, { resource: "workspace", action: "delete" });

      await client.query("BEGIN");
      await client.query(
        "UPDATE app.tables SET deleted_at = now(), updated_at = now(), updated_by = $2, row_version = row_version + 1 WHERE base_id IN (SELECT base_id FROM app.bases WHERE workspace_id = $1) AND deleted_at IS NULL",
        [workspaceId, actor.userId]
      );
      await client.query(
        "UPDATE app.bases SET deleted_at = now(), updated_at = now(), updated_by = $2, row_version = row_version + 1 WHERE workspace_id = $1 AND deleted_at IS NULL",
        [workspaceId, actor.userId]
      );
      await client.query(
        "UPDATE app.workspaces SET deleted_at = now(), updated_at = now(), updated_by = $2, row_version = row_version + 1 WHERE workspace_id = $1 AND deleted_at IS NULL",
        [workspaceId, actor.userId]
      );
      await client.query("COMMIT");

      await writeAuditEvent({
        workspaceId,
        actorUserId: actor.userId,
        action: "workspace.delete",
        entityType: "workspace",
        entityId: workspaceId,
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

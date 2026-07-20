import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { authorizeBase, authorizeWorkspace, requireActor } from "./authz.js";
import { writeAuditEvent } from "./audit.js";
import { mapError, readBodyObject, readRequiredString, readUuidParam, sendCreated, sendOk, HttpError } from "./http.js";
import { quoteAppDataTable } from "@tablespro/database";

export function registerBaseRoutes(app: FastifyInstance<any, any, any, any, any>): void {
  app.get("/api/workspaces/:workspaceId/bases", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const workspaceId = readUuidParam(request.params, "workspaceId");
      await authorizeWorkspace(actor, workspaceId, { resource: "base", action: "read" });
      const result = await pool.query(
        `
          SELECT base_id, workspace_id, name, created_at, updated_at, row_version
          FROM app.bases
          WHERE workspace_id = $1 AND deleted_at IS NULL
          ORDER BY updated_at DESC, base_id DESC
        `,
        [workspaceId]
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
        metadata: { name }
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

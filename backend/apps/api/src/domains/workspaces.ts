import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { requireActor, authorizeWorkspace } from "./authz.js";
import { mapError, readBodyObject, readRequiredString, readUuidParam, requireReturnedRow, sendCreated, sendOk } from "./http.js";
import { writeAuditEvent } from "./audit.js";
import { requireCanCreateWorkspaces } from "./users.js";

export function registerWorkspaceRoutes(app: FastifyInstance<any, any, any, any, any>): void {
  app.get("/api/workspaces", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const result = await pool.query(
        `
          SELECT w.workspace_id, w.name, wm.role, w.created_at, w.updated_at, w.row_version
          FROM app.workspaces w
          JOIN app.workspace_members wm ON wm.workspace_id = w.workspace_id
          WHERE wm.user_id = $1
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

  app.get("/api/workspaces/:workspaceId", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const workspaceId = readUuidParam(request.params, "workspaceId");
      await authorizeWorkspace(actor, workspaceId, { resource: "workspace", action: "read" });
      const result = await pool.query(
        `
          SELECT workspace_id, name, created_at, updated_at, row_version
          FROM app.workspaces
          WHERE workspace_id = $1
        `,
        [workspaceId]
      );
      return sendOk(result.rows[0]);
    } catch (error) {
      return mapError(request, reply, error);
    }
  });
}

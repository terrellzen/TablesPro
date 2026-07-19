import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { authorizeWorkspace, requireActor } from "./authz.js";
import { writeAuditEvent } from "./audit.js";
import {
  HttpError,
  mapError,
  readBodyObject,
  readRequiredString,
  readUuidParam,
  requireReturnedRow,
  sendCreated,
  sendOk
} from "./http.js";
import { workspaceRoles, type WorkspaceRole } from "@tablespro/permissions";

export function registerMembershipRoutes(app: FastifyInstance<any, any, any, any, any>): void {
  app.get("/api/workspaces/:workspaceId/members", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const workspaceId = readUuidParam(request.params, "workspaceId");
      await authorizeWorkspace(actor, workspaceId, { resource: "member", action: "read" });
      const result = await pool.query(
        `
          SELECT wm.workspace_id, wm.user_id, up.handle::text, up.display_name, wm.role, wm.created_at, wm.updated_at
          FROM app.workspace_members wm
          LEFT JOIN app.user_profiles up ON up.user_id = wm.user_id
          WHERE wm.workspace_id = $1
          ORDER BY wm.created_at ASC, wm.user_id ASC
        `,
        [workspaceId]
      );
      return sendOk(result.rows);
    } catch (error) {
      return mapError(request, reply, error);
    }
  });

  app.post("/api/workspaces/:workspaceId/members", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const workspaceId = readUuidParam(request.params, "workspaceId");
      await authorizeWorkspace(actor, workspaceId, { resource: "member", action: "create" });
      const body = readBodyObject(request);
      const userId = await resolveUserId(readRequiredString(body, "userId"));
      const role = readWorkspaceRole(body.role);

      const result = await pool.query(
        `
          INSERT INTO app.workspace_members (workspace_id, user_id, role, created_by, updated_by)
          VALUES ($1, $2, $3, $4, $4)
          ON CONFLICT (workspace_id, user_id) DO UPDATE
          SET role = EXCLUDED.role, updated_at = now(), updated_by = $4
          RETURNING workspace_id, user_id, role, created_at, updated_at
        `,
        [workspaceId, userId, role, actor.userId]
      );
      const member = requireReturnedRow(result.rows[0], "Member insert did not return a row");

      await writeAuditEvent({
        workspaceId,
        actorUserId: actor.userId,
        action: "member.create",
        entityType: "workspace_member",
        entityId: userId,
        requestId: request.id,
        outcome: "success",
        metadata: { role }
      });

      return sendCreated(reply, member);
    } catch (error) {
      return mapError(request, reply, error);
    }
  });

  app.patch("/api/workspaces/:workspaceId/members/:userId", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const workspaceId = readUuidParam(request.params, "workspaceId");
      const targetUserId = readRequiredString(request.params as Record<string, unknown>, "userId");
      const subject = await authorizeWorkspace(actor, workspaceId, { resource: "member", action: "update" });
      const body = readBodyObject(request);
      const role = readWorkspaceRole(body.role);

      if (targetUserId === actor.userId && role !== subject.workspaceRole) {
        throw new HttpError(403, "FORBIDDEN", "Members cannot change their own role");
      }

      const result = await pool.query(
        `
          UPDATE app.workspace_members
          SET role = $3, updated_at = now(), updated_by = $4
          WHERE workspace_id = $1 AND user_id = $2
          RETURNING workspace_id, user_id, role, created_at, updated_at
        `,
        [workspaceId, targetUserId, role, actor.userId]
      );
      const member = requireReturnedRow(result.rows[0], "Member update did not return a row");

      await writeAuditEvent({
        workspaceId,
        actorUserId: actor.userId,
        action: "member.update",
        entityType: "workspace_member",
        entityId: targetUserId,
        requestId: request.id,
        outcome: "success",
        metadata: { role }
      });
      return sendOk(member);
    } catch (error) {
      return mapError(request, reply, error);
    }
  });

  app.delete("/api/workspaces/:workspaceId/members/:userId", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const workspaceId = readUuidParam(request.params, "workspaceId");
      const targetUserId = readRequiredString(request.params as Record<string, unknown>, "userId");
      await authorizeWorkspace(actor, workspaceId, { resource: "member", action: "delete" });

      if (targetUserId === actor.userId) {
        throw new HttpError(403, "FORBIDDEN", "Members cannot remove themselves");
      }

      const target = await pool.query<{ role: WorkspaceRole }>(
        "SELECT role FROM app.workspace_members WHERE workspace_id = $1 AND user_id = $2",
        [workspaceId, targetUserId]
      );
      const targetRole = target.rows[0]?.role;
      if (!targetRole) {
        throw new HttpError(404, "NOT_FOUND", "Member was not found");
      }

      if (targetRole === "admin") {
        const admins = await pool.query<{ admin_count: number }>(
          "SELECT count(*)::int AS admin_count FROM app.workspace_members WHERE workspace_id = $1 AND role = 'admin'",
          [workspaceId]
        );
        if ((admins.rows[0]?.admin_count ?? 0) <= 1) {
          throw new HttpError(403, "FORBIDDEN", "Cannot remove the last admin");
        }
      }

      await pool.query("DELETE FROM app.workspace_members WHERE workspace_id = $1 AND user_id = $2", [
        workspaceId,
        targetUserId
      ]);

      await writeAuditEvent({
        workspaceId,
        actorUserId: actor.userId,
        action: "member.delete",
        entityType: "workspace_member",
        entityId: targetUserId,
        requestId: request.id,
        outcome: "success",
        metadata: { role: targetRole }
      });

      return reply.status(204).send();
    } catch (error) {
      return mapError(request, reply, error);
    }
  });

}

function readWorkspaceRole(value: unknown): WorkspaceRole {
  if (typeof value !== "string" || !workspaceRoles.includes(value as WorkspaceRole)) {
    throw new HttpError(400, "VALIDATION_ERROR", "role is invalid");
  }
  return value as WorkspaceRole;
}

async function resolveUserId(value: string): Promise<string> {
  const userKey = value.replace(/^@/, "");
  const result = await pool.query<{ user_id: string }>(
    `
      SELECT user_id
      FROM app.user_profiles
      WHERE disabled_at IS NULL
        AND (user_id = $1 OR handle = $1::citext)
    `,
    [userKey]
  );
  const userId = result.rows[0]?.user_id;
  if (!userId) {
    throw new HttpError(404, "NOT_FOUND", "User was not found. Ask them to sign in and create a user id first.");
  }
  return userId;
}

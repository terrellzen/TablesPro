import { createHash, randomBytes } from "node:crypto";
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
          SELECT workspace_id, user_id, role, created_at, updated_at
          FROM app.workspace_members
          WHERE workspace_id = $1
          ORDER BY created_at ASC, user_id ASC
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
      const subject = await authorizeWorkspace(actor, workspaceId, { resource: "member", action: "create" });
      const body = readBodyObject(request);
      const userId = readRequiredString(body, "userId");
      const role = readWorkspaceRole(body.role);

      if (role === "owner" && subject.workspaceRole !== "owner") {
        throw new HttpError(403, "FORBIDDEN", "Only owners can add owners");
      }

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

      if (role === "owner" && subject.workspaceRole !== "owner") {
        throw new HttpError(403, "FORBIDDEN", "Only owners can assign owner role");
      }
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

      if (targetRole === "owner") {
        const owners = await pool.query<{ owner_count: number }>(
          "SELECT count(*)::int AS owner_count FROM app.workspace_members WHERE workspace_id = $1 AND role = 'owner'",
          [workspaceId]
        );
        if ((owners.rows[0]?.owner_count ?? 0) <= 1) {
          throw new HttpError(403, "FORBIDDEN", "Cannot remove the last owner");
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

  app.get("/api/workspaces/:workspaceId/invitations", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const workspaceId = readUuidParam(request.params, "workspaceId");
      await authorizeWorkspace(actor, workspaceId, { resource: "invitation", action: "read" });
      const result = await pool.query(
        `
          SELECT invitation_id, workspace_id, email, role, expires_at, accepted_at, cancelled_at, created_at, created_by
          FROM app.invitations
          WHERE workspace_id = $1
          ORDER BY created_at DESC, invitation_id DESC
        `,
        [workspaceId]
      );
      return sendOk(result.rows);
    } catch (error) {
      return mapError(request, reply, error);
    }
  });

  app.post("/api/workspaces/:workspaceId/invitations", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const workspaceId = readUuidParam(request.params, "workspaceId");
      const subject = await authorizeWorkspace(actor, workspaceId, { resource: "invitation", action: "create" });
      const body = readBodyObject(request);
      const email = readRequiredString(body, "email").toLowerCase();
      const role = readWorkspaceRole(body.role);
      if (role === "owner" && subject.workspaceRole !== "owner") {
        throw new HttpError(403, "FORBIDDEN", "Only owners can invite owners");
      }

      const token = randomBytes(32).toString("base64url");
      const tokenHash = createHash("sha256").update(token).digest();
      const result = await pool.query(
        `
          INSERT INTO app.invitations (workspace_id, email, role, token_hash, expires_at, created_by)
          VALUES ($1, $2, $3, $4, now() + interval '7 days', $5)
          RETURNING invitation_id, workspace_id, email, role, expires_at, created_at
        `,
        [workspaceId, email, role, tokenHash, actor.userId]
      );
      const invitation = requireReturnedRow(result.rows[0], "Invitation insert did not return a row");

      await writeAuditEvent({
        workspaceId,
        actorUserId: actor.userId,
        action: "invitation.create",
        entityType: "invitation",
        entityId: invitation.invitation_id,
        requestId: request.id,
        outcome: "success",
        metadata: { email, role }
      });

      return sendCreated(reply, {
        ...invitation,
        developmentAcceptToken: process.env.NODE_ENV === "production" ? undefined : token
      });
    } catch (error) {
      return mapError(request, reply, error);
    }
  });

  app.delete("/api/workspaces/:workspaceId/invitations/:invitationId", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const workspaceId = readUuidParam(request.params, "workspaceId");
      const invitationId = readUuidParam(request.params, "invitationId");
      await authorizeWorkspace(actor, workspaceId, { resource: "invitation", action: "cancel" });

      const result = await pool.query(
        `
          UPDATE app.invitations
          SET cancelled_at = now()
          WHERE workspace_id = $1
            AND invitation_id = $2
            AND accepted_at IS NULL
            AND cancelled_at IS NULL
          RETURNING invitation_id, email, role
        `,
        [workspaceId, invitationId]
      );
      const invitation = result.rows[0];
      if (!invitation) {
        throw new HttpError(404, "NOT_FOUND", "Invitation was not found or already closed");
      }

      await writeAuditEvent({
        workspaceId,
        actorUserId: actor.userId,
        action: "invitation.cancel",
        entityType: "invitation",
        entityId: invitation.invitation_id,
        requestId: request.id,
        outcome: "success",
        metadata: { email: invitation.email, role: invitation.role }
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

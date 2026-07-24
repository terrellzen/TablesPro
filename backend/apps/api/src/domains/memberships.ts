import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { authorizeWorkspace, requireActor } from "./authz.js";
import { writeAuditEvent } from "./audit.js";
import {
  HttpError, mapError, readBodyObject, readRequiredString, readUuidParam,
  requireReturnedRow, sendCreated, sendOk
} from "./http.js";
import {
  hasDestructiveAccess, parseMemberPermissions, storedRoleFor, type MemberPermissions
} from "./member-permissions.js";
import {
  assertAdminWillRemain, lockWorkspaceMembers, validatePermissionResources
} from "./member-permission-store.js";

export function registerMembershipRoutes(app: FastifyInstance): void {
  app.get("/api/workspaces/:workspaceId/permission-resources", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const workspaceId = readUuidParam(request.params, "workspaceId");
      await authorizeWorkspace(actor, workspaceId, { resource: "member", action: "update" });
      const [bases, tables] = await Promise.all([
        pool.query("SELECT base_id, workspace_id, name FROM app.bases WHERE workspace_id = $1 AND deleted_at IS NULL ORDER BY name", [workspaceId]),
        pool.query(`SELECT t.table_id, t.base_id, t.name FROM app.tables t JOIN app.bases b ON b.base_id = t.base_id
                    WHERE b.workspace_id = $1 AND t.deleted_at IS NULL AND b.deleted_at IS NULL ORDER BY t.name`, [workspaceId])
      ]);
      return sendOk({ bases: bases.rows, tables: tables.rows });
    } catch (error) {
      return mapError(request, reply, error);
    }
  });

  app.get("/api/workspaces/:workspaceId/members", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const workspaceId = readUuidParam(request.params, "workspaceId");
      await authorizeWorkspace(actor, workspaceId, { resource: "member", action: "read" });
      const result = await pool.query(
        `SELECT wm.workspace_id, wm.user_id, up.handle::text, up.display_name, wm.role,
                wm.permissions, wm.created_at, wm.updated_at
         FROM app.workspace_members wm
         LEFT JOIN app.user_profiles up ON up.user_id = wm.user_id
         WHERE wm.workspace_id = $1
         ORDER BY wm.created_at ASC, wm.user_id ASC`,
        [workspaceId]
      );
      return sendOk(result.rows);
    } catch (error) {
      return mapError(request, reply, error);
    }
  });

  app.post("/api/workspaces/:workspaceId/members", async (request, reply) => {
    const client = await pool.connect();
    try {
      const actor = await requireActor(request);
      const workspaceId = readUuidParam(request.params, "workspaceId");
      await authorizeWorkspace(actor, workspaceId, { resource: "member", action: "create" });
      const body = readBodyObject(request);
      const userId = await resolveUserId(readRequiredString(body, "userId"));
      const permissions = parseAndConfirmPermissions(body);
      await validatePermissionResources(workspaceId, permissions, client);

      await client.query("BEGIN");
      await lockWorkspaceMembers(workspaceId, client);
      await assertAdminWillRemain(workspaceId, userId, permissions.workspace === "admin", client);
      const result = await client.query(
        `INSERT INTO app.workspace_members (workspace_id, user_id, role, permissions, created_by, updated_by)
         VALUES ($1, $2, $3, $4::jsonb, $5, $5)
         ON CONFLICT (workspace_id, user_id) DO UPDATE
         SET role = EXCLUDED.role, permissions = EXCLUDED.permissions, updated_at = now(), updated_by = $5
         RETURNING workspace_id, user_id, role, permissions, created_at, updated_at`,
        [workspaceId, userId, storedRoleFor(permissions), JSON.stringify(permissions), actor.userId]
      );
      const member = requireReturnedRow(result.rows[0], "Member insert did not return a row");
      await client.query("COMMIT");
      await auditPermissionChange(workspaceId, actor.userId, userId, request.id, "member.create", permissions);
      return sendCreated(reply, member);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      return mapError(request, reply, error);
    } finally {
      client.release();
    }
  });

  app.patch("/api/workspaces/:workspaceId/members/:userId", async (request, reply) => {
    const client = await pool.connect();
    try {
      const actor = await requireActor(request);
      const workspaceId = readUuidParam(request.params, "workspaceId");
      const targetUserId = readRequiredString(request.params as Record<string, unknown>, "userId");
      await authorizeWorkspace(actor, workspaceId, { resource: "member", action: "update" });
      if (targetUserId === actor.userId) throw new HttpError(403, "FORBIDDEN", "Members cannot change their own permissions");
      const body = readBodyObject(request);
      const permissions = parseAndConfirmPermissions(body);
      await validatePermissionResources(workspaceId, permissions, client);

      await client.query("BEGIN");
      await lockWorkspaceMembers(workspaceId, client);
      await assertAdminWillRemain(workspaceId, targetUserId, permissions.workspace === "admin", client);
      const result = await client.query(
        `UPDATE app.workspace_members SET role = $3, permissions = $4::jsonb, updated_at = now(), updated_by = $5
         WHERE workspace_id = $1 AND user_id = $2
         RETURNING workspace_id, user_id, role, permissions, created_at, updated_at`,
        [workspaceId, targetUserId, storedRoleFor(permissions), JSON.stringify(permissions), actor.userId]
      );
      const member = requireReturnedRow(result.rows[0], "Member update did not return a row");
      await client.query("COMMIT");
      await auditPermissionChange(workspaceId, actor.userId, targetUserId, request.id, "member.update", permissions);
      return sendOk(member);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      return mapError(request, reply, error);
    } finally {
      client.release();
    }
  });

  app.delete("/api/workspaces/:workspaceId/members/:userId", async (request, reply) => {
    const client = await pool.connect();
    try {
      const actor = await requireActor(request);
      const workspaceId = readUuidParam(request.params, "workspaceId");
      const targetUserId = readRequiredString(request.params as Record<string, unknown>, "userId");
      await authorizeWorkspace(actor, workspaceId, { resource: "member", action: "delete" });
      if (targetUserId === actor.userId) throw new HttpError(403, "FORBIDDEN", "Members cannot remove themselves");
      await client.query("BEGIN");
      await lockWorkspaceMembers(workspaceId, client);
      await assertAdminWillRemain(workspaceId, targetUserId, false, client);
      const deleted = await client.query("DELETE FROM app.workspace_members WHERE workspace_id = $1 AND user_id = $2 RETURNING role", [workspaceId, targetUserId]);
      if (!deleted.rows[0]) throw new HttpError(404, "NOT_FOUND", "Member was not found");
      await client.query("COMMIT");
      await auditPermissionChange(workspaceId, actor.userId, targetUserId, request.id, "member.delete", null);
      return reply.status(204).send();
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      return mapError(request, reply, error);
    } finally {
      client.release();
    }
  });
}

function parseAndConfirmPermissions(body: Record<string, unknown>): MemberPermissions {
  const permissions = parseMemberPermissions(body.permissions);
  if (hasDestructiveAccess(permissions) && body.confirmDestructive !== true) {
    throw new HttpError(400, "VALIDATION_ERROR", "Confirm destructive permissions before saving");
  }
  return permissions;
}

async function resolveUserId(value: string): Promise<string> {
  const userKey = value.replace(/^@/, "");
  const result = await pool.query<{ user_id: string }>(
    "SELECT user_id FROM app.user_profiles WHERE disabled_at IS NULL AND (user_id = $1 OR handle = $1::citext)",
    [userKey]
  );
  const userId = result.rows[0]?.user_id;
  if (!userId) throw new HttpError(404, "NOT_FOUND", "User was not found");
  return userId;
}

async function auditPermissionChange(
  workspaceId: string, actorUserId: string, userId: string, requestId: string,
  action: string, permissions: MemberPermissions | null
) {
  const target = await pool.query<{ display_name: string; handle: string }>("SELECT display_name, handle::text FROM app.user_profiles WHERE user_id = $1", [userId]);
  const profile = target.rows[0];
  await writeAuditEvent({
    workspaceId, actorUserId, action, entityType: "workspace_member", entityId: userId,
    requestId, outcome: "success", metadata: { permissions, name: profile?.display_name, handle: profile?.handle, targetUserId: userId }
  });
}

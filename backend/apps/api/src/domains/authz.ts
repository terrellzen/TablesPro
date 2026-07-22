import type { Permission } from "@tablespro/permissions";
import { assertAllowed, isAllowed, type AuthorizationSubject, type WorkspaceRole } from "@tablespro/permissions";
import type { FastifyRequest } from "fastify";
import { pool } from "../db/pool.js";
import { getSession } from "../auth/session.js";
import { HttpError } from "./http.js";
import {
  baseOverride, legacyPermissions, parseMemberPermissions, tableOverride,
  workspaceRoleFor, type MemberPermissions
} from "./member-permissions.js";

export type ApiActor = {
  userId: string;
};

export async function requireActor(request: FastifyRequest): Promise<ApiActor> {
  const session = await getSession(request);
  const userId = (session as { user?: { id?: string } } | null)?.user?.id;
  if (userId) {
    return { userId };
  }
  throw new HttpError(401, "UNAUTHORIZED", "Authenticated session does not include a user id");
}

export async function authorizeWorkspace(
  actor: ApiActor,
  workspaceId: string,
  permission: Permission
): Promise<AuthorizationSubject> {
  const result = await pool.query<{ role: WorkspaceRole; permissions: unknown }>(
    "SELECT role, permissions FROM app.workspace_members wm JOIN app.workspaces w ON w.workspace_id = wm.workspace_id WHERE wm.workspace_id = $1 AND wm.user_id = $2 AND w.deleted_at IS NULL",
    [workspaceId, actor.userId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new HttpError(404, "NOT_FOUND", "Workspace was not found");
  }

  const subject = subjectFor(row.role, row.permissions);
  assertAllowed(subject, permission);
  return subject;
}

export async function authorizeBase(actor: ApiActor, baseId: string, permission: Permission): Promise<string> {
  const result = await pool.query<{
    workspace_id: string; role: WorkspaceRole; permissions: unknown; has_table_grant: boolean;
  }>(
    `
      SELECT b.workspace_id, wm.role, wm.permissions,
        EXISTS (
          SELECT 1 FROM app.tables scoped_table
          WHERE scoped_table.base_id = b.base_id
            AND wm.permissions->'tables' ? scoped_table.table_id::text
        ) AS has_table_grant
      FROM app.bases b
      JOIN app.workspace_members wm ON wm.workspace_id = b.workspace_id
      WHERE b.base_id = $1
        AND b.deleted_at IS NULL
        AND wm.user_id = $2
    `,
    [baseId, actor.userId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new HttpError(404, "NOT_FOUND", "Base was not found");
  }

  const permissions = permissionsFor(row.role, row.permissions);
  const subject = subjectFor(row.role, row.permissions, baseOverride(permissions.bases[baseId]));
  if (!isAllowed(subject, permission)) {
    const canNavigateToScopedTable = permission.resource === "table" && permission.action === "read" && row.has_table_grant;
    if (!canNavigateToScopedTable) assertAllowed(subject, permission);
  }
  return row.workspace_id;
}

export async function authorizeTable(actor: ApiActor, tableId: string, permission: Permission): Promise<{
  workspaceId: string;
  baseId: string;
}> {
  const result = await pool.query<{ workspace_id: string; base_id: string; role: WorkspaceRole; permissions: unknown }>(
    `
      SELECT b.workspace_id, b.base_id, wm.role, wm.permissions
      FROM app.tables t
      JOIN app.bases b ON b.base_id = t.base_id
      JOIN app.workspace_members wm ON wm.workspace_id = b.workspace_id
      WHERE t.table_id = $1
        AND t.deleted_at IS NULL
        AND b.deleted_at IS NULL
        AND wm.user_id = $2
    `,
    [tableId, actor.userId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new HttpError(404, "NOT_FOUND", "Table was not found");
  }

  const permissions = permissionsFor(row.role, row.permissions);
  assertAllowed(subjectFor(
    row.role,
    row.permissions,
    baseOverride(permissions.bases[row.base_id]),
    tableOverride(permissions.tables[tableId])
  ), permission);
  return { workspaceId: row.workspace_id, baseId: row.base_id };
}

function permissionsFor(role: WorkspaceRole, value: unknown): MemberPermissions {
  return value === null ? legacyPermissions(role) : parseMemberPermissions(value);
}

function subjectFor(
  role: WorkspaceRole,
  value: unknown,
  base?: AuthorizationSubject["baseOverride"],
  table?: AuthorizationSubject["tableOverride"]
): AuthorizationSubject {
  const permissions = permissionsFor(role, value);
  return { workspaceRole: workspaceRoleFor(permissions), baseOverride: base, tableOverride: table };
}

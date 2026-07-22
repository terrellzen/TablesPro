import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { HttpError } from "./http.js";
import type { MemberPermissions } from "./member-permissions.js";

type Queryable = Pick<PoolClient, "query">;

export async function validatePermissionResources(
  workspaceId: string,
  permissions: MemberPermissions,
  database: Queryable = pool
): Promise<void> {
  const baseIds = Object.keys(permissions.bases);
  const tableIds = Object.keys(permissions.tables);
  const result = await database.query<{ base_count: number; table_count: number }>(
    `
      SELECT
        (SELECT count(*)::int FROM app.bases WHERE workspace_id = $1 AND base_id = ANY($2::uuid[]) AND deleted_at IS NULL) AS base_count,
        (SELECT count(*)::int FROM app.tables t JOIN app.bases b ON b.base_id = t.base_id
          WHERE b.workspace_id = $1 AND t.table_id = ANY($3::uuid[]) AND t.deleted_at IS NULL AND b.deleted_at IS NULL) AS table_count
    `,
    [workspaceId, baseIds, tableIds]
  );
  const counts = result.rows[0];
  if (!counts || counts.base_count !== baseIds.length || counts.table_count !== tableIds.length) {
    throw new HttpError(400, "VALIDATION_ERROR", "A permission references a base or table outside this workspace");
  }
}

export async function lockWorkspaceMembers(workspaceId: string, database: Queryable): Promise<void> {
  await database.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [workspaceId]);
}

export async function assertAdminWillRemain(
  workspaceId: string,
  targetUserId: string,
  targetWillBeAdmin: boolean,
  database: Queryable
): Promise<void> {
  if (targetWillBeAdmin) return;
  const target = await database.query<{ is_admin: boolean }>(
    `SELECT (CASE WHEN permissions IS NULL THEN role = 'admin' ELSE permissions->>'workspace' = 'admin' END) AS is_admin
     FROM app.workspace_members WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, targetUserId]
  );
  if (!target.rows[0]?.is_admin) return;
  const remaining = await database.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM app.workspace_members
     WHERE workspace_id = $1 AND user_id <> $2
       AND (CASE WHEN permissions IS NULL THEN role = 'admin' ELSE permissions->>'workspace' = 'admin' END)`,
    [workspaceId, targetUserId]
  );
  if ((remaining.rows[0]?.count ?? 0) === 0) {
    throw new HttpError(403, "FORBIDDEN", "Cannot remove or demote the final Workspace Admin");
  }
}

export async function assertUserIsNotFinalAdmin(userId: string, database: Queryable): Promise<void> {
  const memberships = await database.query<{ workspace_id: string }>(
    "SELECT workspace_id FROM app.workspace_members WHERE user_id = $1 ORDER BY workspace_id",
    [userId]
  );
  for (const membership of memberships.rows) {
    await lockWorkspaceMembers(membership.workspace_id, database);
  }
  const blocked = await database.query<{ name: string }>(
    `SELECT w.name FROM app.workspace_members target
     JOIN app.workspaces w ON w.workspace_id = target.workspace_id
     WHERE target.user_id = $1
       AND (CASE WHEN target.permissions IS NULL THEN target.role = 'admin' ELSE target.permissions->>'workspace' = 'admin' END)
       AND NOT EXISTS (
         SELECT 1 FROM app.workspace_members other
         WHERE other.workspace_id = target.workspace_id AND other.user_id <> target.user_id
           AND (CASE WHEN other.permissions IS NULL THEN other.role = 'admin' ELSE other.permissions->>'workspace' = 'admin' END)
       )`,
    [userId]
  );
  if (blocked.rows.length > 0) {
    const names = blocked.rows.map((row) => row.name).join(", ");
    throw new HttpError(403, "FORBIDDEN", `Cannot disable the final Workspace Admin for: ${names}`);
  }
}

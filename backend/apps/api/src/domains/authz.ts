import type { Permission } from "@tablespro/permissions";
import { assertAllowed, type AuthorizationSubject, type WorkspaceRole } from "@tablespro/permissions";
import type { FastifyRequest } from "fastify";
import { pool } from "../db/pool.js";
import { getSession } from "../auth/session.js";
import { env } from "../env.js";
import { HttpError } from "./http.js";

export type ApiActor = {
  userId: string;
};

export async function requireActor(request: FastifyRequest<any, any, any, any, any, any, any, any>): Promise<ApiActor> {
  try {
    const session = await getSession(request);
    const userId = (session as { user?: { id?: string } } | null)?.user?.id;
    if (userId) {
      return { userId };
    }
  } catch (error) {
    if (env.nodeEnv !== "development") {
      throw error;
    }
  }

  if (env.nodeEnv === "development" && process.env.DEV_AUTH_USER_ID) {
    const header = request.headers["x-dev-user-id"];
    const devUserId = Array.isArray(header) ? header[0] : header;
    return { userId: devUserId ?? process.env.DEV_AUTH_USER_ID };
  }

  throw new HttpError(401, "UNAUTHORIZED", "Authenticated session does not include a user id");
}

export async function authorizeWorkspace(
  actor: ApiActor,
  workspaceId: string,
  permission: Permission
): Promise<AuthorizationSubject> {
  const result = await pool.query<{ role: WorkspaceRole }>(
    "SELECT role FROM app.workspace_members wm JOIN app.workspaces w ON w.workspace_id = wm.workspace_id WHERE wm.workspace_id = $1 AND wm.user_id = $2 AND w.deleted_at IS NULL",
    [workspaceId, actor.userId]
  );
  const role = result.rows[0]?.role;
  if (!role) {
    throw new HttpError(404, "NOT_FOUND", "Workspace was not found");
  }

  const subject = { workspaceRole: role };
  assertAllowed(subject, permission);
  return subject;
}

export async function authorizeBase(actor: ApiActor, baseId: string, permission: Permission): Promise<string> {
  const result = await pool.query<{ workspace_id: string; role: WorkspaceRole }>(
    `
      SELECT b.workspace_id, wm.role
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

  assertAllowed({ workspaceRole: row.role }, permission);
  return row.workspace_id;
}

export async function authorizeTable(actor: ApiActor, tableId: string, permission: Permission): Promise<{
  workspaceId: string;
  baseId: string;
}> {
  const result = await pool.query<{ workspace_id: string; base_id: string; role: WorkspaceRole }>(
    `
      SELECT b.workspace_id, b.base_id, wm.role
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

  assertAllowed({ workspaceRole: row.role }, permission);
  return { workspaceId: row.workspace_id, baseId: row.base_id };
}

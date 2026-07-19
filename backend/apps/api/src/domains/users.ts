import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { requireActor } from "./authz.js";
import { HttpError, mapError, readBodyObject, readRequiredString, sendOk } from "./http.js";

export type UserProfile = {
  user_id: string;
  handle: string;
  display_name: string;
  can_create_workspaces: boolean;
  can_manage_users: boolean;
  disabled_at: string | null;
};

export function registerUserRoutes(app: FastifyInstance<any, any, any, any, any>): void {
  app.get("/api/users", async (request, reply) => {
    try {
      await requireActor(request);
      const result = await pool.query<UserProfile>(
        `
          SELECT user_id, handle::text, display_name, can_create_workspaces, can_manage_users, disabled_at
          FROM app.user_profiles
          WHERE disabled_at IS NULL
          ORDER BY handle ASC
        `
      );
      return sendOk(result.rows);
    } catch (error) {
      return mapError(request, reply, error);
    }
  });

  app.put("/api/me/profile", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const body = readBodyObject(request);
      const handle = normalizeHandle(readRequiredString(body, "handle"));
      const displayName = readRequiredString(body, "displayName");
      const result = await pool.query<UserProfile>(
        `
          INSERT INTO app.user_profiles (user_id, handle, display_name)
          VALUES ($1, $2, $3)
          ON CONFLICT (user_id) DO UPDATE
          SET handle = EXCLUDED.handle,
              display_name = EXCLUDED.display_name,
              updated_at = now()
          RETURNING user_id, handle::text, display_name, can_create_workspaces, can_manage_users, disabled_at
        `,
        [actor.userId, handle, displayName]
      );
      return sendOk(result.rows[0]);
    } catch (error) {
      return mapError(request, reply, error);
    }
  });

  app.patch("/api/users/:userId/permissions", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      await requireCanManageUsers(actor.userId);
      const targetUserId = readRequiredString(request.params as Record<string, unknown>, "userId");
      const body = readBodyObject(request);
      const canCreateWorkspaces = Boolean(body.canCreateWorkspaces);
      const canManageUsers = Boolean(body.canManageUsers);
      const result = await pool.query<UserProfile>(
        `
          UPDATE app.user_profiles
          SET can_create_workspaces = $2,
              can_manage_users = $3,
              updated_at = now()
          WHERE user_id = $1
          RETURNING user_id, handle::text, display_name, can_create_workspaces, can_manage_users, disabled_at
        `,
        [targetUserId, canCreateWorkspaces, canManageUsers]
      );
      if (!result.rows[0]) {
        throw new HttpError(404, "NOT_FOUND", "User was not found");
      }
      return sendOk(result.rows[0]);
    } catch (error) {
      return mapError(request, reply, error);
    }
  });

  app.delete("/api/users/:userId", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      await requireCanManageUsers(actor.userId);
      const targetUserId = readRequiredString(request.params as Record<string, unknown>, "userId");
      if (targetUserId === actor.userId) {
        throw new HttpError(403, "FORBIDDEN", "Users cannot disable themselves");
      }
      await pool.query("UPDATE app.user_profiles SET disabled_at = now(), updated_at = now() WHERE user_id = $1", [
        targetUserId
      ]);
      await pool.query("DELETE FROM app.workspace_members WHERE user_id = $1", [targetUserId]);
      return reply.status(204).send();
    } catch (error) {
      return mapError(request, reply, error);
    }
  });
}

export async function readUserProfile(userId: string): Promise<UserProfile | null> {
  const result = await pool.query<UserProfile>(
    `
      SELECT user_id, handle::text, display_name, can_create_workspaces, can_manage_users, disabled_at
      FROM app.user_profiles
      WHERE user_id = $1
    `,
    [userId]
  );
  return result.rows[0] ?? null;
}

export async function requireCanCreateWorkspaces(userId: string): Promise<void> {
  const profile = await readUserProfile(userId);
  if (!profile || profile.disabled_at || !profile.can_create_workspaces) {
    throw new HttpError(403, "FORBIDDEN", "You do not have permission to create workspaces");
  }
}

async function requireCanManageUsers(userId: string): Promise<void> {
  const profile = await readUserProfile(userId);
  if (!profile || profile.disabled_at || !profile.can_manage_users) {
    throw new HttpError(403, "FORBIDDEN", "You do not have permission to manage users");
  }
}

function normalizeHandle(value: string): string {
  const handle = value.trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{2,31}$/.test(handle)) {
    throw new HttpError(400, "VALIDATION_ERROR", "User id must be 3-32 letters, numbers, underscores, or dashes");
  }
  return handle;
}

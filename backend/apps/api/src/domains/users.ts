import type { FastifyInstance } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { pool } from "../db/pool.js";
import { auth } from "../auth/auth.js";
import { requireActor } from "./authz.js";
import { HttpError, mapError, readBodyObject, readRequiredString, sendOk } from "./http.js";
import { assertUserIsNotFinalAdmin } from "./member-permission-store.js";

export type UserProfile = {
  user_id: string;
  handle: string;
  display_name: string;
  can_create_workspaces: boolean;
  can_manage_users: boolean;
  disabled_at: string | null;
};

export function registerUserRoutes(app: FastifyInstance): void {
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

  app.post("/api/users", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      await requireCanManageUsers(actor.userId);
      const body = readBodyObject(request);
      const email = readRequiredString(body, "email").trim();
      const password = readRequiredString(body, "password");
      const handle = normalizeHandle(readRequiredString(body, "handle"));
      const displayName = readRequiredString(body, "displayName").trim();
      const canCreateWorkspaces = Boolean(body.canCreateWorkspaces);
      const canManageUsers = Boolean(body.canManageUsers);

      const handleTaken = await pool.query<{ user_id: string }>(
        `SELECT user_id FROM app.user_profiles WHERE handle = $1::citext`,
        [handle]
      );
      if (handleTaken.rows.length > 0) {
        throw new HttpError(409, "CONFLICT", "This handle is already taken by another user");
      }

      const result = await auth.api.signUpEmail({
        body: { name: displayName, email, password }
      });

      await pool.query(
        `
          INSERT INTO app.user_profiles (user_id, handle, display_name, can_create_workspaces, can_manage_users)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (user_id) DO UPDATE
          SET handle = EXCLUDED.handle,
              display_name = EXCLUDED.display_name,
              can_create_workspaces = EXCLUDED.can_create_workspaces,
              can_manage_users = EXCLUDED.can_manage_users,
              updated_at = now()
        `,
        [result.user.id, handle, displayName, canCreateWorkspaces, canManageUsers]
      );

      return sendOk({
        user_id: result.user.id,
        handle,
        display_name: displayName,
        can_create_workspaces: canCreateWorkspaces,
        can_manage_users: canManageUsers,
        disabled_at: null
      });
    } catch (error) {
      if (isDuplicateAccountError(error)) {
        return mapError(request, reply, new HttpError(409, "CONFLICT", "A user with this email already exists"));
      }
      return mapError(request, reply, error);
    }
  });

  app.put("/api/me/profile", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const body = readBodyObject(request);
      const handle = normalizeHandle(readRequiredString(body, "handle"));
      const displayName = readRequiredString(body, "displayName");

      const taken = await pool.query<{ user_id: string }>(
        `SELECT user_id FROM app.user_profiles WHERE handle = $1::citext AND user_id != $2`,
        [handle, actor.userId]
      );
      if (taken.rows.length > 0) {
        throw new HttpError(409, "CONFLICT", "This handle is already taken by another user");
      }

      const existing = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM app.user_profiles");
      const isFirstUser = Number(existing.rows[0]?.count ?? "0") === 0;

      const result = await pool.query<UserProfile>(
        `
          INSERT INTO app.user_profiles (user_id, handle, display_name, can_create_workspaces, can_manage_users)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (user_id) DO UPDATE
          SET handle = EXCLUDED.handle,
              display_name = EXCLUDED.display_name,
              updated_at = now()
          RETURNING user_id, handle::text, display_name, can_create_workspaces, can_manage_users, disabled_at
        `,
        [actor.userId, handle, displayName, isFirstUser, isFirstUser]
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
    const client = await pool.connect();
    try {
      const actor = await requireActor(request);
      await requireCanManageUsers(actor.userId);
      const targetUserId = readRequiredString(request.params as Record<string, unknown>, "userId");
      if (targetUserId === actor.userId) {
        throw new HttpError(403, "FORBIDDEN", "Users cannot disable themselves");
      }
      await client.query("BEGIN");
      await assertUserIsNotFinalAdmin(targetUserId, client);
      await client.query("UPDATE app.user_profiles SET disabled_at = now(), updated_at = now() WHERE user_id = $1", [
        targetUserId
      ]);
      await client.query("DELETE FROM app.workspace_members WHERE user_id = $1", [targetUserId]);
      await client.query("COMMIT");
      return reply.status(204).send();
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      return mapError(request, reply, error);
    } finally {
      client.release();
    }
  });

  app.post("/api/me/change-password", async (request, reply) => {
    try {
      const body = readBodyObject(request);
      const currentPassword = readRequiredString(body, "currentPassword");
      const newPassword = readRequiredString(body, "newPassword");

      await auth.api.changePassword({
        body: { currentPassword, newPassword },
        headers: fromNodeHeaders(request.headers)
      });

      return sendOk({ status: true });
    } catch (error) {
      return mapError(request, reply, error);
    }
  });

  app.post("/api/users/:userId/password", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      await requireCanManageUsers(actor.userId);
      const targetUserId = readRequiredString(request.params as Record<string, unknown>, "userId");
      const body = readBodyObject(request);
      const adminPassword = readRequiredString(body, "adminPassword");
      const newPassword = readRequiredString(body, "newPassword");

      const adminAccount = await pool.query<{ password: string | null }>(
        `SELECT password FROM auth.account WHERE "userId" = $1 AND "providerId" = 'email'`,
        [actor.userId]
      );
      const storedHash = adminAccount.rows[0]?.password;
      if (!storedHash) {
        throw new HttpError(400, "VALIDATION_ERROR", "No password set on your account");
      }

      const valid = await verifyPassword({ hash: storedHash, password: adminPassword });
      if (!valid) {
        throw new HttpError(403, "FORBIDDEN", "Your password is incorrect");
      }

      const newHash = await hashPassword(newPassword);
      await pool.query(
        `UPDATE auth.account SET password = $1, "updatedAt" = now() WHERE "userId" = $2 AND "providerId" = 'email'`,
        [newHash, targetUserId]
      );

      return sendOk({ status: true });
    } catch (error) {
      return mapError(request, reply, error);
    }
  });
}

function isDuplicateAccountError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; message?: unknown };
  return candidate.name === "BASE_ERROR" ||
    (typeof candidate.message === "string" && candidate.message.includes("already exists"));
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

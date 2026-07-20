import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import { registerAuthRoutes } from "./auth/fastify-auth-handler.js";
import { getSession } from "./auth/session.js";
import { registerApiRoutes } from "./domains/register-routes.js";
import { env } from "./env.js";
import { pool } from "./db/pool.js";
import { readUserProfile } from "./domains/users.js";
import { requireActor } from "./domains/authz.js";

const app = Fastify({
  bodyLimit: 2 * 1024 * 1024,
  trustProxy: process.env.TRUST_PROXY === "true",
  logger: {
    level: env.nodeEnv === "production" ? "info" : "debug"
  },
  genReqId: (request) => {
    const header = request.headers["x-request-id"];
    const requestId = Array.isArray(header) ? header[0] : header;
    return requestId ?? crypto.randomUUID();
  }
});

app.addHook("onRequest", async (_request, reply) => {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "DENY");
  reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
  reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  reply.header("Content-Security-Policy", "default-src 'self'; frame-ancestors 'none'");
});

await app.register(fastifyCors, {
  origin: env.webOrigin.split(",").map((origin) => origin.trim()),
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-Request-Id"],
  maxAge: 86_400
});

registerAuthRoutes(app);
registerApiRoutes(app);

app.get("/health", async () => ({
  ok: true
}));

app.get("/ready", async () => ({
  ok: true,
  database: await checkDatabase()
}));

app.get("/api/config", async () => ({
  auth: {
    signUpEnabled: env.authSignupEnabled
  }
}));

app.get("/api/me", async (request) => {
  const session = await getSession(request);
  const userId = (session as { user?: { id?: string } } | null)?.user?.id;
  return {
    authenticated: Boolean(session),
    ...(session ? session : {}),
    profile: userId ? await readUserProfile(userId) : null
  };
});

app.get("/api/admin/stats", async (request, reply) => {
  try {
    const actor = await requireActor(request);
    const profile = await readUserProfile(actor.userId);
    if (!profile?.can_manage_users) {
      return reply.code(403).send({ error: "FORBIDDEN", message: "Admin access required" });
    }

    const dbSize = await pool.query<{ size_bytes: string }>(
      "SELECT pg_database_size(current_database())::text AS size_bytes"
    );

    const tableCount = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM information_schema.tables WHERE table_schema = 'app_data'"
    );

    const rowCounts = await pool.query<{ table_name: string; count: string }>(
      `
      SELECT relname AS table_name, n_live_tup AS count
      FROM pg_stat_user_tables
      WHERE schemaname = 'app_data'
      ORDER BY n_live_tup DESC
      LIMIT 20
      `
    );

    return {
      database: {
        name: (await pool.query("SELECT current_database() AS name")).rows[0]?.name,
        sizeBytes: Number(dbSize.rows[0]?.size_bytes ?? 0),
        tableCount: Number(tableCount.rows[0]?.count ?? 0),
        tables: rowCounts.rows.map((r) => ({
          name: r.table_name,
          rowCount: Number(r.count)
        }))
      }
    };
  } catch (error: any) {
    if (error?.statusCode === 401) {
      return reply.code(401).send({ error: "UNAUTHORIZED", message: "Authentication required" });
    }
    throw error;
  }
});

app.get("/api/admin/workspaces", async (request, reply) => {
  try {
    const actor = await requireActor(request);
    const profile = await readUserProfile(actor.userId);
    if (!profile?.can_manage_users) {
      return reply.code(403).send({ error: "FORBIDDEN", message: "Admin access required" });
    }

    const result = await pool.query(
      `
        SELECT w.workspace_id, w.name, w.created_at,
               (SELECT count(*) FROM app.workspace_members wm2 WHERE wm2.workspace_id = w.workspace_id)::int AS member_count
        FROM app.workspaces w
        WHERE w.deleted_at IS NULL
        ORDER BY w.name ASC
      `
    );
    return { data: result.rows };
  } catch (error: any) {
    if (error?.statusCode === 401) {
      return reply.code(401).send({ error: "UNAUTHORIZED", message: "Authentication required" });
    }
    throw error;
  }
});

app.get("/api/admin/workspaces/:workspaceId/bases", async (request, reply) => {
  try {
    const actor = await requireActor(request);
    const profile = await readUserProfile(actor.userId);
    if (!profile?.can_manage_users) {
      return reply.code(403).send({ error: "FORBIDDEN", message: "Admin access required" });
    }

    const workspaceId = (request.params as Record<string, string>).workspaceId;
    const result = await pool.query(
      `
        SELECT b.base_id, b.name
        FROM app.bases b
        WHERE b.workspace_id = $1 AND b.deleted_at IS NULL
        ORDER BY b.name ASC
      `,
      [workspaceId]
    );
    return { data: result.rows };
  } catch (error: any) {
    if (error?.statusCode === 401) {
      return reply.code(401).send({ error: "UNAUTHORIZED", message: "Authentication required" });
    }
    throw error;
  }
});

app.get("/api/admin/audit-events", async (request, reply) => {
  try {
    const actor = await requireActor(request);
    const profile = await readUserProfile(actor.userId);
    if (!profile?.can_manage_users) {
      return reply.code(403).send({ error: "FORBIDDEN", message: "Admin access required" });
    }

    const query = request.query as Record<string, unknown>;
    const workspaceId = typeof query.workspaceId === "string" ? query.workspaceId : null;
    const baseId = typeof query.baseId === "string" ? query.baseId : null;
    const tableId = typeof query.tableId === "string" ? query.tableId : null;
    const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 250);

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (workspaceId) {
      params.push(workspaceId);
      conditions.push(`ae.workspace_id = $${params.length}`);
    }
    if (baseId) {
      params.push(baseId);
      conditions.push(`t.base_id = $${params.length}`);
    }
    if (tableId) {
      params.push(tableId);
      conditions.push(`ae.metadata->>'tableId' = $${params.length}`);
    }
    params.push(limit);

    const whereClause = conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";

    const result = await pool.query(
      `
        SELECT ae.event_id, ae.workspace_id, ae.actor_user_id, ae.action, ae.entity_type,
               ae.entity_id, ae.occurred_at, ae.outcome, ae.diff, ae.metadata,
               w.name AS workspace_name,
               COALESCE(up.display_name, up.handle, ae.actor_user_id) AS actor_name,
               t.name AS table_name
        FROM app.audit_events ae
        JOIN app.workspaces w ON w.workspace_id = ae.workspace_id
        LEFT JOIN app.user_profiles up ON up.user_id = ae.actor_user_id
        LEFT JOIN app.tables t ON t.table_id = (ae.metadata->>'tableId')::uuid
        WHERE 1=1 ${whereClause}
        ORDER BY ae.occurred_at DESC, ae.event_id DESC
        LIMIT $${params.length}
      `,
      params
    );
    return {
      data: result.rows,
      page: {
        nextCursor: null,
        hasMore: result.rows.length === limit
      }
    };
  } catch (error: any) {
    if (error?.statusCode === 401) {
      return reply.code(401).send({ error: "UNAUTHORIZED", message: "Authentication required" });
    }
    throw error;
  }
});

app.get("/api/admin/workspaces/:workspaceId/tables", async (request, reply) => {
  try {
    const actor = await requireActor(request);
    const profile = await readUserProfile(actor.userId);
    if (!profile?.can_manage_users) {
      return reply.code(403).send({ error: "FORBIDDEN", message: "Admin access required" });
    }

    const workspaceId = (request.params as Record<string, string>).workspaceId;
    const query = request.query as Record<string, unknown>;
    const baseId = typeof query.baseId === "string" ? query.baseId : null;

    const conditions = ["b.workspace_id = $1", "t.deleted_at IS NULL", "b.deleted_at IS NULL"];
    const params: unknown[] = [workspaceId];
    if (baseId) {
      params.push(baseId);
      conditions.push(`t.base_id = $${params.length}`);
    }

    const result = await pool.query(
      `
        SELECT t.table_id, t.name
        FROM app.tables t
        JOIN app.bases b ON b.base_id = t.base_id
        WHERE ${conditions.join(" AND ")}
        ORDER BY t.name ASC
      `,
      params
    );
    return { data: result.rows };
  } catch (error: any) {
    if (error?.statusCode === 401) {
      return reply.code(401).send({ error: "UNAUTHORIZED", message: "Authentication required" });
    }
    throw error;
  }
});

await app.listen({
  host: env.apiHost,
  port: env.apiPort
});

async function checkDatabase() {
  const result = await pool.query<{ migration_count: number }>(
    "SELECT count(*)::int AS migration_count FROM app.schema_migrations"
  );
  return {
    connected: true,
    migrationsApplied: result.rows[0]?.migration_count ?? 0
  };
}

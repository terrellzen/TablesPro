import type { FastifyInstance, FastifyRequest } from "fastify";
import { pool } from "../db/pool.js";
import { readUserProfile } from "./users.js";
import { requireActor } from "./authz.js";
import { HttpError, mapError, readLimit, readOptionalUuid, readUuidParam } from "./http.js";

export function registerAdminRoutes(app: FastifyInstance): void {
  app.get("/api/admin/stats", async (request, reply) => {
    try {
      await requireAdmin(request);
  
      const [databaseName, dbSize, tableCount, rowCounts] = await Promise.all([
        pool.query<{ name: string }>("SELECT current_database() AS name"),
        pool.query<{ size_bytes: string }>("SELECT pg_database_size(current_database())::text AS size_bytes"),
        pool.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM information_schema.tables WHERE table_schema = 'app_data'"
        ),
        pool.query<{ physical_name: string; table_name: string | null; base_name: string | null; workspace_name: string | null; count: string }>(
          `
            SELECT stats.relname AS physical_name, tables.name AS table_name, bases.name AS base_name,
                   workspaces.name AS workspace_name, stats.n_live_tup::text AS count
            FROM pg_stat_user_tables stats
            LEFT JOIN app.tables tables ON tables.physical_table_name::text = stats.relname
            LEFT JOIN app.bases bases ON bases.base_id = tables.base_id
            LEFT JOIN app.workspaces workspaces ON workspaces.workspace_id = bases.workspace_id
            WHERE stats.schemaname = 'app_data'
            ORDER BY stats.n_live_tup DESC
            LIMIT 20
          `
        )
      ]);
  
      return {
        database: {
          name: databaseName.rows[0]?.name ?? "unknown",
          sizeBytes: Number(dbSize.rows[0]?.size_bytes ?? 0),
          tableCount: Number(tableCount.rows[0]?.count ?? 0),
          tables: rowCounts.rows.map((row) => ({
            physicalName: row.physical_name,
            tableName: row.table_name ?? row.physical_name,
            baseName: row.base_name,
            workspaceName: row.workspace_name,
            rowCount: Number(row.count)
          }))
        }
      };
    } catch (error) {
      return mapError(request, reply, error);
    }
  });
  
  app.get("/api/admin/workspaces", async (request, reply) => {
    try {
      await requireAdmin(request);
  
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
    } catch (error) {
      return mapError(request, reply, error);
    }
  });
  
  app.get("/api/admin/workspaces/:workspaceId/bases", async (request, reply) => {
    try {
      await requireAdmin(request);
  
      const workspaceId = readUuidParam(request.params, "workspaceId");
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
    } catch (error) {
      return mapError(request, reply, error);
    }
  });
  
  app.get("/api/admin/audit-events", async (request, reply) => {
    try {
      await requireAdmin(request);
  
      const query = request.query as Record<string, unknown>;
      const workspaceId = readOptionalUuid(query, "workspaceId");
      const baseId = readOptionalUuid(query, "baseId");
      const tableId = readOptionalUuid(query, "tableId");
      const scope = query.scope ?? "all";
      if (scope !== "all" && scope !== "company" && scope !== "workspace") {
        throw new HttpError(400, "VALIDATION_ERROR", "scope must be all, company, or workspace");
      }
      const limit = readLimit(query, 100, 250);
  
      const conditions: string[] = [];
      if (scope === "company") conditions.push("ae.workspace_id IS NULL");
      if (scope === "workspace") conditions.push("ae.workspace_id IS NOT NULL");
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
                 ae.entity_id, ae.occurred_at, ae.request_id, ae.job_id, ae.outcome, ae.diff, ae.metadata,
                 COALESCE(w.name, ae.metadata->>'workspaceName') AS workspace_name, b.base_id, b.name AS base_name, t.table_id, t.name AS table_name,
                 COALESCE(up.display_name, up.handle, ae.actor_user_id) AS actor_name,
                 up.handle::text AS actor_handle
          FROM app.audit_events ae
          LEFT JOIN app.workspaces w ON w.workspace_id = ae.workspace_id
          LEFT JOIN app.user_profiles up ON up.user_id = ae.actor_user_id
          LEFT JOIN app.tables t ON t.table_id = COALESCE(
            NULLIF(ae.metadata->>'tableId', '')::uuid,
            CASE WHEN ae.entity_type = 'table' THEN ae.entity_id::uuid END
          )
          LEFT JOIN app.bases b ON b.base_id = COALESCE(
            t.base_id,
            CASE WHEN ae.entity_type = 'base' THEN ae.entity_id::uuid END
          )
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
    } catch (error) {
      return mapError(request, reply, error);
    }
  });
  
  app.get("/api/admin/workspaces/:workspaceId/tables", async (request, reply) => {
    try {
      await requireAdmin(request);
  
      const workspaceId = readUuidParam(request.params, "workspaceId");
      const query = request.query as Record<string, unknown>;
      const baseId = readOptionalUuid(query, "baseId");
  
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
    } catch (error) {
      return mapError(request, reply, error);
    }
  });
}

async function requireAdmin(request: FastifyRequest): Promise<void> {
  const actor = await requireActor(request);
  const profile = await readUserProfile(actor.userId);
  if (!profile?.can_manage_users) {
    throw new HttpError(403, "FORBIDDEN", "Admin access required");
  }
}

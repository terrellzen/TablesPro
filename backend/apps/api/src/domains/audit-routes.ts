import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { authorizeWorkspace, requireActor } from "./authz.js";
import { mapError, readLimit, readUuidParam } from "./http.js";

export function registerAuditRoutes(app: FastifyInstance): void {
  app.get("/api/workspaces/:workspaceId/audit-events", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const workspaceId = readUuidParam(request.params, "workspaceId");
      await authorizeWorkspace(actor, workspaceId, { resource: "audit", action: "read" });
      const limit = readLimit(request.query, 100, 250);
      const result = await pool.query(
        `
          SELECT ae.event_id, ae.workspace_id, ae.actor_user_id, ae.action, ae.entity_type, ae.entity_id,
                 ae.occurred_at, ae.request_id, ae.job_id, ae.outcome, ae.diff, ae.metadata,
                 w.name AS workspace_name, b.base_id, b.name AS base_name, t.table_id, t.name AS table_name,
                 COALESCE(up.display_name, up.handle, ae.actor_user_id) AS actor_name,
                 up.handle::text AS actor_handle
          FROM app.audit_events ae
          JOIN app.workspaces w ON w.workspace_id = ae.workspace_id
          LEFT JOIN app.user_profiles up ON up.user_id = ae.actor_user_id
          LEFT JOIN app.tables t ON t.table_id = COALESCE(
            NULLIF(ae.metadata->>'tableId', '')::uuid,
            CASE WHEN ae.entity_type = 'table' THEN ae.entity_id::uuid END
          )
          LEFT JOIN app.bases b ON b.base_id = COALESCE(
            t.base_id,
            CASE WHEN ae.entity_type = 'base' THEN ae.entity_id::uuid END
          )
          WHERE ae.workspace_id = $1
          ORDER BY ae.occurred_at DESC, ae.event_id DESC
          LIMIT $2
        `,
        [workspaceId, limit]
      );
      return {
        data: result.rows,
        page: {
          nextCursor: null,
          previousCursor: null,
          hasMore: result.rows.length === limit,
          requestedLimit: limit
        }
      };
    } catch (error) {
      return mapError(request, reply, error);
    }
  });
}

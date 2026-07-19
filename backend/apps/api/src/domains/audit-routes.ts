import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { authorizeWorkspace, requireActor } from "./authz.js";
import { mapError, readLimit, readUuidParam } from "./http.js";

export function registerAuditRoutes(app: FastifyInstance<any, any, any, any, any>): void {
  app.get("/api/workspaces/:workspaceId/audit-events", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const workspaceId = readUuidParam(request.params, "workspaceId");
      await authorizeWorkspace(actor, workspaceId, { resource: "audit", action: "read" });
      const limit = readLimit(request.query, 100, 250);
      const result = await pool.query(
        `
          SELECT event_id, workspace_id, actor_user_id, action, entity_type, entity_id, occurred_at,
                 request_id, job_id, outcome, diff, metadata
          FROM app.audit_events
          WHERE workspace_id = $1
          ORDER BY occurred_at DESC, event_id DESC
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

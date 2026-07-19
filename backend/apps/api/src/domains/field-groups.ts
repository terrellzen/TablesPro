import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { authorizeTable, requireActor } from "./authz.js";
import { writeAuditEvent } from "./audit.js";
import { mapError, readBodyObject, readOptionalString, readRequiredString, readUuidParam, sendCreated, sendOk } from "./http.js";

export function registerFieldGroupRoutes(app: FastifyInstance<any, any, any, any, any>): void {
  app.get("/api/tables/:tableId/field-groups", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const tableId = readUuidParam(request.params, "tableId");
      await authorizeTable(actor, tableId, { resource: "field", action: "read" });
      const result = await pool.query(
        `
          SELECT field_group_id, table_id, parent_field_group_id, name, position, collapsed, hidden, created_at, updated_at
          FROM app.field_groups
          WHERE table_id = $1
          ORDER BY position ASC, field_group_id ASC
        `,
        [tableId]
      );
      return sendOk(result.rows);
    } catch (error) {
      return mapError(request, reply, error);
    }
  });

  app.post("/api/tables/:tableId/field-groups", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const tableId = readUuidParam(request.params, "tableId");
      const { workspaceId } = await authorizeTable(actor, tableId, { resource: "field", action: "create" });
      const body = readBodyObject(request);
      const name = readRequiredString(body, "name");
      const parentFieldGroupId = readOptionalString(body, "parentFieldGroupId");
      const positionResult = await pool.query<{ position: number }>(
        "SELECT COALESCE(MAX(position), -1) + 1 AS position FROM app.field_groups WHERE table_id = $1",
        [tableId]
      );
      const result = await pool.query(
        `
          INSERT INTO app.field_groups (table_id, parent_field_group_id, name, position)
          VALUES ($1, $2, $3, $4)
          RETURNING field_group_id, table_id, parent_field_group_id, name, position, collapsed, hidden, created_at, updated_at
        `,
        [tableId, parentFieldGroupId ?? null, name, positionResult.rows[0]?.position ?? 0]
      );
      const group = result.rows[0];
      await writeAuditEvent({
        workspaceId,
        actorUserId: actor.userId,
        action: "field_group.create",
        entityType: "field_group",
        entityId: group.field_group_id,
        requestId: request.id,
        outcome: "success",
        metadata: { tableId, name, parentFieldGroupId }
      });
      return sendCreated(reply, group);
    } catch (error) {
      return mapError(request, reply, error);
    }
  });
}

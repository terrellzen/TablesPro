import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { authorizeTable, requireActor } from "./authz.js";
import { writeAuditEvent } from "./audit.js";
import { HttpError, mapError, readBodyObject, readOptionalString, readRequiredString, readUuidParam, sendCreated, sendOk } from "./http.js";

export function registerViewRoutes(app: FastifyInstance<any, any, any, any, any>): void {
  app.get("/api/tables/:tableId/views", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const tableId = readUuidParam(request.params, "tableId");
      await authorizeTable(actor, tableId, { resource: "view", action: "read" });
      const viewsResult = await pool.query(
        `
          SELECT saved_view_id, table_id, owner_user_id, name, is_shared, search, visible_field_ids,
                 field_order, field_widths, frozen_field_ids, collapsed_field_group_ids, density, created_at, updated_at
          FROM app.saved_views
          WHERE table_id = $1
            AND (is_shared = true OR owner_user_id = $2)
          ORDER BY updated_at DESC, saved_view_id DESC
        `,
        [tableId, actor.userId]
      );
      const views = viewsResult.rows;
      if (views.length === 0) return sendOk(views);

      const viewIds = views.map((v) => v.saved_view_id);
      const [filtersResult, sortsResult] = await Promise.all([
        pool.query(
          `SELECT saved_view_id, filter_ast FROM app.saved_view_filters WHERE saved_view_id = ANY($1::uuid[])`,
          [viewIds]
        ),
        pool.query(
          `SELECT saved_view_id, field_id, direction, position FROM app.saved_view_sorts WHERE saved_view_id = ANY($1::uuid[]) ORDER BY position`,
          [viewIds]
        )
      ]);

      const filtersByView = new Map<string, unknown[]>();
      for (const row of filtersResult.rows) {
        const list = filtersByView.get(row.saved_view_id) ?? [];
        list.push(row.filter_ast);
        filtersByView.set(row.saved_view_id, list);
      }

      const sortsByView = new Map<string, { field_id: string; direction: string }[]>();
      for (const row of sortsResult.rows) {
        const list = sortsByView.get(row.saved_view_id) ?? [];
        list.push({ field_id: row.field_id, direction: row.direction });
        sortsByView.set(row.saved_view_id, list);
      }

      const enriched = views.map((v) => ({
        ...v,
        filters: filtersByView.get(v.saved_view_id) ?? [],
        sorts: sortsByView.get(v.saved_view_id) ?? []
      }));

      return sendOk(enriched);
    } catch (error) {
      return mapError(request, reply, error);
    }
  });

  app.post("/api/tables/:tableId/views", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const tableId = readUuidParam(request.params, "tableId");
      const { workspaceId } = await authorizeTable(actor, tableId, { resource: "view", action: "create" });
      const body = readBodyObject(request);
      const name = readRequiredString(body, "name");
      const search = readOptionalString(body, "search");
      const isShared = body.isShared === true;
      const filters = Array.isArray(body.filters) ? body.filters : [];
      const sorts = Array.isArray(body.sorts) ? body.sorts : [];

      const result = await pool.query(
        `
          INSERT INTO app.saved_views (
            table_id,
            owner_user_id,
            name,
            is_shared,
            search,
            visible_field_ids,
            field_order,
            field_widths,
            frozen_field_ids,
            collapsed_field_group_ids,
            density
          )
          VALUES ($1, $2, $3, $4, $5, $6::uuid[], $7::uuid[], $8::jsonb, $9::uuid[], $10::uuid[], $11)
          RETURNING saved_view_id, table_id, owner_user_id, name, is_shared, search, visible_field_ids,
                    field_order, field_widths, frozen_field_ids, collapsed_field_group_ids, density, created_at, updated_at
        `,
        [
          tableId,
          actor.userId,
          name,
          isShared,
          search ?? null,
          readUuidArray(body.visibleFieldIds),
          readUuidArray(body.fieldOrder),
          JSON.stringify(readPlainObject(body.fieldWidths)),
          readUuidArray(body.frozenFieldIds),
          readUuidArray(body.collapsedFieldGroupIds),
          readDensity(body.density)
        ]
      );
      const view = result.rows[0];

      for (const filterAst of filters) {
        await pool.query(
          `INSERT INTO app.saved_view_filters (saved_view_id, filter_ast) VALUES ($1, $2::jsonb)`,
          [view.saved_view_id, JSON.stringify(filterAst)]
        );
      }

      for (let i = 0; i < sorts.length; i++) {
        const sort = sorts[i] as { fieldId: string; direction: string };
        if (sort.fieldId && (sort.direction === "asc" || sort.direction === "desc")) {
          await pool.query(
            `INSERT INTO app.saved_view_sorts (saved_view_id, field_id, direction, position) VALUES ($1, $2, $3, $4)`,
            [view.saved_view_id, sort.fieldId, sort.direction, i]
          );
        }
      }

      await writeAuditEvent({
        workspaceId,
        actorUserId: actor.userId,
        action: "view.create",
        entityType: "saved_view",
        entityId: view.saved_view_id,
        requestId: request.id,
        outcome: "success",
        metadata: { tableId, name, isShared }
      });
      return sendCreated(reply, { ...view, filters, sorts });
    } catch (error) {
      return mapError(request, reply, error);
    }
  });
}

function readUuidArray(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new HttpError(400, "VALIDATION_ERROR", "Expected an array of UUID strings");
  }
  return value;
}

function readPlainObject(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) {
    return {};
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "VALIDATION_ERROR", "Expected an object");
  }
  return value as Record<string, unknown>;
}

function readDensity(value: unknown): string {
  if (value === undefined || value === null) {
    return "comfortable";
  }
  if (value === "compact" || value === "comfortable" || value === "spacious") {
    return value;
  }
  throw new HttpError(400, "VALIDATION_ERROR", "density must be compact, comfortable, or spacious");
}

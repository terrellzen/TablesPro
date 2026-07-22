import type { FastifyInstance } from "fastify";
import { quoteAppDataTable, quoteIdentifier } from "@tablespro/database";
import { pool } from "../db/pool.js";
import { authorizeTable, requireActor } from "./authz.js";
import { writeAuditEvent } from "./audit.js";
import {
  HttpError, mapError, readBodyObject, readRequiredString, readUuidParam, sendOk
} from "./http.js";

type DropdownFieldRow = {
  name: string;
  physical_column_name: string;
  field_type: string;
  options: unknown;
};

export function registerFieldOptionRoutes(app: FastifyInstance): void {
  app.get("/api/tables/:tableId/fields/:fieldId/dropdown-options", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const tableId = readUuidParam(request.params, "tableId");
      const fieldId = readUuidParam(request.params, "fieldId");
      await authorizeTable(actor, tableId, { resource: "field", action: "read" });
      const field = await readDropdownField(tableId, fieldId);
      const column = quoteIdentifier(field.physical_column_name);
      const result = await pool.query<{ value: string; usage_count: number }>(
        `
          SELECT ${column}::text AS value, count(*)::int AS usage_count
          FROM ${quoteAppDataTable(tableId)}
          WHERE deleted_at IS NULL AND ${column} IS NOT NULL AND btrim(${column}::text) <> ''
          GROUP BY ${column}
          ORDER BY usage_count DESC, value ASC
          LIMIT 200
        `
      );
      return sendOk({
        values: result.rows.map((row) => row.value),
        colors: readChoiceColors(field.options)
      });
    } catch (error) {
      return mapError(request, reply, error);
    }
  });

  app.patch("/api/tables/:tableId/fields/:fieldId/dropdown-colors", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const tableId = readUuidParam(request.params, "tableId");
      const fieldId = readUuidParam(request.params, "fieldId");
      const { workspaceId } = await authorizeTable(actor, tableId, { resource: "field", action: "update" });
      await readDropdownField(tableId, fieldId);
      const body = readBodyObject(request);
      const value = readRequiredString(body, "value");
      const color = readRequiredString(body, "color").toLowerCase();
      if (value.length > 1_000) {
        throw new HttpError(400, "VALIDATION_ERROR", "Dropdown value is too long");
      }
      if (!/^#[0-9a-f]{6}$/.test(color)) {
        throw new HttpError(400, "VALIDATION_ERROR", "Dropdown color must be a six-digit hex color");
      }

      const result = await pool.query<{ options: unknown }>(
        `
          UPDATE app.fields
          SET options = jsonb_set(
                options,
                '{choiceColors}',
                COALESCE(options->'choiceColors', '{}'::jsonb) || jsonb_build_object($1::text, $2::text),
                true
              ),
              updated_at = now(),
              updated_by = $3,
              row_version = row_version + 1
          WHERE table_id = $4 AND field_id = $5 AND tombstoned_at IS NULL
          RETURNING options
        `,
        [value, color, actor.userId, tableId, fieldId]
      );
      const options = result.rows[0]?.options;
      if (!options) throw new HttpError(404, "NOT_FOUND", "Dropdown field was not found");

      await writeAuditEvent({
        workspaceId,
        actorUserId: actor.userId,
        action: "field.update",
        entityType: "field",
        entityId: fieldId,
        requestId: request.id,
        outcome: "success",
        metadata: { tableId, dropdownValue: value, color }
      });
      return sendOk({ options });
    } catch (error) {
      return mapError(request, reply, error);
    }
  });
}

async function readDropdownField(tableId: string, fieldId: string): Promise<DropdownFieldRow> {
  const result = await pool.query<DropdownFieldRow>(
    `
      SELECT name, physical_column_name, field_type, options
      FROM app.fields
      WHERE table_id = $1 AND field_id = $2 AND tombstoned_at IS NULL
    `,
    [tableId, fieldId]
  );
  const field = result.rows[0];
  if (!field) throw new HttpError(404, "NOT_FOUND", "Field was not found");
  if (field.field_type !== "single_select") {
    throw new HttpError(400, "VALIDATION_ERROR", "Field is not a Dropdown field");
  }
  return field;
}

function readChoiceColors(options: unknown): Record<string, string> {
  if (!options || typeof options !== "object") return {};
  const colors = (options as { choiceColors?: unknown }).choiceColors;
  if (!colors || typeof colors !== "object" || Array.isArray(colors)) return {};
  return Object.fromEntries(Object.entries(colors).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string" && /^#[0-9a-fA-F]{6}$/.test(entry[1])
  ));
}

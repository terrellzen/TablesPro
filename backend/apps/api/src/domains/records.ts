import type { FastifyInstance } from "fastify";
import type { FilterExpression } from "@tablespro/contracts";
import {
  compileFilter,
  decodeCursor,
  encodeCursor,
  quoteAppDataTable,
  quoteIdentifier
} from "@tablespro/database";
import { pool } from "../db/pool.js";
import { env } from "../env.js";
import { authorizeTable, requireActor } from "./authz.js";
import { writeAuditEvent } from "./audit.js";
import { HttpError, mapError, readBodyObject, readLimit, readOptionalString, readUuidParam, sendCreated, sendOk } from "./http.js";

type FieldRow = {
  field_id: string;
  physical_column_name: string;
  field_type: any;
};

export function registerRecordRoutes(app: FastifyInstance<any, any, any, any, any>): void {
  app.get("/api/tables/:tableId/records", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const tableId = readUuidParam(request.params, "tableId");
      await authorizeTable(actor, tableId, { resource: "record", action: "read" });
      const limit = readLimit(request.query);
      const cursor = readOptionalString(request.query as Record<string, unknown>, "cursor");
      const selectedFieldIds = parseSelectedFields((request.query as Record<string, unknown>).fields);
      const filter = parseFilter((request.query as Record<string, unknown>).filter);

      const fields = await readFields(tableId, selectedFieldIds);
      const selectedColumns = fields.map((field) => quoteIdentifier(field.physical_column_name));
      const selectList = [
        "record_id",
        "created_at",
        "created_by",
        "updated_at",
        "updated_by",
        "row_version",
        ...selectedColumns
      ].join(", ");

      const compiledFilter = compileFilter(
        filter,
        fields.map((field) => ({ fieldId: field.field_id, fieldType: field.field_type }))
      );
      const params = [...compiledFilter.params];
      const keysetSql = cursor ? compileCursorWhere(cursor, tableId, params) : "";
      params.push(limit + 1);

      const result = await pool.query(
        `
          SELECT ${selectList}
          FROM ${quoteAppDataTable(tableId)}
          WHERE deleted_at IS NULL
            AND ${compiledFilter.sql}
            ${keysetSql}
          ORDER BY updated_at DESC, record_id DESC
          LIMIT $${params.length}
        `,
        params
      );

      const rows = result.rows.slice(0, limit);
      const nextCursor =
        result.rows.length > limit && rows.length > 0
          ? encodeCursor(
              {
                tableId,
                recordId: rows[rows.length - 1].record_id,
                sort: [{ fieldId: "updated_at", direction: "desc", value: rows[rows.length - 1].updated_at }]
              },
              env.betterAuthSecret
            )
          : null;

      return {
        data: rows,
        page: {
          nextCursor,
          previousCursor: null,
          hasMore: nextCursor !== null,
          requestedLimit: limit
        }
      };
    } catch (error) {
      return mapError(request, reply, error);
    }
  });

  app.post("/api/tables/:tableId/records", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const tableId = readUuidParam(request.params, "tableId");
      const { workspaceId } = await authorizeTable(actor, tableId, { resource: "record", action: "create" });
      const body = readBodyObject(request);
      const values = readRecordValues(body);
      const fields = await readFields(tableId, Object.keys(values));

      const columns = ["created_by", "updated_by", ...fields.map((field) => quoteIdentifier(field.physical_column_name))];
      const params = [actor.userId, actor.userId, ...fields.map((field) => values[field.field_id])];
      const placeholders = params.map((_, index) => `$${index + 1}`);
      const result = await pool.query(
        `
          INSERT INTO ${quoteAppDataTable(tableId)} (${columns.join(", ")})
          VALUES (${placeholders.join(", ")})
          RETURNING *
        `,
        params
      );
      const record = result.rows[0];

      await writeAuditEvent({
        workspaceId,
        actorUserId: actor.userId,
        action: "record.create",
        entityType: "record",
        entityId: record.record_id,
        requestId: request.id,
        outcome: "success",
        metadata: { tableId, fieldIds: Object.keys(values) }
      });

      return sendCreated(reply, record);
    } catch (error) {
      return mapError(request, reply, error);
    }
  });

  app.patch("/api/tables/:tableId/records/:recordId", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const tableId = readUuidParam(request.params, "tableId");
      const recordId = readUuidParam(request.params, "recordId");
      const { workspaceId } = await authorizeTable(actor, tableId, { resource: "record", action: "update" });
      const body = readBodyObject(request);
      const values = readRecordValues(body);
      const expectedRowVersion = Number(body.rowVersion);
      if (!Number.isInteger(expectedRowVersion) || expectedRowVersion <= 0) {
        throw new HttpError(400, "VALIDATION_ERROR", "rowVersion is required for optimistic concurrency");
      }
      const fields = await readFields(tableId, Object.keys(values));
      if (fields.length === 0) {
        throw new HttpError(400, "VALIDATION_ERROR", "At least one record value is required");
      }

      const params = [...fields.map((field) => values[field.field_id]), actor.userId, recordId, expectedRowVersion];
      const setSql = fields
        .map((field, index) => `${quoteIdentifier(field.physical_column_name)} = $${index + 1}`)
        .join(", ");
      const result = await pool.query(
        `
          UPDATE ${quoteAppDataTable(tableId)}
          SET ${setSql},
              updated_by = $${fields.length + 1},
              updated_at = now(),
              row_version = row_version + 1
          WHERE record_id = $${fields.length + 2}
            AND row_version = $${fields.length + 3}
            AND deleted_at IS NULL
          RETURNING *
        `,
        params
      );

      if (result.rowCount === 0) {
        const current = await pool.query(
          `SELECT record_id, row_version FROM ${quoteAppDataTable(tableId)} WHERE record_id = $1 AND deleted_at IS NULL`,
          [recordId]
        );
        throw new HttpError(409, "CONFLICT", "Record version conflict", current.rows[0] ?? null);
      }

      await writeAuditEvent({
        workspaceId,
        actorUserId: actor.userId,
        action: "record.update",
        entityType: "record",
        entityId: recordId,
        requestId: request.id,
        outcome: "success",
        metadata: { tableId, fieldIds: Object.keys(values) }
      });

      return sendOk(result.rows[0]);
    } catch (error) {
      return mapError(request, reply, error);
    }
  });

  app.delete("/api/tables/:tableId/records/:recordId", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const tableId = readUuidParam(request.params, "tableId");
      const recordId = readUuidParam(request.params, "recordId");
      const { workspaceId } = await authorizeTable(actor, tableId, { resource: "record", action: "delete" });
      await pool.query(
        `
          UPDATE ${quoteAppDataTable(tableId)}
          SET deleted_at = now(), updated_at = now(), updated_by = $2, row_version = row_version + 1
          WHERE record_id = $1 AND deleted_at IS NULL
        `,
        [recordId, actor.userId]
      );
      await writeAuditEvent({
        workspaceId,
        actorUserId: actor.userId,
        action: "record.delete",
        entityType: "record",
        entityId: recordId,
        requestId: request.id,
        outcome: "success",
        metadata: { tableId }
      });
      return reply.status(204).send();
    } catch (error) {
      return mapError(request, reply, error);
    }
  });
}

async function readFields(tableId: string, selectedFieldIds: string[]): Promise<FieldRow[]> {
  const params: unknown[] = [tableId];
  const selectedClause =
    selectedFieldIds.length > 0
      ? `AND field_id = ANY($2::uuid[])`
      : "";
  if (selectedFieldIds.length > 0) {
    params.push(selectedFieldIds);
  }

  const result = await pool.query<FieldRow>(
    `
      SELECT field_id, physical_column_name, field_type
      FROM app.fields
      WHERE table_id = $1
        AND tombstoned_at IS NULL
        ${selectedClause}
      ORDER BY position ASC, field_id ASC
    `,
    params
  );

  if (selectedFieldIds.length > 0 && result.rows.length !== selectedFieldIds.length) {
    throw new HttpError(400, "VALIDATION_ERROR", "One or more selected fields are invalid");
  }
  return result.rows;
}

function parseSelectedFields(value: unknown): string[] {
  if (value === undefined || value === null || value === "") {
    return [];
  }
  if (typeof value !== "string") {
    throw new HttpError(400, "VALIDATION_ERROR", "fields must be a comma-separated string");
  }
  return value.split(",").map((field) => field.trim()).filter(Boolean);
}

function parseFilter(value: unknown): FilterExpression | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new HttpError(400, "VALIDATION_ERROR", "filter must be a JSON-encoded filter AST");
  }
  const parsed = JSON.parse(value) as FilterExpression;
  if (!parsed || typeof parsed !== "object" || !("kind" in parsed)) {
    throw new HttpError(400, "VALIDATION_ERROR", "filter must be a valid filter AST");
  }
  return parsed;
}

function readRecordValues(body: Record<string, unknown>): Record<string, unknown> {
  const values = body.values;
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    throw new HttpError(400, "VALIDATION_ERROR", "values must be an object keyed by field id");
  }
  return values as Record<string, unknown>;
}

function compileCursorWhere(cursor: string, tableId: string, params: unknown[]): string {
  const decoded = decodeCursor(cursor, env.betterAuthSecret);
  if (decoded.tableId !== tableId) {
    throw new HttpError(400, "VALIDATION_ERROR", "Cursor does not belong to this table");
  }
  const updatedAt = decoded.sort.find((sort) => sort.fieldId === "updated_at")?.value;
  params.push(updatedAt, decoded.recordId);
  return `AND (updated_at, record_id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
}

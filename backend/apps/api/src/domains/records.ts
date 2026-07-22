import type { FastifyInstance } from "fastify";
import {
  compileFilter,
  encodeCursor,
  quoteAppDataTable,
  quoteIdentifier
} from "@tablespro/database";
import { pool } from "../db/pool.js";
import { env } from "../env.js";
import { authorizeTable, requireActor } from "./authz.js";
import { writeAuditEvent } from "./audit.js";
import { HttpError, mapError, readBodyObject, readLimit, readOptionalString, readUuidParam, sendCreated, sendOk } from "./http.js";
import {
  compileCursorWhere, compileOrderBy, readFields
} from "./record-query.js";
import { parseFilter, parseSelectedFields, parseSort, readRecordValues } from "./record-input.js";
import { validateRecordValues } from "./field-value.js";

export function registerRecordRoutes(app: FastifyInstance): void {
  app.get("/api/tables/:tableId/records", async (request, reply) => {
    try {
      const actor = await requireActor(request);
      const tableId = readUuidParam(request.params, "tableId");
      await authorizeTable(actor, tableId, { resource: "record", action: "read" });
      const limit = readLimit(request.query);
      const cursor = readOptionalString(request.query as Record<string, unknown>, "cursor");
      const selectedFieldIds = parseSelectedFields((request.query as Record<string, unknown>).fields);
      const filter = parseFilter((request.query as Record<string, unknown>).filter);
      const sort = parseSort((request.query as Record<string, unknown>).sort);

      const fields = await readFields(tableId, selectedFieldIds);
      const selectedColumns = fields.map((field) => quoteIdentifier(field.physical_column_name));
      const selectList = [
        "record_id",
        "created_at",
        "created_by",
        "updated_at",
        "updated_at::text AS updated_at_text",
        "updated_by",
        "row_version",
        ...selectedColumns
      ].join(", ");

      const compiledFilter = compileFilter(
        filter,
        fields.map((field) => ({ fieldId: field.field_id, fieldType: field.field_type }))
      );
      const params = [...compiledFilter.params];
      const keysetSql = cursor ? compileCursorWhere(cursor, tableId, sort, fields, params) : "";
      params.push(limit + 1);
      const orderSql = compileOrderBy(sort, fields);

      const result = await pool.query(
        `
          SELECT ${selectList}
          FROM ${quoteAppDataTable(tableId)}
          WHERE deleted_at IS NULL
            AND ${compiledFilter.sql}
            ${keysetSql}
          ORDER BY ${orderSql}
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
                sort: sort.length > 0
                  ? sort.map((entry) => {
                      const field = fields.find((candidate) => candidate.field_id === entry.fieldId);
                      if (!field) {
                        throw new HttpError(400, "VALIDATION_ERROR", "One or more sort fields are invalid");
                      }
                      return {
                        fieldId: entry.fieldId,
                        direction: entry.direction,
                        value: rows[rows.length - 1][field.physical_column_name]
                      };
                    })
                  : [{ fieldId: "updated_at", direction: "desc", value: rows[rows.length - 1].updated_at_text }]
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
      const validatedValues = validateRecordValues(fields, values);

      const columns = ["created_by", "updated_by", ...fields.map((field) => quoteIdentifier(field.physical_column_name))];
      const params = [actor.userId, actor.userId, ...fields.map((field) => validatedValues[field.field_id])];
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
      const validatedValues = validateRecordValues(fields, values);

      const columnNames = fields.map((field) => quoteIdentifier(field.physical_column_name));
      const beforeResult = await pool.query(
        `SELECT ${columnNames.join(", ")} FROM ${quoteAppDataTable(tableId)} WHERE record_id = $1 AND deleted_at IS NULL`,
        [recordId]
      );
      const beforeRow = beforeResult.rows[0] ?? {};

      const params = [
        ...fields.map((field) => validatedValues[field.field_id]),
        actor.userId,
        recordId,
        expectedRowVersion
      ];
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

      const afterRow = result.rows[0];
      const diff: Record<string, { before: unknown; after: unknown }> = {};
      for (const field of fields) {
        const col = field.physical_column_name;
        const oldVal = beforeRow[col];
        const newVal = afterRow[col];
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          diff[field.name] = { before: oldVal ?? null, after: newVal ?? null };
        }
      }

      await writeAuditEvent({
        workspaceId,
        actorUserId: actor.userId,
        action: "record.update",
        entityType: "record",
        entityId: recordId,
        requestId: request.id,
        outcome: "success",
        diff,
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

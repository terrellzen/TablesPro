import type { FieldType, RecordSort } from "@tablespro/contracts";
import { decodeCursor, quoteIdentifier } from "@tablespro/database";
import { pool } from "../db/pool.js";
import { env } from "../env.js";
import { HttpError } from "./http.js";

export type FieldRow = {
  field_id: string;
  name: string;
  physical_column_name: string;
  field_type: FieldType;
};

export async function readFields(tableId: string, selectedFieldIds: string[]): Promise<FieldRow[]> {
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
      SELECT field_id, name, physical_column_name, field_type
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

export function compileOrderBy(sort: RecordSort[], fields: FieldRow[]): string {
  if (sort.length === 0) {
    return "updated_at DESC, record_id DESC";
  }
  const fieldMap = new Map(fields.map((field) => [field.field_id, field]));
  const clauses = sort.map((entry) => {
    const field = fieldMap.get(entry.fieldId);
    if (!field) {
      throw new HttpError(400, "VALIDATION_ERROR", "One or more sort fields are invalid");
    }
    return `${quoteIdentifier(field.physical_column_name)} ${entry.direction.toUpperCase()} NULLS LAST`;
  });
  return [...clauses, "record_id ASC"].join(", ");
}

export function compileCursorWhere(
  cursor: string,
  tableId: string,
  sort: RecordSort[],
  fields: FieldRow[],
  params: unknown[]
): string {
  const decoded = decodeCursor(cursor, env.betterAuthSecret);
  if (decoded.tableId !== tableId) {
    throw new HttpError(400, "VALIDATION_ERROR", "Cursor does not belong to this table");
  }

  if (sort.length === 0) {
    const updatedAt = decoded.sort.find((entry) => entry.fieldId === "updated_at")?.value;
    if (updatedAt === undefined) {
      throw new HttpError(400, "VALIDATION_ERROR", "Cursor does not match the requested sort");
    }
    params.push(updatedAt, decoded.recordId);
    return `AND (updated_at, record_id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
  }

  const fieldMap = new Map(fields.map((field) => [field.field_id, field]));
  const cursorSort = new Map(decoded.sort.map((entry) => [entry.fieldId, entry]));
  const branches: string[] = [];

  for (let index = 0; index < sort.length; index += 1) {
    const prefix: string[] = [];
    for (let prefixIndex = 0; prefixIndex < index; prefixIndex += 1) {
      const prefixSort = sort[prefixIndex]!;
      const prefixField = fieldMap.get(prefixSort.fieldId);
      const prefixCursor = cursorSort.get(prefixSort.fieldId);
      if (!prefixField || !prefixCursor || prefixCursor.direction !== prefixSort.direction) {
        throw new HttpError(400, "VALIDATION_ERROR", "Cursor does not match the requested sort");
      }
      params.push(prefixCursor.value);
      prefix.push(`${quoteIdentifier(prefixField.physical_column_name)} IS NOT DISTINCT FROM $${params.length}`);
    }

    const entry = sort[index]!;
    const field = fieldMap.get(entry.fieldId);
    const cursorEntry = cursorSort.get(entry.fieldId);
    if (!field || !cursorEntry || cursorEntry.direction !== entry.direction) {
      throw new HttpError(400, "VALIDATION_ERROR", "Cursor does not match the requested sort");
    }
    if (cursorEntry.value === null) {
      continue;
    }
    params.push(cursorEntry.value);
    const column = quoteIdentifier(field.physical_column_name);
    const operator = entry.direction === "asc" ? ">" : "<";
    branches.push([...prefix, `(${column} ${operator} $${params.length} OR ${column} IS NULL)`].join(" AND "));
  }

  const equalPrefix = sort.map((entry) => {
    const field = fieldMap.get(entry.fieldId);
    const cursorEntry = cursorSort.get(entry.fieldId);
    if (!field || !cursorEntry || cursorEntry.direction !== entry.direction) {
      throw new HttpError(400, "VALIDATION_ERROR", "Cursor does not match the requested sort");
    }
    params.push(cursorEntry.value);
    return `${quoteIdentifier(field.physical_column_name)} IS NOT DISTINCT FROM $${params.length}`;
  });
  params.push(decoded.recordId);
  branches.push([...equalPrefix, `record_id > $${params.length}::uuid`].join(" AND "));
  return `AND (${branches.map((branch) => `(${branch})`).join(" OR ")})`;
}

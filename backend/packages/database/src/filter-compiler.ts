import type { FieldType, FilterExpression, FilterOperator } from "@tablespro/contracts";
import { quoteIdentifier, toPhysicalFieldName } from "./safe-identifiers.js";

export type FieldCatalogEntry = {
  fieldId: string;
  fieldType: FieldType;
};

export type CompiledFilter = {
  sql: string;
  params: unknown[];
};

export function compileFilter(expression: FilterExpression | undefined, fields: FieldCatalogEntry[]): CompiledFilter {
  if (!expression) {
    return { sql: "TRUE", params: [] };
  }

  const params: unknown[] = [];
  const fieldMap = new Map(fields.map((field) => [field.fieldId, field]));
  const sql = compileExpression(expression, fieldMap, params);
  return { sql, params };
}

function compileExpression(
  expression: FilterExpression,
  fields: Map<string, FieldCatalogEntry>,
  params: unknown[]
): string {
  if (expression.kind === "group") {
    if (expression.children.length === 0) {
      return "TRUE";
    }

    const operator = expression.conjunction === "and" ? " AND " : " OR ";
    return `(${expression.children.map((child) => compileExpression(child, fields, params)).join(operator)})`;
  }

  const field = fields.get(expression.fieldId);
  if (!field) {
    throw new Error(`Unknown filter field: ${expression.fieldId}`);
  }

  assertOperatorAllowed(field.fieldType, expression.operator);
  const column = quoteIdentifier(toPhysicalFieldName(field.fieldId));

  switch (expression.operator) {
    case "equals":
      return withParam(`${column} =`, expression.value, params);
    case "not_equals":
      return withParam(`${column} <>`, expression.value, params);
    case "contains":
      return withParam(`${column} ILIKE`, `%${String(expression.value ?? "")}%`, params);
    case "starts_with":
      return withParam(`${column} ILIKE`, `${String(expression.value ?? "")}%`, params);
    case "gt":
    case "after":
      return withParam(`${column} >`, expression.value, params);
    case "gte":
      return withParam(`${column} >=`, expression.value, params);
    case "lt":
    case "before":
      return withParam(`${column} <`, expression.value, params);
    case "lte":
      return withParam(`${column} <=`, expression.value, params);
    case "is_empty":
      return `(${column} IS NULL OR ${column}::text = '')`;
    case "is_not_empty":
      return `(${column} IS NOT NULL AND ${column}::text <> '')`;
    case "is_any_of": {
      if (!Array.isArray(expression.value)) {
        throw new Error("is_any_of filters require an array value");
      }
      params.push(expression.value);
      return `${column} = ANY($${params.length})`;
    }
  }
}

function withParam(prefix: string, value: unknown, params: unknown[]): string {
  params.push(value);
  return `${prefix} $${params.length}`;
}

function assertOperatorAllowed(fieldType: FieldType, operator: FilterOperator): void {
  const textOperators: FilterOperator[] = [
    "equals",
    "not_equals",
    "contains",
    "starts_with",
    "is_empty",
    "is_not_empty",
    "is_any_of"
  ];
  const orderedOperators: FilterOperator[] = [
    "equals",
    "not_equals",
    "gt",
    "gte",
    "lt",
    "lte",
    "before",
    "after",
    "is_empty",
    "is_not_empty",
    "is_any_of"
  ];
  const booleanOperators: FilterOperator[] = ["equals", "not_equals", "is_empty", "is_not_empty"];

  const allowed =
    fieldType === "boolean"
      ? booleanOperators
      : fieldType === "short_text" ||
          fieldType === "long_text" ||
          fieldType === "email" ||
          fieldType === "url" ||
          fieldType === "phone" ||
          fieldType === "single_select"
        ? textOperators
        : orderedOperators;

  if (!allowed.includes(operator)) {
    throw new Error(`${operator} is not allowed for ${fieldType} fields`);
  }
}

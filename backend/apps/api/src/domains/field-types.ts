import type { FieldType } from "@tablespro/contracts";
import { HttpError } from "./http.js";

export const fieldTypes: readonly FieldType[] = [
  "short_text",
  "long_text",
  "integer",
  "decimal",
  "currency",
  "percentage",
  "boolean",
  "date",
  "timestamp_tz",
  "single_select",
  "multiple_select",
  "email",
  "url",
  "phone",
  "user_reference"
];

export function parseFieldType(value: unknown): FieldType {
  if (typeof value !== "string" || !fieldTypes.includes(value as FieldType)) {
    throw new HttpError(400, "VALIDATION_ERROR", "fieldType is invalid");
  }
  return value as FieldType;
}

export function fieldTypeToSql(fieldType: FieldType): string {
  switch (fieldType) {
    case "short_text":
    case "email":
    case "url":
    case "phone":
    case "single_select":
    case "user_reference":
      return "text";
    case "long_text":
      return "text";
    case "integer":
      return "bigint";
    case "decimal":
    case "currency":
    case "percentage":
      return "numeric";
    case "boolean":
      return "boolean";
    case "date":
      return "date";
    case "timestamp_tz":
      return "timestamptz";
    case "multiple_select":
      return "text[]";
  }
}

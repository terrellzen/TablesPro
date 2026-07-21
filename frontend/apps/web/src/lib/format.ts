import type { FieldType } from "../types/domain.js";

export function coerceFieldValue(value: string, fieldType: FieldType): unknown {
  if (value === "") return null;
  if (fieldType === "integer") return Number.parseInt(value, 10);
  if (fieldType === "decimal" || fieldType === "currency" || fieldType === "percentage") return Number(value);
  if (fieldType === "boolean") return value === "true" || value === "1" || value.toLowerCase() === "yes";
  return value;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

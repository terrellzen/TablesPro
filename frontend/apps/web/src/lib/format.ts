import type { FieldType } from "../types/domain.js";

export function coerceFieldValue(value: string, fieldType: FieldType): unknown {
  if (value === "") return null;
  if (fieldType === "integer") return Number.parseInt(value, 10);
  if (fieldType === "decimal" || fieldType === "currency" || fieldType === "percentage") return Number(value);
  if (fieldType === "boolean") return value === "true" || value === "1" || value.toLowerCase() === "yes";
  if (fieldType === "single_select") return value.trim() || null;
  if (fieldType === "url" || fieldType === "email") return value.trim() || null;
  return value;
}

export function fieldValueForInput(value: unknown, fieldType: FieldType): string {
  const text = String(value ?? "");
  if (fieldType === "date" && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(text)) return text.slice(0, 10);
  return text;
}

export function fieldValueChanged(draftValue: string, storedValue: unknown, fieldType: FieldType): boolean {
  const displayedValue = fieldValueForInput(storedValue, fieldType);
  if (draftValue === displayedValue) return false;

  const nextValue = coerceFieldValue(draftValue, fieldType);
  const currentValue = typeof storedValue === "string"
    ? coerceFieldValue(storedValue, fieldType)
    : storedValue ?? null;
  return !Object.is(nextValue, currentValue);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

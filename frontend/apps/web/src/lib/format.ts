import type { FieldType } from "../types/domain.js";

export function coerceFieldValue(value: string, fieldType: FieldType): unknown {
  if (value === "") return null;
  if (fieldType === "integer") {
    const trimmed = value.trim();
    if (!/^-?\d+$/.test(trimmed)) throw new Error("Enter a valid whole number without a decimal point");
    const number = Number(trimmed);
    if (!Number.isSafeInteger(number)) throw new Error("Enter a valid whole number");
    return number;
  }
  if (fieldType === "decimal" || fieldType === "currency" || fieldType === "percentage") {
    const number = Number(value.trim());
    if (!Number.isFinite(number)) throw new Error("Enter a valid number using a decimal point");
    return number;
  }
  if (fieldType === "boolean") return value === "true" || value === "1" || value.toLowerCase() === "yes";
  if (fieldType === "single_select") return value.trim() || null;
  if (fieldType === "multiple_select") {
    return [...new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean))];
  }
  if (fieldType === "url") return normalizeHttpUrl(value);
  if (fieldType === "email") return value.trim() || null;
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

export function auditObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export function auditValueForDisplay(value: unknown): string {
  if (value === null || value === undefined) return "(not set)";
  if (typeof value === "string" && value.trim() === "") return "(blank)";
  if (Array.isArray(value) && value.length === 0) return "(no selections)";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

export function numericInputPattern(fieldType: FieldType): string | undefined {
  if (fieldType === "integer") return "-?\\d+";
  if (["decimal", "currency", "percentage"].includes(fieldType)) {
    return "-?(?:\\d+(?:\\.\\d*)?|\\.\\d+)";
  }
  return undefined;
}

export function numericInputTitle(fieldType: FieldType): string | undefined {
  if (fieldType === "integer") return "Enter a whole number without a decimal point, for example 42.";
  if (["decimal", "currency", "percentage"].includes(fieldType)) {
    return "Enter a valid number using a decimal point, for example 19.99.";
  }
  return undefined;
}

function normalizeHttpUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname) throw new Error();
    return candidate;
  } catch {
    throw new Error("Enter a valid HTTP or HTTPS URL");
  }
}

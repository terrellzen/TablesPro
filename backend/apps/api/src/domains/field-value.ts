import type { FieldType } from "@tablespro/contracts";
import { HttpError } from "./http.js";

export type ValueField = {
  field_id: string;
  field_type: FieldType;
};

export function validateRecordValues(
  fields: ValueField[],
  values: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [
    field.field_id,
    validateFieldValue(values[field.field_id], field.field_type)
  ]));
}

export function validateFieldValue(value: unknown, fieldType: FieldType): unknown {
  if (value === null) return null;

  switch (fieldType) {
    case "boolean":
      if (typeof value !== "boolean") invalid(fieldType, "a boolean");
      return value;
    case "integer":
      if (typeof value !== "number" || !Number.isSafeInteger(value)) invalid(fieldType, "a safe integer");
      return value;
    case "decimal":
    case "currency":
    case "percentage":
      if (typeof value !== "number" || !Number.isFinite(value)) invalid(fieldType, "a finite number");
      return value;
    case "date":
      return validateDate(value);
    case "timestamp_tz":
      return validateTimestamp(value);
    case "multiple_select":
      return validateMultipleSelect(value);
    case "url":
      return validateUrl(value);
    case "email":
      return validateText(value, fieldType, 320, /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    case "short_text":
    case "phone":
    case "user_reference":
      return validateText(value, fieldType, 1_000);
    case "single_select": {
      const option = validateText(value, fieldType, 1_000).trim();
      return option === "" ? null : option;
    }
    case "long_text":
      return validateText(value, fieldType, 100_000);
  }
}

function validateText(value: unknown, fieldType: FieldType, maxLength: number, pattern?: RegExp): string {
  if (typeof value !== "string") invalid(fieldType, "text");
  if (value.length > maxLength) invalid(fieldType, `text no longer than ${maxLength} characters`);
  if (pattern && value !== "" && !pattern.test(value)) invalid(fieldType, "a valid value");
  return value;
}

function validateDate(value: unknown): string {
  const text = validateText(value, "date", 10);
  const parsed = new Date(`${text}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== text) {
    invalid("date", "a valid YYYY-MM-DD date");
  }
  return text;
}

function validateTimestamp(value: unknown): string {
  const text = validateText(value, "timestamp_tz", 64);
  if (Number.isNaN(Date.parse(text))) invalid("timestamp_tz", "a valid timestamp");
  return text;
}

function validateMultipleSelect(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 100) invalid("multiple_select", "an array of at most 100 values");
  const entries = value.map((entry) => validateText(entry, "multiple_select", 1_000));
  if (new Set(entries).size !== entries.length) invalid("multiple_select", "an array of unique values");
  return entries;
}

function validateUrl(value: unknown): string {
  const text = validateText(value, "url", 2_048);
  if (text === "") return text;
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") invalid("url", "an HTTP or HTTPS URL");
  } catch {
    invalid("url", "a valid URL");
  }
  return text;
}

function invalid(fieldType: FieldType, expected: string): never {
  throw new HttpError(400, "VALIDATION_ERROR", `${fieldType} field value must be ${expected}`);
}

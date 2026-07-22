import type { FilterExpression, RecordSort } from "@tablespro/contracts";
import { HttpError } from "./http.js";

export function parseSelectedFields(value: unknown): string[] {
  if (value === undefined || value === null || value === "") return [];
  if (typeof value !== "string") {
    throw new HttpError(400, "VALIDATION_ERROR", "fields must be a comma-separated string");
  }
  return value.split(",").map((field) => field.trim()).filter(Boolean);
}

export function parseFilter(value: unknown): FilterExpression | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new HttpError(400, "VALIDATION_ERROR", "filter must be a JSON-encoded filter AST");
  }
  const parsed = parseJson(value, "filter") as FilterExpression;
  if (!parsed || typeof parsed !== "object" || !("kind" in parsed)) {
    throw new HttpError(400, "VALIDATION_ERROR", "filter must be a valid filter AST");
  }
  return parsed;
}

export function parseSort(value: unknown): RecordSort[] {
  if (value === undefined || value === null || value === "") return [];
  if (typeof value !== "string") {
    throw new HttpError(400, "VALIDATION_ERROR", "sort must be a JSON-encoded sort list");
  }
  const parsed = parseJson(value, "sort");
  if (!Array.isArray(parsed)) {
    throw new HttpError(400, "VALIDATION_ERROR", "sort must be an array");
  }
  return parsed.map((entry: unknown) => {
    if (!entry || typeof entry !== "object") {
      throw new HttpError(400, "VALIDATION_ERROR", "sort fieldId is required");
    }
    const sort = entry as { fieldId?: unknown; direction?: unknown };
    if (typeof sort.fieldId !== "string") {
      throw new HttpError(400, "VALIDATION_ERROR", "sort fieldId is required");
    }
    if (sort.direction !== "asc" && sort.direction !== "desc") {
      throw new HttpError(400, "VALIDATION_ERROR", "sort direction must be asc or desc");
    }
    return { fieldId: sort.fieldId, direction: sort.direction };
  });
}

export function readRecordValues(body: Record<string, unknown>): Record<string, unknown> {
  const values = body.values;
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    throw new HttpError(400, "VALIDATION_ERROR", "values must be an object keyed by field id");
  }
  return values as Record<string, unknown>;
}

function parseJson(value: string, parameter: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new HttpError(400, "VALIDATION_ERROR", `${parameter} must contain valid JSON`);
  }
}

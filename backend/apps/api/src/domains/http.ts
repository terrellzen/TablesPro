import type { FastifyReply, FastifyRequest } from "fastify";
import type { ApiError, ApiErrorCode } from "@tablespro/contracts";

export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly details?: unknown;

  constructor(statusCode: number, code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function sendCreated<T>(reply: FastifyReply, data: T) {
  return reply.status(201).send({ data });
}

export function sendOk<T>(data: T) {
  return { data };
}

export function mapError(request: FastifyRequest, reply: FastifyReply, error: unknown) {
  if (error instanceof HttpError) {
    return reply.status(error.statusCode).send(toApiError(error.code, error.message, request.id, error.details));
  }

  if (error instanceof Error && "code" in error && error.code === "PERMISSION_DENIED") {
    return reply.status(403).send(toApiError("FORBIDDEN", error.message, request.id));
  }

  request.log.error({ error }, "Unhandled API error");
  return reply.status(500).send(toApiError("INTERNAL_ERROR", "Internal server error", request.id));
}

function toApiError(code: ApiErrorCode, message: string, requestId: string, details?: unknown): ApiError {
  return { code, message, requestId, details };
}

export function readBodyObject(request: FastifyRequest): Record<string, unknown> {
  if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) {
    throw new HttpError(400, "BAD_REQUEST", "Request body must be an object");
  }
  return request.body as Record<string, unknown>;
}

export function readRequiredString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpError(400, "VALIDATION_ERROR", `${key} is required`);
  }
  return value.trim();
}

export function readOptionalString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new HttpError(400, "VALIDATION_ERROR", `${key} must be a string`);
  }
  return value.trim();
}

export function readUuidParam(params: unknown, key: string): string {
  const value = (params as Record<string, unknown>)[key];
  const uuidPattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    throw new HttpError(400, "VALIDATION_ERROR", `${key} must be a UUID`);
  }
  return value;
}

export function readOptionalUuid(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  if (value === undefined || value === null || value === "") return null;
  return readUuidParam(source, key);
}

export function readLimit(query: unknown, fallback = 100, max = 500): number {
  const raw = (query as Record<string, unknown>).limit;
  if (raw === undefined) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new HttpError(400, "VALIDATION_ERROR", "limit must be a positive integer");
  }
  return Math.min(value, max);
}

export function requireReturnedRow<T>(row: T | undefined, message: string): T {
  if (!row) {
    throw new HttpError(500, "INTERNAL_ERROR", message);
  }
  return row;
}

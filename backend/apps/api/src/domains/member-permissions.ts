import type { AuthorizationRole, Permission, PermissionOverride, WorkspaceRole } from "@tablespro/permissions";
import { HttpError } from "./http.js";

export type AccessLevel = "read" | "edit" | "admin";
export type TableGrant = { table?: AccessLevel; record?: AccessLevel };
export type MemberPermissions = {
  workspace: AccessLevel | null;
  bases: Record<string, AccessLevel>;
  tables: Record<string, TableGrant>;
};

const levels: AccessLevel[] = ["read", "edit", "admin"];

export function parseMemberPermissions(value: unknown): MemberPermissions {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const input = value as Record<string, unknown>;
  const workspace = input.workspace === null ? null : readLevel(input.workspace);
  return {
    workspace,
    bases: readLevelRecord(input.bases),
    tables: readTableRecord(input.tables)
  };
}

export function legacyPermissions(role: WorkspaceRole): MemberPermissions {
  return { workspace: role === "admin" ? "admin" : role === "editor" ? "edit" : "read", bases: {}, tables: {} };
}

export function workspaceRoleFor(permissions: MemberPermissions): AuthorizationRole {
  if (permissions.workspace === "admin") return "admin";
  if (permissions.workspace === "edit") return "editor";
  if (permissions.workspace === "read") return "viewer";
  return "restricted";
}

export function storedRoleFor(permissions: MemberPermissions): WorkspaceRole {
  const role = workspaceRoleFor(permissions);
  return role === "restricted" ? "viewer" : role;
}

export function baseOverride(level: AccessLevel | undefined): PermissionOverride | undefined {
  return level ? { allow: grantsForBase(level) } : undefined;
}

export function tableOverride(grant: TableGrant | undefined): PermissionOverride | undefined {
  if (!grant) return undefined;
  return { allow: [...grantsForTable(grant.table), ...grantsForRecords(grant.record)] };
}

export function hasDestructiveAccess(permissions: MemberPermissions): boolean {
  return permissions.workspace === "edit" || permissions.workspace === "admin" ||
    Object.values(permissions.bases).some((level) => level === "edit" || level === "admin") ||
    Object.values(permissions.tables).some((grant) => grant.table === "edit" || grant.table === "admin" || grant.record === "edit" || grant.record === "admin");
}

function grantsForBase(level: AccessLevel): Permission[] {
  const read = permissions(["base:read", "table:read", "field:read", "view:read", "record:read", "record:export"]);
  if (level === "read") return read;
  const edit = permissions(["table:create", "table:update", "table:delete", "table:manageSchema", "field:create", "field:update", "field:delete", "view:create", "view:update", "view:delete", "record:create", "record:update", "record:delete", "record:bulkUpdate", "record:import"]);
  return [...read, ...edit, permission("base:update"), permission("base:delete")];
}

function grantsForTable(level: AccessLevel | undefined): Permission[] {
  if (!level) return [];
  const read = permissions(["table:read", "field:read", "view:read", "record:read", "record:export"]);
  if (level === "read") return read;
  const edit = permissions(["table:update", "table:delete", "table:manageSchema", "field:create", "field:update", "field:delete", "view:create", "view:update", "view:delete", "record:create", "record:update", "record:delete", "record:bulkUpdate", "record:import"]);
  return [...read, ...edit];
}

function grantsForRecords(level: AccessLevel | undefined): Permission[] {
  if (!level) return [];
  const metadata = permissions(["table:read", "field:read", "view:read", "record:read"]);
  if (level === "read") return metadata;
  const edit = permissions(["record:create", "record:update", "record:delete"]);
  return [...metadata, ...edit];
}

function permissions(values: string[]): Permission[] {
  return values.map(permission);
}

function permission(value: string): Permission {
  const [resource, action] = value.split(":");
  return { resource, action } as Permission;
}

function readLevel(value: unknown): AccessLevel {
  if (typeof value !== "string" || !levels.includes(value as AccessLevel)) invalid();
  return value as AccessLevel;
}

function readResourceLevel(value: unknown): AccessLevel {
  const level = readLevel(value);
  return level === "admin" ? "edit" : level;
}

function readLevelRecord(value: unknown): Record<string, AccessLevel> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return Object.fromEntries(Object.entries(value).map(([id, level]) => [readUuid(id), readResourceLevel(level)]));
}

function readTableRecord(value: unknown): Record<string, TableGrant> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return Object.fromEntries(Object.entries(value).map(([id, grant]) => {
    if (!grant || typeof grant !== "object" || Array.isArray(grant)) invalid();
    const entry = grant as Record<string, unknown>;
    if (entry.table === undefined && entry.record === undefined) invalid();
    return [readUuid(id), {
      ...(entry.table === undefined ? {} : { table: readResourceLevel(entry.table) }),
      ...(entry.record === undefined ? {} : { record: readResourceLevel(entry.record) })
    }];
  }));
}

function readUuid(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) invalid();
  return value;
}

function invalid(): never {
  throw new HttpError(400, "VALIDATION_ERROR", "permissions must contain valid workspace, base, table, and record access levels");
}

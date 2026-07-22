import type {
  AccessLevel, AppTable, Base, MemberPermissions, WorkspaceMember
} from "../../types/domain.js";

export const accessLevels: AccessLevel[] = ["read", "edit", "admin"];

export function permissionsForMember(member?: WorkspaceMember): MemberPermissions {
  if (member?.permissions) return structuredClone(member.permissions);
  const workspace = member?.role === "admin" ? "admin" : member?.role === "editor" ? "edit" : "read";
  return { workspace, bases: {}, tables: {} };
}

export function inheritedBaseAccess(permissions: MemberPermissions): AccessLevel | null {
  return permissions.workspace;
}

export function inheritedTableAccess(permissions: MemberPermissions, baseId: string): AccessLevel | null {
  return maxAccess(permissions.workspace, permissions.bases[baseId]);
}

export function inheritedRecordAccess(
  permissions: MemberPermissions,
  baseId: string,
  tableId: string
): AccessLevel | null {
  return maxAccess(
    permissions.workspace,
    permissions.bases[baseId],
    permissions.tables[tableId]?.table
  );
}

export function setBaseAccess(permissions: MemberPermissions, baseId: string, level: AccessLevel | null): MemberPermissions {
  const bases = { ...permissions.bases };
  if (level) bases[baseId] = level;
  else delete bases[baseId];
  return { ...permissions, bases };
}

export function setTableAccess(
  permissions: MemberPermissions,
  tableId: string,
  scope: "table" | "record",
  level: AccessLevel | null
): MemberPermissions {
  const tables = { ...permissions.tables };
  const grant = { ...tables[tableId] };
  if (level) grant[scope] = level;
  else delete grant[scope];
  if (grant.table || grant.record) tables[tableId] = grant;
  else delete tables[tableId];
  return { ...permissions, tables };
}

export function accessSummary(permissions: MemberPermissions, bases: Base[], tables: AppTable[]): string {
  if (permissions.workspace === "admin") return "Workspace administrator";
  if (permissions.workspace === "edit") return "Can manage all tables and records in this workspace";
  if (permissions.workspace === "read" && Object.keys(permissions.bases).length + Object.keys(permissions.tables).length === 0) {
    return "Can view the entire workspace";
  }
  const managedBases = bases.filter((base) => rank(permissions.bases[base.base_id]) >= rank("edit"));
  if (managedBases.length === 1) return `Can manage all tables in ${managedBases[0]!.name}`;
  const editableTables = tables.filter((table) => rank(effectiveRecordAccess(permissions, table)) >= rank("edit"));
  if (editableTables.length > 0) return `Can edit records in ${editableTables.length} table${editableTables.length === 1 ? "" : "s"}`;
  const readableTables = tables.filter((table) => rank(effectiveRecordAccess(permissions, table)) >= rank("read"));
  return readableTables.length > 0
    ? `Can view records in ${readableTables.length} table${readableTables.length === 1 ? "" : "s"}`
    : "No base, table, or record access assigned";
}

export function isDestructive(permissions: MemberPermissions): boolean {
  return permissions.workspace === "edit" || permissions.workspace === "admin" ||
    Object.values(permissions.bases).some((level) => level === "edit" || level === "admin") ||
    Object.values(permissions.tables).some((grant) => grant.table === "edit" || grant.table === "admin" || grant.record === "admin");
}

export function rank(level: AccessLevel | null | undefined): number {
  return level ? accessLevels.indexOf(level) + 1 : 0;
}

function maxAccess(...levels: (AccessLevel | null | undefined)[]): AccessLevel | null {
  return levels.reduce<AccessLevel | null>((highest, level) => rank(level) > rank(highest) ? level! : highest, null);
}

function effectiveRecordAccess(permissions: MemberPermissions, table: AppTable): AccessLevel | null {
  return maxAccess(inheritedRecordAccess(permissions, table.base_id, table.table_id), permissions.tables[table.table_id]?.record);
}

export const workspaceRoles = ["owner", "admin", "editor", "commenter", "viewer"] as const;
export type WorkspaceRole = (typeof workspaceRoles)[number];

export const appPermissions = {
  workspace: ["read", "update", "delete"],
  member: ["read", "create", "update", "delete"],
  invitation: ["read", "create", "cancel"],
  base: ["read", "create", "update", "delete", "share"],
  table: ["read", "create", "update", "delete", "manageSchema"],
  field: ["read", "create", "update", "delete"],
  view: ["read", "create", "update", "delete"],
  record: ["read", "create", "update", "delete", "bulkUpdate", "import", "export"],
  audit: ["read"]
} as const;

export type PermissionResource = keyof typeof appPermissions;
export type PermissionAction<R extends PermissionResource = PermissionResource> =
  (typeof appPermissions)[R][number];

export type Permission = {
  [R in PermissionResource]: {
    resource: R;
    action: PermissionAction<R>;
  };
}[PermissionResource];

export type PermissionOverride = {
  role?: WorkspaceRole;
  allow?: Permission[];
  deny?: Permission[];
};

export type AuthorizationSubject = {
  workspaceRole: WorkspaceRole;
  baseOverride?: PermissionOverride | undefined;
  tableOverride?: PermissionOverride | undefined;
};

const rolePermissions = {
  owner: [
    "*:*"
  ],
  admin: [
    "workspace:read",
    "workspace:update",
    "member:read",
    "member:create",
    "member:update",
    "member:delete",
    "invitation:read",
    "invitation:create",
    "invitation:cancel",
    "base:*",
    "table:*",
    "field:*",
    "view:*",
    "record:*",
    "audit:read"
  ],
  editor: [
    "workspace:read",
    "member:read",
    "invitation:read",
    "base:read",
    "base:create",
    "base:update",
    "table:read",
    "table:create",
    "table:update",
    "table:manageSchema",
    "field:*",
    "view:*",
    "record:*"
  ],
  commenter: [
    "workspace:read",
    "member:read",
    "base:read",
    "table:read",
    "field:read",
    "view:read",
    "record:read",
    "record:update"
  ],
  viewer: [
    "workspace:read",
    "member:read",
    "base:read",
    "table:read",
    "field:read",
    "view:read",
    "record:read",
    "record:export"
  ]
} as const satisfies Record<WorkspaceRole, readonly string[]>;

export function can(role: WorkspaceRole, permission: Permission): boolean {
  const grants = rolePermissions[role];
  return grants.some((grant) => grantMatches(grant, permission));
}

export function isAllowed(subject: AuthorizationSubject, permission: Permission): boolean {
  if (matchesOverride(subject.tableOverride?.deny, permission)) {
    return false;
  }

  if (matchesOverride(subject.baseOverride?.deny, permission)) {
    return false;
  }

  if (matchesOverride(subject.tableOverride?.allow, permission)) {
    return true;
  }

  if (matchesOverride(subject.baseOverride?.allow, permission)) {
    return true;
  }

  const effectiveRole =
    subject.tableOverride?.role ?? subject.baseOverride?.role ?? subject.workspaceRole;

  return can(effectiveRole, permission);
}

export function assertAllowed(subject: AuthorizationSubject, permission: Permission): void {
  if (!isAllowed(subject, permission)) {
    throw new PermissionDeniedError(permission);
  }
}

export class PermissionDeniedError extends Error {
  readonly code = "PERMISSION_DENIED";
  readonly permission: Permission;

  constructor(permission: Permission) {
    super(`Permission denied for ${permission.resource}:${permission.action}`);
    this.name = "PermissionDeniedError";
    this.permission = permission;
  }
}

function matchesOverride(overrides: readonly Permission[] | undefined, permission: Permission): boolean {
  return overrides?.some((override) => samePermission(override, permission)) ?? false;
}

function samePermission(left: Permission, right: Permission): boolean {
  return left.resource === right.resource && left.action === right.action;
}

function grantMatches(grant: string, permission: Permission): boolean {
  const [resource, action] = grant.split(":");
  return (resource === "*" || resource === permission.resource) && (action === "*" || action === permission.action);
}

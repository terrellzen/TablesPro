import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/organization/access";
import { appPermissions } from "./rbac.js";

export const accessStatement = {
  ...defaultStatements,
  workspace: appPermissions.workspace,
  base: appPermissions.base,
  table: appPermissions.table,
  field: appPermissions.field,
  view: appPermissions.view,
  record: appPermissions.record,
  audit: appPermissions.audit
} as const;

export const ac = createAccessControl(accessStatement);

export const admin = ac.newRole({
  organization: ["update"],
  member: ["create", "update", "delete"],
  invitation: [],
  workspace: ["read", "update"],
  base: ["read", "create", "update", "delete", "share"],
  table: ["read", "create", "update", "delete", "manageSchema"],
  field: ["read", "create", "update", "delete"],
  view: ["read", "create", "update", "delete"],
  record: ["read", "create", "update", "delete", "bulkUpdate", "import", "export"],
  audit: ["read"]
});

export const editor = ac.newRole({
  organization: [],
  member: [],
  invitation: [],
  workspace: ["read"],
  base: ["read"],
  table: ["read"],
  field: ["read"],
  view: ["read", "create", "update"],
  record: ["read", "create", "update", "delete", "bulkUpdate", "import", "export"],
  audit: []
});

export const viewer = ac.newRole({
  organization: [],
  member: [],
  invitation: [],
  workspace: ["read"],
  base: ["read"],
  table: ["read"],
  field: ["read"],
  view: ["read"],
  record: ["read", "export"],
  audit: []
});

export const organizationRoles = {
  admin,
  editor,
  viewer
};

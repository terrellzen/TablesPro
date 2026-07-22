import { describe, expect, it } from "vitest";
import { isAllowed } from "@tablespro/permissions";
import { HttpError } from "../../apps/api/src/domains/http.js";
import {
  baseOverride, hasDestructiveAccess, parseMemberPermissions, tableOverride,
  workspaceRoleFor
} from "../../apps/api/src/domains/member-permissions.js";

const baseId = "11111111-1111-4111-8111-111111111111";
const tableId = "22222222-2222-4222-8222-222222222222";

describe("hierarchical member permissions", () => {
  it("parses selected resource grants and uses a restricted workspace baseline", () => {
    const permissions = parseMemberPermissions({
      workspace: null,
      bases: { [baseId]: "read" },
      tables: { [tableId]: { record: "edit" } }
    });
    expect(workspaceRoleFor(permissions)).toBe("restricted");
    expect(permissions.tables[tableId]?.record).toBe("edit");
  });

  it("allows base edit without workspace administration", () => {
    const subject = { workspaceRole: "restricted" as const, baseOverride: baseOverride("edit") };
    expect(isAllowed(subject, { resource: "table", action: "delete" })).toBe(true);
    expect(isAllowed(subject, { resource: "workspace", action: "delete" })).toBe(false);
    expect(isAllowed(subject, { resource: "member", action: "update" })).toBe(false);
  });

  it("keeps table edit separate from table and record deletion", () => {
    const edit = { workspaceRole: "restricted" as const, tableOverride: tableOverride({ table: "edit" }) };
    const admin = { workspaceRole: "restricted" as const, tableOverride: tableOverride({ table: "admin" }) };
    expect(isAllowed(edit, { resource: "field", action: "update" })).toBe(true);
    expect(isAllowed(edit, { resource: "record", action: "delete" })).toBe(false);
    expect(isAllowed(edit, { resource: "table", action: "delete" })).toBe(false);
    expect(isAllowed(admin, { resource: "record", action: "delete" })).toBe(true);
    expect(isAllowed(admin, { resource: "table", action: "delete" })).toBe(true);
  });

  it("keeps record grants from changing table structure", () => {
    const subject = { workspaceRole: "restricted" as const, tableOverride: tableOverride({ record: "admin" }) };
    expect(isAllowed(subject, { resource: "record", action: "delete" })).toBe(true);
    expect(isAllowed(subject, { resource: "field", action: "update" })).toBe(false);
  });

  it("rejects malformed resource identifiers and detects destructive grants", () => {
    expect(() => parseMemberPermissions({ workspace: null, bases: { nope: "read" }, tables: {} })).toThrow(HttpError);
    expect(hasDestructiveAccess({ workspace: null, bases: { [baseId]: "edit" }, tables: {} })).toBe(true);
  });
});

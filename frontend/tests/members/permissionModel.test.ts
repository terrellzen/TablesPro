import { describe, expect, it } from "vitest";
import type { AppTable, Base, MemberPermissions } from "../../apps/web/src/types/domain.js";
import {
  accessSummary, inheritedRecordAccess, inheritedTableAccess, normalizePermissions,
  permissionsForMember, setTableAccess
} from "../../apps/web/src/features/members/permissionModel.js";

const base = { base_id: "base-1", workspace_id: "workspace-1", name: "Marketing" } as Base;
const tables = [
  { table_id: "table-1", base_id: base.base_id, name: "Campaigns" },
  { table_id: "table-2", base_id: base.base_id, name: "Leads" }
] as AppTable[];

describe("permission model", () => {
  it("shows inherited workspace and base access", () => {
    const permissions: MemberPermissions = { workspace: "read", bases: { [base.base_id]: "edit" }, tables: {} };
    expect(inheritedTableAccess(permissions, base.base_id)).toBe("edit");
    expect(inheritedRecordAccess(permissions, base.base_id, tables[0]!.table_id)).toBe("edit");
  });

  it("keeps table and record assignments independent", () => {
    const initial: MemberPermissions = { workspace: null, bases: {}, tables: {} };
    const tableGrant = setTableAccess(initial, tables[0]!.table_id, "table", "read");
    const both = setTableAccess(tableGrant, tables[0]!.table_id, "record", "edit");
    expect(both.tables[tables[0]!.table_id]).toEqual({ table: "read", record: "edit" });
  });

  it("builds concise summaries", () => {
    expect(accessSummary({ workspace: "admin", bases: {}, tables: {} }, [base], tables)).toBe("Workspace administrator");
    expect(accessSummary({ workspace: null, bases: { [base.base_id]: "edit" }, tables: {} }, [base], tables))
      .toBe("Can manage all tables in Marketing");
  });

  it("normalizes older permission payloads with missing maps", () => {
    expect(normalizePermissions({ workspace: "read" })).toEqual({
      workspace: "read",
      bases: {},
      tables: {}
    });
    expect(normalizePermissions({
      workspace: null,
      bases: { [base.base_id]: "admin" },
      tables: { [tables[0]!.table_id]: { table: "admin", record: "admin" } }
    })).toEqual({
      workspace: null,
      bases: { [base.base_id]: "edit" },
      tables: { [tables[0]!.table_id]: { table: "edit", record: "edit" } }
    });
    expect(permissionsForMember({
      role: "editor",
      permissions: { workspace: null } as MemberPermissions
    } as Parameters<typeof permissionsForMember>[0])).toEqual({
      workspace: null,
      bases: {},
      tables: {}
    });
  });
});

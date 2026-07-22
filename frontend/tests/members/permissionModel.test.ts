import { describe, expect, it } from "vitest";
import type { AppTable, Base, MemberPermissions } from "../../apps/web/src/types/domain.js";
import {
  accessSummary, inheritedRecordAccess, inheritedTableAccess, setTableAccess
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
    const both = setTableAccess(tableGrant, tables[0]!.table_id, "record", "admin");
    expect(both.tables[tables[0]!.table_id]).toEqual({ table: "read", record: "admin" });
  });

  it("builds concise summaries", () => {
    expect(accessSummary({ workspace: "admin", bases: {}, tables: {} }, [base], tables)).toBe("Workspace administrator");
    expect(accessSummary({ workspace: null, bases: { [base.base_id]: "edit" }, tables: {} }, [base], tables))
      .toBe("Can manage all tables in Marketing");
  });
});

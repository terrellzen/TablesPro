import { describe, expect, it } from "vitest";
import { isAllowed } from "./rbac.js";

describe("RBAC permissions", () => {
  it("allows admins to manage tables", () => {
    expect(
      isAllowed({ workspaceRole: "admin" }, { resource: "table", action: "delete" })
    ).toBe(true);
  });

  it("prevents viewers from editing records by default", () => {
    expect(
      isAllowed({ workspaceRole: "viewer" }, { resource: "record", action: "update" })
    ).toBe(false);
  });

  it("uses base-level role overrides before the workspace role", () => {
    expect(
      isAllowed(
        { workspaceRole: "admin", baseOverride: { role: "viewer" } },
        { resource: "table", action: "delete" }
      )
    ).toBe(false);
  });

  it("uses table-level overrides before base-level overrides", () => {
    expect(
      isAllowed(
        {
          workspaceRole: "viewer",
          baseOverride: { role: "editor" },
          tableOverride: { role: "viewer" }
        },
        { resource: "record", action: "update" }
      )
    ).toBe(false);
  });

  it("lets explicit denies win over explicit allows", () => {
    expect(
      isAllowed(
        {
          workspaceRole: "admin",
          tableOverride: {
            allow: [{ resource: "record", action: "delete" }],
            deny: [{ resource: "record", action: "delete" }]
          }
        },
        { resource: "record", action: "delete" }
      )
    ).toBe(false);
  });
});

import type { ReactNode } from "react";
import type { AccessLevel, AppTable, Base, MemberPermissions } from "../../types/domain.js";
import { PermissionControl } from "./PermissionControl.js";
import {
  inheritedBaseAccess, inheritedRecordAccess, inheritedTableAccess,
  setBaseAccess, setTableAccess
} from "./permissionModel.js";

export function PermissionEditor(props: {
  permissions: MemberPermissions;
  bases: Base[];
  tables: AppTable[];
  onChange: (permissions: MemberPermissions) => void;
}) {
  const { permissions } = props;
  return (
    <div className="permission-editor">
      <PermissionSection title="1. Workspace Control" description="Applies to the entire workspace and everything inside it.">
        <label className="permission-control workspace-permission">
          <span className="permission-copy">
            <strong>All workspace resources</strong>
            <small>Read views everything; Edit manages content; Admin also manages access, audit logs, and workspace deletion.</small>
            <em className="direct-access">Assigned directly</em>
          </span>
          <select
            value={permissions.workspace ?? ""}
            onChange={(event) => props.onChange({ ...permissions, workspace: (event.target.value || null) as AccessLevel | null })}
          >
            <option value="">Selected resources only</option>
            <option value="read">Read</option>
            <option value="edit">Edit</option>
            <option value="admin">Admin</option>
          </select>
        </label>
      </PermissionSection>

      <PermissionSection title="2. Base Control" description="Applies to a selected base and all tables and records inside it.">
        {props.bases.map((base) => (
          <PermissionControl
            key={base.base_id}
            label={base.name}
            description="Read, edit, or administer this base."
            inherited={inheritedBaseAccess(permissions)}
            direct={permissions.bases[base.base_id] ?? null}
            onChange={(level) => props.onChange(setBaseAccess(permissions, base.base_id, level))}
          />
        ))}
      </PermissionSection>

      <PermissionSection title="3. Table Control" description="Controls table structure, fields, views, and records in selected tables.">
        {props.tables.map((table) => (
          <PermissionControl
            key={table.table_id}
            label={resourceName(table, props.bases)}
            description="Edit includes fields, views, and records; Admin also allows table deletion."
            inherited={inheritedTableAccess(permissions, table.base_id)}
            direct={permissions.tables[table.table_id]?.table ?? null}
            onChange={(level) => props.onChange(setTableAccess(permissions, table.table_id, "table", level))}
          />
        ))}
      </PermissionSection>

      <PermissionSection title="4. Record Control" description="Controls record access without granting structure or settings access.">
        {props.tables.map((table) => (
          <PermissionControl
            key={table.table_id}
            label={resourceName(table, props.bases)}
            description="Edit adds and updates records; Admin also allows record deletion."
            inherited={inheritedRecordAccess(permissions, table.base_id, table.table_id)}
            direct={permissions.tables[table.table_id]?.record ?? null}
            onChange={(level) => props.onChange(setTableAccess(permissions, table.table_id, "record", level))}
          />
        ))}
      </PermissionSection>
    </div>
  );
}

function PermissionSection(props: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="permission-section">
      <div><h4>{props.title}</h4><p>{props.description}</p></div>
      {props.children}
    </section>
  );
}

function resourceName(table: AppTable, bases: Base[]): string {
  const base = bases.find((candidate) => candidate.base_id === table.base_id);
  return base ? `${base.name} / ${table.name}` : table.name;
}

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { api } from "../../lib/api.js";
import { errorMessage } from "../../lib/format.js";
import type { AdminBase, AdminTable } from "../../types/domain.js";
import type { AdminPanelProps } from "./AdminPanel.js";

type AuditTabProps = Pick<
  AdminPanelProps,
  "profile" | "auditEvents" | "adminWorkspaces" | "workspaces" | "onLoadAdminAuditEvents"
>;

export function AdminAuditTab(props: AuditTabProps) {
  const [workspaceFilter, setWorkspaceFilter] = useState("");
  const [baseFilter, setBaseFilter] = useState("");
  const [tableFilter, setTableFilter] = useState("");
  const [adminBases, setAdminBases] = useState<AdminBase[]>([]);
  const [adminTables, setAdminTables] = useState<AdminTable[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const isAdmin = Boolean(props.profile?.can_manage_users);
  const workspaces = isAdmin ? props.adminWorkspaces : props.workspaces;

  useEffect(() => {
    let current = true;
    setLoading(true);
    setLoadError("");
    void props.onLoadAdminAuditEvents(
      workspaceFilter || null,
      baseFilter || null,
      tableFilter || null
    ).catch((error) => {
      if (current) setLoadError(errorMessage(error));
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => {
      current = false;
    };
  }, [workspaceFilter, baseFilter, tableFilter]);

  useEffect(() => {
    if (!workspaceFilter || !isAdmin) {
      setAdminBases([]);
      setAdminTables([]);
      setBaseFilter("");
      setTableFilter("");
      return;
    }
    const controller = new AbortController();
    api<{ data: AdminBase[] }>(`/api/admin/workspaces/${workspaceFilter}/bases`, { signal: controller.signal })
      .then((response) => setAdminBases(response.data))
      .catch(() => {
        if (!controller.signal.aborted) setAdminBases([]);
      });
    return () => controller.abort();
  }, [workspaceFilter, isAdmin]);

  useEffect(() => {
    if (!isAdmin || !workspaceFilter) {
      setAdminTables([]);
      setTableFilter("");
      return;
    }
    const controller = new AbortController();
    const url = baseFilter
      ? `/api/admin/workspaces/${workspaceFilter}/tables?baseId=${baseFilter}`
      : `/api/admin/workspaces/${workspaceFilter}/tables`;
    api<{ data: AdminTable[] }>(url, { signal: controller.signal })
      .then((response) => setAdminTables(response.data))
      .catch(() => {
        if (!controller.signal.aborted) setAdminTables([]);
      });
    return () => controller.abort();
  }, [workspaceFilter, baseFilter, isAdmin]);

  return (
    <div className="admin-page-content">
      <div className="admin-section">
        <div className="panel-heading inline-heading">
          <History size={15} />
          <span>Recent activity</span>
        </div>
        <div className="audit-filter-row">
          <label className="audit-filter">
            Workspace
            <select
              value={workspaceFilter}
              onChange={(event) => {
                setWorkspaceFilter(event.target.value);
                setBaseFilter("");
                setTableFilter("");
              }}
            >
              <option value="">All</option>
              {workspaces.map((workspace) => (
                <option key={workspace.workspace_id} value={workspace.workspace_id}>{workspace.name}</option>
              ))}
            </select>
          </label>
          {isAdmin && workspaceFilter && adminBases.length > 0 && (
            <label className="audit-filter">
              Base
              <select
                value={baseFilter}
                onChange={(event) => {
                  setBaseFilter(event.target.value);
                  setTableFilter("");
                }}
              >
                <option value="">All</option>
                {adminBases.map((base) => (
                  <option key={base.base_id} value={base.base_id}>{base.name}</option>
                ))}
              </select>
            </label>
          )}
          {isAdmin && workspaceFilter && adminTables.length > 0 && (
            <label className="audit-filter">
              Table
              <select value={tableFilter} onChange={(event) => setTableFilter(event.target.value)}>
                <option value="">All</option>
                {adminTables.map((table) => (
                  <option key={table.table_id} value={table.table_id}>{table.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        {loading && <p className="empty-text">Loading...</p>}
        {loadError && <p className="empty-text">{loadError}</p>}
        <div className="audit-full-list">
          {props.auditEvents.map((event) => (
            <div className="audit-row" key={event.event_id}>
              <div className="audit-row-main">
                <span className="audit-action">{event.action}</span>
                <span className="audit-entity">{event.entity_type}</span>
                {event.table_name && <span className="audit-table-badge">{event.table_name}</span>}
                {!workspaceFilter && <span className="audit-workspace">{event.workspace_name}</span>}
                <span className="audit-actor">{event.actor_name}</span>
                <time>{new Date(event.occurred_at).toLocaleString()}</time>
              </div>
              {event.diff && Object.keys(event.diff).length > 0 && (
                <div className="audit-diff">
                  {Object.entries(event.diff).map(([fieldName, change]) => (
                    <div className="audit-diff-row" key={fieldName}>
                      <span className="audit-diff-field">{fieldName}</span>
                      <span className="audit-diff-before">{String(change.before ?? "(empty)")}</span>
                      <span className="audit-diff-arrow">&rarr;</span>
                      <span className="audit-diff-after">{String(change.after ?? "(empty)")}</span>
                    </div>
                  ))}
                </div>
              )}
              {event.metadata && Object.keys(event.metadata).length > 0 && (!event.diff || Object.keys(event.diff).length === 0) && (
                <div className="audit-meta">
                  {Object.entries(event.metadata).map(([key, value]) => (
                    <span key={key} className="audit-meta-tag">{key}: {String(value)}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {props.auditEvents.length === 0 && !loading && <p className="empty-text">No audit events yet.</p>}
        </div>
      </div>
    </div>
  );
}

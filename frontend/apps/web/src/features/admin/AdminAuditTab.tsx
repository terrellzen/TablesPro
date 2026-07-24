import { useEffect, useState } from "react";
import { ArrowRight, CirclePlus, History, Pencil, Trash2 } from "lucide-react";
import { api } from "../../lib/api.js";
import { auditObject, auditValueForDisplay, errorMessage } from "../../lib/format.js";
import { onAuditChanged } from "../../lib/auditEvents.js";
import type { AdminBase, AdminTable, AuditEvent } from "../../types/domain.js";
import type { AdminPanelProps } from "./AdminPanel.js";

type AuditTabProps = Pick<
  AdminPanelProps,
  "profile" | "adminWorkspaces" | "workspaces" | "onLoadAdminAuditEvents"
>;

export function AdminAuditTab(props: AuditTabProps) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [refreshToken, setRefreshToken] = useState(0);
  const [scopeFilter, setScopeFilter] = useState<"all" | "company" | "workspace">("all");
  const [workspaceFilter, setWorkspaceFilter] = useState("");
  const [baseFilter, setBaseFilter] = useState("");
  const [tableFilter, setTableFilter] = useState("");
  const [adminBases, setAdminBases] = useState<AdminBase[]>([]);
  const [adminTables, setAdminTables] = useState<AdminTable[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const isAdmin = props.profile?.role === "owner" || props.profile?.role === "admin";
  const workspaces = isAdmin ? props.adminWorkspaces : props.workspaces;
  useEffect(() => onAuditChanged(() => setRefreshToken((current) => current + 1)), []);


  useEffect(() => {
    let current = true;
    setEvents([]);
    setLoading(true);
    setLoadError("");
    void props.onLoadAdminAuditEvents(
      scopeFilter,
      workspaceFilter || null,
      baseFilter || null,
      tableFilter || null
    ).then((result) => {
      if (current) setEvents(result);
    }).catch((error) => {
      if (current) setLoadError(errorMessage(error));
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [scopeFilter, workspaceFilter, baseFilter, tableFilter, refreshToken]);

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
            Activity
            <select value={scopeFilter} onChange={(event) => {
              const scope = event.target.value as "all" | "company" | "workspace";
              setScopeFilter(scope);
              if (scope === "company") setWorkspaceFilter("");
              setBaseFilter("");
              setTableFilter("");
            }}>
              <option value="all">All activity</option>
              <option value="company">Company & users</option>
              <option value="workspace">Workspace activity</option>
            </select>
          </label>
          {scopeFilter !== "company" && (
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
          )}
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
        {workspaceFilter && <p className="audit-filter-note">Company-level user activity is visible when Workspace is set to All.</p>}
        {loading && <p className="empty-text">Loading...</p>}
        {loadError && <p className="empty-text">{loadError}</p>}
        <div className="audit-full-list">
          {events.map((event) => {
            const diff = Object.entries(auditObject(event.diff)) as [string, { before: unknown; after: unknown }][];
            const metadata = auditObject(event.metadata);
            const operation = event.action.split(".").at(-1);
            const labels: Record<string, string> = { workspace: "workspace", base: "base", table: "table", field: "column", record: "record", user: "user", workspace_member: "workspace member", saved_view: "view" };
            const entity = labels[event.entity_type] ?? event.entity_type.replaceAll("_", " ");
            const fallbackName = event.entity_type === "workspace" ? event.workspace_name : event.entity_type === "base" ? event.base_name : event.entity_type === "table" ? event.table_name : "";
            const targetName = typeof metadata.name === "string" ? metadata.name : fallbackName ?? "";
            const isRename = operation === "update" && ["workspace", "base", "table", "field"].includes(event.entity_type);
            const verb = event.action === "user.create" || event.action === "member.create" ? "Added" : event.action === "user.disable" ? "Disabled" : event.action === "user.password_reset" ? "Reset password for" : event.action === "user.password_change" ? "Changed password for" : event.action === "member.delete" ? "Removed" : event.action === "member.update" ? "Changed access for" : operation === "create" ? "Created" : operation === "delete" ? "Deleted" : isRename ? "Renamed" : operation === "update" ? "Updated" : operation === "reorder" ? "Reordered" : "Changed";
            const location = [event.workspace_name, event.base_name, event.table_name].filter((part): part is string => Boolean(part));
            const technicalDetails = [["Event ID", event.event_id], ["Entity ID", event.entity_id], ["Actor user ID", event.actor_user_id], ["Workspace ID", event.workspace_id], ["Base ID", event.base_id], ["Table ID", event.table_id], ["Request ID", event.request_id], ["Job ID", event.job_id], ["Physical name", metadata.physicalColumnName ?? metadata.physicalTableName]].filter((detail): detail is [string, string] => typeof detail[1] === "string" && detail[1].length > 0);
            const EventIcon = operation === "create" ? CirclePlus : operation === "delete" || operation === "disable" ? Trash2 : Pencil;
            return (
              <article className={`audit-row audit-${operation ?? "change"}`} key={event.event_id}>
                <div className="audit-row-main">
                  <div className="audit-event-icon" aria-hidden="true"><EventIcon size={16} /></div>
                  <div className="audit-headline">
                    <div className="audit-title"><strong>{verb} {entity}</strong>{targetName && <span className="audit-target-name">“{targetName}”</span>}{typeof metadata.handle === "string" && <span className="audit-target-handle">@{metadata.handle}</span>}</div>
                    <div className="audit-byline">by <strong className="audit-actor">{event.actor_name || event.actor_user_id || "System"}</strong>{event.actor_handle && <span>@{event.actor_handle}</span>}</div>
                  </div>
                  <time>{new Date(event.occurred_at).toLocaleString()}</time>
                </div>
                <div className="audit-location-row"><span>Location</span><span className="audit-location">{location.length > 0 ? location.map((part, index) => <span key={`${part}:${index}`}>{index > 0 && <b>→</b>}<strong>{part}</strong></span>) : <strong>Company administration</strong>}</span></div>
                {typeof metadata.fieldType === "string" && <div className="audit-context-note">Column type: <strong>{String(metadata.fieldType).replaceAll("_", " ")}</strong></div>}
                {isRename && targetName && diff.length === 0 && <div className="audit-context-note">Previous name was not captured for this older event.</div>}
                {diff.length > 0 && <div className="audit-diff">{diff.map(([fieldName, change]) => <div className="audit-diff-row" key={fieldName}><span className="audit-diff-field">{fieldName}</span><span className="audit-diff-value audit-diff-before"><small>Old</small>{auditValueForDisplay(change.before)}</span><ArrowRight className="audit-diff-arrow" size={14} aria-label="changed to" /><span className="audit-diff-value audit-diff-after"><small>New</small>{auditValueForDisplay(change.after)}</span></div>)}</div>}
                <details className="audit-technical"><summary>Technical details</summary><dl>{technicalDetails.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></details>
              </article>
            );
          })}
          {events.length === 0 && !loading && <p className="empty-text">No audit events yet.</p>}
        </div>
      </div>
    </div>
  );
}

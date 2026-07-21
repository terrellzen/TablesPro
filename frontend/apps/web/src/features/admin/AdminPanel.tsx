import { useEffect, useState } from "react";
import { Database, History, KeyRound, ShieldCheck, Table2, Trash2, Users } from "lucide-react";
import { api } from "../../lib/api.js";
import { errorMessage } from "../../lib/format.js";
import type { AdminBase, AdminTable, AdminWorkspace, AuditEvent, AuthUser, UserProfile, Workspace } from "../../types/domain.js";
import { CreateUserForm } from "./CreateUserForm.js";

export function AdminPanel(props: {
  currentUser: AuthUser;
  profile: UserProfile | null;
  users: UserProfile[];
  auditEvents: AuditEvent[];
  adminWorkspaces: AdminWorkspace[];
  workspaces: Workspace[];
  onLoadAdminAuditEvents: (workspaceId: string | null, baseId: string | null, tableId: string | null) => Promise<void>;
  onChangeUserPermissions: (user: UserProfile, patch: Partial<Pick<UserProfile, "can_create_workspaces" | "can_manage_users">>) => Promise<void>;
  onRemoveUser: (user: UserProfile) => Promise<void>;
  onCreateUser: (fields: { email: string; password: string; handle: string; displayName: string; canCreateWorkspaces: boolean; canManageUsers: boolean }) => Promise<UserProfile | undefined>;
  onChangeUserPassword: (userId: string, adminPassword: string, newPassword: string) => Promise<boolean>;
}) {
  const [tab, setTab] = useState<"users" | "audit" | "database">("users");
  const [passwordUserId, setPasswordUserId] = useState<string | null>(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("");
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [dbStats, setDbStats] = useState<{ database: { name: string; sizeBytes: number; tableCount: number; tables: { name: string; rowCount: number }[] } } | null>(null);
  const [dbStatsLoading, setDbStatsLoading] = useState(false);
  const [dbStatsError, setDbStatsError] = useState("");
  const [auditWorkspaceFilter, setAuditWorkspaceFilter] = useState<string>("");
  const [auditBaseFilter, setAuditBaseFilter] = useState<string>("");
  const [auditTableFilter, setAuditTableFilter] = useState<string>("");
  const [adminBases, setAdminBases] = useState<AdminBase[]>([]);
  const [adminTables, setAdminTables] = useState<AdminTable[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const isAdmin = Boolean(props.profile?.can_manage_users);
  const auditWorkspaces = isAdmin ? props.adminWorkspaces : props.workspaces;

  useEffect(() => {
    if (tab !== "audit") return;
    setAuditLoading(true);
    const wsId = auditWorkspaceFilter || null;
    const bsId = auditBaseFilter || null;
    const tbId = auditTableFilter || null;
    props.onLoadAdminAuditEvents(wsId, bsId, tbId).finally(() => setAuditLoading(false));
  }, [tab, auditWorkspaceFilter, auditBaseFilter, auditTableFilter]);

  useEffect(() => {
    if (tab !== "audit" || !auditWorkspaceFilter || !isAdmin) {
      setAdminBases([]);
      setAdminTables([]);
      setAuditBaseFilter("");
      setAuditTableFilter("");
      return;
    }
    api<{ data: AdminBase[] }>(`/api/admin/workspaces/${auditWorkspaceFilter}/bases`).then((r) => setAdminBases(r.data));
  }, [tab, auditWorkspaceFilter, isAdmin]);

  useEffect(() => {
    if (tab !== "audit" || !isAdmin) {
      if (!auditWorkspaceFilter) {
        setAdminTables([]);
        setAuditTableFilter("");
      }
      return;
    }
    const url = auditBaseFilter
      ? `/api/admin/workspaces/${auditWorkspaceFilter}/tables?baseId=${auditBaseFilter}`
      : `/api/admin/workspaces/${auditWorkspaceFilter}/tables`;
    api<{ data: AdminTable[] }>(url).then((r) => setAdminTables(r.data));
  }, [tab, auditWorkspaceFilter, auditBaseFilter, isAdmin]);

  useEffect(() => {
    if (tab !== "database" || dbStats) return;
    setDbStatsLoading(true);
    setDbStatsError("");
    api<{ database: { name: string; sizeBytes: number; tableCount: number; tables: { name: string; rowCount: number }[] } }>("/api/admin/stats")
      .then(setDbStats)
      .catch((err) => setDbStatsError(errorMessage(err)))
      .finally(() => setDbStatsLoading(false));
  }, [tab, dbStats]);

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault();
    if (!passwordUserId) return;
    setPasswordSubmitting(true);
    setPasswordStatus("");
    const ok = await props.onChangeUserPassword(passwordUserId, adminPassword, newPassword);
    setPasswordSubmitting(false);
    if (ok) {
      setPasswordUserId(null);
      setAdminPassword("");
      setNewPassword("");
      setPasswordStatus("");
    } else {
      setPasswordStatus("Failed — check your password");
    }
  }

  return (
    <section className="admin-page">
      <div className="admin-page-header">
        <ShieldCheck size={20} />
        <h2>Administration</h2>
      </div>
      <div className="admin-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "users"} className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>
          <Users size={15} />
          Users
        </button>
        <button type="button" role="tab" aria-selected={tab === "audit"} className={tab === "audit" ? "active" : ""} onClick={() => setTab("audit")}>
          <History size={15} />
          Audit log
        </button>
        <button type="button" role="tab" aria-selected={tab === "database"} className={tab === "database" ? "active" : ""} onClick={() => setTab("database")}>
          <Database size={15} />
          Database
        </button>
      </div>

      {tab === "users" && (
        <div className="admin-page-content">
          <CreateUserForm onCreateUser={props.onCreateUser} />

          {passwordUserId && (
            <form className="password-change-form admin-password-form" onSubmit={(event) => void submitPassword(event)}>
              <div className="panel-heading inline-heading">
                <ShieldCheck size={15} />
                <span>Change password for @{props.users.find((u) => u.user_id === passwordUserId)?.handle ?? "user"}</span>
              </div>
              <label className="stacked-field">
                <span>Your password (admin verification)</span>
                <input type="password" required value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} />
              </label>
              <label className="stacked-field">
                <span>New password for user</span>
                <input type="password" required minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
              </label>
              <div className="inline-form">
                <button type="submit" className="small-button" disabled={passwordSubmitting || !adminPassword || !newPassword}>
                  {passwordSubmitting ? "Saving" : "Set password"}
                </button>
                <button type="button" className="small-button" onClick={() => { setPasswordUserId(null); setAdminPassword(""); setNewPassword(""); setPasswordStatus(""); }}>
                  Cancel
                </button>
              </div>
              {passwordStatus && <span className="server-status">{passwordStatus}</span>}
            </form>
          )}

          <div className="admin-section">
            <div className="panel-heading inline-heading">
              <Users size={15} />
              <span>User directory</span>
              <span className="badge">{props.users.length}</span>
            </div>
            <div className="user-directory">
              {props.users.map((user) => (
                <div className="user-row" key={user.user_id}>
                  <div className="user-info">
                    <strong>{user.display_name}</strong>
                    <span>@{user.handle}</span>
                    {user.user_id === props.currentUser.id && <span className="badge">You</span>}
                  </div>
                  <div className="user-actions">
                    <label className="user-perm">
                      <input
                        type="checkbox"
                        checked={user.can_create_workspaces}
                        disabled={!props.profile?.can_manage_users || user.user_id === props.currentUser.id}
                        onChange={(event) => void props.onChangeUserPermissions(user, { can_create_workspaces: event.target.checked })}
                      />
                      Create
                    </label>
                    <label className="user-perm">
                      <input
                        type="checkbox"
                        checked={user.can_manage_users}
                        disabled={!props.profile?.can_manage_users || user.user_id === props.currentUser.id}
                        onChange={(event) => void props.onChangeUserPermissions(user, { can_manage_users: event.target.checked })}
                      />
                      Manage
                    </label>
                    <button
                      type="button"
                      className="icon-button"
                      disabled={!props.profile?.can_manage_users}
                      onClick={() => { setPasswordUserId(user.user_id); setAdminPassword(""); setNewPassword(""); setPasswordStatus(""); }}
                      aria-label={`Change password for ${user.handle}`}
                    >
                      <KeyRound size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-button danger"
                      disabled={!props.profile?.can_manage_users || user.user_id === props.currentUser.id}
                      onClick={() => void props.onRemoveUser(user)}
                      aria-label={`Disable ${user.handle}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "audit" && (
        <div className="admin-page-content">
          <div className="admin-section">
            <div className="panel-heading inline-heading">
              <History size={15} />
              <span>Recent activity</span>
            </div>
            <div className="audit-filter-row">
              <label className="audit-filter">
                Workspace
                <select value={auditWorkspaceFilter} onChange={(event) => { setAuditWorkspaceFilter(event.target.value); setAuditBaseFilter(""); setAuditTableFilter(""); }}>
                  <option value="">All</option>
                  {auditWorkspaces.map((ws) => (
                    <option key={ws.workspace_id} value={ws.workspace_id}>{ws.name}</option>
                  ))}
                </select>
              </label>
              {isAdmin && auditWorkspaceFilter && adminBases.length > 0 && (
                <label className="audit-filter">
                  Base
                  <select value={auditBaseFilter} onChange={(event) => { setAuditBaseFilter(event.target.value); setAuditTableFilter(""); }}>
                    <option value="">All</option>
                    {adminBases.map((base: AdminBase) => (
                      <option key={base.base_id} value={base.base_id}>{base.name}</option>
                    ))}
                  </select>
                </label>
              )}
              {isAdmin && auditWorkspaceFilter && adminTables.length > 0 && (
                <label className="audit-filter">
                  Table
                  <select value={auditTableFilter} onChange={(event) => setAuditTableFilter(event.target.value)}>
                    <option value="">All</option>
                    {adminTables.map((tbl: AdminTable) => (
                      <option key={tbl.table_id} value={tbl.table_id}>{tbl.name}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {auditLoading && <p className="empty-text">Loading...</p>}
            <div className="audit-full-list">
              {props.auditEvents.map((event) => (
                <div className="audit-row" key={event.event_id}>
                  <div className="audit-row-main">
                    <span className="audit-action">{event.action}</span>
                    <span className="audit-entity">{event.entity_type}</span>
                    {event.table_name && <span className="audit-table-badge">{event.table_name}</span>}
                    {!auditWorkspaceFilter && <span className="audit-workspace">{event.workspace_name}</span>}
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
                      {Object.entries(event.metadata).map(([key, val]) => (
                        <span key={key} className="audit-meta-tag">{key}: {String(val)}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {props.auditEvents.length === 0 && !auditLoading && <p className="empty-text">No audit events yet.</p>}
            </div>
          </div>
        </div>
      )}

      {tab === "database" && (
        <div className="admin-page-content">
          {dbStatsLoading && <p className="empty-text">Loading database stats...</p>}
          {dbStatsError && <p className="empty-text">{dbStatsError}</p>}
          {dbStats && (() => {
            const sizeGB = dbStats.database.sizeBytes / (1024 * 1024 * 1024);
            const sizeMB = dbStats.database.sizeBytes / (1024 * 1024);
            const sizeLabel = sizeGB >= 1 ? `${sizeGB.toFixed(2)} GB` : `${sizeMB.toFixed(1)} MB`;
            const isWarning = dbStats.database.sizeBytes >= 10 * 1024 * 1024 * 1024;
            return (
              <>
                <div className="admin-section">
                  <div className="panel-heading inline-heading">
                    <Database size={15} />
                    <span>Database overview</span>
                  </div>
                  <div className="db-stats-grid">
                    <div className="db-stat">
                      <span className="db-stat-label">Name</span>
                      <span className="db-stat-value">{dbStats.database.name}</span>
                    </div>
                    <div className="db-stat">
                      <span className="db-stat-label">Size</span>
                      <span className={`db-stat-value ${isWarning ? "db-stat-warning" : ""}`}>{sizeLabel}</span>
                    </div>
                    <div className="db-stat">
                      <span className="db-stat-label">Data tables</span>
                      <span className="db-stat-value">{dbStats.database.tableCount}</span>
                    </div>
                  </div>
                  {isWarning && (
                    <div className="db-warning-banner">
                      Database size exceeds 10 GB soft limit. Consider archiving old data.
                    </div>
                  )}
                </div>
                {dbStats.database.tables.length > 0 && (
                  <div className="admin-section">
                    <div className="panel-heading inline-heading">
                      <Table2 size={15} />
                      <span>Table sizes</span>
                    </div>
                    <div className="db-table-list">
                      <div className="db-table-row db-table-header">
                        <span>Table</span>
                        <span>Rows</span>
                      </div>
                      {dbStats.database.tables.map((t) => (
                        <div className="db-table-row" key={t.name}>
                          <span className="db-table-name">{t.name}</span>
                          <span>{t.rowCount.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}
    </section>
  );
}

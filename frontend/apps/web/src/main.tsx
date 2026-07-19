import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Database,
  Download,
  FolderPlus,
  Grid3X3,
  History,
  Layers3,
  LogIn,
  LogOut,
  Plus,
  RefreshCcw,
  Save,
  ShieldCheck,
  Table2,
  Trash2,
  UserPlus,
  UserRound,
  Users
} from "lucide-react";
import "./styles/theme.css";
import "./styles/app.css";

const apiServerStorageKey = "tablespro.apiServerUrl";
const defaultApiBaseUrl = import.meta.env.VITE_API_URL ?? `${window.location.protocol}//${window.location.hostname}:4000`;

type Workspace = {
  workspace_id: string;
  name: string;
  role: string;
};

type Base = {
  base_id: string;
  workspace_id: string;
  name: string;
};

type AppTable = {
  table_id: string;
  base_id: string;
  name: string;
};

type Field = {
  field_id: string;
  name: string;
  physical_column_name: string;
  field_type: FieldType;
  width: number;
  hidden: boolean;
  pinned: boolean;
};

type FieldType =
  | "short_text"
  | "long_text"
  | "integer"
  | "decimal"
  | "currency"
  | "percentage"
  | "boolean"
  | "date"
  | "timestamp_tz"
  | "single_select"
  | "multiple_select"
  | "email"
  | "url"
  | "phone"
  | "user_reference";

type RecordRow = {
  record_id: string;
  row_version: string;
  [key: string]: unknown;
};

type SavedView = {
  saved_view_id: string;
  name: string;
  is_shared: boolean;
};

type AuditEvent = {
  event_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  outcome: string;
  occurred_at: string;
};

type WorkspaceMember = {
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  created_at: string;
  updated_at: string;
};

type Invitation = {
  invitation_id: string;
  workspace_id: string;
  email: string;
  role: WorkspaceRole;
  expires_at: string;
  accepted_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  developmentAcceptToken?: string;
};

type WorkspaceRole = "owner" | "admin" | "editor" | "commenter" | "viewer";

type PageEnvelope<T> = {
  data: T[];
  page?: {
    nextCursor: string | null;
    hasMore: boolean;
  };
};

type Status = {
  tone: "idle" | "success" | "danger";
  text: string;
};

type AuthUser = {
  id: string;
  name?: string | null;
  email?: string | null;
};

type AuthEnvelope = {
  user?: AuthUser;
};

type AppConfig = {
  auth: {
    signUpEnabled: boolean;
  };
};

function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [apiServerUrl, setApiServerUrl] = useState(() => getConfiguredApiBaseUrl());
  const [signUpEnabled, setSignUpEnabled] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [bases, setBases] = useState<Base[]>([]);
  const [tables, setTables] = useState<AppTable[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [views, setViews] = useState<SavedView[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>("viewer");
  const [directUserId, setDirectUserId] = useState("");
  const [directRole, setDirectRole] = useState<WorkspaceRole>("viewer");
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ recordId: string; fieldId: string } | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [status, setStatus] = useState<Status>({ tone: "idle", text: "Ready" });
  const [loading, setLoading] = useState(false);

  const selectedWorkspace = workspaces.find((workspace) => workspace.workspace_id === selectedWorkspaceId) ?? null;
  const selectedBase = bases.find((base) => base.base_id === selectedBaseId) ?? null;
  const selectedTable = tables.find((table) => table.table_id === selectedTableId) ?? null;
  const visibleFields = fields.filter((field) => !field.hidden);

  const loadAppConfig = useCallback(async () => {
    try {
      const config = await api<AppConfig>("/api/config");
      setSignUpEnabled(config.auth.signUpEnabled);
    } catch {
      setSignUpEnabled(false);
    }
  }, []);

  const loadCurrentUser = useCallback(async () => {
    try {
      const session = await api<AuthEnvelope>("/api/me");
      setCurrentUser(session.user ?? null);
    } catch {
      setCurrentUser(null);
    } finally {
      setAuthChecked(true);
    }
  }, []);

  const loadWorkspaces = useCallback(async () => {
    const response = await api<PageEnvelope<Workspace>>("/api/workspaces");
    setWorkspaces(response.data);
    setSelectedWorkspaceId((current) => current ?? response.data[0]?.workspace_id ?? null);
  }, []);

  const loadBases = useCallback(async (workspaceId: string) => {
    const response = await api<PageEnvelope<Base>>(`/api/workspaces/${workspaceId}/bases`);
    setBases(response.data);
    setSelectedBaseId((current) =>
      response.data.some((base) => base.base_id === current) ? current : response.data[0]?.base_id ?? null
    );
  }, []);

  const loadTables = useCallback(async (baseId: string) => {
    const response = await api<PageEnvelope<AppTable>>(`/api/bases/${baseId}/tables`);
    setTables(response.data);
    setSelectedTableId((current) =>
      response.data.some((table) => table.table_id === current) ? current : response.data[0]?.table_id ?? null
    );
  }, []);

  const loadTableData = useCallback(async (tableId: string) => {
    const [fieldResponse, recordResponse, viewResponse] = await Promise.all([
      api<PageEnvelope<Field>>(`/api/tables/${tableId}/fields`),
      api<PageEnvelope<RecordRow>>(`/api/tables/${tableId}/records?limit=100`),
      api<PageEnvelope<SavedView>>(`/api/tables/${tableId}/views`)
    ]);
    setFields(fieldResponse.data);
    setRecords(recordResponse.data);
    setViews(viewResponse.data);
  }, []);

  const loadAuditEvents = useCallback(async (workspaceId: string) => {
    const response = await api<PageEnvelope<AuditEvent>>(`/api/workspaces/${workspaceId}/audit-events?limit=25`);
    setAuditEvents(response.data);
  }, []);

  const loadAdminData = useCallback(async (workspaceId: string) => {
    const [memberResponse, invitationResponse] = await Promise.all([
      api<PageEnvelope<WorkspaceMember>>(`/api/workspaces/${workspaceId}/members`),
      api<PageEnvelope<Invitation>>(`/api/workspaces/${workspaceId}/invitations`)
    ]);
    setMembers(memberResponse.data);
    setInvitations(invitationResponse.data);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await loadWorkspaces();
      if (selectedWorkspaceId) {
        await Promise.all([loadBases(selectedWorkspaceId), loadAuditEvents(selectedWorkspaceId), loadAdminData(selectedWorkspaceId)]);
      }
      if (selectedBaseId) {
        await loadTables(selectedBaseId);
      }
      if (selectedTableId) {
        await loadTableData(selectedTableId);
      }
      setStatus({ tone: "success", text: "Synced" });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [loadAdminData, loadAuditEvents, loadBases, loadTableData, loadTables, loadWorkspaces, selectedBaseId, selectedTableId, selectedWorkspaceId]);

  useEffect(() => {
    void Promise.all([loadAppConfig(), loadCurrentUser()]);
  }, [apiServerUrl, loadAppConfig, loadCurrentUser]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }
    loadWorkspaces().catch((error) => setStatus({ tone: "danger", text: errorMessage(error) }));
  }, [currentUser, loadWorkspaces]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      setBases([]);
      setAuditEvents([]);
      setMembers([]);
      setInvitations([]);
      return;
    }
    Promise.all([loadBases(selectedWorkspaceId), loadAuditEvents(selectedWorkspaceId), loadAdminData(selectedWorkspaceId)]).catch((error) =>
      setStatus({ tone: "danger", text: errorMessage(error) })
    );
  }, [loadAdminData, loadAuditEvents, loadBases, selectedWorkspaceId]);

  useEffect(() => {
    if (!selectedBaseId) {
      setTables([]);
      return;
    }
    loadTables(selectedBaseId).catch((error) => setStatus({ tone: "danger", text: errorMessage(error) }));
  }, [loadTables, selectedBaseId]);

  useEffect(() => {
    if (!selectedTableId) {
      setFields([]);
      setRecords([]);
      setViews([]);
      return;
    }
    loadTableData(selectedTableId).catch((error) => setStatus({ tone: "danger", text: errorMessage(error) }));
  }, [loadTableData, selectedTableId]);

  async function createWorkspace() {
    const name = prompt("Workspace name");
    if (!name) {
      return;
    }
    const response = await mutate<{ data: Workspace }>("/api/workspaces", { name });
    setSelectedWorkspaceId(response.data.workspace_id);
    await loadWorkspaces();
  }

  async function createBase() {
    if (!selectedWorkspaceId) {
      return;
    }
    const name = prompt("Base name");
    if (!name) {
      return;
    }
    const response = await mutate<{ data: Base }>(`/api/workspaces/${selectedWorkspaceId}/bases`, { name });
    setSelectedBaseId(response.data.base_id);
    await loadBases(selectedWorkspaceId);
    await loadAuditEvents(selectedWorkspaceId);
  }

  async function createTable() {
    if (!selectedBaseId || !selectedWorkspaceId) {
      return;
    }
    const name = prompt("Table name");
    if (!name) {
      return;
    }
    const response = await mutate<{ data: { tableId: string } }>(`/api/bases/${selectedBaseId}/tables`, { name });
    setSelectedTableId(response.data.tableId);
    await loadTables(selectedBaseId);
    await loadAuditEvents(selectedWorkspaceId);
  }

  async function addField(fieldType: FieldType) {
    if (!selectedTableId || !selectedWorkspaceId) {
      return;
    }
    const name = prompt("Field name");
    if (!name) {
      return;
    }
    await mutate(`/api/tables/${selectedTableId}/fields`, { name, fieldType });
    await loadTableData(selectedTableId);
    await loadAuditEvents(selectedWorkspaceId);
  }

  async function addRecord() {
    if (!selectedTableId || visibleFields.length === 0 || !selectedWorkspaceId) {
      return;
    }
    await mutate(`/api/tables/${selectedTableId}/records`, {
      values: Object.fromEntries(visibleFields.map((field) => [field.field_id, ""]))
    });
    await loadTableData(selectedTableId);
    await loadAuditEvents(selectedWorkspaceId);
  }

  async function createSavedView() {
    if (!selectedTableId || !selectedWorkspaceId) {
      return;
    }
    const name = prompt("View name");
    if (!name) {
      return;
    }
    await mutate(`/api/tables/${selectedTableId}/views`, {
      name,
      isShared: true,
      visibleFieldIds: visibleFields.map((field) => field.field_id),
      fieldOrder: visibleFields.map((field) => field.field_id)
    });
    await loadTableData(selectedTableId);
    await loadAuditEvents(selectedWorkspaceId);
  }

  async function createFieldGroup() {
    if (!selectedTableId || !selectedWorkspaceId) {
      return;
    }
    const name = prompt("Column group name");
    if (!name) {
      return;
    }
    await mutate(`/api/tables/${selectedTableId}/field-groups`, { name });
    await loadAuditEvents(selectedWorkspaceId);
    setStatus({ tone: "success", text: "Column group created" });
  }

  async function exportCsv() {
    if (!selectedTableId || !selectedWorkspaceId) {
      return;
    }
    const response = await mutate<{ data: { jobId: string } }>(`/api/tables/${selectedTableId}/export-jobs`, {});
    await loadAuditEvents(selectedWorkspaceId);
    setStatus({ tone: "success", text: `Export queued: ${response.data.jobId}` });
  }

  async function inviteMember() {
    if (!selectedWorkspaceId || !inviteEmail.trim()) {
      return;
    }
    try {
      const response = await mutate<{ data: Invitation }>(`/api/workspaces/${selectedWorkspaceId}/invitations`, {
        email: inviteEmail.trim(),
        role: inviteRole
      });
      setInviteEmail("");
      await Promise.all([loadAdminData(selectedWorkspaceId), loadAuditEvents(selectedWorkspaceId)]);
      setStatus({
        tone: "success",
        text: response.data.developmentAcceptToken ? `Invite created. Dev token: ${response.data.developmentAcceptToken}` : "Invite created"
      });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  async function addDirectMember() {
    if (!selectedWorkspaceId || !directUserId.trim()) {
      return;
    }
    try {
      await mutate(`/api/workspaces/${selectedWorkspaceId}/members`, {
        userId: directUserId.trim(),
        role: directRole
      });
      setDirectUserId("");
      await Promise.all([loadAdminData(selectedWorkspaceId), loadAuditEvents(selectedWorkspaceId)]);
      setStatus({ tone: "success", text: "Member added" });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  async function changeMemberRole(member: WorkspaceMember, role: WorkspaceRole) {
    if (!selectedWorkspaceId) {
      return;
    }
    try {
      await mutate(`/api/workspaces/${selectedWorkspaceId}/members/${encodeURIComponent(member.user_id)}`, { role }, "PATCH");
      await Promise.all([loadAdminData(selectedWorkspaceId), loadAuditEvents(selectedWorkspaceId)]);
      setStatus({ tone: "success", text: "Role updated" });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  async function removeMember(member: WorkspaceMember) {
    if (!selectedWorkspaceId || !confirm(`Remove ${member.user_id} from this workspace?`)) {
      return;
    }
    try {
      await request(`/api/workspaces/${selectedWorkspaceId}/members/${encodeURIComponent(member.user_id)}`, {
        method: "DELETE"
      });
      await Promise.all([loadAdminData(selectedWorkspaceId), loadAuditEvents(selectedWorkspaceId)]);
      setStatus({ tone: "success", text: "Member removed" });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  async function cancelInvitation(invitation: Invitation) {
    if (!selectedWorkspaceId) {
      return;
    }
    try {
      await request(`/api/workspaces/${selectedWorkspaceId}/invitations/${invitation.invitation_id}`, {
        method: "DELETE"
      });
      await Promise.all([loadAdminData(selectedWorkspaceId), loadAuditEvents(selectedWorkspaceId)]);
      setStatus({ tone: "success", text: "Invitation cancelled" });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  async function saveCell(record: RecordRow, field: Field) {
    if (!selectedTableId || !selectedWorkspaceId) {
      return;
    }
    setEditingCell(null);
    const previous = records;
    setRecords((current) =>
      current.map((row) =>
        row.record_id === record.record_id ? { ...row, [field.physical_column_name]: draftValue } : row
      )
    );
    try {
      const response = await mutate<{ data: RecordRow }>(`/api/tables/${selectedTableId}/records/${record.record_id}`, {
        rowVersion: Number(record.row_version),
        values: { [field.field_id]: coerceFieldValue(draftValue, field.field_type) }
      }, "PATCH");
      setRecords((current) => current.map((row) => (row.record_id === record.record_id ? response.data : row)));
      await loadAuditEvents(selectedWorkspaceId);
      setStatus({ tone: "success", text: "Cell saved" });
    } catch (error) {
      setRecords(previous);
      setStatus({ tone: "danger", text: errorMessage(error) });
      await loadTableData(selectedTableId);
    }
  }

  async function handleAuthenticated() {
    await loadCurrentUser();
    await loadWorkspaces();
    setStatus({ tone: "success", text: "Signed in" });
  }

  async function handleApiServerChange(nextUrl: string) {
    const normalized = normalizeApiBaseUrl(nextUrl);
    localStorage.setItem(apiServerStorageKey, normalized);
    setApiServerUrl(normalized);
    setCurrentUser(null);
    setWorkspaces([]);
    setBases([]);
    setTables([]);
    setFields([]);
    setRecords([]);
    setViews([]);
    setAuditEvents([]);
    setMembers([]);
    setInvitations([]);
    setSelectedWorkspaceId(null);
    setSelectedBaseId(null);
    setSelectedTableId(null);
    setAuthChecked(false);
    setStatus({ tone: "idle", text: `Server set to ${normalized}` });
  }

  async function logout() {
    await request("/api/auth/sign-out", { method: "POST" }).catch(() => undefined);
    setCurrentUser(null);
    setWorkspaces([]);
    setBases([]);
    setTables([]);
    setFields([]);
    setRecords([]);
    setViews([]);
    setAuditEvents([]);
    setMembers([]);
    setInvitations([]);
    setSelectedWorkspaceId(null);
    setSelectedBaseId(null);
    setSelectedTableId(null);
    setStatus({ tone: "idle", text: "Signed out" });
  }

  if (!authChecked) {
    return (
      <main className="auth-layout">
        <div className="auth-card compact">
          <div className="brand-row">
            <div className="brand-mark" aria-hidden="true">
              TP
            </div>
            <div>
              <strong>TablesPro</strong>
              <span>Checking session</span>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!currentUser) {
    return (
      <AuthScreen
        apiServerUrl={apiServerUrl}
        signUpEnabled={signUpEnabled}
        onApiServerChange={handleApiServerChange}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Workspace navigation">
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true">
            TP
          </div>
          <div>
            <strong>TablesPro</strong>
            <span>{selectedWorkspace?.role ?? currentUser.email ?? "signed in"}</span>
          </div>
        </div>

        <AccountBlock user={currentUser} apiServerUrl={apiServerUrl} onApiServerChange={handleApiServerChange} onLogout={logout} />

        <button type="button" className="command-button" onClick={createWorkspace}>
          <Plus size={16} />
          Workspace
        </button>

        <nav className="workspace-list" aria-label="Workspaces">
          {workspaces.map((workspace) => (
            <button
              type="button"
              className={`workspace-item ${workspace.workspace_id === selectedWorkspaceId ? "active" : ""}`}
              key={workspace.workspace_id}
              onClick={() => setSelectedWorkspaceId(workspace.workspace_id)}
            >
              {workspace.name}
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace-panel" aria-label="Table workspace">
        <header className="topbar">
          <div className="title-block">
            <p className="eyebrow">
              {selectedWorkspace?.name ?? "No workspace"} / {selectedBase?.name ?? "No base"}
            </p>
            <h1>{selectedTable?.name ?? "Choose a table"}</h1>
          </div>
          <div className="topbar-actions">
            <button type="button" className="icon-button" onClick={refresh} aria-label="Refresh data">
              <RefreshCcw size={18} />
            </button>
            <button type="button" className="icon-button" onClick={exportCsv} aria-label="Export CSV">
              <Download size={18} />
            </button>
          </div>
        </header>

        <div className="object-bar">
          <Selector
            icon={<Database size={15} />}
            label="Base"
            value={selectedBaseId ?? ""}
            options={bases.map((base) => ({ value: base.base_id, label: base.name }))}
            onChange={setSelectedBaseId}
          />
          <button type="button" className="small-button" onClick={createBase}>
            <FolderPlus size={15} />
            Base
          </button>
          <Selector
            icon={<Table2 size={15} />}
            label="Table"
            value={selectedTableId ?? ""}
            options={tables.map((table) => ({ value: table.table_id, label: table.name }))}
            onChange={setSelectedTableId}
          />
          <button type="button" className="small-button" onClick={createTable}>
            <Grid3X3 size={15} />
            Table
          </button>
          <button type="button" className="small-button" onClick={() => addField("short_text")}>
            <Plus size={15} />
            Text
          </button>
          <button type="button" className="small-button" onClick={() => addField("currency")}>
            <Plus size={15} />
            Currency
          </button>
          <button type="button" className="small-button" onClick={addRecord}>
            <Plus size={15} />
            Record
          </button>
          <button type="button" className="small-button" onClick={createFieldGroup}>
            <Layers3 size={15} />
            Group
          </button>
          <button type="button" className="small-button" onClick={createSavedView}>
            <Save size={15} />
            View
          </button>
        </div>

        <div className="view-tabs" role="tablist" aria-label="Saved views">
          <button type="button" role="tab" aria-selected="true">
            All records
          </button>
          {views.map((view) => (
            <button type="button" role="tab" aria-selected="false" key={view.saved_view_id}>
              {view.name}
            </button>
          ))}
        </div>

        <section className="content-grid">
          {workspaces.length === 0 ? (
            <div className="empty-state workspace-empty">
              <Database size={24} />
              <strong>No workspaces yet</strong>
              <span>Create one to become its owner and start adding tables.</span>
              <button type="button" className="small-button primary" onClick={createWorkspace}>
                <Plus size={15} />
                Workspace
              </button>
            </div>
          ) : (
            <DataGrid
              fields={visibleFields}
              records={records}
              editingCell={editingCell}
              draftValue={draftValue}
              onDraftChange={setDraftValue}
              onStartEdit={(record, field) => {
                setEditingCell({ recordId: record.record_id, fieldId: field.field_id });
                setDraftValue(String(record[field.physical_column_name] ?? ""));
              }}
              onCancelEdit={() => setEditingCell(null)}
              onSaveCell={saveCell}
            />
          )}

          <RightRail
            currentUser={currentUser}
            members={members}
            invitations={invitations}
            auditEvents={auditEvents}
            inviteEmail={inviteEmail}
            inviteRole={inviteRole}
            directUserId={directUserId}
            directRole={directRole}
            onInviteEmailChange={setInviteEmail}
            onInviteRoleChange={setInviteRole}
            onDirectUserIdChange={setDirectUserId}
            onDirectRoleChange={setDirectRole}
            onInvite={inviteMember}
            onAddDirectMember={addDirectMember}
            onChangeRole={changeMemberRole}
            onRemoveMember={removeMember}
            onCancelInvitation={cancelInvitation}
          />
        </section>

        <footer className={`status-bar ${status.tone}`} aria-live="polite">
          {loading ? "Loading" : status.text}
        </footer>
      </section>
    </main>
  );
}

function AuthScreen(props: {
  apiServerUrl: string;
  signUpEnabled: boolean;
  onApiServerChange: (url: string) => Promise<void>;
  onAuthenticated: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [serverDraft, setServerDraft] = useState(props.apiServerUrl);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>({ tone: "idle", text: "Use your TablesPro account" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setServerDraft(props.apiServerUrl);
  }, [props.apiServerUrl]);

  useEffect(() => {
    if (!props.signUpEnabled && mode === "sign-up") {
      setMode("sign-in");
    }
  }, [mode, props.signUpEnabled]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setStatus({ tone: "idle", text: mode === "sign-in" ? "Signing in" : "Creating account" });
    try {
      const path = mode === "sign-in" ? "/api/auth/sign-in/email" : "/api/auth/sign-up/email";
      await mutate(path, {
        email: email.trim(),
        password,
        ...(mode === "sign-up" ? { name: name.trim() || email.trim() } : {})
      });
      await props.onAuthenticated();
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  }

  async function saveServer() {
    try {
      await props.onApiServerChange(serverDraft);
      setStatus({ tone: "success", text: "Server updated" });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  return (
    <main className="auth-layout">
      <form className="auth-card" onSubmit={(event) => void submit(event)}>
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true">
            TP
          </div>
          <div>
            <strong>TablesPro</strong>
            <span>{mode === "sign-in" ? "Sign in" : "Create account"}</span>
          </div>
        </div>

        <div className="auth-toggle" role="tablist" aria-label="Authentication mode">
          <button type="button" aria-selected={mode === "sign-in"} onClick={() => setMode("sign-in")}>
            Sign in
          </button>
          {props.signUpEnabled ? (
            <button type="button" aria-selected={mode === "sign-up"} onClick={() => setMode("sign-up")}>
              Sign up
            </button>
          ) : null}
        </div>

        <div className="server-settings">
          <label className="stacked-field">
            <span>API server</span>
            <input
              type="url"
              spellCheck={false}
              value={serverDraft}
              onChange={(event) => setServerDraft(event.target.value)}
            />
          </label>
          <button type="button" className="small-button" onClick={() => void saveServer()}>
            <Database size={15} />
            Use
          </button>
        </div>

        {mode === "sign-up" ? (
          <label className="stacked-field">
            <span>Name</span>
            <input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
        ) : null}

        <label className="stacked-field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        <label className="stacked-field">
          <span>Password</span>
          <input
            type="password"
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <button type="submit" className="command-button" disabled={submitting}>
          <LogIn size={16} />
          {submitting ? "Working" : mode === "sign-in" ? "Sign in" : "Create account"}
        </button>

        <p className={`auth-status ${status.tone}`} aria-live="polite">
          {status.text}
        </p>
      </form>
    </main>
  );
}

function AccountBlock(props: {
  user: AuthUser;
  apiServerUrl: string;
  onApiServerChange: (url: string) => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const [serverDraft, setServerDraft] = useState(props.apiServerUrl);
  const [serverStatus, setServerStatus] = useState("");

  useEffect(() => {
    setServerDraft(props.apiServerUrl);
  }, [props.apiServerUrl]);

  async function saveServer() {
    try {
      await props.onApiServerChange(serverDraft);
      setServerStatus("Server updated");
    } catch (error) {
      setServerStatus(errorMessage(error));
    }
  }

  return (
    <div className="account-stack">
      <div className="account-block">
        <UserRound size={16} />
        <div>
          <strong>{props.user.name || props.user.email || "Signed in"}</strong>
          <span>{props.user.id}</span>
        </div>
        <button type="button" className="icon-button" onClick={() => void props.onLogout()} aria-label="Sign out">
          <LogOut size={16} />
        </button>
      </div>

      <label className="stacked-field server-field">
        <span>API server</span>
        <input value={serverDraft} spellCheck={false} onChange={(event) => setServerDraft(event.target.value)} />
      </label>
      <button type="button" className="small-button" onClick={() => void saveServer()}>
        <Database size={15} />
        Switch
      </button>
      {serverStatus ? <span className="server-status">{serverStatus}</span> : null}
    </div>
  );
}

function RightRail(props: {
  currentUser: AuthUser;
  members: WorkspaceMember[];
  invitations: Invitation[];
  auditEvents: AuditEvent[];
  inviteEmail: string;
  inviteRole: WorkspaceRole;
  directUserId: string;
  directRole: WorkspaceRole;
  onInviteEmailChange: (value: string) => void;
  onInviteRoleChange: (value: WorkspaceRole) => void;
  onDirectUserIdChange: (value: string) => void;
  onDirectRoleChange: (value: WorkspaceRole) => void;
  onInvite: () => Promise<void>;
  onAddDirectMember: () => Promise<void>;
  onChangeRole: (member: WorkspaceMember, role: WorkspaceRole) => Promise<void>;
  onRemoveMember: (member: WorkspaceMember) => Promise<void>;
  onCancelInvitation: (invitation: Invitation) => Promise<void>;
}) {
  return (
    <aside className="right-rail" aria-label="Workspace administration">
      <section className="admin-panel">
        <div className="panel-heading">
          <ShieldCheck size={16} />
          <span>RBAC</span>
        </div>

        <div className="admin-section">
          <label className="stacked-field">
            <span>Invite email</span>
            <input value={props.inviteEmail} onChange={(event) => props.onInviteEmailChange(event.target.value)} />
          </label>
          <div className="inline-form">
            <RoleSelect value={props.inviteRole} onChange={props.onInviteRoleChange} />
            <button type="button" className="small-button primary" onClick={() => void props.onInvite()}>
              <UserPlus size={15} />
              Invite
            </button>
          </div>
        </div>

        <div className="admin-section">
          <label className="stacked-field">
            <span>User id</span>
            <input value={props.directUserId} onChange={(event) => props.onDirectUserIdChange(event.target.value)} />
          </label>
          <div className="inline-form">
            <RoleSelect value={props.directRole} onChange={props.onDirectRoleChange} />
            <button type="button" className="small-button" onClick={() => props.onDirectUserIdChange(props.currentUser.id)}>
              <UserRound size={15} />
              Me
            </button>
            <button type="button" className="small-button" onClick={() => void props.onAddDirectMember()}>
              <Users size={15} />
              Add
            </button>
          </div>
        </div>

        <div className="member-list">
          {props.members.map((member) => (
            <div className="member-row" key={member.user_id}>
              <div>
                <strong>{member.user_id}</strong>
                <span>{new Date(member.updated_at).toLocaleDateString()}</span>
              </div>
              <RoleSelect value={member.role} onChange={(role) => void props.onChangeRole(member, role)} />
              <button
                type="button"
                className="icon-button danger"
                onClick={() => void props.onRemoveMember(member)}
                aria-label={`Remove ${member.user_id}`}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>

        <div className="invite-list">
          {props.invitations.map((invitation) => (
            <div className={`invite-row ${invitation.cancelled_at ? "muted" : ""}`} key={invitation.invitation_id}>
              <div>
                <strong>{invitation.email}</strong>
                <span>{invitation.cancelled_at ? "cancelled" : invitation.accepted_at ? "accepted" : invitation.role}</span>
              </div>
              {!invitation.accepted_at && !invitation.cancelled_at ? (
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => void props.onCancelInvitation(invitation)}
                  aria-label={`Cancel invitation for ${invitation.email}`}
                >
                  <Trash2 size={15} />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="audit-panel" aria-label="Audit log">
        <div className="panel-heading">
          <History size={16} />
          <span>Audit</span>
        </div>
        <div className="audit-list">
          {props.auditEvents.map((event) => (
            <div className="audit-item" key={event.event_id}>
              <strong>{event.action}</strong>
              <span>{event.entity_type}</span>
              <time>{new Date(event.occurred_at).toLocaleTimeString()}</time>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}

function RoleSelect(props: { value: WorkspaceRole; onChange: (value: WorkspaceRole) => void }) {
  return (
    <select className="role-select" value={props.value} onChange={(event) => props.onChange(event.target.value as WorkspaceRole)}>
      <option value="owner">Owner</option>
      <option value="admin">Admin</option>
      <option value="editor">Editor</option>
      <option value="commenter">Commenter</option>
      <option value="viewer">Viewer</option>
    </select>
  );
}

function DataGrid(props: {
  fields: Field[];
  records: RecordRow[];
  editingCell: { recordId: string; fieldId: string } | null;
  draftValue: string;
  onDraftChange: (value: string) => void;
  onStartEdit: (record: RecordRow, field: Field) => void;
  onCancelEdit: () => void;
  onSaveCell: (record: RecordRow, field: Field) => Promise<void>;
}) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: props.records.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 38,
    overscan: 8
  });
  const columnVirtualizer = useVirtualizer({
    horizontal: true,
    count: props.fields.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => props.fields[index]?.width ?? 180,
    overscan: 4
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const virtualColumns = columnVirtualizer.getVirtualItems();
  const totalWidth = columnVirtualizer.getTotalSize();
  const totalHeight = rowVirtualizer.getTotalSize();

  if (props.fields.length === 0) {
    return (
      <div className="empty-state">
        <Table2 size={24} />
        <strong>No fields</strong>
      </div>
    );
  }

  return (
    <div className="grid-shell" aria-label="Records">
      <div className="grid-scroll" ref={parentRef}>
        <div className="grid-header" style={{ width: totalWidth, height: 38 }}>
          {virtualColumns.map((virtualColumn) => {
            const field = props.fields[virtualColumn.index];
            if (!field) {
              return null;
            }
            return (
              <div
                className="grid-header-cell"
                key={field.field_id}
                style={{ left: virtualColumn.start, width: virtualColumn.size }}
              >
                <span>{field.name}</span>
                <small>{field.field_type}</small>
              </div>
            );
          })}
        </div>
        <div className="grid-body" style={{ width: totalWidth, height: totalHeight }}>
          {virtualRows.map((virtualRow) => {
            const record = props.records[virtualRow.index];
            if (!record) {
              return null;
            }
            return (
              <div
                className="grid-row"
                key={record.record_id}
                style={{ transform: `translateY(${virtualRow.start}px)`, height: virtualRow.size, width: totalWidth }}
              >
                {virtualColumns.map((virtualColumn) => {
                  const field = props.fields[virtualColumn.index];
                  if (!field) {
                    return null;
                  }
                  const isEditing =
                    props.editingCell?.recordId === record.record_id && props.editingCell.fieldId === field.field_id;
                  return (
                    <div
                      className="grid-cell-wrap"
                      key={`${record.record_id}:${field.field_id}`}
                      style={{ left: virtualColumn.start, width: virtualColumn.size }}
                    >
                      {isEditing ? (
                        <input
                          className="cell-input"
                          autoFocus
                          value={props.draftValue}
                          onChange={(event) => props.onDraftChange(event.target.value)}
                          onBlur={() => void props.onSaveCell(record, field)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              void props.onSaveCell(record, field);
                            }
                            if (event.key === "Escape") {
                              props.onCancelEdit();
                            }
                          }}
                        />
                      ) : (
                        <button type="button" className="grid-cell" onDoubleClick={() => props.onStartEdit(record, field)}>
                          {String(record[field.physical_column_name] ?? "")}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Selector(props: {
  icon: React.ReactNode;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="selector">
      {props.icon}
      <span>{props.label}</span>
      <select value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        <option value="">None</option>
        {props.options.map((option) => (
          <option value={option.value} key={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

async function api<T>(path: string): Promise<T> {
  return request<T>(path);
}

async function mutate<T>(path: string, body: unknown, method = "POST"): Promise<T> {
  return request<T>(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${getConfiguredApiBaseUrl()}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      ...(init.headers ?? {})
    }
  });
  return readResponse<T>(response);
}

function getConfiguredApiBaseUrl(): string {
  try {
    return normalizeApiBaseUrl(localStorage.getItem(apiServerStorageKey) || defaultApiBaseUrl);
  } catch {
    localStorage.removeItem(apiServerStorageKey);
    return defaultApiBaseUrl;
  }
}

function normalizeApiBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return defaultApiBaseUrl;
  }
  const url = new URL(trimmed);
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

async function readResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message ?? `Request failed with ${response.status}`);
  }
  return payload as T;
}

function coerceFieldValue(value: string, fieldType: FieldType): unknown {
  if (value === "") {
    return null;
  }
  if (fieldType === "integer") {
    return Number.parseInt(value, 10);
  }
  if (fieldType === "decimal" || fieldType === "currency" || fieldType === "percentage") {
    return Number(value);
  }
  if (fieldType === "boolean") {
    return value === "true" || value === "1" || value.toLowerCase() === "yes";
  }
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);

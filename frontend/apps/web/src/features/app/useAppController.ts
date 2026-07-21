import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRecordPagination } from "../grid/useRecordPagination.js";
import { api, getConfiguredApiBaseUrl, mutate, request, setConfiguredApiBaseUrl } from "../../lib/api.js";
import { coerceFieldValue, errorMessage } from "../../lib/format.js";
import { useThemePreference } from "../../lib/useThemePreference.js";
import type {
  AdminWorkspace, AppConfig, AppTable, AuditEvent, AuthEnvelope, AuthUser, Base,
  Field, FieldType, PageEnvelope, RecordRow, SavedView, Status, UserProfile,
  Workspace, WorkspaceMember, WorkspaceRole
} from "../../types/domain.js";
import type { ContextMenuItem, ModalEntity } from "../../types/ui.js";
export function useAppController() {
  const [themePreference, setThemePreference] = useThemePreference();
  const [authChecked, setAuthChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [apiServerUrl, setApiServerUrl] = useState(() => getConfiguredApiBaseUrl());
  const [signUpEnabled, setSignUpEnabled] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [bases, setBases] = useState<Base[]>([]);
  const [tables, setTables] = useState<AppTable[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [schemaTableId, setSchemaTableId] = useState<string | null>(null);
  const [views, setViews] = useState<SavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [adminWorkspaces, setAdminWorkspaces] = useState<AdminWorkspace[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [directUserId, setDirectUserId] = useState("");
  const [directRole, setDirectRole] = useState<WorkspaceRole>("viewer");
  const [filterFieldId, setFilterFieldId] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [sortFieldId, setSortFieldId] = useState("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [searchValue, setSearchValue] = useState("");
  const [showAdmin, setShowAdmin] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ recordId: string; fieldId: string } | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [status, setStatus] = useState<Status>({ tone: "idle", text: "Ready" });
  const [loading, setLoading] = useState(false);
  const deletingFieldIdsRef = useRef(new Set<string>());
  const [modalEntity, setModalEntity] = useState<ModalEntity | null>(null);
  const [modalValue, setModalValue] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const reportRecordError = useCallback((text: string) => setStatus({ tone: "danger", text }), []);
  const {
    records,
    setRecords,
    hasMore,
    loadingMore,
    loadingRows,
    loadMoreError,
    reloadRecords,
    loadMore,
    cancelRecordRequests
  } = useRecordPagination({
    selectedTableId,
    filterFieldId,
    filterValue,
    sortFieldId,
    sortDirection,
    onError: reportRecordError
  });

  const selectedWorkspace = workspaces.find((workspace) => workspace.workspace_id === selectedWorkspaceId) ?? null;
  const selectedBase = bases.find((base) => base.base_id === selectedBaseId) ?? null;
  const selectedTable = tables.find((table) => table.table_id === selectedTableId) ?? null;
  const visibleFields = fields.filter((field) => !field.hidden);

  const searchedRecords = useMemo(() => {
    if (!searchValue.trim()) return records;
    const term = searchValue.trim().toLowerCase();
    return records.filter((record) =>
      visibleFields.some((field) => String(record[field.physical_column_name] ?? "").toLowerCase().includes(term))
    );
  }, [records, visibleFields, searchValue]);

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
      setProfile(session.profile ?? null);
    } catch {
      setCurrentUser(null);
      setProfile(null);
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

  const loadAuditEvents = useCallback(async (workspaceId: string) => {
    const response = await api<PageEnvelope<AuditEvent>>(`/api/workspaces/${workspaceId}/audit-events?limit=100`);
    setAuditEvents(response.data);
  }, []);

  const loadAdminAuditEvents = useCallback(async (workspaceId: string | null, baseId: string | null = null, tableId: string | null = null) => {
    const params = new URLSearchParams({ limit: "100" });
    if (workspaceId) params.set("workspaceId", workspaceId);
    if (baseId) params.set("baseId", baseId);
    if (tableId) params.set("tableId", tableId);
    const response = await api<{ data: AuditEvent[] }>(`/api/admin/audit-events?${params.toString()}`);
    setAuditEvents(response.data);
  }, []);

  const loadAdminWorkspaces = useCallback(async () => {
    const response = await api<{ data: AdminWorkspace[] }>("/api/admin/workspaces");
    setAdminWorkspaces(response.data);
  }, []);

  const loadAdminData = useCallback(async (workspaceId: string) => {
    const [memberResponse, userResponse] = await Promise.all([
      api<PageEnvelope<WorkspaceMember>>(`/api/workspaces/${workspaceId}/members`),
      api<PageEnvelope<UserProfile>>("/api/users")
    ]);
    setMembers(memberResponse.data);
    setUsers(userResponse.data);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await loadWorkspaces();
      if (profile?.can_manage_users) {
        loadAdminWorkspaces().catch(() => {});
      }
      if (selectedWorkspaceId) {
        await Promise.all([loadBases(selectedWorkspaceId), loadAuditEvents(selectedWorkspaceId), loadAdminData(selectedWorkspaceId)]);
      }
      if (selectedBaseId) {
        await loadTables(selectedBaseId);
      }
      if (selectedTableId) {
        await Promise.all([
          api<PageEnvelope<Field>>(`/api/tables/${selectedTableId}/fields`),
          api<PageEnvelope<SavedView>>(`/api/tables/${selectedTableId}/views`)
        ]).then(([fieldResponse, viewResponse]) => {
          setFields(fieldResponse.data);
          setViews(viewResponse.data);
        });
        await reloadRecords(selectedTableId);
      }
      setStatus({ tone: "success", text: "Synced" });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [loadAdminData, loadAdminWorkspaces, loadAuditEvents, loadBases, loadTables, loadWorkspaces, profile, reloadRecords, selectedBaseId, selectedTableId, selectedWorkspaceId]);

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
    if (profile?.can_manage_users) {
      loadAdminWorkspaces().catch(() => {});
    }
  }, [profile, loadAdminWorkspaces]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      setBases([]);
      setAuditEvents([]);
      setMembers([]);
      setUsers([]);
      setSearchValue("");
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
      setSchemaTableId(null);
      setFields([]);
      setRecords([]);
      setViews([]);
      setActiveViewId(null);
      setSearchValue("");
      setRecords([]);
      cancelRecordRequests();
      return;
    }
    const controller = new AbortController();
    setSchemaTableId(null);
    setFields([]);
    setViews([]);
    setActiveViewId(null);
    setSearchValue("");
    setFilterFieldId("");
    setFilterValue("");
    setSortFieldId("");
    setSortDirection("asc");
    setRecords([]);
    cancelRecordRequests();
    Promise.all([
      api<PageEnvelope<Field>>(`/api/tables/${selectedTableId}/fields`, { signal: controller.signal }),
      api<PageEnvelope<SavedView>>(`/api/tables/${selectedTableId}/views`, { signal: controller.signal })
    ]).then(([fieldResponse, viewResponse]) => {
      setFields(fieldResponse.data);
      setViews(viewResponse.data);
      setSchemaTableId(selectedTableId);
    }).catch((error) => {
      if (!controller.signal.aborted) {
        setStatus({ tone: "danger", text: errorMessage(error) });
      }
    });
    return () => controller.abort();
  }, [selectedTableId]);

  useEffect(() => {
    if (!activeViewId) {
      return;
    }
    const view = views.find((v) => v.saved_view_id === activeViewId);
    if (!view) return;
    const visibleFieldIds = new Set(view.visible_field_ids ?? []);
    const order = new Map((view.field_order ?? []).map((fieldId, index) => [fieldId, index]));
    setFields((current) => [...current]
      .sort((left, right) => (order.get(left.field_id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.field_id) ?? Number.MAX_SAFE_INTEGER))
      .map((field) => ({
        ...field,
        hidden: view.field_order?.length > 0 ? !visibleFieldIds.has(field.field_id) : false
      })));
    setSearchValue(view.search ?? "");
    const filter = view.filters?.[0];
    setFilterFieldId(filter?.fieldId ?? "");
    setFilterValue(filter?.value ?? "");
    const sort = view.sorts?.[0];
    setSortFieldId(sort?.field_id ?? "");
    setSortDirection(sort?.direction === "desc" ? "desc" : "asc");
  }, [activeViewId, views]);

  function showAllRecords() {
    setActiveViewId(null);
    setSearchValue("");
    setFilterFieldId("");
    setFilterValue("");
    setSortFieldId("");
    setSortDirection("asc");
    setFields((current) => current.map((field) => ({ ...field, hidden: false })));
  }

  useEffect(() => {
    if (!selectedTableId || schemaTableId !== selectedTableId) return;
    void reloadRecords(selectedTableId);
    return cancelRecordRequests;
  }, [schemaTableId, selectedTableId, reloadRecords]);

  async function createWorkspace() {
    if (!profile?.can_create_workspaces) {
      setStatus({ tone: "danger", text: "You do not have permission to create workspaces" });
      return;
    }
    setModalEntity({ mode: "create", type: "workspace" });
    setModalValue("");
  }

  async function createBase() {
    if (!selectedWorkspaceId) {
      return;
    }
    setModalEntity({ mode: "create", type: "base" });
    setModalValue("");
  }

  async function createTable() {
    if (!selectedBaseId || !selectedWorkspaceId) {
      return;
    }
    setModalEntity({ mode: "create", type: "table" });
    setModalValue("");
  }

  async function addField(fieldType: FieldType) {
    if (!selectedTableId || !selectedWorkspaceId) {
      return;
    }
    setModalEntity({ mode: "create", type: "field", fieldType, parentId: selectedTableId });
    setModalValue("");
  }

  async function addRecord() {
    if (!selectedTableId || visibleFields.length === 0 || !selectedWorkspaceId) {
      return;
    }
    await mutate(`/api/tables/${selectedTableId}/records`, {
      values: Object.fromEntries(visibleFields.map((field) => [field.field_id, null]))
    });
    await reloadRecords(selectedTableId);
    await loadAuditEvents(selectedWorkspaceId);
  }

  async function createWorkspaceWithName(name: string) {
    const response = await mutate<{ data: Workspace }>("/api/workspaces", { name });
    setSelectedWorkspaceId(response.data.workspace_id);
    await loadWorkspaces();
  }

  async function createBaseWithName(name: string) {
    if (!selectedWorkspaceId) return;
    const response = await mutate<{ data: Base }>(`/api/workspaces/${selectedWorkspaceId}/bases`, { name });
    setSelectedBaseId(response.data.base_id);
    await loadBases(selectedWorkspaceId);
    await loadAuditEvents(selectedWorkspaceId);
  }

  async function createTableWithName(name: string) {
    if (!selectedBaseId || !selectedWorkspaceId) return;
    const response = await mutate<{ data: { tableId: string } }>(`/api/bases/${selectedBaseId}/tables`, { name });
    setSelectedTableId(response.data.tableId);
    await loadTables(selectedBaseId);
    await loadAuditEvents(selectedWorkspaceId);
  }

  async function duplicateWorkspace(workspaceId: string) {
    try {
      const response = await mutate<{ data: { workspace_id: string; name: string } }>(`/api/workspaces/${workspaceId}/duplicate`, {});
      setSelectedWorkspaceId(response.data.workspace_id);
      await loadWorkspaces();
      setStatus({ tone: "success", text: `Workspace duplicated as "${response.data.name}"` });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  async function duplicateBase(baseId: string) {
    if (!selectedWorkspaceId) return;
    try {
      const response = await mutate<{ data: { base_id: string; name: string } }>(`/api/bases/${baseId}/duplicate`, {});
      setSelectedBaseId(response.data.base_id);
      await loadBases(selectedWorkspaceId);
      await loadAuditEvents(selectedWorkspaceId);
      setStatus({ tone: "success", text: `Base duplicated as "${response.data.name}"` });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  async function duplicateTable(tableId: string) {
    if (!selectedBaseId || !selectedWorkspaceId) return;
    try {
      const response = await mutate<{ data: { tableId: string; name: string } }>(`/api/tables/${tableId}/duplicate`, {});
      setSelectedTableId(response.data.tableId);
      await loadTables(selectedBaseId);
      await loadAuditEvents(selectedWorkspaceId);
      setStatus({ tone: "success", text: `Table duplicated as "${response.data.name}"` });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  async function createFieldWithName(name: string, fieldType: FieldType, tableId: string) {
    if (!selectedWorkspaceId) return;
    try {
      await mutate(`/api/tables/${tableId}/fields`, { name: name.trim(), fieldType });
      const fieldResponse = await api<PageEnvelope<Field>>(`/api/tables/${tableId}/fields`);
      setFields(fieldResponse.data);
      await Promise.all([reloadRecords(tableId), loadAuditEvents(selectedWorkspaceId)]);
      setStatus({ tone: "success", text: `Column “${name.trim()}” created` });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  async function createViewWithName(name: string) {
    if (!selectedTableId || !selectedWorkspaceId) return;
    const filters = filterFieldId && filterValue
      ? [{ kind: "rule", fieldId: filterFieldId, operator: "contains", value: filterValue }]
      : [];
    const sorts = sortFieldId
      ? [{ fieldId: sortFieldId, direction: sortDirection }]
      : [];
    try {
      const response = await mutate<{ data: { saved_view_id: string } }>(`/api/tables/${selectedTableId}/views`, {
        name: name.trim(),
        isShared: true,
        search: searchValue || null,
        visibleFieldIds: visibleFields.map((field) => field.field_id),
        fieldOrder: fields.map((field) => field.field_id),
        filters,
        sorts
      });
      const viewResponse = await api<PageEnvelope<SavedView>>(`/api/tables/${selectedTableId}/views`);
      setViews(viewResponse.data);
      setActiveViewId(response.data.saved_view_id);
      await loadAuditEvents(selectedWorkspaceId);
      setStatus({ tone: "success", text: `View “${name.trim()}” saved` });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  async function createFieldGroupWithName(name: string) {
    if (!selectedTableId || !selectedWorkspaceId) return;
    await mutate(`/api/tables/${selectedTableId}/field-groups`, { name });
    await loadAuditEvents(selectedWorkspaceId);
    setStatus({ tone: "success", text: "Column group created" });
  }

  async function createSavedView() {
    if (!selectedTableId || !selectedWorkspaceId) {
      return;
    }
    setModalEntity({ mode: "create", type: "view" });
    setModalValue("");
  }

  async function deleteView(viewId: string) {
    if (!selectedTableId || !selectedWorkspaceId) return;
    if (!window.confirm("Delete this view?")) return;
    try {
      await request(`/api/tables/${selectedTableId}/views/${viewId}`, { method: "DELETE" });
      if (activeViewId === viewId) showAllRecords();
      setViews((current) => current.filter((view) => view.saved_view_id !== viewId));
      await reloadRecords(selectedTableId);
      setStatus({ tone: "success", text: "View deleted" });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  async function createFieldGroup() {
    if (!selectedTableId || !selectedWorkspaceId) {
      return;
    }
    setModalEntity({ mode: "create", type: "fieldGroup" });
    setModalValue("");
  }

  async function exportCsv() {
    if (!selectedTableId || !selectedWorkspaceId) {
      return;
    }
    const response = await mutate<{ data: { jobId: string } }>(`/api/tables/${selectedTableId}/export-jobs`, {});
    await loadAuditEvents(selectedWorkspaceId);
    setStatus({ tone: "success", text: `Export queued: ${response.data.jobId}` });
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

  async function changeUserPermissions(user: UserProfile, patch: Partial<Pick<UserProfile, "can_create_workspaces" | "can_manage_users">>) {
    try {
      const response = await mutate<{ data: UserProfile }>(`/api/users/${encodeURIComponent(user.user_id)}/permissions`, {
        canCreateWorkspaces: patch.can_create_workspaces ?? user.can_create_workspaces,
        canManageUsers: patch.can_manage_users ?? user.can_manage_users
      }, "PATCH");
      setUsers((current) => current.map((entry) => (entry.user_id === user.user_id ? response.data : entry)));
      setStatus({ tone: "success", text: "User permissions updated" });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  async function removeUser(user: UserProfile) {
    if (!confirm(`Disable @${user.handle} and remove workspace access?`)) {
      return;
    }
    try {
      await request(`/api/users/${encodeURIComponent(user.user_id)}`, { method: "DELETE" });
      setUsers((current) => current.filter((entry) => entry.user_id !== user.user_id));
      setStatus({ tone: "success", text: "User disabled" });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  async function createUser(fields: { email: string; password: string; handle: string; displayName: string; canCreateWorkspaces: boolean; canManageUsers: boolean }) {
    try {
      const response = await mutate<{ data: UserProfile }>("/api/users", {
        email: fields.email,
        password: fields.password,
        handle: fields.handle,
        displayName: fields.displayName,
        canCreateWorkspaces: fields.canCreateWorkspaces,
        canManageUsers: fields.canManageUsers
      }, "POST");
      setUsers((current) => [...current, response.data].sort((a, b) => a.handle.localeCompare(b.handle)));
      setStatus({ tone: "success", text: `Created @${response.data.handle}` });
      return response.data;
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
      return undefined;
    }
  }

  async function changeMyPassword(currentPassword: string, newPassword: string): Promise<boolean> {
    try {
      await mutate("/api/me/change-password", { currentPassword, newPassword });
      setStatus({ tone: "success", text: "Password changed" });
      return true;
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
      return false;
    }
  }

  async function changeUserPassword(userId: string, adminPassword: string, newPassword: string): Promise<boolean> {
    try {
      await mutate(`/api/users/${encodeURIComponent(userId)}/password`, { adminPassword, newPassword });
      setStatus({ tone: "success", text: "Password changed" });
      return true;
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
      return false;
    }
  }

  async function saveCell(record: RecordRow, field: Field) {
    if (!selectedTableId || !selectedWorkspaceId) {
      return;
    }
    setEditingCell(null);
    const previousRecord = record;
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
      setRecords((current) => current.map((row) => (row.record_id === record.record_id ? previousRecord : row)));
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  async function deleteRecord(record: RecordRow) {
    if (!selectedTableId || !selectedWorkspaceId) {
      return;
    }
    if (!confirm("Delete this record?")) {
      return;
    }
    try {
      await request(`/api/tables/${selectedTableId}/records/${record.record_id}`, { method: "DELETE" });
      setRecords((current) => current.filter((row) => row.record_id !== record.record_id));
      await loadAuditEvents(selectedWorkspaceId);
      setStatus({ tone: "success", text: "Record deleted" });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  async function deleteBase() {
    if (!selectedBaseId || !selectedWorkspaceId) {
      return;
    }
    if (!confirm("Delete this base and all its tables?")) {
      return;
    }
    try {
      await request(`/api/workspaces/${selectedWorkspaceId}/bases/${selectedBaseId}`, { method: "DELETE" });
      setSelectedBaseId(null);
      setSelectedTableId(null);
      setTables([]);
      setFields([]);
      setRecords([]);
      setViews([]);
      await loadBases(selectedWorkspaceId);
      await loadAuditEvents(selectedWorkspaceId);
      setStatus({ tone: "success", text: "Base deleted" });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  async function deleteTable() {
    if (!selectedBaseId || !selectedTableId || !selectedWorkspaceId) {
      return;
    }
    if (!confirm("Delete this table and all its data?")) {
      return;
    }
    try {
      await request(`/api/bases/${selectedBaseId}/tables/${selectedTableId}`, { method: "DELETE" });
      setSelectedTableId(null);
      setFields([]);
      setRecords([]);
      setViews([]);
      await loadTables(selectedBaseId);
      await loadAuditEvents(selectedWorkspaceId);
      setStatus({ tone: "success", text: "Table deleted" });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  async function deleteWorkspace() {
    if (!selectedWorkspaceId) {
      return;
    }
    if (!confirm("Delete this workspace and all its contents?")) {
      return;
    }
    try {
      await request(`/api/workspaces/${selectedWorkspaceId}`, { method: "DELETE" });
      setSelectedWorkspaceId(null);
      setSelectedBaseId(null);
      setSelectedTableId(null);
      setBases([]);
      setTables([]);
      setFields([]);
      setRecords([]);
      setViews([]);
      setAuditEvents([]);
      setMembers([]);
      await loadWorkspaces();
      setStatus({ tone: "success", text: "Workspace deleted" });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  async function renameWorkspace(workspaceId: string, name: string) {
    if (!name.trim()) return;
    try {
      const response = await mutate<{ data: Workspace }>(`/api/workspaces/${workspaceId}`, { name: name.trim() }, "PATCH");
      setWorkspaces((prev) => prev.map((w) => (w.workspace_id === workspaceId ? { ...w, name: name.trim() } : w)));
      setStatus({ tone: "success", text: "Workspace renamed" });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  async function renameBase(baseId: string, name: string) {
    if (!name.trim() || !selectedWorkspaceId) return;
    try {
      await mutate(`/api/bases/${baseId}`, { name: name.trim() }, "PATCH");
      setBases((prev) => prev.map((b) => (b.base_id === baseId ? { ...b, name: name.trim() } : b)));
      setStatus({ tone: "success", text: "Base renamed" });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  async function renameTable(tableId: string, name: string) {
    if (!name.trim() || !selectedBaseId || !selectedWorkspaceId) return;
    try {
      await mutate(`/api/tables/${tableId}`, { name: name.trim() }, "PATCH");
      setTables((prev) => prev.map((t) => (t.table_id === tableId ? { ...t, name: name.trim() } : t)));
      setStatus({ tone: "success", text: "Table renamed" });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  async function renameField(tableId: string, fieldId: string, name: string) {
    if (!name.trim() || !selectedWorkspaceId) return;
    try {
      await mutate(`/api/tables/${tableId}/fields/${fieldId}`, { name: name.trim() }, "PATCH");
      setFields((prev) => prev.map((f) => (f.field_id === fieldId ? { ...f, name: name.trim() } : f)));
      setStatus({ tone: "success", text: "Field renamed" });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  function hideField(fieldId: string) {
    if (visibleFields.length <= 1) {
      setStatus({ tone: "danger", text: "A view must keep at least one column visible" });
      return;
    }
    setFields((current) => current.map((field) => (
      field.field_id === fieldId ? { ...field, hidden: true } : field
    )));
    setStatus({ tone: "idle", text: "Column hidden · save the view to keep this layout" });
  }

  async function moveField(fieldId: string, direction: "left" | "right" | "start" | "end") {
    if (!selectedTableId || !selectedWorkspaceId) return;
    setFields((prev) => {
      const idx = prev.findIndex((f) => f.field_id === fieldId);
      if (idx < 0) return prev;
      const next = [...prev];
      let target: number;
      if (direction === "left") target = idx - 1;
      else if (direction === "right") target = idx + 1;
      else if (direction === "start") target = 0;
      else target = next.length - 1;
      if (target < 0 || target >= next.length || target === idx) return prev;
      const moved = next[idx]!;
      next.splice(idx, 1);
      next.splice(target, 0, moved);
      const fieldOrder = next.map((f) => f.field_id);
      void mutate(`/api/tables/${selectedTableId}/fields/reorder`, { fieldOrder }).then(() => {
        setStatus({ tone: "success", text: "Field moved" });
      }).catch((error) => {
        setStatus({ tone: "danger", text: errorMessage(error) });
      });
      return next;
    });
  }

  async function deleteField(fieldId: string) {
    if (!selectedTableId || !selectedWorkspaceId) return;
    if (deletingFieldIdsRef.current.has(fieldId)) return;
    if (!window.confirm("Delete this column and all its data?")) return;
    deletingFieldIdsRef.current.add(fieldId);
    try {
      await request(`/api/tables/${selectedTableId}/fields/${fieldId}`, { method: "DELETE" });
      setFields((current) => current.filter((field) => field.field_id !== fieldId));
      await reloadRecords(selectedTableId);
      await loadAuditEvents(selectedWorkspaceId);
      setStatus({ tone: "success", text: "Column deleted" });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    } finally {
      deletingFieldIdsRef.current.delete(fieldId);
    }
  }

  function openRenameModal(type: "workspace" | "base" | "table" | "field", id: string, name: string, parentId?: string) {
    setModalEntity(parentId !== undefined ? { mode: "rename", type, id, parentId, name } : { mode: "rename", type, id, name });
    setModalValue(name);
    setContextMenu(null);
  }

  function confirmModal() {
    if (!modalEntity || !modalValue.trim()) return;

    if (modalEntity.mode === "rename") {
      const { type, id, parentId } = modalEntity;
      switch (type) {
        case "workspace":
          void renameWorkspace(id!, modalValue);
          break;
        case "base":
          void renameBase(id!, modalValue);
          break;
        case "table":
          void renameTable(id!, modalValue);
          break;
        case "field":
          void renameField(parentId!, id!, modalValue);
          break;
      }
    } else {
      const { type, fieldType, parentId } = modalEntity;
      switch (type) {
        case "workspace":
          void createWorkspaceWithName(modalValue);
          break;
        case "base":
          void createBaseWithName(modalValue);
          break;
        case "table":
          void createTableWithName(modalValue);
          break;
        case "field":
          void createFieldWithName(modalValue, fieldType!, parentId!);
          break;
        case "view":
          void createViewWithName(modalValue);
          break;
        case "fieldGroup":
          void createFieldGroupWithName(modalValue);
          break;
      }
    }
    setModalEntity(null);
  }

  async function handleAuthenticated() {
    await loadCurrentUser();
    await loadWorkspaces();
    setStatus({ tone: "success", text: "Signed in" });
  }

  async function handleApiServerChange(nextUrl: string) {
    const normalized = setConfiguredApiBaseUrl(nextUrl);
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
    setUsers([]);
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
    setUsers([]);
    setSelectedWorkspaceId(null);
    setSelectedBaseId(null);
    setSelectedTableId(null);
    setStatus({ tone: "idle", text: "Signed out" });
  }

  return {
    themePreference, setThemePreference,
    authChecked, currentUser, apiServerUrl, signUpEnabled, profile, setProfile,
    workspaces, bases, tables, fields, records, views, activeViewId, setActiveViewId,
    auditEvents, adminWorkspaces, members, users,
    directUserId, setDirectUserId, directRole, setDirectRole,
    filterFieldId, setFilterFieldId, filterValue, setFilterValue,
    sortFieldId, setSortFieldId, sortDirection, setSortDirection,
    searchValue, setSearchValue, showAdmin, setShowAdmin,
    selectedWorkspaceId, setSelectedWorkspaceId, selectedBaseId, setSelectedBaseId,
    selectedTableId, setSelectedTableId, editingCell, setEditingCell,
    draftValue, setDraftValue, status, loading,
    hasMore, loadingMore, loadingRows, loadMoreError,
    modalEntity, setModalEntity, modalValue, setModalValue,
    contextMenu, setContextMenu,
    selectedWorkspace, selectedBase, selectedTable, visibleFields, searchedRecords,
    refresh, loadAdminAuditEvents, createWorkspace, createBase, createTable,
    addField, addRecord, duplicateWorkspace, duplicateBase, duplicateTable,
    createSavedView, createFieldGroup, exportCsv, addDirectMember,
    changeMemberRole, removeMember, changeUserPermissions, removeUser, createUser,
    changeMyPassword, changeUserPassword, saveCell, deleteRecord,
    deleteBase, deleteTable, deleteWorkspace, hideField, moveField, deleteField,
    openRenameModal, confirmModal, showAllRecords, deleteView,
    handleAuthenticated, handleApiServerChange, logout, loadMore
  };
}


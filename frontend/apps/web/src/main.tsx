import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Copy,
  Database,
  Download,
  FolderPlus,
  Grid3X3,
  History,
  KeyRound,
  Layers3,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Search,
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
  search: string | null;
  visible_field_ids: string[];
  field_order: string[];
  filters: { kind: string; fieldId: string; operator: string; value: string }[];
  sorts: { field_id: string; direction: string }[];
};

type AuditEvent = {
  event_id: string;
  workspace_id: string;
  workspace_name: string;
  actor_user_id: string;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: string;
  outcome: string;
  occurred_at: string;
  diff: Record<string, { before: unknown; after: unknown }>;
  metadata: Record<string, unknown>;
  table_name: string | null;
};

type AdminWorkspace = {
  workspace_id: string;
  name: string;
  created_at: string;
  member_count: number;
};

type AdminBase = {
  base_id: string;
  name: string;
};

type AdminTable = {
  table_id: string;
  name: string;
};

type WorkspaceMember = {
  workspace_id: string;
  user_id: string;
  handle: string | null;
  display_name: string | null;
  role: WorkspaceRole;
  created_at: string;
  updated_at: string;
};

type WorkspaceRole = "admin" | "editor" | "viewer";

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

type UserProfile = {
  user_id: string;
  handle: string;
  display_name: string;
  can_create_workspaces: boolean;
  can_manage_users: boolean;
  disabled_at: string | null;
};

type AuthEnvelope = {
  user?: AuthUser;
  profile?: UserProfile | null;
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
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [bases, setBases] = useState<Base[]>([]);
  const [tables, setTables] = useState<AppTable[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [schemaTableId, setSchemaTableId] = useState<string | null>(null);
  const [records, setRecords] = useState<RecordRow[]>([]);
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
  const pageSize = 100;
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const recordsGenerationRef = useRef(0);
  const recordsRequestRef = useRef<AbortController | null>(null);
  const loadMoreRequestRef = useRef<AbortController | null>(null);
  const loadingMoreRef = useRef(false);
  const deletingFieldIdsRef = useRef(new Set<string>());
  const [modalEntity, setModalEntity] = useState<{
    mode: "rename" | "create";
    type: "workspace" | "base" | "table" | "field" | "view" | "fieldGroup";
    id?: string;
    parentId?: string;
    fieldType?: FieldType;
    name?: string;
  } | null>(null);
  const [modalValue, setModalValue] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: { label: string; onClick: () => void; className?: string; divider?: boolean }[] } | null>(null);

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

  const fetchRecordPage = useCallback(async (tableId: string, cursor?: string, signal?: AbortSignal) => {
    const recordParams = new URLSearchParams({ limit: String(pageSize) });
    if (cursor) {
      recordParams.set("cursor", cursor);
    }
    if (filterFieldId && filterValue) {
      recordParams.set(
        "filter",
        JSON.stringify({ kind: "rule", fieldId: filterFieldId, operator: "contains", value: filterValue })
      );
    }
    if (sortFieldId) {
      recordParams.set("sort", JSON.stringify([{ fieldId: sortFieldId, direction: sortDirection }]));
    }
    return api<PageEnvelope<RecordRow>>(
      `/api/tables/${tableId}/records?${recordParams.toString()}`,
      signal ? { signal } : {}
    );
  }, [filterFieldId, filterValue, sortDirection, sortFieldId, pageSize]);

  const reloadRecords = useCallback(async (tableId: string) => {
    const generation = recordsGenerationRef.current + 1;
    recordsGenerationRef.current = generation;
    recordsRequestRef.current?.abort();
    loadMoreRequestRef.current?.abort();
    loadingMoreRef.current = false;
    const controller = new AbortController();
    recordsRequestRef.current = controller;
    setRecords([]);
    setHasMore(false);
    setNextCursor(null);
    setLoadMoreError(null);
    setLoadingMore(false);
    setLoadingRows(true);
    try {
      const response = await fetchRecordPage(tableId, undefined, controller.signal);
      if (recordsGenerationRef.current !== generation) return;
      setRecords(response.data);
      setHasMore(response.page?.hasMore ?? false);
      setNextCursor(response.page?.nextCursor ?? null);
    } catch (error) {
      if (!controller.signal.aborted && recordsGenerationRef.current === generation) {
        setStatus({ tone: "danger", text: errorMessage(error) });
      }
    } finally {
      if (recordsGenerationRef.current === generation) {
        setLoadingRows(false);
      }
    }
  }, [fetchRecordPage]);

  const loadMore = useCallback(async () => {
    if (!selectedTableId || !hasMore || loadingMoreRef.current || !nextCursor) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(null);
    const generation = recordsGenerationRef.current;
    const controller = new AbortController();
    loadMoreRequestRef.current?.abort();
    loadMoreRequestRef.current = controller;
    try {
      const response = await fetchRecordPage(selectedTableId, nextCursor, controller.signal);
      if (recordsGenerationRef.current !== generation) return;
      setRecords((current) => {
        const existingIds = new Set(current.map((record) => record.record_id));
        return [...current, ...response.data.filter((record) => !existingIds.has(record.record_id))];
      });
      setHasMore(response.page?.hasMore ?? false);
      setNextCursor(response.page?.nextCursor ?? null);
    } catch (err) {
      if (!controller.signal.aborted && recordsGenerationRef.current === generation) {
        const message = errorMessage(err);
        setLoadMoreError(message);
        setStatus({ tone: "danger", text: message });
      }
    } finally {
      if (recordsGenerationRef.current === generation) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [fetchRecordPage, hasMore, nextCursor, selectedTableId]);

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
      setHasMore(false);
      setNextCursor(null);
      recordsGenerationRef.current += 1;
      recordsRequestRef.current?.abort();
      loadMoreRequestRef.current?.abort();
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
    setHasMore(false);
    setNextCursor(null);
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
    return () => {
      recordsRequestRef.current?.abort();
      loadMoreRequestRef.current?.abort();
    };
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

        <AccountBlock
          user={currentUser}
          profile={profile}
          apiServerUrl={apiServerUrl}
          onApiServerChange={handleApiServerChange}
          onProfileChange={setProfile}
          onLogout={logout}
          onChangePassword={changeMyPassword}
        />

        {profile?.can_manage_users && (
          <button type="button" className={`command-button ${showAdmin ? "active" : ""}`} onClick={() => setShowAdmin(!showAdmin)}>
            <ShieldCheck size={16} />
            Admin
          </button>
        )}

        <button type="button" className="command-button" onClick={createWorkspace}>
          <Plus size={16} />
          Workspace
        </button>

        <nav className="workspace-list" aria-label="Workspaces">
          {workspaces.map((workspace) => (
            <div className="workspace-item-row" key={workspace.workspace_id}>
              <button
                type="button"
                className={`workspace-item ${workspace.workspace_id === selectedWorkspaceId ? "active" : ""}`}
                onClick={() => setSelectedWorkspaceId(workspace.workspace_id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    items: [
                      { label: "Rename", onClick: () => openRenameModal("workspace", workspace.workspace_id, workspace.name) },
                      { label: "Duplicate", onClick: () => void duplicateWorkspace(workspace.workspace_id) }
                    ]
                  });
                }}
              >
                {workspace.name}
              </button>
              {workspace.workspace_id === selectedWorkspaceId && (
                <button
                  type="button"
                  className="icon-button danger"
                  onClick={() => void deleteWorkspace()}
                  aria-label={`Delete workspace ${workspace.name}`}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
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

        {showAdmin ? (
          <AdminPanel
            currentUser={currentUser}
            profile={profile}
            users={users}
            auditEvents={auditEvents}
            adminWorkspaces={adminWorkspaces}
            workspaces={workspaces}
            onLoadAdminAuditEvents={loadAdminAuditEvents}
            onChangeUserPermissions={changeUserPermissions}
            onRemoveUser={removeUser}
            onCreateUser={createUser}
            onChangeUserPassword={changeUserPassword}
          />
        ) : (
          <>
            {bases.length === 0 ? (
              <div className="empty-state workspace-empty">
                <Database size={24} />
                <strong>No bases yet</strong>
                <span>Create a base to start organizing your data.</span>
                <button type="button" className="small-button primary" onClick={createBase}>
                  <FolderPlus size={15} />
                  Create base
                </button>
              </div>
            ) : tables.length === 0 ? (
              <>
                <div className="object-bar">
                  <Selector
                    icon={<Database size={15} />}
                    label="Base"
                    value={selectedBaseId ?? ""}
                    options={bases.map((base) => ({ value: base.base_id, label: base.name }))}
                    onChange={setSelectedBaseId}
                  />
                  {selectedBaseId && (
                    <button
                      type="button"
                      className="small-button"
                      onClick={() => {
                        const base = bases.find((b) => b.base_id === selectedBaseId);
                        if (base) openRenameModal("base", base.base_id, base.name);
                      }}
                    >
                      Rename base
                    </button>
                  )}
                  <button type="button" className="small-button" onClick={createBase}>
                    <FolderPlus size={15} />
                    Base
                  </button>
                  {selectedBaseId && (
                    <button type="button" className="small-button" onClick={() => void duplicateBase(selectedBaseId)}>
                      <Copy size={15} />
                      Duplicate base
                    </button>
                  )}
                  {selectedBaseId && (
                    <button type="button" className="small-button danger" onClick={() => void deleteBase()}>
                      <Trash2 size={15} />
                      Delete base
                    </button>
                  )}
                </div>
                <div className="empty-state">
                  <Table2 size={24} />
                  <strong>No tables yet</strong>
                  <span>Create a table to start adding data.</span>
                  <button type="button" className="small-button primary" onClick={createTable}>
                    <Grid3X3 size={15} />
                    Create table
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="object-bar">
                  <Selector
                    icon={<Database size={15} />}
                    label="Base"
                    value={selectedBaseId ?? ""}
                    options={bases.map((base) => ({ value: base.base_id, label: base.name }))}
                    onChange={setSelectedBaseId}
                  />
                  {selectedBaseId && (
                    <button
                      type="button"
                      className="icon-button"
                      title="Rename base"
                      onClick={() => {
                        const base = bases.find((b) => b.base_id === selectedBaseId);
                        if (base) openRenameModal("base", base.base_id, base.name);
                      }}
                    >
                      <Pencil size={15} />
                    </button>
                  )}
                  <button type="button" className="icon-button" title="Create base" onClick={createBase}>
                    <FolderPlus size={15} />
                  </button>
                  {selectedBaseId && (
                    <button type="button" className="icon-button" title="Duplicate base" onClick={() => void duplicateBase(selectedBaseId)}>
                      <Copy size={15} />
                    </button>
                  )}
                  {selectedBaseId && (
                    <button type="button" className="icon-button danger" title="Delete base" onClick={() => void deleteBase()}>
                      <Trash2 size={15} />
                    </button>
                  )}
                  <Selector
                    icon={<Table2 size={15} />}
                    label="Table"
                    value={selectedTableId ?? ""}
                    options={tables.map((table) => ({ value: table.table_id, label: table.name }))}
                    onChange={setSelectedTableId}
                  />
                  {selectedTableId && (
                    <button
                      type="button"
                      className="icon-button"
                      title="Rename table"
                      onClick={() => {
                        const table = tables.find((t) => t.table_id === selectedTableId);
                        if (table) openRenameModal("table", table.table_id, table.name);
                      }}
                    >
                      <Pencil size={15} />
                    </button>
                  )}
                  <button type="button" className="icon-button" title="Create table" onClick={createTable}>
                    <Grid3X3 size={15} />
                  </button>
                  {selectedTableId && (
                    <button type="button" className="icon-button" title="Duplicate table" onClick={() => void duplicateTable(selectedTableId)}>
                      <Copy size={15} />
                    </button>
                  )}
                  {selectedTableId && (
                    <button type="button" className="icon-button danger" title="Delete table" onClick={() => void deleteTable()}>
                      <Trash2 size={15} />
                    </button>
                  )}
                  <Selector
                    icon={<Plus size={15} />}
                    label="Column"
                    value=""
                    options={[
                      { value: "short_text", label: "Text" },
                      { value: "currency", label: "Currency" }
                    ]}
                    onChange={(fieldType) => {
                      if (fieldType) addField(fieldType as FieldType);
                    }}
                  />
                  <button type="button" className="small-button" onClick={addRecord}>
                    <Plus size={15} />
                    Record
                  </button>
                </div>

                <div className="view-controls-bar">
                  <div className="search-input-wrap">
                    <Search size={15} />
                    <input
                      className="search-input"
                      type="text"
                      placeholder="Search records"
                      value={searchValue}
                      onChange={(event) => { setSearchValue(event.target.value); setNextCursor(null); }}
                    />
                  </div>
                  <Selector
                    icon={<RefreshCcw size={15} />}
                    label="Filter"
                    value={filterFieldId}
                    options={fields.map((field) => ({ value: field.field_id, label: field.name }))}
                    onChange={setFilterFieldId}
                  />
                  <input
                    className="toolbar-input"
                    placeholder="Contains"
                    value={filterValue}
                    onChange={(event) => setFilterValue(event.target.value)}
                  />
                  <Selector
                    icon={<RefreshCcw size={15} />}
                    label="Sort"
                    value={sortFieldId}
                    options={fields.map((field) => ({ value: field.field_id, label: field.name }))}
                    onChange={setSortFieldId}
                  />
                  <select className="role-select compact-select" value={sortDirection} onChange={(event) => setSortDirection(event.target.value as "asc" | "desc")}>
                    <option value="asc">Asc</option>
                    <option value="desc">Desc</option>
                  </select>
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
                  <button type="button" role="tab" aria-selected={activeViewId === null} onClick={showAllRecords}>
                    All records
                  </button>
                  {views.map((view) => (
                    <button type="button" role="tab" className="view-tab" aria-selected={activeViewId === view.saved_view_id} key={view.saved_view_id} onClick={() => setActiveViewId(view.saved_view_id)}>
                      {view.name}
                      <span className="view-tab-close" onClick={(e) => { e.stopPropagation(); void deleteView(view.saved_view_id); }}>&times;</span>
                    </button>
                  ))}
                </div>

                <section className="content-grid">
                  {fields.length === 0 ? (
                    <div className="empty-state">
                      <Table2 size={24} />
                      <strong>No fields yet</strong>
                      <span>Add a field to start building your table.</span>
                      <button type="button" className="small-button primary" onClick={() => addField("short_text")}>
                        <Plus size={15} />
                        Add text field
                      </button>
                    </div>
                  ) : (
                    <div className="grid-panel">
                      {records.length > 0 && fields.length > 0 && (
                        <div className="pagination-bar">
                          <span className="pagination-info">
                            {records.length.toLocaleString()} row{records.length !== 1 ? "s" : ""} loaded
                            {hasMore ? " · loading ahead as you scroll" : " · all records loaded"}
                          </span>
                        </div>
                      )}
                      <DataGrid
                        fields={visibleFields}
                        allFields={fields}
                        records={searchedRecords}
                        editingCell={editingCell}
                        draftValue={draftValue}
                        onDraftChange={setDraftValue}
                        onStartEdit={(record, field) => {
                          setEditingCell({ recordId: record.record_id, fieldId: field.field_id });
                          setDraftValue(String(record[field.physical_column_name] ?? ""));
                        }}
                        onCancelEdit={() => setEditingCell(null)}
                        onSaveCell={saveCell}
                        onDeleteRecord={deleteRecord}
                        onRenameField={(fieldId, name) => {
                          if (selectedTableId) openRenameModal("field", fieldId, name, selectedTableId);
                        }}
                        onMoveField={moveField}
                        onHideField={hideField}
                        onDeleteField={deleteField}
                        onContextMenu={(x, y, items) => setContextMenu({ x, y, items })}
                        onLoadMore={loadMore}
                        hasMore={hasMore}
                        initialLoading={loadingRows}
                        loadingMore={loadingMore}
                        loadMoreError={loadMoreError}
                      />
                    </div>
                  )}

                  <RightRail
                    currentUser={currentUser}
                    profile={profile}
                    members={members}
                    directUserId={directUserId}
                    directRole={directRole}
                    onDirectUserIdChange={setDirectUserId}
                    onDirectRoleChange={setDirectRole}
                    onAddDirectMember={addDirectMember}
                    onChangeRole={changeMemberRole}
                    onRemoveMember={removeMember}
                  />
                </section>
              </>
            )}
          </>
        )}

        <footer className={`status-bar ${status.tone}`} aria-live="polite">
          {loading ? "Loading" : status.text}
        </footer>
      </section>

      {modalEntity && (
        <div className="modal-overlay" onClick={() => setModalEntity(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">
              {modalEntity.mode === "rename" ? `Rename ${modalEntity.type}` : `New ${modalEntity.type}`}
            </h3>
            <input
              className="modal-input"
              autoFocus
              placeholder={modalEntity.mode === "create" ? `Enter ${modalEntity.type} name` : undefined}
              value={modalValue}
              onChange={(e) => setModalValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmModal();
                if (e.key === "Escape") setModalEntity(null);
              }}
            />
            <div className="modal-actions">
              <button type="button" className="small-button" onClick={() => setModalEntity(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="small-button primary"
                onClick={confirmModal}
                disabled={!modalValue.trim() || (modalEntity.mode === "rename" && modalValue === modalEntity.name)}
              >
                {modalEntity.mode === "rename" ? "Save" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {contextMenu && (
        <div className="context-menu-overlay" onClick={() => setContextMenu(null)}>
          <div
            className="context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            {contextMenu.items.map((item, i) => (
              item.divider ? (
                <div key={i} className="context-menu-divider" />
              ) : (
                <button
                  key={i}
                  type="button"
                  className={`context-menu-item${item.className ? ` ${item.className}` : ""}`}
                  onClick={() => {
                    item.onClick();
                    setContextMenu(null);
                  }}
                >
                  {item.label}
                </button>
              )
            ))}
          </div>
        </div>
      )}
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
  const [handle, setHandle] = useState("");
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
      if (mode === "sign-up") {
        await mutate("/api/me/profile", {
          handle: handle.trim() || name.trim() || email.trim().split("@")[0],
          displayName: name.trim() || email.trim()
        }, "PUT");
      }
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
          <>
            <label className="stacked-field">
              <span>Name</span>
              <input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="stacked-field">
              <span>User id</span>
              <input autoComplete="username" value={handle} onChange={(event) => setHandle(event.target.value)} />
            </label>
          </>
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
  profile: UserProfile | null;
  apiServerUrl: string;
  onApiServerChange: (url: string) => Promise<void>;
  onProfileChange: (profile: UserProfile) => void;
  onLogout: () => Promise<void>;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
}) {
  const [serverDraft, setServerDraft] = useState(props.apiServerUrl);
  const [handleDraft, setHandleDraft] = useState(props.profile?.handle ?? "");
  const [serverStatus, setServerStatus] = useState("");
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("");
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  useEffect(() => {
    setServerDraft(props.apiServerUrl);
  }, [props.apiServerUrl]);

  useEffect(() => {
    setHandleDraft(props.profile?.handle ?? "");
  }, [props.profile?.handle]);

  async function saveServer() {
    try {
      await props.onApiServerChange(serverDraft);
      setServerStatus("Server updated");
    } catch (error) {
      setServerStatus(errorMessage(error));
    }
  }

  async function saveProfile() {
    try {
      const response = await mutate<{ data: UserProfile }>("/api/me/profile", {
        handle: handleDraft,
        displayName: props.user.name || props.user.email || handleDraft
      }, "PUT");
      props.onProfileChange(response.data);
      setServerStatus("User id updated");
    } catch (error) {
      setServerStatus(errorMessage(error));
    }
  }

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordStatus("Passwords do not match");
      return;
    }
    setPasswordSubmitting(true);
    setPasswordStatus("");
    const ok = await props.onChangePassword(currentPassword, newPassword);
    setPasswordSubmitting(false);
    if (ok) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswordForm(false);
      setPasswordStatus("");
    } else {
      setPasswordStatus("Failed to change password");
    }
  }

  return (
    <div className="account-stack">
      <div className="account-block">
        <UserRound size={16} />
        <div>
          <strong>{props.profile?.handle ? `@${props.profile.handle}` : props.user.name || props.user.email || "Signed in"}</strong>
          <span>{props.profile?.can_create_workspaces ? "Can create" : "Shared access only"}</span>
        </div>
        <button type="button" className="icon-button" onClick={() => void props.onLogout()} aria-label="Sign out">
          <LogOut size={16} />
        </button>
      </div>

      <label className="stacked-field server-field">
        <span>User id</span>
        <input value={handleDraft} spellCheck={false} onChange={(event) => setHandleDraft(event.target.value)} />
      </label>
      <button type="button" className="small-button" onClick={() => void saveProfile()}>
        <UserRound size={15} />
        Save id
      </button>

      {!showPasswordForm ? (
        <button type="button" className="small-button" onClick={() => setShowPasswordForm(true)}>
          Change password
        </button>
      ) : (
        <form className="password-change-form" onSubmit={(event) => void submitPassword(event)}>
          <label className="stacked-field server-field">
            <span>Current password</span>
            <input type="password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
          </label>
          <label className="stacked-field server-field">
            <span>New password</span>
            <input type="password" required minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
          </label>
          <label className="stacked-field server-field">
            <span>Confirm new password</span>
            <input type="password" required minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
          </label>
          <div className="inline-form">
            <button type="submit" className="small-button" disabled={passwordSubmitting || !currentPassword || !newPassword}>
              {passwordSubmitting ? "Saving" : "Save password"}
            </button>
            <button type="button" className="small-button" onClick={() => { setShowPasswordForm(false); setPasswordStatus(""); setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); }}>
              Cancel
            </button>
          </div>
          {passwordStatus && <span className="server-status">{passwordStatus}</span>}
        </form>
      )}

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
  profile: UserProfile | null;
  members: WorkspaceMember[];
  directUserId: string;
  directRole: WorkspaceRole;
  onDirectUserIdChange: (value: string) => void;
  onDirectRoleChange: (value: WorkspaceRole) => void;
  onAddDirectMember: () => Promise<void>;
  onChangeRole: (member: WorkspaceMember, role: WorkspaceRole) => Promise<void>;
  onRemoveMember: (member: WorkspaceMember) => Promise<void>;
}) {
  return (
    <aside className="right-rail" aria-label="Workspace members">
      <section className="admin-panel">
        <div className="panel-heading">
          <ShieldCheck size={16} />
          <span>Workspace members</span>
        </div>

        <div className="admin-section">
          <label className="stacked-field">
            <span>User id or handle</span>
            <input value={props.directUserId} onChange={(event) => props.onDirectUserIdChange(event.target.value)} />
          </label>
          <div className="inline-form">
            <RoleSelect value={props.directRole} onChange={props.onDirectRoleChange} />
            <button type="button" className="small-button" onClick={() => props.onDirectUserIdChange(props.profile?.handle ?? props.currentUser.id)}>
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
                <strong>{member.handle ? `@${member.handle}` : member.user_id}</strong>
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

      </section>
    </aside>
  );
}

function AdminPanel(props: {
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

function RoleSelect(props: { value: WorkspaceRole; onChange: (value: WorkspaceRole) => void }) {
  return (
    <select className="role-select" value={props.value} onChange={(event) => props.onChange(event.target.value as WorkspaceRole)}>
      <option value="admin">Admin</option>
      <option value="editor">Editor</option>
      <option value="viewer">Viewer</option>
    </select>
  );
}

function CreateUserForm(props: {
  onCreateUser: (fields: { email: string; password: string; handle: string; displayName: string; canCreateWorkspaces: boolean; canManageUsers: boolean }) => Promise<UserProfile | undefined>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [canCreateWorkspaces, setCanCreateWorkspaces] = useState(false);
  const [canManageUsers, setCanManageUsers] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    const result = await props.onCreateUser({
      email: email.trim(),
      password,
      handle: handle.trim() || email.trim().split("@")[0] || "",
      displayName: displayName.trim() || email.trim().split("@")[0] || "",
      canCreateWorkspaces,
      canManageUsers
    });
    setSubmitting(false);
    if (result) {
      setEmail("");
      setPassword("");
      setHandle("");
      setDisplayName("");
      setCanCreateWorkspaces(false);
      setCanManageUsers(false);
    }
  }

  return (
    <form className="create-user-form" onSubmit={(event) => void submit(event)}>
      <label className="stacked-field">
        <span>Email</span>
        <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
      </label>
      <label className="stacked-field">
        <span>Password</span>
        <input type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} />
      </label>
      <label className="stacked-field">
        <span>Handle</span>
        <input value={handle} placeholder={email.trim().split("@")[0] || "auto from email"} onChange={(event) => setHandle(event.target.value)} />
      </label>
      <label className="stacked-field">
        <span>Display name</span>
        <input value={displayName} placeholder={email.trim().split("@")[0] || "auto from email"} onChange={(event) => setDisplayName(event.target.value)} />
      </label>
      <div className="inline-form">
        <label>
          <input type="checkbox" checked={canCreateWorkspaces} onChange={(event) => setCanCreateWorkspaces(event.target.checked)} />
          Create workspaces
        </label>
        <label>
          <input type="checkbox" checked={canManageUsers} onChange={(event) => setCanManageUsers(event.target.checked)} />
          Manage users
        </label>
      </div>
      <button type="submit" className="small-button" disabled={submitting || !email.trim() || !password}>
        <UserPlus size={15} />
        {submitting ? "Creating" : "Create account"}
      </button>
    </form>
  );
}

function DataGrid(props: {
  fields: Field[];
  allFields: Field[];
  records: RecordRow[];
  editingCell: { recordId: string; fieldId: string } | null;
  draftValue: string;
  onDraftChange: (value: string) => void;
  onStartEdit: (record: RecordRow, field: Field) => void;
  onCancelEdit: () => void;
  onSaveCell: (record: RecordRow, field: Field) => Promise<void>;
  onDeleteRecord: (record: RecordRow) => void;
  onRenameField: (fieldId: string, name: string) => void;
  onMoveField: (fieldId: string, direction: "left" | "right" | "start" | "end") => void;
  onHideField: (fieldId: string) => void;
  onDeleteField: (fieldId: string) => void;
  onContextMenu: (x: number, y: number, items: { label: string; onClick: () => void; className?: string; divider?: boolean }[]) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  initialLoading?: boolean;
  loadingMore?: boolean;
  loadMoreError?: string | null;
}) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const deleteColumnWidth = 40;
  const rowVirtualizer = useVirtualizer({
    count: props.records.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 38,
    overscan: 12,
    getItemKey: (index) => props.records[index]?.record_id ?? index
  });
  const columnVirtualizer = useVirtualizer({
    horizontal: true,
    count: props.fields.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => props.fields[index]?.width ?? 180,
    overscan: 4
  });

  const handleScroll = useCallback(() => {
    const el = parentRef.current;
    if (!el || !props.onLoadMore) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < el.clientHeight * 2) {
      props.onLoadMore();
    }
  }, [props.onLoadMore]);

  const virtualRows = rowVirtualizer.getVirtualItems();
  const virtualColumns = columnVirtualizer.getVirtualItems();
  const totalWidth = columnVirtualizer.getTotalSize() + deleteColumnWidth;
  const totalHeight = rowVirtualizer.getTotalSize();
  const footerHeight = props.initialLoading ? 0 : 42;
  const bodyHeight = props.initialLoading && props.records.length === 0 ? 12 * 38 : totalHeight + footerHeight;

  useEffect(() => {
    if (props.initialLoading && parentRef.current) {
      parentRef.current.scrollTop = 0;
    }
  }, [props.initialLoading]);

  useEffect(() => {
    const lastRow = virtualRows[virtualRows.length - 1];
    if (
      lastRow &&
      props.hasMore &&
      !props.loadingMore &&
      !props.loadMoreError &&
      lastRow.index >= props.records.length - 20
    ) {
      props.onLoadMore?.();
    }
  }, [props.hasMore, props.loadMoreError, props.loadingMore, props.onLoadMore, props.records.length, virtualRows]);

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
      <div className="grid-scroll" ref={parentRef} onScroll={handleScroll}>
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
                onContextMenu={(e) => {
                  e.preventDefault();
                  const fieldIndex = props.allFields.findIndex((f) => f.field_id === field.field_id);
                  const items: { label: string; onClick: () => void; className?: string; divider?: boolean }[] = [
                    { label: "Rename", onClick: () => props.onRenameField(field.field_id, field.name) }
                  ];
                  if (fieldIndex > 0) {
                    items.push({ label: "Move left", onClick: () => props.onMoveField(field.field_id, "left") });
                    items.push({ label: "Move to beginning", onClick: () => props.onMoveField(field.field_id, "start") });
                  }
                  if (fieldIndex < props.allFields.length - 1) {
                    items.push({ label: "Move right", onClick: () => props.onMoveField(field.field_id, "right") });
                    items.push({ label: "Move to end", onClick: () => props.onMoveField(field.field_id, "end") });
                  }
                  items.push({ label: "Hide column", onClick: () => props.onHideField(field.field_id) });
                  items.push({ label: "", onClick: () => {}, divider: true });
                  items.push({ label: "Delete column", onClick: () => props.onDeleteField(field.field_id), className: "danger" });
                  props.onContextMenu(e.clientX, e.clientY, items);
                }}
              >
                <span>{field.name}</span>
                <small>{field.field_type}</small>
              </div>
            );
          })}
          <div
            className="grid-header-cell"
            style={{ left: totalWidth - deleteColumnWidth, width: deleteColumnWidth }}
          />
        </div>
        <div className="grid-body" style={{ width: totalWidth, height: bodyHeight }}>
          {props.initialLoading && props.records.length === 0 && Array.from({ length: 12 }, (_, index) => (
            <div
              className="grid-row grid-skeleton-row"
              key={`skeleton-${index}`}
              style={{ transform: `translateY(${index * 38}px)`, height: 38, width: totalWidth }}
            >
              <span className="grid-skeleton-cell" />
              <span className="grid-skeleton-cell short" />
              <span className="grid-skeleton-cell" />
            </div>
          ))}
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
                <div
                  className="grid-cell-wrap"
                  style={{ left: totalWidth - deleteColumnWidth, width: deleteColumnWidth }}
                >
                  <button
                    type="button"
                    className="icon-button danger"
                    onClick={() => props.onDeleteRecord(record)}
                    aria-label="Delete record"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
          {!props.initialLoading && (
            <div className="grid-load-status" style={{ top: totalHeight, width: totalWidth }} role="status">
              {props.loadMoreError ? (
                <>
                  <span>Couldn’t load more rows: {props.loadMoreError}</span>
                  <button type="button" className="small-button" onClick={props.onLoadMore}>Retry</button>
                </>
              ) : props.loadingMore ? (
                <><span className="loading-dot" /> Loading more rows…</>
              ) : props.hasMore ? (
                "Scroll to continue"
              ) : (
                `All ${props.records.length.toLocaleString()} records loaded`
              )}
            </div>
          )}
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

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  return request<T>(path, init);
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

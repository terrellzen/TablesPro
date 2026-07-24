import { useCallback, useEffect, useMemo, useState } from "react";
import { getConfiguredApiBaseUrl } from "../../lib/api.js";
import { useThemePreference } from "../../lib/useThemePreference.js";
import type {
  AdminWorkspace, AppTable, AuditEvent, AuthUser, Base, Field, FilterRule, RecordSort,
  SavedView, Status, UserProfile, Workspace, WorkspaceMember
} from "../../types/domain.js";
import type { ContextMenuItem, ModalEntity } from "../../types/ui.js";
import { useRecordPagination } from "../grid/useRecordPagination.js";
import { useAppEffects } from "./useAppEffects.js";
import { useAppLoaders } from "./useAppLoaders.js";
import { useAdminActions } from "./actions/useAdminActions.js";
import { useBaseActions } from "./actions/useBaseActions.js";
import { useFieldActions } from "./actions/useFieldActions.js";
import { useRecordActions } from "./actions/useRecordActions.js";
import { useSessionActions } from "./actions/useSessionActions.js";
import { useTableActions } from "./actions/useTableActions.js";
import { useViewActions } from "./actions/useViewActions.js";
import { useWorkspaceActions } from "./actions/useWorkspaceActions.js";

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
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [sorts, setSorts] = useState<RecordSort[]>([]);
  const [searchValue, setSearchValue] = useState("");
  const [showAdmin, setShowAdmin] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ recordId: string; fieldId: string } | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [status, setStatus] = useState<Status>({ tone: "idle", text: "Ready" });
  const [loading, setLoading] = useState(false);
  const [modalEntity, setModalEntity] = useState<ModalEntity | null>(null);
  const [modalValue, setModalValue] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);

  const reportRecordError = useCallback((text: string) => setStatus({ tone: "danger", text }), []);
  const {
    records, setRecords, hasMore, loadingMore, loadingRows, loadMoreError,
    reloadRecords, loadMore, cancelRecordRequests
  } = useRecordPagination({
    selectedTableId, filters, sorts,
    onError: reportRecordError
  });

  const selectedWorkspace = workspaces.find((workspace) => workspace.workspace_id === selectedWorkspaceId) ?? null;
  const workspaceBases = selectedWorkspaceId
    ? bases.filter((base) => base.workspace_id === selectedWorkspaceId)
    : [];
  const selectedBase = workspaceBases.find((base) => base.base_id === selectedBaseId) ?? null;
  const baseTables = selectedBase
    ? tables.filter((table) => table.base_id === selectedBase.base_id)
    : [];
  const selectedTable = baseTables.find((table) => table.table_id === selectedTableId) ?? null;
  const visibleFields = fields.filter((field) => !field.hidden);

  useEffect(() => {
    if (selectedBaseId && !selectedBase) setSelectedBaseId(null);
  }, [selectedBase, selectedBaseId]);

  useEffect(() => {
    if (selectedTableId && !selectedTable) setSelectedTableId(null);
  }, [selectedTable, selectedTableId]);

  const searchedRecords = useMemo(() => {
    if (!searchValue.trim()) return records;
    const term = searchValue.trim().toLowerCase();
    return records.filter((record) => visibleFields.some((field) =>
      String(record[field.physical_column_name] ?? "").toLowerCase().includes(term)
    ));
  }, [records, visibleFields, searchValue]);

  const {
    loadAppConfig, loadCurrentUser, loadWorkspaces, loadBases, loadTables,
    loadAuditEvents, loadAdminAuditEvents, loadAdminWorkspaces, loadAdminData,
    loadUsers, cancelHierarchyRequests, refresh
  } = useAppLoaders({
    profile, selectedWorkspaceId, selectedWorkspaceRole: selectedWorkspace?.role ?? null,
    selectedBaseId, selectedTableId, setAuthChecked,
    setCurrentUser, setSignUpEnabled, setProfile, setWorkspaces, setSelectedWorkspaceId,
    setBases, setSelectedBaseId, setTables, setSelectedTableId, setFields, setViews,
    setAuditEvents, setAdminWorkspaces, setMembers, setUsers, setLoading, setStatus,
    reloadRecords
  });

  useAppEffects({
    apiServerUrl, currentUser, profile, selectedWorkspaceId,
    selectedWorkspaceRole: selectedWorkspace?.role ?? null,
    selectedBaseId, selectedTableId, schemaTableId, activeViewId, views, fields, loadAppConfig,
    loadCurrentUser, loadWorkspaces, loadBases, loadTables, loadAuditEvents,
    loadAdminWorkspaces, loadAdminData, loadUsers, reloadRecords, cancelRecordRequests,
    setSchemaTableId, setSelectedTableId, setBases, setTables, setFields, setRecords, setViews,
    setActiveViewId, setAuditEvents, setMembers, setUsers, setSearchValue,
    setFilters, setSorts, setStatus
  });

  function selectWorkspace(workspaceId: string) {
    if (workspaceId === selectedWorkspaceId) return;
    cancelHierarchyRequests();
    setSelectedWorkspaceId(workspaceId);
    setSelectedBaseId(null);
    setSelectedTableId(null);
    setBases([]);
    setTables([]);
    setFields([]);
    setRecords([]);
    setViews([]);
    setSchemaTableId(null);
    setActiveViewId(null);
    setEditingCell(null);
    cancelRecordRequests();
  }

  function showAllRecords() {
    setActiveViewId(null);
    setSearchValue("");
    setFilters([]);
    setSorts([]);
    setFields((current) => current.map((field) => ({ ...field, hidden: false })));
  }

  async function openWorkspaceMembers(workspaceId: string) {
    selectWorkspace(workspaceId);
    try {
      await loadAdminData(workspaceId);
      setShowMembers(true);
    } catch (error) {
      setStatus({ tone: "danger", text: error instanceof Error ? error.message : "Could not load workspace members" });
    }
  }

  const clearTableData = () => {
    setFields([]);
    setRecords([]);
    setViews([]);
  };
  const clearBaseData = () => {
    setTables([]);
    clearTableData();
  };
  const clearWorkspaceData = () => {
    setBases([]);
    clearBaseData();
    setAuditEvents([]);
    setMembers([]);
  };

  const workspaceActions = useWorkspaceActions({
    profile, selectedWorkspaceId, setSelectedWorkspaceId, setSelectedBaseId,
    setSelectedTableId, setWorkspaces, clearWorkspaceData, loadWorkspaces,
    setModalEntity, setModalValue, setStatus
  });
  const baseActions = useBaseActions({
    selectedWorkspaceId, selectedBaseId, setSelectedBaseId, setSelectedTableId,
    setBases, clearBaseData, loadBases, loadAuditEvents, setModalEntity,
    setModalValue, setStatus
  });
  const tableActions = useTableActions({
    selectedWorkspaceId, selectedBaseId, selectedTableId, setSelectedTableId,
    setTables, clearTableData, loadTables, loadAuditEvents, setModalEntity,
    setModalValue, setStatus
  });
  const fieldActions = useFieldActions({
    selectedWorkspaceId, selectedTableId, visibleFieldCount: visibleFields.length,
    setFields, reloadRecords, loadAuditEvents, setModalEntity, setModalValue, setStatus
  });
  const recordActions = useRecordActions({
    selectedWorkspaceId, selectedTableId, visibleFields, draftValue, setEditingCell,
    setRecords, reloadRecords, loadAuditEvents, setStatus
  });
  const viewActions = useViewActions({
    selectedWorkspaceId, selectedTableId, activeViewId, filters, sorts,
    searchValue, fields, visibleFields, showAllRecords,
    setViews, setActiveViewId, reloadRecords, loadAuditEvents, setModalEntity,
    setModalValue, setStatus
  });
  const adminActions = useAdminActions({
    selectedWorkspaceId, setUsers,
    loadAdminData, loadAuditEvents, setStatus
  });
  const sessionActions = useSessionActions({
    loadCurrentUser, loadWorkspaces, setApiServerUrl, setCurrentUser,
    setWorkspaces, setBases, setTables, setFields, setRecords, setViews,
    setAuditEvents, setMembers, setUsers, setSelectedWorkspaceId, setSelectedBaseId,
    setSelectedTableId, setStatus
  });

  function openRenameModal(
    type: "workspace" | "base" | "table" | "field",
    id: string,
    name: string,
    parentId?: string
  ) {
    setModalEntity(parentId !== undefined
      ? { mode: "rename", type, id, parentId, name }
      : { mode: "rename", type, id, name });
    setModalValue(name);
    setContextMenu(null);
  }

  function confirmModal() {
    if (!modalEntity || !modalValue.trim()) return;
    if (modalEntity.mode === "rename") {
      const { type, id, parentId } = modalEntity;
      if (type === "workspace") void workspaceActions.renameWorkspace(id!, modalValue);
      if (type === "base") void baseActions.renameBase(id!, modalValue);
      if (type === "table") void tableActions.renameTable(id!, modalValue);
      if (type === "field") void fieldActions.renameField(parentId!, id!, modalValue);
    } else {
      const { type, fieldType, parentId } = modalEntity;
      if (type === "workspace") void workspaceActions.createWorkspaceWithName(modalValue);
      if (type === "base") void baseActions.createBaseWithName(modalValue);
      if (type === "table") void tableActions.createTableWithName(modalValue);
      if (type === "field") void fieldActions.createFieldWithName(modalValue, fieldType!, parentId!);
      if (type === "view") void viewActions.createViewWithName(modalValue);
    }
    setModalEntity(null);
  }

  return {
    themePreference, setThemePreference,
    authChecked, currentUser, apiServerUrl, signUpEnabled, profile, setProfile,
    workspaces, bases: workspaceBases, tables: baseTables, fields, records, views, activeViewId, setActiveViewId,
    auditEvents, adminWorkspaces, members, users,
    filters, setFilters, sorts, setSorts,
    searchValue, setSearchValue, showAdmin, setShowAdmin, showMembers, setShowMembers,
    selectedWorkspaceId, setSelectedWorkspaceId, selectWorkspace, selectedBaseId, setSelectedBaseId,
    selectedTableId, setSelectedTableId, editingCell, setEditingCell,
    draftValue, setDraftValue, status, loading,
    hasMore, loadingMore, loadingRows, loadMoreError,
    modalEntity, setModalEntity, modalValue, setModalValue,
    contextMenu, setContextMenu,
    selectedWorkspace, selectedBase, selectedTable, visibleFields, searchedRecords,
    refresh,
    loadAdminAuditEvents,
    openWorkspaceMembers,
    createWorkspace: workspaceActions.createWorkspace,
    createBase: baseActions.createBase,
    createTable: tableActions.createTable,
    addField: fieldActions.addField,
    addRecord: recordActions.addRecord,
    duplicateRecord: recordActions.duplicateRecord,
    duplicateWorkspace: workspaceActions.duplicateWorkspace,
    duplicateBase: baseActions.duplicateBase,
    duplicateTable: tableActions.duplicateTable,
    createSavedView: viewActions.createSavedView,
    exportCsv: tableActions.exportCsv,
    saveMemberPermissions: adminActions.saveMemberPermissions,
    removeMember: adminActions.removeMember,
    changeUserPermissions: adminActions.changeUserPermissions,
    removeUser: adminActions.removeUser,
    createUser: adminActions.createUser,
    changeMyPassword: sessionActions.changeMyPassword,
    changeUserPassword: adminActions.changeUserPassword,
    saveCell: recordActions.saveCell,
    deleteRecord: recordActions.deleteRecord,
    deleteBase: baseActions.deleteBase,
    deleteTable: tableActions.deleteTable,
    deleteWorkspace: workspaceActions.deleteWorkspace,
    hideField: fieldActions.hideField,
    moveField: fieldActions.moveField,
    deleteField: fieldActions.deleteField,
    setDropdownColor: fieldActions.setDropdownColor,
    openRenameModal,
    confirmModal,
    showAllRecords,
    deleteView: viewActions.deleteView,
    handleAuthenticated: sessionActions.handleAuthenticated,
    handleApiServerChange: sessionActions.handleApiServerChange,
    logout: sessionActions.logout,
    loadMore
  };
}

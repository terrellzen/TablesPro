import { useCallback, useRef } from "react";
import { api } from "../../lib/api.js";
import { errorMessage } from "../../lib/format.js";
import type {
  AdminWorkspace, AppConfig, AppTable, AuditEvent, AuthEnvelope, AuthUser, Base,
  Field, PageEnvelope, SavedView, UserProfile, Workspace, WorkspaceMember
} from "../../types/domain.js";
import type { AsyncLoader, StateSetter, StatusSetter } from "./actions/actionTypes.js";

type AppLoadersOptions = {
  profile: UserProfile | null;
  selectedWorkspaceId: string | null;
  selectedWorkspaceRole: string | null;
  selectedBaseId: string | null;
  selectedTableId: string | null;
  setAuthChecked: StateSetter<boolean>;
  setCurrentUser: StateSetter<AuthUser | null>;
  setSignUpEnabled: StateSetter<boolean>;
  setProfile: StateSetter<UserProfile | null>;
  setWorkspaces: StateSetter<Workspace[]>;
  setSelectedWorkspaceId: StateSetter<string | null>;
  setBases: StateSetter<Base[]>;
  setSelectedBaseId: StateSetter<string | null>;
  setTables: StateSetter<AppTable[]>;
  setSelectedTableId: StateSetter<string | null>;
  setFields: StateSetter<Field[]>;
  setViews: StateSetter<SavedView[]>;
  setAuditEvents: StateSetter<AuditEvent[]>;
  setAdminWorkspaces: StateSetter<AdminWorkspace[]>;
  setMembers: StateSetter<WorkspaceMember[]>;
  setUsers: StateSetter<UserProfile[]>;
  setLoading: StateSetter<boolean>;
  setStatus: StatusSetter;
  reloadRecords: AsyncLoader;
};

export function useAppLoaders(options: AppLoadersOptions) {
  const basesRequest = useRef(0);
  const tablesRequest = useRef(0);
  const activeWorkspaceId = useRef(options.selectedWorkspaceId);
  const activeBaseId = useRef(options.selectedBaseId);
  activeWorkspaceId.current = options.selectedWorkspaceId;
  activeBaseId.current = options.selectedBaseId;
  const cancelHierarchyRequests = useCallback(() => {
    basesRequest.current += 1;
    tablesRequest.current += 1;
  }, []);

  const loadAppConfig = useCallback(async () => {
    try {
      const config = await api<AppConfig>("/api/config");
      options.setSignUpEnabled(config.auth.signUpEnabled);
    } catch {
      options.setSignUpEnabled(false);
    }
  }, []);

  const loadCurrentUser = useCallback(async () => {
    try {
      const session = await api<AuthEnvelope>("/api/me");
      options.setCurrentUser(session.user ?? null);
      options.setProfile(session.profile ?? null);
    } catch {
      options.setCurrentUser(null);
      options.setProfile(null);
    } finally {
      options.setAuthChecked(true);
    }
  }, []);

  const loadWorkspaces = useCallback(async () => {
    const response = await api<PageEnvelope<Workspace>>("/api/workspaces");
    options.setWorkspaces(response.data);
    options.setSelectedWorkspaceId((current) => current ?? response.data[0]?.workspace_id ?? null);
  }, []);

  const loadBases = useCallback(async (workspaceId: string) => {
    const request = ++basesRequest.current;
    const response = await api<PageEnvelope<Base>>("/api/workspaces/" + workspaceId + "/bases");
    if (request !== basesRequest.current || workspaceId !== activeWorkspaceId.current) return;
    options.setBases(response.data);
    options.setSelectedBaseId((current) =>
      response.data.some((base) => base.base_id === current) ? current : response.data[0]?.base_id ?? null
    );
  }, []);

  const loadTables = useCallback(async (baseId: string) => {
    const request = ++tablesRequest.current;
    const response = await api<PageEnvelope<AppTable>>("/api/bases/" + baseId + "/tables");
    if (request !== tablesRequest.current || baseId !== activeBaseId.current) return;
    options.setTables(response.data);
    options.setSelectedTableId((current) =>
      response.data.some((table) => table.table_id === current) ? current : response.data[0]?.table_id ?? null
    );
  }, []);

  const loadAuditEvents = useCallback(async (workspaceId: string) => {
    if (options.selectedWorkspaceRole !== "admin") {
      options.setAuditEvents([]);
      return;
    }
    const response = await api<PageEnvelope<AuditEvent>>(`/api/workspaces/${workspaceId}/audit-events?limit=100`);
    options.setAuditEvents(response.data);
  }, [options.selectedWorkspaceRole]);

  const loadAdminAuditEvents = useCallback(async (
    scope: "all" | "company" | "workspace" = "all",
    workspaceId: string | null = null,
    baseId: string | null = null,
    tableId: string | null = null,
    cursor: string | null = null,
    actorUserId: string | null = null
  ) => {
    const params = new URLSearchParams({ limit: "100" });
    if (scope !== "all") params.set("scope", scope);
    if (workspaceId) params.set("workspaceId", workspaceId);
    if (baseId) params.set("baseId", baseId);
    if (tableId) params.set("tableId", tableId);
    if (cursor) params.set("cursor", cursor);
    if (actorUserId) params.set("actorUserId", actorUserId);
    const response = await api<{ data: AuditEvent[]; page: { nextCursor: string | null } }>(`/api/admin/audit-events?${params.toString()}`);
    return { data: response.data, nextCursor: response.page.nextCursor };
  }, []);

  const loadUsers = useCallback(async () => {
    if (options.profile?.role !== "owner" && options.profile?.role !== "admin") return;
    const response = await api<PageEnvelope<UserProfile>>("/api/users");
    options.setUsers(response.data);
  }, [options.profile]);

  const loadAdminWorkspaces = useCallback(async () => {
    const response = await api<{ data: AdminWorkspace[] }>("/api/admin/workspaces");
    options.setAdminWorkspaces(response.data);
  }, []);

  const loadAdminData = useCallback(async (workspaceId: string) => {
    const memberResponse = await api<PageEnvelope<WorkspaceMember>>(`/api/workspaces/${workspaceId}/members`);
    options.setMembers(memberResponse.data);
    if (options.profile?.role === "owner" || options.profile?.role === "admin") {
      const userResponse = await api<PageEnvelope<UserProfile>>("/api/users");
      options.setUsers(userResponse.data);
    }
  }, [options.profile]);

  const refresh = useCallback(async () => {
    options.setLoading(true);
    try {
      await loadWorkspaces();
      if (options.profile?.role === "owner" || options.profile?.role === "admin") void loadAdminWorkspaces().catch(() => {});
      if (options.selectedWorkspaceId) {
        const tasks = [loadBases(options.selectedWorkspaceId), loadAuditEvents(options.selectedWorkspaceId)];
        if (options.selectedWorkspaceRole === "admin") tasks.push(loadAdminData(options.selectedWorkspaceId));
        await Promise.all(tasks);
      }
      if (options.selectedBaseId) await loadTables(options.selectedBaseId);
      if (options.selectedTableId) {
        const [fieldResponse, viewResponse] = await Promise.all([
          api<PageEnvelope<Field>>(`/api/tables/${options.selectedTableId}/fields`),
          api<PageEnvelope<SavedView>>(`/api/tables/${options.selectedTableId}/views`)
        ]);
        options.setFields(fieldResponse.data);
        options.setViews(viewResponse.data);
        await options.reloadRecords(options.selectedTableId);
      }
      options.setStatus({ tone: "success", text: "Synced" });
    } catch (error) {
      options.setStatus({ tone: "danger", text: errorMessage(error) });
    } finally {
      options.setLoading(false);
    }
  }, [
    loadAdminData, loadAdminWorkspaces, loadAuditEvents, loadBases, loadTables,
    loadWorkspaces, options.profile, options.reloadRecords, options.selectedBaseId,
    options.selectedTableId, options.selectedWorkspaceId, options.selectedWorkspaceRole
  ]);

  return {
    loadAppConfig, loadCurrentUser, loadWorkspaces, loadBases, loadTables,
    loadAuditEvents, loadAdminAuditEvents, loadAdminWorkspaces, loadAdminData,
    loadUsers, cancelHierarchyRequests, refresh
  };
}

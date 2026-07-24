import { useEffect } from "react";
import { api } from "../../lib/api.js";
import { errorMessage } from "../../lib/format.js";
import type {
  AppTable, AuditEvent, AuthUser, Base, Field, FilterRule, PageEnvelope, RecordRow,
  RecordSort, SavedView, UserProfile, WorkspaceMember
} from "../../types/domain.js";
import { filtersFromView, sortsFromView } from "../grid/viewQuery.js";
import type { AsyncLoader, StateSetter, StatusSetter } from "./actions/actionTypes.js";

type AppEffectsOptions = {
  apiServerUrl: string;
  currentUser: AuthUser | null;
  profile: UserProfile | null;
  selectedWorkspaceId: string | null;
  selectedWorkspaceRole: string | null;
  selectedBaseId: string | null;
  selectedTableId: string | null;
  schemaTableId: string | null;
  activeViewId: string | null;
  views: SavedView[];
  fields: Field[];
  loadAppConfig: () => Promise<void>;
  loadCurrentUser: () => Promise<void>;
  loadWorkspaces: () => Promise<void>;
  loadBases: AsyncLoader;
  loadTables: AsyncLoader;
  loadAuditEvents: AsyncLoader;
  loadAdminWorkspaces: () => Promise<void>;
  loadAdminData: AsyncLoader;
  loadUsers: () => Promise<void>;
  reloadRecords: AsyncLoader;
  cancelRecordRequests: () => void;
  setSchemaTableId: StateSetter<string | null>;
  setSelectedTableId: StateSetter<string | null>;
  setBases: StateSetter<Base[]>;
  setTables: StateSetter<AppTable[]>;
  setFields: StateSetter<Field[]>;
  setRecords: StateSetter<RecordRow[]>;
  setViews: StateSetter<SavedView[]>;
  setActiveViewId: StateSetter<string | null>;
  setAuditEvents: StateSetter<AuditEvent[]>;
  setMembers: StateSetter<WorkspaceMember[]>;
  setUsers: StateSetter<UserProfile[]>;
  setSearchValue: StateSetter<string>;
  setFilters: StateSetter<FilterRule[]>;
  setSorts: StateSetter<RecordSort[]>;
  setStatus: StatusSetter;
};

export function useAppEffects(options: AppEffectsOptions) {
  useEffect(() => {
    void Promise.all([options.loadAppConfig(), options.loadCurrentUser()]);
  }, [options.apiServerUrl, options.loadAppConfig, options.loadCurrentUser]);

  useEffect(() => {
    if (!options.currentUser) return;
    options.loadWorkspaces().catch((error) =>
      options.setStatus({ tone: "danger", text: errorMessage(error) })
    );
  }, [options.currentUser, options.loadWorkspaces]);

  useEffect(() => {
    if (options.profile?.role === "owner" || options.profile?.role === "admin") void options.loadAdminWorkspaces().catch(() => {});
  }, [options.profile, options.loadAdminWorkspaces]);

  useEffect(() => {
    if (options.profile?.role === "owner" || options.profile?.role === "admin") void options.loadUsers().catch(() => {});
  }, [options.profile, options.loadUsers]);

  useEffect(() => {
    if (!options.selectedWorkspaceId) {
      options.setBases([]);
      options.setAuditEvents([]);
      options.setMembers([]);
      options.setSearchValue("");
      return;
    }
    const tasks = [options.loadBases(options.selectedWorkspaceId)];
    if (options.selectedWorkspaceRole === "admin") {
      tasks.push(options.loadAuditEvents(options.selectedWorkspaceId), options.loadAdminData(options.selectedWorkspaceId));
    } else {
      options.setAuditEvents([]);
      options.setMembers([]);
    }
    Promise.all(tasks).catch((error) => options.setStatus({ tone: "danger", text: errorMessage(error) }));
  }, [
    options.loadAdminData, options.loadAuditEvents, options.loadBases,
    options.selectedWorkspaceId, options.selectedWorkspaceRole
  ]);

  useEffect(() => {
    if (!options.selectedBaseId) {
      options.setSelectedTableId(null);
      options.setTables([]);
      return;
    }
    options.loadTables(options.selectedBaseId).catch((error) =>
      options.setStatus({ tone: "danger", text: errorMessage(error) })
    );
  }, [options.loadTables, options.selectedBaseId]);

  useEffect(() => {
    if (!options.selectedTableId) {
      options.setSchemaTableId(null);
      options.setFields([]);
      options.setRecords([]);
      options.setViews([]);
      options.setActiveViewId(null);
      options.setSearchValue("");
      options.cancelRecordRequests();
      return;
    }
    const controller = new AbortController();
    options.setSchemaTableId(null);
    options.setFields([]);
    options.setViews([]);
    options.setActiveViewId(null);
    options.setSearchValue("");
    options.setFilters([]);
    options.setSorts([]);
    options.setRecords([]);
    options.cancelRecordRequests();
    Promise.all([
      api<PageEnvelope<Field>>(`/api/tables/${options.selectedTableId}/fields`, { signal: controller.signal }),
      api<PageEnvelope<SavedView>>(`/api/tables/${options.selectedTableId}/views`, { signal: controller.signal })
    ]).then(([fieldResponse, viewResponse]) => {
      options.setFields(fieldResponse.data);
      options.setViews(viewResponse.data);
      options.setSchemaTableId(options.selectedTableId);
    }).catch((error) => {
      if (!controller.signal.aborted) options.setStatus({ tone: "danger", text: errorMessage(error) });
    });
    return () => controller.abort();
  }, [options.selectedTableId]);

  useEffect(() => {
    if (!options.activeViewId) return;
    const view = options.views.find((candidate) => candidate.saved_view_id === options.activeViewId);
    if (!view) return;
    const visibleFieldIds = new Set(view.visible_field_ids ?? []);
    const order = new Map((view.field_order ?? []).map((fieldId, index) => [fieldId, index]));
    options.setFields((current) => [...current]
      .sort((left, right) =>
        (order.get(left.field_id) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(right.field_id) ?? Number.MAX_SAFE_INTEGER)
      )
      .map((field) => ({
        ...field,
        hidden: view.field_order?.length > 0 ? !visibleFieldIds.has(field.field_id) : false
      })));
    options.setSearchValue(view.search ?? "");
    const fieldIds = new Set(options.fields.map((field) => field.field_id));
    options.setFilters(filtersFromView(view.filters).filter((filter) => fieldIds.has(filter.fieldId)));
    options.setSorts(sortsFromView(view.sorts).filter((sort) => fieldIds.has(sort.fieldId)));
  }, [options.activeViewId, options.views]);

  useEffect(() => {
    if (!options.selectedTableId || options.schemaTableId !== options.selectedTableId) return;
    void options.reloadRecords(options.selectedTableId);
    return options.cancelRecordRequests;
  }, [options.schemaTableId, options.selectedTableId, options.reloadRecords]);
}

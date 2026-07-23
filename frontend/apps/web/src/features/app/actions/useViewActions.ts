import { api, mutate, request } from "../../../lib/api.js";
import { errorMessage } from "../../../lib/format.js";
import type {
  Field, FilterRule, PageEnvelope, RecordSort, SavedView
} from "../../../types/domain.js";
import { toFilterExpression } from "../../grid/viewQuery.js";
import type { ModalEntity } from "../../../types/ui.js";
import type { AsyncLoader, StateSetter, StatusSetter } from "./actionTypes.js";

type ViewActionsOptions = {
  selectedWorkspaceId: string | null;
  selectedTableId: string | null;
  activeViewId: string | null;
  filters: FilterRule[];
  sorts: RecordSort[];
  searchValue: string;
  fields: Field[];
  visibleFields: Field[];
  showAllRecords: () => void;
  setViews: StateSetter<SavedView[]>;
  setActiveViewId: StateSetter<string | null>;
  reloadRecords: AsyncLoader;
  loadAuditEvents: AsyncLoader;
  setModalEntity: StateSetter<ModalEntity | null>;
  setModalValue: StateSetter<string>;
  setStatus: StatusSetter;
};

export function useViewActions(options: ViewActionsOptions) {
  const {
    selectedWorkspaceId, selectedTableId, activeViewId, filters, sorts,
    searchValue, fields, visibleFields, showAllRecords,
    setViews, setActiveViewId, reloadRecords, loadAuditEvents, setModalEntity,
    setModalValue, setStatus
  } = options;

  async function createSavedView() {
    if (!selectedTableId || !selectedWorkspaceId) return;
    setModalEntity({ mode: "create", type: "view" });
    setModalValue("");
  }

  async function createViewWithName(name: string) {
    if (!selectedTableId || !selectedWorkspaceId) return;
    const trimmedName = name.trim();
    const filterExpression = toFilterExpression(filters);
    try {
      const response = await mutate<{ data: { saved_view_id: string } }>(`/api/tables/${selectedTableId}/views`, {
        name: trimmedName,
        isShared: true,
        search: searchValue || null,
        visibleFieldIds: visibleFields.map((field) => field.field_id),
        fieldOrder: fields.map((field) => field.field_id),
        filters: filterExpression ? [filterExpression] : [],
        sorts
      });
      const viewResponse = await api<PageEnvelope<SavedView>>(`/api/tables/${selectedTableId}/views`);
      setViews(viewResponse.data);
      setActiveViewId(response.data.saved_view_id);
      await loadAuditEvents(selectedWorkspaceId);
      setStatus({ tone: "success", text: `View “${trimmedName}” saved` });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  async function deleteView(viewId: string) {
    if (!selectedTableId || !selectedWorkspaceId || !window.confirm("Delete this view?")) return;
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

  return { createSavedView, createViewWithName, deleteView };
}

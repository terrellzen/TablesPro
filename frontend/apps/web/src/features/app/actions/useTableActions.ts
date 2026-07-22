import { mutate, request } from "../../../lib/api.js";
import { errorMessage } from "../../../lib/format.js";
import type { AppTable } from "../../../types/domain.js";
import type { ModalEntity } from "../../../types/ui.js";
import type { AsyncLoader, StateSetter, StatusSetter } from "./actionTypes.js";

type TableActionsOptions = {
  selectedWorkspaceId: string | null;
  selectedBaseId: string | null;
  selectedTableId: string | null;
  setSelectedTableId: StateSetter<string | null>;
  setTables: StateSetter<AppTable[]>;
  clearTableData: () => void;
  loadTables: AsyncLoader;
  loadAuditEvents: AsyncLoader;
  setModalEntity: StateSetter<ModalEntity | null>;
  setModalValue: StateSetter<string>;
  setStatus: StatusSetter;
};

export function useTableActions(options: TableActionsOptions) {
  const {
    selectedWorkspaceId, selectedBaseId, selectedTableId, setSelectedTableId,
    setTables, clearTableData, loadTables, loadAuditEvents, setModalEntity,
    setModalValue, setStatus
  } = options;

  async function createTable() {
    if (!selectedBaseId || !selectedWorkspaceId) return;
    setModalEntity({ mode: "create", type: "table" });
    setModalValue("");
  }

  async function createTableWithName(name: string) {
    if (!selectedBaseId || !selectedWorkspaceId) return;
    const response = await mutate<{ data: { tableId: string } }>(`/api/bases/${selectedBaseId}/tables`, { name });
    setSelectedTableId(response.data.tableId);
    await loadTables(selectedBaseId);
    await loadAuditEvents(selectedWorkspaceId);
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

  async function deleteTable() {
    if (!selectedBaseId || !selectedTableId || !selectedWorkspaceId || !confirm("Delete this table and all its data?")) return;
    try {
      await request(`/api/bases/${selectedBaseId}/tables/${selectedTableId}`, { method: "DELETE" });
      setSelectedTableId(null);
      clearTableData();
      await loadTables(selectedBaseId);
      await loadAuditEvents(selectedWorkspaceId);
      setStatus({ tone: "success", text: "Table deleted" });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  async function renameTable(tableId: string, name: string) {
    const trimmedName = name.trim();
    if (!trimmedName || !selectedBaseId || !selectedWorkspaceId) return;
    try {
      await mutate(`/api/tables/${tableId}`, { name: trimmedName }, "PATCH");
      setTables((current) => current.map((table) => table.table_id === tableId ? { ...table, name: trimmedName } : table));
      setStatus({ tone: "success", text: "Table renamed" });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  async function exportCsv() {
    if (!selectedTableId || !selectedWorkspaceId) return;
    const response = await mutate<{ data: { jobId: string } }>(`/api/tables/${selectedTableId}/export-jobs`, {});
    await loadAuditEvents(selectedWorkspaceId);
    setStatus({ tone: "success", text: `Export queued: ${response.data.jobId}` });
  }

  return { createTable, createTableWithName, duplicateTable, deleteTable, renameTable, exportCsv };
}

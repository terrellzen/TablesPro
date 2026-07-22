import { mutate, request } from "../../../lib/api.js";
import { coerceFieldValue, errorMessage, fieldValueChanged } from "../../../lib/format.js";
import type { Field, RecordRow } from "../../../types/domain.js";
import type { AsyncLoader, StateSetter, StatusSetter } from "./actionTypes.js";

type RecordActionsOptions = {
  selectedWorkspaceId: string | null;
  selectedTableId: string | null;
  visibleFields: Field[];
  draftValue: string;
  setEditingCell: StateSetter<{ recordId: string; fieldId: string } | null>;
  setRecords: StateSetter<RecordRow[]>;
  reloadRecords: AsyncLoader;
  loadAuditEvents: AsyncLoader;
  setStatus: StatusSetter;
};

export function useRecordActions(options: RecordActionsOptions) {
  const {
    selectedWorkspaceId, selectedTableId, visibleFields, draftValue,
    setEditingCell, setRecords, reloadRecords, loadAuditEvents, setStatus
  } = options;

  async function addRecord() {
    if (!selectedTableId || visibleFields.length === 0 || !selectedWorkspaceId) return;
    await mutate(`/api/tables/${selectedTableId}/records`, {
      values: Object.fromEntries(visibleFields.map((field) => [field.field_id, null]))
    });
    await reloadRecords(selectedTableId);
    await loadAuditEvents(selectedWorkspaceId);
  }

  async function saveCell(record: RecordRow, field: Field) {
    if (!selectedTableId || !selectedWorkspaceId) return;
    setEditingCell(null);
    const storedValue = record[field.physical_column_name];
    if (!fieldValueChanged(draftValue, storedValue, field.field_type)) return;

    setRecords((current) => current.map((row) =>
      row.record_id === record.record_id ? { ...row, [field.physical_column_name]: draftValue } : row
    ));
    try {
      const response = await mutate<{ data: RecordRow }>(`/api/tables/${selectedTableId}/records/${record.record_id}`, {
        rowVersion: Number(record.row_version),
        values: { [field.field_id]: coerceFieldValue(draftValue, field.field_type) }
      }, "PATCH");
      setRecords((current) => current.map((row) => row.record_id === record.record_id ? response.data : row));
      await loadAuditEvents(selectedWorkspaceId);
      setStatus({ tone: "success", text: "Cell saved" });
    } catch (error) {
      setRecords((current) => current.map((row) => row.record_id === record.record_id ? record : row));
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  async function deleteRecord(record: RecordRow) {
    if (!selectedTableId || !selectedWorkspaceId || !confirm("Delete this record?")) return;
    try {
      await request(`/api/tables/${selectedTableId}/records/${record.record_id}`, { method: "DELETE" });
      setRecords((current) => current.filter((row) => row.record_id !== record.record_id));
      await loadAuditEvents(selectedWorkspaceId);
      setStatus({ tone: "success", text: "Record deleted" });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  return { addRecord, saveCell, deleteRecord };
}

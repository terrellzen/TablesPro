import { useRef } from "react";
import { api, mutate, request } from "../../../lib/api.js";
import { errorMessage } from "../../../lib/format.js";
import type { Field, FieldOptions, FieldType, PageEnvelope } from "../../../types/domain.js";
import type { ModalEntity } from "../../../types/ui.js";
import type { AsyncLoader, StateSetter, StatusSetter } from "./actionTypes.js";

type FieldActionsOptions = {
  selectedWorkspaceId: string | null;
  selectedTableId: string | null;
  visibleFieldCount: number;
  setFields: StateSetter<Field[]>;
  reloadRecords: AsyncLoader;
  loadAuditEvents: AsyncLoader;
  setModalEntity: StateSetter<ModalEntity | null>;
  setModalValue: StateSetter<string>;
  setStatus: StatusSetter;
};

export function useFieldActions(options: FieldActionsOptions) {
  const deletingFieldIdsRef = useRef(new Set<string>());
  const {
    selectedWorkspaceId, selectedTableId, visibleFieldCount, setFields,
    reloadRecords, loadAuditEvents, setModalEntity, setModalValue, setStatus
  } = options;

  async function addField(fieldType: FieldType) {
    if (!selectedTableId || !selectedWorkspaceId) return;
    setModalEntity({ mode: "create", type: "field", fieldType, parentId: selectedTableId });
    setModalValue("");
  }

  async function createFieldWithName(name: string, fieldType: FieldType, tableId: string) {
    if (!selectedWorkspaceId) return;
    const trimmedName = name.trim();
    try {
      await mutate(`/api/tables/${tableId}/fields`, { name: trimmedName, fieldType });
      const response = await api<PageEnvelope<Field>>(`/api/tables/${tableId}/fields`);
      setFields(response.data);
      await Promise.all([reloadRecords(tableId), loadAuditEvents(selectedWorkspaceId)]);
      setStatus({ tone: "success", text: `Column “${trimmedName}” created` });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  async function renameField(tableId: string, fieldId: string, name: string) {
    const trimmedName = name.trim();
    if (!trimmedName || !selectedWorkspaceId) return;
    try {
      await mutate(`/api/tables/${tableId}/fields/${fieldId}`, { name: trimmedName }, "PATCH");
      setFields((current) => current.map((field) => field.field_id === fieldId ? { ...field, name: trimmedName } : field));
      setStatus({ tone: "success", text: "Field renamed" });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  function hideField(fieldId: string) {
    if (visibleFieldCount <= 1) {
      setStatus({ tone: "danger", text: "A view must keep at least one column visible" });
      return;
    }
    setFields((current) => current.map((field) => field.field_id === fieldId ? { ...field, hidden: true } : field));
    setStatus({ tone: "idle", text: "Column hidden · save the view to keep this layout" });
  }

  async function moveField(fieldId: string, direction: "left" | "right" | "start" | "end") {
    if (!selectedTableId || !selectedWorkspaceId) return;
    setFields((current) => {
      const index = current.findIndex((field) => field.field_id === fieldId);
      if (index < 0) return current;
      const next = [...current];
      const target = direction === "left" ? index - 1
        : direction === "right" ? index + 1
          : direction === "start" ? 0 : next.length - 1;
      if (target < 0 || target >= next.length || target === index) return current;
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved!);
      void mutate(`/api/tables/${selectedTableId}/fields/reorder`, {
        fieldOrder: next.map((field) => field.field_id)
      }).then(() => setStatus({ tone: "success", text: "Field moved" }))
        .catch((error) => setStatus({ tone: "danger", text: errorMessage(error) }));
      return next;
    });
  }

  async function deleteField(fieldId: string) {
    if (!selectedTableId || !selectedWorkspaceId || deletingFieldIdsRef.current.has(fieldId)) return;
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

  async function setDropdownColor(fieldId: string, value: string, color: string) {
    if (!selectedTableId || !selectedWorkspaceId) return;
    try {
      const response = await mutate<{ data: { options: FieldOptions } }>(
        `/api/tables/${selectedTableId}/fields/${fieldId}/dropdown-colors`,
        { value, color },
        "PATCH"
      );
      setFields((current) => current.map((field) =>
        field.field_id === fieldId ? { ...field, options: response.data.options } : field
      ));
      await loadAuditEvents(selectedWorkspaceId);
      setStatus({ tone: "success", text: `Color updated for “${value}”` });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  return {
    addField, createFieldWithName, renameField, hideField, moveField, deleteField,
    setDropdownColor
  };
}

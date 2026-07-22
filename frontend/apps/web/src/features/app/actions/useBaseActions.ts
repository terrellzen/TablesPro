import { mutate, request } from "../../../lib/api.js";
import { errorMessage } from "../../../lib/format.js";
import type { Base } from "../../../types/domain.js";
import type { ModalEntity } from "../../../types/ui.js";
import type { AsyncLoader, StateSetter, StatusSetter } from "./actionTypes.js";

type BaseActionsOptions = {
  selectedWorkspaceId: string | null;
  selectedBaseId: string | null;
  setSelectedBaseId: StateSetter<string | null>;
  setSelectedTableId: StateSetter<string | null>;
  setBases: StateSetter<Base[]>;
  clearBaseData: () => void;
  loadBases: AsyncLoader;
  loadAuditEvents: AsyncLoader;
  setModalEntity: StateSetter<ModalEntity | null>;
  setModalValue: StateSetter<string>;
  setStatus: StatusSetter;
};

export function useBaseActions(options: BaseActionsOptions) {
  const {
    selectedWorkspaceId, selectedBaseId, setSelectedBaseId, setSelectedTableId,
    setBases, clearBaseData, loadBases, loadAuditEvents, setModalEntity,
    setModalValue, setStatus
  } = options;

  async function createBase() {
    if (!selectedWorkspaceId) return;
    setModalEntity({ mode: "create", type: "base" });
    setModalValue("");
  }

  async function createBaseWithName(name: string) {
    if (!selectedWorkspaceId) return;
    const response = await mutate<{ data: Base }>(`/api/workspaces/${selectedWorkspaceId}/bases`, { name });
    setSelectedBaseId(response.data.base_id);
    await loadBases(selectedWorkspaceId);
    await loadAuditEvents(selectedWorkspaceId);
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

  async function deleteBase() {
    if (!selectedBaseId || !selectedWorkspaceId || !confirm("Delete this base and all its tables?")) return;
    try {
      await request(`/api/workspaces/${selectedWorkspaceId}/bases/${selectedBaseId}`, { method: "DELETE" });
      setSelectedBaseId(null);
      setSelectedTableId(null);
      clearBaseData();
      await loadBases(selectedWorkspaceId);
      await loadAuditEvents(selectedWorkspaceId);
      setStatus({ tone: "success", text: "Base deleted" });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  async function renameBase(baseId: string, name: string) {
    const trimmedName = name.trim();
    if (!trimmedName || !selectedWorkspaceId) return;
    try {
      await mutate(`/api/bases/${baseId}`, { name: trimmedName }, "PATCH");
      setBases((current) => current.map((base) => base.base_id === baseId ? { ...base, name: trimmedName } : base));
      setStatus({ tone: "success", text: "Base renamed" });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  return { createBase, createBaseWithName, duplicateBase, deleteBase, renameBase };
}

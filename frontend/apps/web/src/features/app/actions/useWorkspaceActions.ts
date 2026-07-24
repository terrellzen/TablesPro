import { mutate, request } from "../../../lib/api.js";
import { errorMessage } from "../../../lib/format.js";
import type { UserProfile, Workspace } from "../../../types/domain.js";
import type { ModalEntity } from "../../../types/ui.js";
import type { StateSetter, StatusSetter } from "./actionTypes.js";

type WorkspaceActionsOptions = {
  profile: UserProfile | null;
  selectedWorkspaceId: string | null;
  setSelectedWorkspaceId: StateSetter<string | null>;
  setSelectedBaseId: StateSetter<string | null>;
  setSelectedTableId: StateSetter<string | null>;
  setWorkspaces: StateSetter<Workspace[]>;
  clearWorkspaceData: () => void;
  loadWorkspaces: () => Promise<void>;
  setModalEntity: StateSetter<ModalEntity | null>;
  setModalValue: StateSetter<string>;
  setStatus: StatusSetter;
};

export function useWorkspaceActions(options: WorkspaceActionsOptions) {
  const {
    profile, selectedWorkspaceId, setSelectedWorkspaceId, setSelectedBaseId,
    setSelectedTableId, setWorkspaces, clearWorkspaceData, loadWorkspaces,
    setModalEntity, setModalValue, setStatus
  } = options;

  async function createWorkspace() {
    if (profile?.role === "member") {
      setStatus({ tone: "danger", text: "You do not have permission to create workspaces" });
      return;
    }
    setModalEntity({ mode: "create", type: "workspace" });
    setModalValue("");
  }

  async function createWorkspaceWithName(name: string) {
    const response = await mutate<{ data: Workspace }>("/api/workspaces", { name });
    setSelectedBaseId(null);
    setSelectedTableId(null);
    clearWorkspaceData();
    setSelectedWorkspaceId(response.data.workspace_id);
    await loadWorkspaces();
  }

  async function duplicateWorkspace(workspaceId: string) {
    try {
      const response = await mutate<{ data: { workspace_id: string; name: string } }>(`/api/workspaces/${workspaceId}/duplicate`, {});
      setSelectedBaseId(null);
      setSelectedTableId(null);
      clearWorkspaceData();
      setSelectedWorkspaceId(response.data.workspace_id);
      await loadWorkspaces();
      setStatus({ tone: "success", text: `Workspace duplicated as "${response.data.name}"` });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  async function deleteWorkspace() {
    if (!selectedWorkspaceId || !confirm("Delete this workspace and all its contents?")) return;
    try {
      await request(`/api/workspaces/${selectedWorkspaceId}`, { method: "DELETE" });
      setSelectedWorkspaceId(null);
      setSelectedBaseId(null);
      setSelectedTableId(null);
      clearWorkspaceData();
      await loadWorkspaces();
      setStatus({ tone: "success", text: "Workspace deleted" });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  async function renameWorkspace(workspaceId: string, name: string) {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    try {
      await mutate(`/api/workspaces/${workspaceId}`, { name: trimmedName }, "PATCH");
      setWorkspaces((current) => current.map((workspace) =>
        workspace.workspace_id === workspaceId ? { ...workspace, name: trimmedName } : workspace
      ));
      setStatus({ tone: "success", text: "Workspace renamed" });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  return { createWorkspace, createWorkspaceWithName, duplicateWorkspace, deleteWorkspace, renameWorkspace };
}

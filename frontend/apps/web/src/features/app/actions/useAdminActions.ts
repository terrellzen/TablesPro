import { mutate, request } from "../../../lib/api.js";
import { errorMessage } from "../../../lib/format.js";
import { notifyAuditChanged } from "../../../lib/auditEvents.js";
import type { CreateUserInput, GlobalRole, MemberPermissions, UserProfile, WorkspaceMember } from "../../../types/domain.js";
import type { AsyncLoader, StateSetter, StatusSetter } from "./actionTypes.js";

type AdminActionsOptions = {
  selectedWorkspaceId: string | null;
  setUsers: StateSetter<UserProfile[]>;
  loadAdminData: AsyncLoader;
  loadAuditEvents: AsyncLoader;
  setStatus: StatusSetter;
};

export function useAdminActions(options: AdminActionsOptions) {
  const {
    selectedWorkspaceId, setUsers,
    loadAdminData, loadAuditEvents, setStatus
  } = options;

  async function saveMemberPermissions(
    userId: string,
    permissions: MemberPermissions,
    existing: boolean,
    confirmDestructive: boolean
  ): Promise<boolean> {
    if (!selectedWorkspaceId || !userId.trim()) return false;
    try {
      const path = existing
        ? `/api/workspaces/${selectedWorkspaceId}/members/${encodeURIComponent(userId)}`
        : `/api/workspaces/${selectedWorkspaceId}/members`;
      await mutate(path, { userId: userId.trim(), permissions, confirmDestructive }, existing ? "PATCH" : "POST");
      await Promise.all([loadAdminData(selectedWorkspaceId), loadAuditEvents(selectedWorkspaceId)]);
      notifyAuditChanged();
      setStatus({ tone: "success", text: existing ? "Member permissions updated" : "Member added" });
      return true;
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
      return false;
    }
  }

  async function removeMember(member: WorkspaceMember) {
    if (!selectedWorkspaceId || !confirm(`Remove ${member.user_id} from this workspace?`)) return;
    try {
      await request(`/api/workspaces/${selectedWorkspaceId}/members/${encodeURIComponent(member.user_id)}`, { method: "DELETE" });
      await Promise.all([loadAdminData(selectedWorkspaceId), loadAuditEvents(selectedWorkspaceId)]);
      notifyAuditChanged();
      setStatus({ tone: "success", text: "Member removed" });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  async function changeUserRole(
    user: UserProfile,
    role: GlobalRole
  ) {
    try {
      const response = await mutate<{ data: UserProfile }>(`/api/users/${encodeURIComponent(user.user_id)}/role`, { role }, "PATCH");
      setUsers((current) => current.map((entry) => entry.user_id === user.user_id ? response.data : entry));
      notifyAuditChanged();
      setStatus({ tone: "success", text: "User role updated" });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  async function removeUser(user: UserProfile) {
    if (!confirm(`Disable @${user.handle} and remove workspace access?`)) return;
    try {
      await request(`/api/users/${encodeURIComponent(user.user_id)}`, { method: "DELETE" });
      setUsers((current) => current.filter((entry) => entry.user_id !== user.user_id));
      notifyAuditChanged();
      setStatus({ tone: "success", text: "User disabled" });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  async function createUser(fields: CreateUserInput) {
    try {
      const response = await mutate<{ data: UserProfile }>("/api/users", fields, "POST");
      setUsers((current) => [...current, response.data].sort((a, b) => a.handle.localeCompare(b.handle)));
      notifyAuditChanged();
      setStatus({ tone: "success", text: `Created @${response.data.handle}` });
      return response.data;
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
      return undefined;
    }
  }

  async function changeUserPassword(userId: string, adminPassword: string, newPassword: string): Promise<boolean> {
    try {
      await mutate(`/api/users/${encodeURIComponent(userId)}/password`, { adminPassword, newPassword });
      notifyAuditChanged();
      setStatus({ tone: "success", text: "Password changed" });
      return true;
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
      return false;
    }
  }

  return {
    saveMemberPermissions, removeMember, changeUserRole,
    removeUser, createUser, changeUserPassword
  };
}

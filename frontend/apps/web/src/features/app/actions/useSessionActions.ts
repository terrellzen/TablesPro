import { mutate, request, setConfiguredApiBaseUrl } from "../../../lib/api.js";
import { errorMessage } from "../../../lib/format.js";
import type {
  AppTable, AuditEvent, AuthUser, Base, Field, RecordRow, SavedView, UserProfile,
  Workspace, WorkspaceMember
} from "../../../types/domain.js";
import type { StateSetter, StatusSetter } from "./actionTypes.js";

type SessionActionsOptions = {
  loadCurrentUser: () => Promise<void>;
  loadWorkspaces: () => Promise<void>;
  setApiServerUrl: StateSetter<string>;
  setCurrentUser: StateSetter<AuthUser | null>;
  setAuthChecked: StateSetter<boolean>;
  setWorkspaces: StateSetter<Workspace[]>;
  setBases: StateSetter<Base[]>;
  setTables: StateSetter<AppTable[]>;
  setFields: StateSetter<Field[]>;
  setRecords: StateSetter<RecordRow[]>;
  setViews: StateSetter<SavedView[]>;
  setAuditEvents: StateSetter<AuditEvent[]>;
  setMembers: StateSetter<WorkspaceMember[]>;
  setUsers: StateSetter<UserProfile[]>;
  setSelectedWorkspaceId: StateSetter<string | null>;
  setSelectedBaseId: StateSetter<string | null>;
  setSelectedTableId: StateSetter<string | null>;
  setStatus: StatusSetter;
};

export function useSessionActions(options: SessionActionsOptions) {
  const {
    loadCurrentUser, loadWorkspaces, setApiServerUrl, setCurrentUser,
    setAuthChecked, setWorkspaces, setBases, setTables, setFields, setRecords,
    setViews, setAuditEvents, setMembers, setUsers, setSelectedWorkspaceId,
    setSelectedBaseId, setSelectedTableId, setStatus
  } = options;

  function clearSessionData() {
    setWorkspaces([]);
    setBases([]);
    setTables([]);
    setFields([]);
    setRecords([]);
    setViews([]);
    setAuditEvents([]);
    setMembers([]);
    setUsers([]);
    setSelectedWorkspaceId(null);
    setSelectedBaseId(null);
    setSelectedTableId(null);
  }

  async function handleAuthenticated() {
    await loadCurrentUser();
    await loadWorkspaces();
    setStatus({ tone: "success", text: "Signed in" });
  }

  async function handleApiServerChange(nextUrl: string) {
    const normalized = setConfiguredApiBaseUrl(nextUrl);
    setApiServerUrl(normalized);
    setCurrentUser(null);
    clearSessionData();
    setAuthChecked(false);
    setStatus({ tone: "idle", text: `Server set to ${normalized}` });
  }

  async function logout() {
    await request("/api/auth/sign-out", { method: "POST" }).catch(() => undefined);
    setCurrentUser(null);
    clearSessionData();
    setStatus({ tone: "idle", text: "Signed out" });
  }

  async function changeMyPassword(currentPassword: string, newPassword: string): Promise<boolean> {
    try {
      await mutate("/api/me/change-password", { currentPassword, newPassword });
      setStatus({ tone: "success", text: "Password changed" });
      return true;
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
      return false;
    }
  }

  return { handleAuthenticated, handleApiServerChange, logout, changeMyPassword };
}

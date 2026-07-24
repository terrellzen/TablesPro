import { Download, Plus, RefreshCcw, ShieldCheck, Trash2 } from "lucide-react";
import { ThemeControl } from "../../components/ThemeControl.js";
import { AccountBlock } from "../auth/AccountBlock.js";
import type { AppTable, AuthUser, Base, ThemePreference, UserProfile, Workspace } from "../../types/domain.js";
import type { ContextMenuItem } from "../../types/ui.js";

export function WorkspaceSidebar(props: {
  currentUser: AuthUser;
  profile: UserProfile | null;
  selectedWorkspace: Workspace | null;
  selectedWorkspaceId: string | null;
  workspaces: Workspace[];
  showAdmin: boolean;
  onShowAdminChange: (show: boolean) => void;
  onWorkspaceChange: (workspaceId: string) => void;
  onCreateWorkspace: () => void;
  onDeleteWorkspace: () => void;
  onDuplicateWorkspace: (workspaceId: string) => void;
  onRenameWorkspace: (workspace: Workspace) => void;
  onManageMembers: (workspace: Workspace) => void;
  onContextMenu: (x: number, y: number, items: ContextMenuItem[]) => void;
  onProfileChange: (profile: UserProfile) => void;
  onLogout: () => Promise<void>;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
}) {
  return (
    <aside className="sidebar" aria-label="Workspace navigation">
      <div className="brand-row">
        <div className="brand-mark" aria-hidden="true">TP</div>
        <div>
          <strong>TablesPro</strong>
          <span>{props.currentUser.name || props.currentUser.email || "signed in"}</span>
        </div>
      </div>
      <AccountBlock
        user={props.currentUser}
        profile={props.profile}
        onProfileChange={props.onProfileChange}
        onLogout={props.onLogout}
        onChangePassword={props.onChangePassword}
      />
      {props.profile?.can_manage_users && (
        <button
          type="button"
          className={`command-button admin-command ${props.showAdmin ? "active" : ""}`}
          aria-pressed={props.showAdmin}
          onClick={() => props.onShowAdminChange(!props.showAdmin)}
        >
          <ShieldCheck size={16} /> Admin
        </button>
      )}
      <button type="button" className="command-button" onClick={props.onCreateWorkspace}>
        <Plus size={16} /> Workspace
      </button>
      <nav className="workspace-list" aria-label="Workspaces">
        {props.workspaces.map((workspace) => (
          <div className="workspace-item-row" key={workspace.workspace_id}>
            <button
              type="button"
              className={`workspace-item ${workspace.workspace_id === props.selectedWorkspaceId ? "active" : ""}`}
              onClick={() => props.onWorkspaceChange(workspace.workspace_id)}
              onContextMenu={(event) => {
                event.preventDefault();
                const items: ContextMenuItem[] = [
                  { label: "Rename", onClick: () => props.onRenameWorkspace(workspace) },
                  { label: "Duplicate", onClick: () => props.onDuplicateWorkspace(workspace.workspace_id) }
                ];
                if (workspace.role === "admin") items.unshift({ label: "Workspace members", onClick: () => props.onManageMembers(workspace) });
                props.onContextMenu(event.clientX, event.clientY, items);
              }}
            >
              {workspace.name}
            </button>
            {workspace.workspace_id === props.selectedWorkspaceId && workspace.role === "admin" && (
              <button type="button" className="icon-button danger" onClick={props.onDeleteWorkspace} aria-label={`Delete workspace ${workspace.name}`}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </nav>
    </aside>
  );
}

export function WorkspaceHeader(props: {
  workspace: Workspace | null;
  base: Base | null;
  table: AppTable | null;
  themePreference: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  onRefresh: () => void;
  onExport: () => void;
}) {
  return (
    <header className="topbar">
      <div className="title-block">
        <p className="eyebrow">{props.workspace?.name ?? "No workspace"} / {props.base?.name ?? "No base"}</p>
        <h1>{props.table?.name ?? "Choose a table"}</h1>
      </div>
      <div className="topbar-actions">
        <ThemeControl value={props.themePreference} onChange={props.onThemeChange} />
        <button type="button" className="icon-button" onClick={props.onRefresh} aria-label="Refresh data"><RefreshCcw size={18} /></button>
        <button type="button" className="icon-button" onClick={props.onExport} aria-label="Export CSV"><Download size={18} /></button>
      </div>
    </header>
  );
}

import { ContextMenu, EntityModal } from "../../components/Overlays.js";
import { ThemeControl } from "../../components/ThemeControl.js";
import { AdminPanel } from "../admin/AdminPanel.js";
import { AuthScreen } from "../auth/AuthScreen.js";
import { WorkspaceHeader, WorkspaceSidebar } from "../workspace/WorkspaceChrome.js";
import { WorkspaceMembersDialog } from "../members/WorkspaceMembersDialog.js";
import type { AppController } from "./controllerTypes.js";
import { WorkspaceContent } from "./WorkspaceContent.js";

export function AppView({ controller }: { controller: AppController }) {
  const {
    themePreference, setThemePreference, authChecked, currentUser, apiServerUrl,
    signUpEnabled, profile, setProfile, workspaces, showAdmin, setShowAdmin,
    selectedWorkspace, selectedWorkspaceId, selectWorkspace, selectedBase,
    selectedTable, status, loading, modalEntity, setModalEntity, modalValue,
    setModalValue, contextMenu, setContextMenu, createWorkspace, deleteWorkspace,
    duplicateWorkspace, openRenameModal, handleApiServerChange, handleAuthenticated,
    logout, changeMyPassword, refresh, exportCsv, confirmModal
  } = controller;

  if (!authChecked) {
    return (
      <main className="auth-layout">
        <div className="auth-card compact">
          <div className="auth-card-heading">
            <div className="brand-row">
              <div className="brand-mark" aria-hidden="true">TP</div>
              <div>
                <strong>TablesPro</strong>
                <span>Checking session</span>
              </div>
            </div>
            <ThemeControl value={themePreference} onChange={setThemePreference} />
          </div>
        </div>
      </main>
    );
  }

  if (!currentUser) {
    return (
      <AuthScreen
        apiServerUrl={apiServerUrl}
        signUpEnabled={signUpEnabled}
        onApiServerChange={handleApiServerChange}
        onAuthenticated={handleAuthenticated}
        themePreference={themePreference}
        onThemeChange={setThemePreference}
      />
    );
  }

  return (
    <main className="app-shell">
      <WorkspaceSidebar
        currentUser={currentUser}
        profile={profile}
        selectedWorkspace={selectedWorkspace}
        selectedWorkspaceId={selectedWorkspaceId}
        workspaces={workspaces}
        showAdmin={showAdmin}
        onShowAdminChange={setShowAdmin}
        onWorkspaceChange={selectWorkspace}
        onCreateWorkspace={() => void createWorkspace()}
        onDeleteWorkspace={() => void deleteWorkspace()}
        onDuplicateWorkspace={(workspaceId) => void duplicateWorkspace(workspaceId)}
        onRenameWorkspace={(workspace) => openRenameModal("workspace", workspace.workspace_id, workspace.name)}
        onManageMembers={(workspace) => {
          void controller.openWorkspaceMembers(workspace.workspace_id);
        }}
        onContextMenu={(x, y, items) => setContextMenu({ x, y, items })}
        onProfileChange={setProfile}
        onLogout={logout}
        onChangePassword={changeMyPassword}
      />

      <section className="workspace-panel" aria-label="Table workspace">
        <WorkspaceHeader
          workspace={selectedWorkspace}
          base={selectedBase}
          table={selectedTable}
          themePreference={themePreference}
          onThemeChange={setThemePreference}
          onRefresh={() => void refresh()}
          onExport={() => void exportCsv()}
        />

        {showAdmin ? (
          <AdminPanel
            onClose={() => setShowAdmin(false)}
            currentUser={currentUser}
            profile={profile}
            users={controller.users}
            adminWorkspaces={controller.adminWorkspaces}
            workspaces={workspaces}
            onLoadAdminAuditEvents={controller.loadAdminAuditEvents}
            onChangeUserRole={controller.changeUserRole}
            onRemoveUser={controller.removeUser}
            onCreateUser={controller.createUser}
            onChangeUserPassword={controller.changeUserPassword}
          />
        ) : <WorkspaceContent controller={controller} />}

        <footer className={`status-bar ${status.tone}`} aria-live="polite">
          {loading ? "Loading" : status.text}
        </footer>
      </section>

      {modalEntity && (
        <EntityModal
          entity={modalEntity}
          value={modalValue}
          onValueChange={setModalValue}
          onConfirm={confirmModal}
          onClose={() => setModalEntity(null)}
        />
      )}
      {contextMenu && <ContextMenu {...contextMenu} onClose={() => setContextMenu(null)} />}
      {controller.showMembers && selectedWorkspace && (
        <WorkspaceMembersDialog
          workspace={selectedWorkspace}
          currentUserId={currentUser.id}
          members={controller.members}
          onClose={() => controller.setShowMembers(false)}
          onSave={controller.saveMemberPermissions}
          onRemove={controller.removeMember}
        />
      )}
    </main>
  );
}

import { Copy, Database, FolderPlus, Grid3X3, Layers3, Pencil, Plus, RefreshCcw, Save, Search, Table2, Trash2 } from "lucide-react";
import { ContextMenu, EntityModal } from "../../components/Overlays.js";
import { Selector } from "../../components/Selector.js";
import { ThemeControl } from "../../components/ThemeControl.js";
import { AdminPanel } from "../admin/AdminPanel.js";
import { RightRail } from "../admin/RightRail.js";
import { AuthScreen } from "../auth/AuthScreen.js";
import { DataGrid } from "../grid/DataGrid.js";
import { WorkspaceHeader, WorkspaceSidebar } from "../workspace/WorkspaceChrome.js";
import type { FieldType } from "../../types/domain.js";
import type { useAppController } from "./useAppController.js";

type AppController = ReturnType<typeof useAppController>;

export function AppView({ controller }: { controller: AppController }) {

  const {
    themePreference, setThemePreference,
    authChecked, currentUser, apiServerUrl, signUpEnabled, profile, setProfile,
    workspaces, bases, tables, fields, records, views, activeViewId, setActiveViewId,
    auditEvents, adminWorkspaces, members, users,
    directUserId, setDirectUserId, directRole, setDirectRole,
    filterFieldId, setFilterFieldId, filterValue, setFilterValue,
    sortFieldId, setSortFieldId, sortDirection, setSortDirection,
    searchValue, setSearchValue, showAdmin, setShowAdmin,
    selectedWorkspaceId, setSelectedWorkspaceId, selectedBaseId, setSelectedBaseId,
    selectedTableId, setSelectedTableId, editingCell, setEditingCell,
    draftValue, setDraftValue, status, loading,
    hasMore, loadingMore, loadingRows, loadMoreError,
    modalEntity, setModalEntity, modalValue, setModalValue,
    contextMenu, setContextMenu,
    selectedWorkspace, selectedBase, selectedTable, visibleFields, searchedRecords,
    refresh, loadAdminAuditEvents, createWorkspace, createBase, createTable,
    addField, addRecord, duplicateWorkspace, duplicateBase, duplicateTable,
    createSavedView, createFieldGroup, exportCsv, addDirectMember,
    changeMemberRole, removeMember, changeUserPermissions, removeUser, createUser,
    changeMyPassword, changeUserPassword, saveCell, deleteRecord,
    deleteBase, deleteTable, deleteWorkspace, hideField, moveField, deleteField,
    openRenameModal, confirmModal, showAllRecords, deleteView,
    handleAuthenticated, handleApiServerChange, logout, loadMore
  } = controller;
  if (!authChecked) {
    return (
      <main className="auth-layout">
        <div className="auth-card compact">
          <div className="auth-card-heading">
            <div className="brand-row">
              <div className="brand-mark" aria-hidden="true">
                TP
              </div>
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
        apiServerUrl={apiServerUrl}
        selectedWorkspace={selectedWorkspace}
        selectedWorkspaceId={selectedWorkspaceId}
        workspaces={workspaces}
        showAdmin={showAdmin}
        onShowAdminChange={setShowAdmin}
        onWorkspaceChange={setSelectedWorkspaceId}
        onCreateWorkspace={() => void createWorkspace()}
        onDeleteWorkspace={() => void deleteWorkspace()}
        onDuplicateWorkspace={(workspaceId) => void duplicateWorkspace(workspaceId)}
        onRenameWorkspace={(workspace) => openRenameModal("workspace", workspace.workspace_id, workspace.name)}
        onContextMenu={(x, y, items) => setContextMenu({ x, y, items })}
        onApiServerChange={handleApiServerChange}
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
            currentUser={currentUser}
            profile={profile}
            users={users}
            auditEvents={auditEvents}
            adminWorkspaces={adminWorkspaces}
            workspaces={workspaces}
            onLoadAdminAuditEvents={loadAdminAuditEvents}
            onChangeUserPermissions={changeUserPermissions}
            onRemoveUser={removeUser}
            onCreateUser={createUser}
            onChangeUserPassword={changeUserPassword}
          />
        ) : (
          <>
            {bases.length === 0 ? (
              <div className="empty-state workspace-empty">
                <Database size={24} />
                <strong>No bases yet</strong>
                <span>Create a base to start organizing your data.</span>
                <button type="button" className="small-button primary" onClick={createBase}>
                  <FolderPlus size={15} />
                  Create base
                </button>
              </div>
            ) : tables.length === 0 ? (
              <>
                <div className="object-bar">
                  <Selector
                    icon={<Database size={15} />}
                    label="Base"
                    value={selectedBaseId ?? ""}
                    options={bases.map((base) => ({ value: base.base_id, label: base.name }))}
                    onChange={setSelectedBaseId}
                  />
                  {selectedBaseId && (
                    <button
                      type="button"
                      className="small-button"
                      onClick={() => {
                        const base = bases.find((b) => b.base_id === selectedBaseId);
                        if (base) openRenameModal("base", base.base_id, base.name);
                      }}
                    >
                      Rename base
                    </button>
                  )}
                  <button type="button" className="small-button" onClick={createBase}>
                    <FolderPlus size={15} />
                    Base
                  </button>
                  {selectedBaseId && (
                    <button type="button" className="small-button" onClick={() => void duplicateBase(selectedBaseId)}>
                      <Copy size={15} />
                      Duplicate base
                    </button>
                  )}
                  {selectedBaseId && (
                    <button type="button" className="small-button danger" onClick={() => void deleteBase()}>
                      <Trash2 size={15} />
                      Delete base
                    </button>
                  )}
                </div>
                <div className="empty-state">
                  <Table2 size={24} />
                  <strong>No tables yet</strong>
                  <span>Create a table to start adding data.</span>
                  <button type="button" className="small-button primary" onClick={createTable}>
                    <Grid3X3 size={15} />
                    Create table
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="object-bar">
                  <Selector
                    icon={<Database size={15} />}
                    label="Base"
                    value={selectedBaseId ?? ""}
                    options={bases.map((base) => ({ value: base.base_id, label: base.name }))}
                    onChange={setSelectedBaseId}
                  />
                  {selectedBaseId && (
                    <button
                      type="button"
                      className="icon-button"
                      title="Rename base"
                      onClick={() => {
                        const base = bases.find((b) => b.base_id === selectedBaseId);
                        if (base) openRenameModal("base", base.base_id, base.name);
                      }}
                    >
                      <Pencil size={15} />
                    </button>
                  )}
                  <button type="button" className="icon-button" title="Create base" onClick={createBase}>
                    <FolderPlus size={15} />
                  </button>
                  {selectedBaseId && (
                    <button type="button" className="icon-button" title="Duplicate base" onClick={() => void duplicateBase(selectedBaseId)}>
                      <Copy size={15} />
                    </button>
                  )}
                  {selectedBaseId && (
                    <button type="button" className="icon-button danger" title="Delete base" onClick={() => void deleteBase()}>
                      <Trash2 size={15} />
                    </button>
                  )}
                  <Selector
                    icon={<Table2 size={15} />}
                    label="Table"
                    value={selectedTableId ?? ""}
                    options={tables.map((table) => ({ value: table.table_id, label: table.name }))}
                    onChange={setSelectedTableId}
                  />
                  {selectedTableId && (
                    <button
                      type="button"
                      className="icon-button"
                      title="Rename table"
                      onClick={() => {
                        const table = tables.find((t) => t.table_id === selectedTableId);
                        if (table) openRenameModal("table", table.table_id, table.name);
                      }}
                    >
                      <Pencil size={15} />
                    </button>
                  )}
                  <button type="button" className="icon-button" title="Create table" onClick={createTable}>
                    <Grid3X3 size={15} />
                  </button>
                  {selectedTableId && (
                    <button type="button" className="icon-button" title="Duplicate table" onClick={() => void duplicateTable(selectedTableId)}>
                      <Copy size={15} />
                    </button>
                  )}
                  {selectedTableId && (
                    <button type="button" className="icon-button danger" title="Delete table" onClick={() => void deleteTable()}>
                      <Trash2 size={15} />
                    </button>
                  )}
                  <Selector
                    icon={<Plus size={15} />}
                    label="Column"
                    value=""
                    options={[
                      { value: "short_text", label: "Text" },
                      { value: "currency", label: "Currency" }
                    ]}
                    onChange={(fieldType) => {
                      if (fieldType) addField(fieldType as FieldType);
                    }}
                  />
                  <button type="button" className="small-button" onClick={addRecord}>
                    <Plus size={15} />
                    Record
                  </button>
                </div>

                <div className="view-controls-bar">
                  <div className="search-input-wrap">
                    <Search size={15} />
                    <input
                      className="search-input"
                      type="text"
                      placeholder="Search records"
                      value={searchValue}
                      onChange={(event) => setSearchValue(event.target.value)}
                    />
                  </div>
                  <Selector
                    icon={<RefreshCcw size={15} />}
                    label="Filter"
                    value={filterFieldId}
                    options={fields.map((field) => ({ value: field.field_id, label: field.name }))}
                    onChange={setFilterFieldId}
                  />
                  <input
                    className="toolbar-input"
                    placeholder="Contains"
                    value={filterValue}
                    onChange={(event) => setFilterValue(event.target.value)}
                  />
                  <Selector
                    icon={<RefreshCcw size={15} />}
                    label="Sort"
                    value={sortFieldId}
                    options={fields.map((field) => ({ value: field.field_id, label: field.name }))}
                    onChange={setSortFieldId}
                  />
                  <select className="role-select compact-select" value={sortDirection} onChange={(event) => setSortDirection(event.target.value as "asc" | "desc")}>
                    <option value="asc">Asc</option>
                    <option value="desc">Desc</option>
                  </select>
                  <button type="button" className="small-button" onClick={createFieldGroup}>
                    <Layers3 size={15} />
                    Group
                  </button>
                  <button type="button" className="small-button" onClick={createSavedView}>
                    <Save size={15} />
                    View
                  </button>
                </div>

                <div className="view-tabs" role="tablist" aria-label="Saved views">
                  <button type="button" role="tab" aria-selected={activeViewId === null} onClick={showAllRecords}>
                    All records
                  </button>
                  {views.map((view) => (
                    <button type="button" role="tab" className="view-tab" aria-selected={activeViewId === view.saved_view_id} key={view.saved_view_id} onClick={() => setActiveViewId(view.saved_view_id)}>
                      {view.name}
                      <span className="view-tab-close" onClick={(e) => { e.stopPropagation(); void deleteView(view.saved_view_id); }}>&times;</span>
                    </button>
                  ))}
                </div>

                <section className="content-grid">
                  {fields.length === 0 ? (
                    <div className="empty-state">
                      <Table2 size={24} />
                      <strong>No fields yet</strong>
                      <span>Add a field to start building your table.</span>
                      <button type="button" className="small-button primary" onClick={() => addField("short_text")}>
                        <Plus size={15} />
                        Add text field
                      </button>
                    </div>
                  ) : (
                    <div className="grid-panel">
                      {records.length > 0 && fields.length > 0 && (
                        <div className="pagination-bar">
                          <span className="pagination-info">
                            {records.length.toLocaleString()} row{records.length !== 1 ? "s" : ""} loaded
                            {hasMore ? " · loading ahead as you scroll" : " · all records loaded"}
                          </span>
                        </div>
                      )}
                      <DataGrid
                        fields={visibleFields}
                        allFields={fields}
                        records={searchedRecords}
                        editingCell={editingCell}
                        draftValue={draftValue}
                        onDraftChange={setDraftValue}
                        onStartEdit={(record, field) => {
                          setEditingCell({ recordId: record.record_id, fieldId: field.field_id });
                          setDraftValue(String(record[field.physical_column_name] ?? ""));
                        }}
                        onCancelEdit={() => setEditingCell(null)}
                        onSaveCell={saveCell}
                        onDeleteRecord={deleteRecord}
                        onRenameField={(fieldId, name) => {
                          if (selectedTableId) openRenameModal("field", fieldId, name, selectedTableId);
                        }}
                        onMoveField={moveField}
                        onHideField={hideField}
                        onDeleteField={deleteField}
                        onContextMenu={(x, y, items) => setContextMenu({ x, y, items })}
                        onLoadMore={loadMore}
                        hasMore={hasMore}
                        initialLoading={loadingRows}
                        loadingMore={loadingMore}
                        loadMoreError={loadMoreError}
                      />
                    </div>
                  )}

                  <RightRail
                    currentUser={currentUser}
                    profile={profile}
                    members={members}
                    directUserId={directUserId}
                    directRole={directRole}
                    onDirectUserIdChange={setDirectUserId}
                    onDirectRoleChange={setDirectRole}
                    onAddDirectMember={addDirectMember}
                    onChangeRole={changeMemberRole}
                    onRemoveMember={removeMember}
                  />
                </section>
              </>
            )}
          </>
        )}

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

      {contextMenu && (
        <ContextMenu {...contextMenu} onClose={() => setContextMenu(null)} />
      )}

    </main>
  );
}


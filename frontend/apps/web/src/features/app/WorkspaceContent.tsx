import { Database, FolderPlus, Grid3X3, Table2 } from "lucide-react";
import type { AppController } from "./controllerTypes.js";
import { WorkspaceObjectBar } from "./WorkspaceObjectBar.js";
import { TableWorkspace } from "./TableWorkspace.js";

export function WorkspaceContent({ controller }: { controller: AppController }) {
  if (controller.bases.length === 0) {
    return (
      <div className="empty-state workspace-empty">
        <Database size={24} />
        <strong>No bases yet</strong>
        <span>Create a base to start organizing your data.</span>
        <button type="button" className="small-button primary" onClick={controller.createBase}>
          <FolderPlus size={15} />
          Create base
        </button>
      </div>
    );
  }

  if (controller.tables.length === 0) {
    return (
      <>
        <WorkspaceObjectBar controller={controller} tableControls={false} />
        <div className="empty-state">
          <Table2 size={24} />
          <strong>No tables yet</strong>
          <span>Create a table to start adding data.</span>
          <button type="button" className="small-button primary" onClick={controller.createTable}>
            <Grid3X3 size={15} />
            Create table
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <WorkspaceObjectBar controller={controller} tableControls />
      <TableWorkspace controller={controller} />
    </>
  );
}

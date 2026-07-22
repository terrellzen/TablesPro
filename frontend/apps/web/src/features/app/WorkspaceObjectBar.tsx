import { Copy, Database, FolderPlus, Grid3X3, Pencil, Plus, Table2, Trash2 } from "lucide-react";
import { Selector } from "../../components/Selector.js";
import type { FieldType } from "../../types/domain.js";
import type { AppController } from "./controllerTypes.js";

export function WorkspaceObjectBar({
  controller,
  tableControls
}: {
  controller: AppController;
  tableControls: boolean;
}) {
  const {
    bases, tables, selectedBaseId, setSelectedBaseId, selectedTableId,
    setSelectedTableId, createBase, createTable, duplicateBase, duplicateTable,
    deleteBase, deleteTable, addField, addRecord, openRenameModal
  } = controller;
  const iconButtonClass = tableControls ? "icon-button" : "small-button";

  function renameSelectedBase() {
    const base = bases.find((candidate) => candidate.base_id === selectedBaseId);
    if (base) openRenameModal("base", base.base_id, base.name);
  }

  return (
    <div className="object-bar">
      <Selector
        icon={<Database size={15} />}
        label="Base"
        value={selectedBaseId ?? ""}
        options={bases.map((base) => ({ value: base.base_id, label: base.name }))}
        onChange={setSelectedBaseId}
      />
      {selectedBaseId && (
        <button type="button" className={iconButtonClass} title="Rename base" onClick={renameSelectedBase}>
          {tableControls ? <Pencil size={15} /> : "Rename base"}
        </button>
      )}
      <button type="button" className={iconButtonClass} title="Create base" onClick={createBase}>
        <FolderPlus size={15} />
        {!tableControls && "Base"}
      </button>
      {selectedBaseId && (
        <button
          type="button"
          className={iconButtonClass}
          title="Duplicate base"
          onClick={() => void duplicateBase(selectedBaseId)}
        >
          <Copy size={15} />
          {!tableControls && "Duplicate base"}
        </button>
      )}
      {selectedBaseId && (
        <button
          type="button"
          className={`${iconButtonClass} danger`}
          title="Delete base"
          onClick={() => void deleteBase()}
        >
          <Trash2 size={15} />
          {!tableControls && "Delete base"}
        </button>
      )}

      {tableControls && (
        <>
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
                const table = tables.find((candidate) => candidate.table_id === selectedTableId);
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
              { value: "decimal", label: "Number" },
              { value: "currency", label: "Currency" },
              { value: "date", label: "Date" },
              { value: "url", label: "URL" },
              { value: "email", label: "Email" },
              { value: "boolean", label: "Boolean" },
              { value: "single_select", label: "Dropdown" }
            ]}
            onChange={(fieldType) => {
              if (fieldType) void addField(fieldType as FieldType);
            }}
          />
          <button type="button" className="small-button" onClick={() => void addRecord()}>
            <Plus size={15} />
            Record
          </button>
        </>
      )}
    </div>
  );
}

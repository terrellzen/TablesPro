import { useState } from "react";
import { Plus, Save, Search, Table2 } from "lucide-react";
import { DataGrid } from "../grid/DataGrid.js";
import { DuplicateRecordDialog } from "../grid/DuplicateRecordDialog.js";
import { DropdownColorDialog } from "../grid/DropdownColorDialog.js";
import { FilterSortMenu } from "../grid/FilterSortMenu.js";
import { useDropdownOptions } from "../grid/useDropdownOptions.js";
import type { AppController } from "./controllerTypes.js";
import { fieldValueForInput } from "../../lib/format.js";
import type { RecordRow } from "../../types/domain.js";

export function TableWorkspace({ controller }: { controller: AppController }) {
  const [colorFieldId, setColorFieldId] = useState<string | null>(null);
  const [recordToDuplicate, setRecordToDuplicate] = useState<RecordRow | null>(null);
  const {
    fields, records, views, activeViewId, setActiveViewId,
    filters, setFilters, sorts, setSorts, searchValue, setSearchValue,
    selectedTableId, visibleFields, searchedRecords, editingCell, setEditingCell,
    draftValue, setDraftValue, hasMore, loadingRows, loadingMore, loadMoreError,
    createSavedView, showAllRecords, deleteView, addField,
    saveCell, duplicateRecord, deleteRecord, openRenameModal, moveField, hideField, deleteField,
    setContextMenu, loadMore, setDropdownColor
  } = controller;
  const dropdownOptions = useDropdownOptions(selectedTableId, fields, records);
  const colorField = fields.find((field) => field.field_id === colorFieldId) ?? null;

  return (
    <>
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
        <FilterSortMenu
          fields={fields}
          filters={filters}
          sorts={sorts}
          onFiltersChange={setFilters}
          onSortsChange={setSorts}
        />
        <button type="button" className="small-button" onClick={() => void createSavedView()}>
          <Save size={15} />
          View
        </button>
      </div>

      <div className="view-tabs" role="tablist" aria-label="Saved views">
        <button type="button" role="tab" aria-selected={activeViewId === null} onClick={showAllRecords}>
          All records
        </button>
        {views.map((view) => (
          <button
            type="button"
            role="tab"
            className="view-tab"
            aria-selected={activeViewId === view.saved_view_id}
            key={view.saved_view_id}
            onClick={() => setActiveViewId(view.saved_view_id)}
          >
            {view.name}
            <span
              className="view-tab-close"
              onClick={(event) => {
                event.stopPropagation();
                void deleteView(view.saved_view_id);
              }}
            >
              &times;
            </span>
          </button>
        ))}
      </div>

      <section className="content-grid">
        {fields.length === 0 ? (
          <div className="empty-state">
            <Table2 size={24} />
            <strong>No fields yet</strong>
            <span>Add a field to start building your table.</span>
            <button type="button" className="small-button primary" onClick={() => void addField("short_text")}>
              <Plus size={15} />
              Add text field
            </button>
          </div>
        ) : (
          <div className="grid-panel">
            {records.length > 0 && (
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
                setDraftValue(fieldValueForInput(record[field.physical_column_name], field.field_type));
              }}
              onCancelEdit={() => setEditingCell(null)}
              onSaveCell={saveCell}
              onDuplicateRecord={setRecordToDuplicate}
              onDeleteRecord={deleteRecord}
              onRenameField={(fieldId, name) => {
                if (selectedTableId) openRenameModal("field", fieldId, name, selectedTableId);
              }}
              onMoveField={moveField}
              onHideField={hideField}
              onDeleteField={deleteField}
              dropdownOptions={dropdownOptions}
              onOpenDropdownColors={setColorFieldId}
              onContextMenu={(x, y, items) => setContextMenu({ x, y, items })}
              onLoadMore={loadMore}
              hasMore={hasMore}
              initialLoading={loadingRows}
              loadingMore={loadingMore}
              loadMoreError={loadMoreError}
            />
          </div>
        )}
      </section>
      {colorField && (
        <DropdownColorDialog
          field={colorField}
          options={dropdownOptions[colorField.field_id]}
          onSetColor={(value, color) => void setDropdownColor(colorField.field_id, value, color)}
          onClose={() => setColorFieldId(null)}
        />
      )}
      {recordToDuplicate && (
        <DuplicateRecordDialog
          key={recordToDuplicate.record_id}
          record={recordToDuplicate}
          fields={fields}
          dropdownOptions={dropdownOptions}
          onSave={duplicateRecord}
          onClose={() => setRecordToDuplicate(null)}
        />
      )}
    </>
  );
}

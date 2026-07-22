import { useCallback, useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Table2, Trash2 } from "lucide-react";
import type { Field, RecordRow } from "../../types/domain.js";
import type { ContextMenuItem } from "../../types/ui.js";
import { buildFieldContextMenu } from "./fieldContextMenu.js";
import { GridCellEditor, GridCellValue } from "./GridCellContent.js";
import { fieldTypeLabel } from "./fieldDisplay.js";
import type { DropdownOptionsByField } from "./useDropdownOptions.js";

type DataGridProps = {
  fields: Field[];
  allFields: Field[];
  records: RecordRow[];
  editingCell: { recordId: string; fieldId: string } | null;
  draftValue: string;
  onDraftChange: (value: string) => void;
  onStartEdit: (record: RecordRow, field: Field) => void;
  onCancelEdit: () => void;
  onSaveCell: (record: RecordRow, field: Field) => Promise<void>;
  onDeleteRecord: (record: RecordRow) => void;
  onRenameField: (fieldId: string, name: string) => void;
  onMoveField: (fieldId: string, direction: "left" | "right" | "start" | "end") => void;
  onHideField: (fieldId: string) => void;
  onDeleteField: (fieldId: string) => void;
  dropdownOptions: DropdownOptionsByField;
  onSetDropdownColor: (fieldId: string, value: string, color: string) => void;
  onContextMenu: (x: number, y: number, items: ContextMenuItem[]) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  initialLoading?: boolean;
  loadingMore?: boolean;
  loadMoreError?: string | null;
};

export function DataGrid(props: DataGridProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const deleteColumnWidth = 40;
  const rowVirtualizer = useVirtualizer({
    count: props.records.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 38,
    overscan: 12,
    getItemKey: (index) => props.records[index]?.record_id ?? index
  });
  const columnVirtualizer = useVirtualizer({
    horizontal: true,
    count: props.fields.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => props.fields[index]?.width ?? 180,
    overscan: 4
  });

  const handleScroll = useCallback(() => {
    const el = parentRef.current;
    if (!el || !props.onLoadMore) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < el.clientHeight * 2) props.onLoadMore();
  }, [props.onLoadMore]);

  const virtualRows = rowVirtualizer.getVirtualItems();
  const virtualColumns = columnVirtualizer.getVirtualItems();
  const totalWidth = columnVirtualizer.getTotalSize() + deleteColumnWidth;
  const totalHeight = rowVirtualizer.getTotalSize();
  const footerHeight = props.initialLoading ? 0 : 42;
  const bodyHeight = props.initialLoading && props.records.length === 0 ? 12 * 38 : totalHeight + footerHeight;

  useEffect(() => {
    if (props.initialLoading && parentRef.current) parentRef.current.scrollTop = 0;
  }, [props.initialLoading]);

  useEffect(() => {
    const lastRow = virtualRows[virtualRows.length - 1];
    if (lastRow && props.hasMore && !props.loadingMore && !props.loadMoreError && lastRow.index >= props.records.length - 20) {
      props.onLoadMore?.();
    }
  }, [props.hasMore, props.loadMoreError, props.loadingMore, props.onLoadMore, props.records.length, virtualRows]);

  if (props.fields.length === 0) {
    return <div className="empty-state"><Table2 size={24} /><strong>No fields</strong></div>;
  }

  return (
    <div className="grid-shell" aria-label="Records">
      <div className="grid-scroll" ref={parentRef} onScroll={handleScroll}>
        <div className="grid-header" style={{ width: totalWidth, height: 38 }}>
          {virtualColumns.map((virtualColumn) => {
            const field = props.fields[virtualColumn.index];
            if (!field) return null;
            return (
              <div
                className="grid-header-cell"
                key={field.field_id}
                style={{ left: virtualColumn.start, width: virtualColumn.size }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  const items: ContextMenuItem[] = buildFieldContextMenu({
                    field,
                    allFields: props.allFields,
                    dropdownOptions: props.dropdownOptions[field.field_id],
                    onRename: () => props.onRenameField(field.field_id, field.name),
                    onMove: (direction) => props.onMoveField(field.field_id, direction),
                    onHide: () => props.onHideField(field.field_id),
                    onDelete: () => props.onDeleteField(field.field_id),
                    onSetDropdownColor: (value, color) => props.onSetDropdownColor(field.field_id, value, color)
                  });
                  props.onContextMenu(event.clientX, event.clientY, items);
                }}
              >
                <span>{field.name}</span><small>{fieldTypeLabel(field.field_type)}</small>
              </div>
            );
          })}
          <div className="grid-header-cell" style={{ left: totalWidth - deleteColumnWidth, width: deleteColumnWidth }} />
        </div>
        <div className="grid-body" style={{ width: totalWidth, height: bodyHeight }}>
          {props.initialLoading && props.records.length === 0 && Array.from({ length: 12 }, (_, index) => (
            <div className="grid-row grid-skeleton-row" key={`skeleton-${index}`} style={{ transform: `translateY(${index * 38}px)`, height: 38, width: totalWidth }}>
              <span className="grid-skeleton-cell" /><span className="grid-skeleton-cell short" /><span className="grid-skeleton-cell" />
            </div>
          ))}
          {virtualRows.map((virtualRow) => {
            const record = props.records[virtualRow.index];
            if (!record) return null;
            return (
              <div className="grid-row" key={record.record_id} style={{ transform: `translateY(${virtualRow.start}px)`, height: virtualRow.size, width: totalWidth }}>
                {virtualColumns.map((virtualColumn) => {
                  const field = props.fields[virtualColumn.index];
                  if (!field) return null;
                  const isEditing = props.editingCell?.recordId === record.record_id && props.editingCell?.fieldId === field.field_id;
                  return (
                    <div className="grid-cell-wrap" key={`${record.record_id}:${field.field_id}`} style={{ left: virtualColumn.start, width: virtualColumn.size }}>
                      {isEditing ? (
                        <GridCellEditor
                          field={field}
                          value={props.draftValue}
                          suggestions={props.dropdownOptions[field.field_id]?.values ?? []}
                          onChange={props.onDraftChange}
                          onSave={() => void props.onSaveCell(record, field)}
                          onCancel={props.onCancelEdit}
                        />
                      ) : (
                        <div
                          className="grid-cell"
                          role="button"
                          tabIndex={0}
                          onDoubleClick={() => props.onStartEdit(record, field)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") props.onStartEdit(record, field);
                          }}
                        >
                          <GridCellValue
                            field={field}
                            value={record[field.physical_column_name]}
                            color={props.dropdownOptions[field.field_id]?.colors[String(record[field.physical_column_name] ?? "")]}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="grid-cell-wrap" style={{ left: totalWidth - deleteColumnWidth, width: deleteColumnWidth }}>
                  <button type="button" className="icon-button danger" onClick={() => props.onDeleteRecord(record)} aria-label="Delete record">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
          {!props.initialLoading && (
            <div className="grid-load-status" style={{ top: totalHeight, width: totalWidth }} role="status">
              {props.loadMoreError ? (
                <><span>Couldn’t load more rows: {props.loadMoreError}</span><button type="button" className="small-button" onClick={props.onLoadMore}>Retry</button></>
              ) : props.loadingMore ? (
                <><span className="loading-dot" /> Loading more rows…</>
              ) : props.hasMore ? "Scroll to continue" : `All ${props.records.length.toLocaleString()} records loaded`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ListFilter, Plus, Trash2
} from "lucide-react";
import type { Field, FilterRule, RecordSort } from "../../types/domain.js";
import {
  appliedFilters, defaultFilterOperator, filterNeedsValue, operatorsForField
} from "./viewQuery.js";

type FilterSortMenuProps = {
  fields: Field[];
  filters: FilterRule[];
  sorts: RecordSort[];
  onFiltersChange: (filters: FilterRule[]) => void;
  onSortsChange: (sorts: RecordSort[]) => void;
};

export function FilterSortMenu(props: FilterSortMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 48, maxHeight: 520 });
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const activeCount = appliedFilters(props.filters).length + props.sorts.length;

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const addFilter = () => {
    const field = props.fields[0];
    if (!field) return;
    props.onFiltersChange([
      ...props.filters,
      { kind: "rule", fieldId: field.field_id, operator: defaultFilterOperator(field), value: "" }
    ]);
  };

  const addSort = () => {
    const used = new Set(props.sorts.map((sort) => sort.fieldId));
    const field = props.fields.find((candidate) => !used.has(candidate.field_id)) ?? props.fields[0];
    if (!field) return;
    props.onSortsChange([...props.sorts, { fieldId: field.field_id, direction: "asc" }]);
  };

  return (
    <div className="filter-sort-root" ref={rootRef}>
      <button
        type="button"
        className={`small-button filter-sort-trigger${activeCount ? " active" : ""}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          if (!open) {
            const rect = rootRef.current?.getBoundingClientRect();
            if (rect) {
              setPosition({
                left: Math.max(12, Math.min(rect.left, window.innerWidth - Math.min(620, window.innerWidth - 24))),
                top: rect.bottom + 6,
                maxHeight: Math.max(240, window.innerHeight - rect.bottom - 18)
              });
            }
          }
          setOpen((current) => !current);
        }}
      >
        <ListFilter size={15} />
        Filter & sort
        {activeCount > 0 && <span className="filter-sort-count">{activeCount}</span>}
        <ChevronDown size={14} />
      </button>

      {open && createPortal(
        <div
          ref={popoverRef}
          className="filter-sort-popover"
          role="dialog"
          aria-label="Filters and sorts"
          style={position}
        >
          <div className="filter-sort-heading">
            <div>
              <strong>Filters</strong>
              <span>All conditions must match</span>
            </div>
            <button type="button" className="filter-sort-add" onClick={addFilter} disabled={!props.fields.length}>
              <Plus size={14} /> Add filter
            </button>
          </div>

          <div className="filter-sort-list">
            {props.filters.length === 0 && <div className="filter-sort-empty">No filters applied</div>}
            {props.filters.map((filter, index) => {
              const field = props.fields.find((candidate) => candidate.field_id === filter.fieldId);
              const operators = operatorsForField(field);
              const inputType = field?.field_type === "date"
                ? "date"
                : field?.field_type === "timestamp_tz"
                  ? "datetime-local"
                  : ["integer", "decimal", "currency", "percentage"].includes(field?.field_type ?? "")
                    ? "number"
                    : "text";
              return (
                <div className="filter-sort-row filter-row" key={`filter-${index}`}>
                  <span className="filter-sort-priority">{index + 1}</span>
                  <select
                    aria-label={`Filter ${index + 1} field`}
                    value={filter.fieldId}
                    onChange={(event) => {
                      const nextField = props.fields.find((candidate) => candidate.field_id === event.target.value);
                      props.onFiltersChange(props.filters.map((item, itemIndex) => itemIndex === index
                        ? { ...item, fieldId: event.target.value, operator: defaultFilterOperator(nextField), value: "" }
                        : item));
                    }}
                  >
                    {props.fields.map((candidate) => (
                      <option value={candidate.field_id} key={candidate.field_id}>{candidate.name}</option>
                    ))}
                  </select>
                  <select
                    aria-label={`Filter ${index + 1} operator`}
                    value={filter.operator}
                    onChange={(event) => {
                      const operator = event.target.value as FilterRule["operator"];
                      props.onFiltersChange(props.filters.map((item, itemIndex) =>
                        itemIndex === index
                          ? {
                              ...item,
                              operator,
                              value: field?.field_type === "boolean" && filterNeedsValue(operator)
                                ? item.value || "true"
                                : item.value
                            }
                          : item
                      ));
                    }}
                  >
                    {operators.map((operator) => (
                      <option value={operator.value} key={operator.value}>{operator.label}</option>
                    ))}
                  </select>
                  {filterNeedsValue(filter.operator) ? (
                    field?.field_type === "boolean" ? (
                      <select
                        aria-label={`Filter ${index + 1} value`}
                        value={filter.value ?? "true"}
                        onChange={(event) => props.onFiltersChange(props.filters.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, value: event.target.value } : item
                        ))}
                      >
                        <option value="true">True</option>
                        <option value="false">False</option>
                      </select>
                    ) : (
                      <input
                        type={inputType}
                        step={inputType === "number" ? "any" : undefined}
                        aria-label={`Filter ${index + 1} value`}
                        placeholder={filter.operator === "is_any_of" ? "Value 1, value 2" : "Value"}
                        value={filter.value ?? ""}
                        onChange={(event) => props.onFiltersChange(props.filters.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, value: event.target.value } : item
                        ))}
                      />
                    )
                  ) : <span className="filter-sort-no-value">—</span>}
                  <button
                    type="button"
                    className="filter-sort-remove"
                    aria-label={`Remove filter ${index + 1}`}
                    onClick={() => props.onFiltersChange(props.filters.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="filter-sort-divider" />

          <div className="filter-sort-heading">
            <div>
              <strong>Sorts</strong>
              <span>Applied from top to bottom</span>
            </div>
            <button
              type="button"
              className="filter-sort-add"
              onClick={addSort}
              disabled={!props.fields.length || props.sorts.length >= props.fields.length}
            >
              <Plus size={14} /> Add sort
            </button>
          </div>

          <div className="filter-sort-list">
            {props.sorts.length === 0 && <div className="filter-sort-empty">No sorts applied</div>}
            {props.sorts.map((sort, index) => (
              <div className="filter-sort-row sort-row" key={`sort-${index}`}>
                <span className="filter-sort-priority">{index + 1}</span>
                <select
                  aria-label={`Sort ${index + 1} field`}
                  value={sort.fieldId}
                  onChange={(event) => props.onSortsChange(props.sorts.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, fieldId: event.target.value } : item
                  ))}
                >
                  {props.fields.map((field) => (
                    <option
                      value={field.field_id}
                      key={field.field_id}
                      disabled={props.sorts.some((candidate, candidateIndex) =>
                        candidateIndex !== index && candidate.fieldId === field.field_id
                      )}
                    >
                      {field.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="sort-direction-button"
                  onClick={() => props.onSortsChange(props.sorts.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, direction: item.direction === "asc" ? "desc" : "asc" }
                      : item
                  ))}
                >
                  {sort.direction === "asc" ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                  {sort.direction === "asc" ? "Ascending" : "Descending"}
                </button>
                <div className="filter-sort-order-buttons">
                  <button
                    type="button"
                    aria-label={`Move sort ${index + 1} up`}
                    disabled={index === 0}
                    onClick={() => props.onSortsChange(move(props.sorts, index, index - 1))}
                  ><ArrowUp size={13} /></button>
                  <button
                    type="button"
                    aria-label={`Move sort ${index + 1} down`}
                    disabled={index === props.sorts.length - 1}
                    onClick={() => props.onSortsChange(move(props.sorts, index, index + 1))}
                  ><ArrowDown size={13} /></button>
                </div>
                <button
                  type="button"
                  className="filter-sort-remove"
                  aria-label={`Remove sort ${index + 1}`}
                  onClick={() => props.onSortsChange(props.sorts.filter((_, itemIndex) => itemIndex !== index))}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <div className="filter-sort-footer">
            <ArrowUpDown size={14} />
            Changes apply immediately. Save a view to recall them later.
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function move<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item === undefined) return items;
  next.splice(to, 0, item);
  return next;
}

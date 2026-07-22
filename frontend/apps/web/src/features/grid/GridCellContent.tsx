import type { KeyboardEvent, MouseEvent } from "react";
import { fieldValueForInput } from "../../lib/format.js";
import type { Field } from "../../types/domain.js";
import { dropdownColor } from "./dropdownColors.js";

type EditorProps = {
  field: Field;
  value: string;
  suggestions: string[];
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
};

export function GridCellEditor(props: EditorProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    }
    if (event.key === "Escape") props.onCancel();
  }

  if (props.field.field_type === "boolean") {
    return (
      <select
        className="cell-input cell-select"
        autoFocus
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        onBlur={props.onSave}
        onKeyDown={handleKeyDown}
      >
        <option value="">Blank</option>
        <option value="true">Checked</option>
        <option value="false">Unchecked</option>
      </select>
    );
  }

  const listId = props.field.field_type === "single_select"
    ? `dropdown-options-${props.field.field_id}`
    : undefined;
  const inputType = editorInputType(props.field.field_type);
  return (
    <>
      <input
        className="cell-input"
        autoFocus
        list={listId}
        type={inputType}
        step={inputType === "number" ? (props.field.field_type === "integer" ? "1" : "any") : undefined}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        onBlur={props.onSave}
        onKeyDown={handleKeyDown}
      />
      {listId && (
        <datalist id={listId}>
          {props.suggestions.map((suggestion) => <option key={suggestion} value={suggestion} />)}
        </datalist>
      )}
    </>
  );
}

export function GridCellValue({ field, value, color }: {
  field: Field;
  value: unknown;
  color: string | undefined;
}) {
  if (field.field_type === "boolean") {
    if (value === null || value === undefined) return null;
    return (
      <span className={`boolean-value ${value === true ? "checked" : ""}`} aria-label={value === true ? "Checked" : "Unchecked"}>
        {value === true ? "✓" : ""}
      </span>
    );
  }
  if (field.field_type === "single_select" && typeof value === "string" && value) {
    return (
      <span className="dropdown-value" style={{ backgroundColor: color ?? dropdownColor(field, value) }}>
        {value}
      </span>
    );
  }
  const text = fieldValueForInput(value, field.field_type);
  if (field.field_type === "url" && isSafeHttpUrl(text)) {
    return <a className="cell-link" href={text} target="_blank" rel="noreferrer" onDoubleClick={stopDoubleClick}>{text}</a>;
  }
  if (field.field_type === "email" && text) {
    return <a className="cell-link" href={`mailto:${text}`} onDoubleClick={stopDoubleClick}>{text}</a>;
  }
  return text;
}

function editorInputType(fieldType: Field["field_type"]): "text" | "number" | "date" | "url" | "email" {
  if (["integer", "decimal", "currency", "percentage"].includes(fieldType)) return "number";
  if (fieldType === "date") return "date";
  if (fieldType === "url") return "url";
  if (fieldType === "email") return "email";
  return "text";
}

function stopDoubleClick(event: MouseEvent<HTMLAnchorElement>) {
  event.stopPropagation();
}

function isSafeHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

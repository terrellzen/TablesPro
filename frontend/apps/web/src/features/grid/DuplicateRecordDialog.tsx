import { useState, type FormEvent } from "react";
import { Copy, X } from "lucide-react";
import {
  coerceFieldValue, errorMessage, fieldValueForInput, numericInputPattern,
  numericInputTitle
} from "../../lib/format.js";
import type { Field, RecordRow } from "../../types/domain.js";
import { fieldTypeLabel } from "./fieldDisplay.js";
import type { DropdownOptionsByField } from "./useDropdownOptions.js";

export function DuplicateRecordDialog(props: {
  record: RecordRow;
  fields: Field[];
  dropdownOptions: DropdownOptionsByField;
  onSave: (values: Record<string, unknown>) => Promise<string | null>;
  onClose: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(props.fields.map((field) => [
      field.field_id,
      draftValue(props.record[field.physical_column_name], field)
    ]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function update(fieldId: string, value: string) {
    setDrafts((current) => ({ ...current, [fieldId]: value }));
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const values = Object.fromEntries(props.fields.map((field) => [
        field.field_id,
        coerceFieldValue(drafts[field.field_id] ?? "", field.field_type)
      ]));
      const saveError = await props.onSave(values);
      if (saveError) {
        setError(saveError);
      } else {
        props.onClose();
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={() => { if (!saving) props.onClose(); }}>
      <form
        className="duplicate-record-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="duplicate-record-title"
        onSubmit={(event) => void submit(event)}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="duplicate-record-header">
          <div><Copy size={18} /><div><h3 id="duplicate-record-title">Duplicate record</h3><span>Review and edit every field before saving</span></div></div>
          <button type="button" className="icon-button" disabled={saving} onClick={props.onClose} aria-label="Close"><X size={16} /></button>
        </header>

        <div className="duplicate-record-fields">
          {props.fields.map((field) => (
            <DuplicateField
              key={field.field_id}
              field={field}
              value={drafts[field.field_id] ?? ""}
              suggestions={props.dropdownOptions[field.field_id]?.values ?? []}
              onChange={(value) => update(field.field_id, value)}
            />
          ))}
        </div>

        {error && <p className="duplicate-record-error" role="alert">{error}</p>}
        <footer className="duplicate-record-actions">
          <button type="button" className="small-button" disabled={saving} onClick={props.onClose}>Cancel</button>
          <button type="submit" className="small-button primary" disabled={saving}>
            {saving ? "Saving" : "Save duplicate"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function DuplicateField(props: {
  field: Field;
  value: string;
  suggestions: string[];
  onChange: (value: string) => void;
}) {
  const label = <span>{props.field.name}<small>{fieldTypeLabel(props.field.field_type)}</small></span>;

  if (props.field.field_type === "boolean") {
    return (
      <label className="duplicate-record-field">
        {label}
        <select value={props.value} onChange={(event) => props.onChange(event.target.value)}>
          <option value="">Blank</option><option value="true">Checked</option><option value="false">Unchecked</option>
        </select>
      </label>
    );
  }

  if (props.field.field_type === "long_text" || props.field.field_type === "multiple_select") {
    return (
      <label className="duplicate-record-field">
        {label}
        <textarea
          rows={props.field.field_type === "long_text" ? 4 : 2}
          placeholder={props.field.field_type === "multiple_select" ? "Comma-separated values" : undefined}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
        />
      </label>
    );
  }

  const listId = props.field.field_type === "single_select" ? `duplicate-options-${props.field.field_id}` : undefined;
  return (
    <label className="duplicate-record-field">
      {label}
      <input
        type={inputType(props.field.field_type)}
        inputMode={inputMode(props.field.field_type)}
        pattern={numericInputPattern(props.field.field_type)}
        title={numericInputTitle(props.field.field_type)}
        list={listId}
        placeholder={props.field.field_type === "url" ? "https://example.com" : undefined}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
      {listId && <datalist id={listId}>{props.suggestions.map((value) => <option key={value} value={value} />)}</datalist>}
    </label>
  );
}

function draftValue(value: unknown, field: Field): string {
  if (field.field_type === "multiple_select" && Array.isArray(value)) return value.join(", ");
  return fieldValueForInput(value, field.field_type);
}

function inputType(fieldType: Field["field_type"]): "text" | "date" | "email" {
  if (fieldType === "date") return "date";
  if (fieldType === "email") return "email";
  return "text";
}

function inputMode(fieldType: Field["field_type"]): "numeric" | "decimal" | "url" | undefined {
  if (fieldType === "integer") return "numeric";
  if (["decimal", "currency", "percentage"].includes(fieldType)) return "decimal";
  if (fieldType === "url") return "url";
  return undefined;
}

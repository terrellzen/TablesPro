import type { Field } from "../../types/domain.js";
import type { ContextMenuItem } from "../../types/ui.js";
import { dropdownColor, dropdownColorPalette } from "./dropdownColors.js";
import type { DropdownOptionSet } from "./useDropdownOptions.js";

type FieldMenuOptions = {
  field: Field;
  allFields: Field[];
  dropdownOptions: DropdownOptionSet | undefined;
  onRename: () => void;
  onMove: (direction: "left" | "right" | "start" | "end") => void;
  onHide: () => void;
  onDelete: () => void;
  onSetDropdownColor: (value: string, color: string) => void;
};

export function buildFieldContextMenu(options: FieldMenuOptions): ContextMenuItem[] {
  const fieldIndex = options.allFields.findIndex((field) => field.field_id === options.field.field_id);
  const items: ContextMenuItem[] = [{ label: "Rename", onClick: options.onRename }];
  if (options.field.field_type === "single_select") {
    items.push({ label: "Colors", children: buildColorItems(options) });
  }
  if (fieldIndex > 0) {
    items.push({ label: "Move left", onClick: () => options.onMove("left") });
    items.push({ label: "Move to beginning", onClick: () => options.onMove("start") });
  }
  if (fieldIndex < options.allFields.length - 1) {
    items.push({ label: "Move right", onClick: () => options.onMove("right") });
    items.push({ label: "Move to end", onClick: () => options.onMove("end") });
  }
  items.push({ label: "Hide column", onClick: options.onHide });
  items.push({ label: "", divider: true });
  items.push({ label: "Delete column", onClick: options.onDelete, className: "danger" });
  return items;
}

function buildColorItems(options: FieldMenuOptions): ContextMenuItem[] {
  const values = options.dropdownOptions?.values ?? [];
  if (values.length === 0) return [{ label: "No values yet" }];
  return values.map((value) => ({
    label: value,
    swatch: options.dropdownOptions?.colors[value] ?? dropdownColor(options.field, value),
    children: dropdownColorPalette.map((color) => ({
      label: color.name,
      swatch: color.value,
      onClick: () => options.onSetDropdownColor(value, color.value)
    }))
  }));
}

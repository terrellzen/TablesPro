import type { Field } from "../../types/domain.js";
import type { ContextMenuItem } from "../../types/ui.js";

type FieldMenuOptions = {
  field: Field;
  allFields: Field[];
  onRename: () => void;
  onOpenColors: () => void;
  onMove: (direction: "left" | "right" | "start" | "end") => void;
  onHide: () => void;
  onDelete: () => void;
};

export function buildFieldContextMenu(options: FieldMenuOptions): ContextMenuItem[] {
  const fieldIndex = options.allFields.findIndex((field) => field.field_id === options.field.field_id);
  const items: ContextMenuItem[] = [{ label: "Rename", onClick: options.onRename }];
  if (options.field.field_type === "single_select") {
    items.push({ label: "Colors", onClick: options.onOpenColors });
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

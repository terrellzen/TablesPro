import type { FieldType } from "./domain.js";

export type ContextMenuItem = {
  label: string;
  onClick: () => void;
  className?: string;
  divider?: boolean;
};

export type ModalEntity = {
  mode: "rename" | "create";
  type: "workspace" | "base" | "table" | "field" | "view" | "fieldGroup";
  id?: string;
  parentId?: string;
  fieldType?: FieldType;
  name?: string;
};

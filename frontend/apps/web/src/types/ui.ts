import type { FieldType } from "./domain.js";

export type ContextMenuItem = {
  label: string;
  onClick?: () => void;
  className?: string;
  divider?: boolean;
  children?: ContextMenuItem[];
  swatch?: string;
};

export type ModalEntity = {
  mode: "rename" | "create";
  type: "workspace" | "base" | "table" | "field" | "view";
  id?: string;
  parentId?: string;
  fieldType?: FieldType;
  name?: string;
};

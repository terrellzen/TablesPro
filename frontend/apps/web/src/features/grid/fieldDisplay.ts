import type { FieldType } from "../../types/domain.js";

const fieldTypeLabels: Partial<Record<FieldType, string>> = {
  short_text: "Text",
  long_text: "Long text",
  integer: "Number",
  decimal: "Decimal",
  currency: "Decimal",
  boolean: "Boolean",
  date: "Date",
  timestamp_tz: "Date and time",
  single_select: "Dropdown",
  multiple_select: "Multi-select",
  email: "Email",
  url: "URL",
  phone: "Phone",
  user_reference: "User"
};

export function fieldTypeLabel(fieldType: FieldType): string {
  return fieldTypeLabels[fieldType] ?? fieldType.charAt(0).toUpperCase() + fieldType.slice(1);
}

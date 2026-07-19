const internalIdPattern = /^[0-9a-f]{32}$/;
const physicalIdentifierPattern = /^[a-z_][a-z0-9_]{0,62}$/;

export function toPhysicalTableName(tableId: string): string {
  const normalized = normalizeInternalId(tableId);
  return `records_${normalized}`;
}

export function toPhysicalFieldName(fieldId: string): string {
  const normalized = normalizeInternalId(fieldId);
  return `f_${normalized}`;
}

export function quoteIdentifier(identifier: string): string {
  if (!physicalIdentifierPattern.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return `"${identifier.replaceAll("\"", "\"\"")}"`;
}

export function quoteAppDataTable(tableId: string): string {
  return `${quoteIdentifier("app_data")}.${quoteIdentifier(toPhysicalTableName(tableId))}`;
}

function normalizeInternalId(value: string): string {
  const normalized = value.replaceAll("-", "").toLowerCase();
  if (!internalIdPattern.test(normalized)) {
    throw new Error("Internal IDs used in physical identifiers must be UUID-like hex values");
  }
  return normalized;
}

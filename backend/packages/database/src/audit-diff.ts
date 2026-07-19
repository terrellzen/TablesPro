export type AuditDiff = {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  changedFields: string[];
};

export function createAuditDiff(before: Record<string, unknown>, after: Record<string, unknown>): AuditDiff {
  const changedFields = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => !Object.is(before[key], after[key]))
    .sort();

  return {
    before: pick(before, changedFields),
    after: pick(after, changedFields),
    changedFields
  };
}

function pick(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((key) => [key, source[key]]));
}

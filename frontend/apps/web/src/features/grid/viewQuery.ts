import type {
  Field, FilterExpression, FilterOperator, FilterRule, RecordSort
} from "../../types/domain.js";

const VALUELESS_OPERATORS = new Set<FilterOperator>(["is_empty", "is_not_empty"]);

export function defaultFilterOperator(field: Field | undefined): FilterOperator {
  if (!field) return "contains";
  if (field.field_type === "boolean" || field.field_type === "multiple_select") return "is_not_empty";
  if (field.field_type === "date" || field.field_type === "timestamp_tz") return "after";
  if (["integer", "decimal", "currency", "percentage"].includes(field.field_type)) return "equals";
  return "contains";
}

export function operatorsForField(field: Field | undefined): { value: FilterOperator; label: string }[] {
  if (!field) return [];
  if (field.field_type === "boolean") {
    return [
      { value: "equals", label: "is" },
      { value: "not_equals", label: "is not" },
      { value: "is_empty", label: "is empty" },
      { value: "is_not_empty", label: "is not empty" }
    ];
  }
  if (field.field_type === "multiple_select") {
    return [
      { value: "is_empty", label: "is empty" },
      { value: "is_not_empty", label: "is not empty" }
    ];
  }
  if (field.field_type === "date" || field.field_type === "timestamp_tz") {
    return [
      { value: "equals", label: "is" },
      { value: "not_equals", label: "is not" },
      { value: "before", label: "is before" },
      { value: "after", label: "is after" },
      { value: "is_empty", label: "is empty" },
      { value: "is_not_empty", label: "is not empty" }
    ];
  }
  if (["integer", "decimal", "currency", "percentage"].includes(field.field_type)) {
    return [
      { value: "equals", label: "=" },
      { value: "not_equals", label: "≠" },
      { value: "gt", label: ">" },
      { value: "gte", label: "≥" },
      { value: "lt", label: "<" },
      { value: "lte", label: "≤" },
      { value: "is_empty", label: "is empty" },
      { value: "is_not_empty", label: "is not empty" }
    ];
  }
  return [
    { value: "contains", label: "contains" },
    { value: "starts_with", label: "starts with" },
    { value: "equals", label: "is" },
    { value: "not_equals", label: "is not" },
    { value: "is_any_of", label: "is any of" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" }
  ];
}

export function filterNeedsValue(operator: FilterOperator): boolean {
  return !VALUELESS_OPERATORS.has(operator);
}

export function appliedFilters(filters: FilterRule[]): FilterRule[] {
  return filters.filter((filter) =>
    Boolean(filter.fieldId) &&
    (!filterNeedsValue(filter.operator) || Boolean(filter.value.trim()))
  );
}

export function toFilterExpression(filters: FilterRule[]): FilterExpression | undefined {
  const ready = appliedFilters(filters).map((filter) => {
    if (filter.operator === "is_any_of") {
      return {
        ...filter,
        value: filter.value.split(",").map((value) => value.trim()).filter(Boolean)
      };
    }
    if (filter.operator === "equals" || filter.operator === "not_equals") {
      const value = filter.value.trim();
      if (value === "true" || value === "false") {
        return { ...filter, value: value === "true" };
      }
    }
    return filter;
  });
  if (ready.length === 0) return undefined;
  if (ready.length === 1) return ready[0];
  return { kind: "group", conjunction: "and", children: ready };
}

export function filtersFromView(expressions: FilterExpression[] | undefined): FilterRule[] {
  if (!expressions?.length) return [];
  const flattened = expressions.flatMap((expression) =>
    expression.kind === "group" ? flattenRules(expression) : [expression]
  );
  return flattened.map((rule) => ({
    ...rule,
    value: Array.isArray(rule.value) ? rule.value.join(", ") : String(rule.value ?? "")
  }));
}

function flattenRules(expression: FilterExpression): Extract<FilterExpression, { kind: "rule" }>[] {
  if (expression.kind === "rule") return [expression];
  return expression.children.flatMap(flattenRules);
}

export function sortsFromView(sorts: { field_id: string; direction: string }[] | undefined): RecordSort[] {
  return (sorts ?? [])
    .filter((sort) => sort.field_id && (sort.direction === "asc" || sort.direction === "desc"))
    .map((sort) => ({ fieldId: sort.field_id, direction: sort.direction as "asc" | "desc" }));
}

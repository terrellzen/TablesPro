import { describe, expect, it } from "vitest";
import type { Field, FilterRule } from "../../apps/web/src/types/domain.js";
import {
  filtersFromView, operatorsForField, sortsFromView, toFilterExpression
} from "../../apps/web/src/features/grid/viewQuery.js";

const textField: Field = {
  field_id: "field-name",
  name: "Name",
  physical_column_name: "field_name",
  field_type: "short_text",
  width: 180,
  hidden: false,
  pinned: false,
  options: {}
};

describe("view query helpers", () => {
  it("builds an ordered AND expression from every complete filter", () => {
    const filters: FilterRule[] = [
      { kind: "rule", fieldId: "field-name", operator: "contains", value: "Ada" },
      { kind: "rule", fieldId: "field-status", operator: "is_not_empty", value: "" },
      { kind: "rule", fieldId: "field-city", operator: "equals", value: "" }
    ];

    expect(toFilterExpression(filters)).toEqual({
      kind: "group",
      conjunction: "and",
      children: [
        { kind: "rule", fieldId: "field-name", operator: "contains", value: "Ada" },
        { kind: "rule", fieldId: "field-status", operator: "is_not_empty", value: "" }
      ]
    });
  });

  it("serializes list and boolean values for the API", () => {
    expect(toFilterExpression([
      { kind: "rule", fieldId: "field-status", operator: "is_any_of", value: "Open, Closed" },
      { kind: "rule", fieldId: "field-live", operator: "equals", value: "false" }
    ])).toEqual({
      kind: "group",
      conjunction: "and",
      children: [
        { kind: "rule", fieldId: "field-status", operator: "is_any_of", value: ["Open", "Closed"] },
        { kind: "rule", fieldId: "field-live", operator: "equals", value: false }
      ]
    });
  });

  it("restores nested saved filters and ordered sorts", () => {
    expect(filtersFromView([{
      kind: "group",
      conjunction: "and",
      children: [
        { kind: "rule", fieldId: "first", operator: "equals", value: "one" },
        { kind: "rule", fieldId: "second", operator: "is_any_of", value: ["two", "three"] }
      ]
    }])).toEqual([
      { kind: "rule", fieldId: "first", operator: "equals", value: "one" },
      { kind: "rule", fieldId: "second", operator: "is_any_of", value: "two, three" }
    ]);

    expect(sortsFromView([
      { field_id: "second", direction: "desc" },
      { field_id: "first", direction: "asc" }
    ])).toEqual([
      { fieldId: "second", direction: "desc" },
      { fieldId: "first", direction: "asc" }
    ]);
  });

  it("offers only operators supported by the field type", () => {
    expect(operatorsForField(textField).map((operator) => operator.value)).toContain("contains");
    expect(operatorsForField({ ...textField, field_type: "boolean" }).map((operator) => operator.value))
      .toEqual(["equals", "not_equals", "is_empty", "is_not_empty"]);
  });
});

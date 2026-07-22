import { describe, expect, it } from "vitest";
import type { Field } from "../../apps/web/src/types/domain.js";
import { buildDropdownColors, dropdownColor, generatedColor } from "../../apps/web/src/features/grid/dropdownColors.js";

const field: Field = {
  field_id: "field-1",
  name: "Status",
  physical_column_name: "field_status",
  field_type: "single_select",
  width: 180,
  hidden: false,
  pinned: false,
  options: { choiceColors: { Done: "#2e8b57" } }
};

describe("dropdown colors", () => {
  it("uses persisted color overrides", () => {
    expect(dropdownColor(field, "Done")).toBe("#2e8b57");
  });

  it("generates stable colors for newly entered values", () => {
    expect(generatedColor("In progress")).toBe(generatedColor("In progress"));
    expect(generatedColor("In progress")).not.toBe(generatedColor("Blocked"));
  });

  it("assigns a unique default color to every known value", () => {
    const values = Array.from({ length: 100 }, (_, index) => `Option ${index}`);
    const colors = buildDropdownColors(values, {});
    expect(new Set(Object.values(colors))).toHaveLength(values.length);
  });
});

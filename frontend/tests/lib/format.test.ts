import { describe, expect, it } from "vitest";
import { coerceFieldValue, fieldValueChanged, fieldValueForInput } from "../../apps/web/src/lib/format.js";

describe("fieldValueChanged", () => {
  it("does not mark an untouched text value as changed", () => {
    expect(fieldValueChanged("hello", "hello", "short_text")).toBe(false);
  });

  it("treats an empty displayed null as unchanged", () => {
    expect(fieldValueChanged("", null, "short_text")).toBe(false);
  });

  it("compares numeric fields by their coerced values", () => {
    expect(fieldValueChanged("10", 10, "integer")).toBe(false);
    expect(fieldValueChanged("10.00", "10.0", "currency")).toBe(false);
    expect(fieldValueChanged("11", 10, "integer")).toBe(true);
  });

  it("compares boolean fields by their coerced values", () => {
    expect(fieldValueChanged("true", true, "boolean")).toBe(false);
    expect(fieldValueChanged("yes", true, "boolean")).toBe(false);
    expect(fieldValueChanged("false", true, "boolean")).toBe(true);
  });

  it("detects changed text", () => {
    expect(fieldValueChanged("updated", "original", "short_text")).toBe(true);
  });

  it("normalizes dropdown whitespace before comparing", () => {
    expect(fieldValueChanged("  Done  ", "Done", "single_select")).toBe(false);
  });

  it("coerces number fields and trims URL and email values", () => {
    expect(coerceFieldValue("42.25", "decimal")).toBe(42.25);
    expect(coerceFieldValue("19.99", "currency")).toBe(19.99);
    expect(coerceFieldValue("  https://example.com  ", "url")).toBe("https://example.com");
    expect(coerceFieldValue("example.com/path", "url")).toBe("https://example.com/path");
    expect(coerceFieldValue("  person@example.com  ", "email")).toBe("person@example.com");
    expect(coerceFieldValue("Alpha, Beta, Alpha", "multiple_select")).toEqual(["Alpha", "Beta"]);
  });

  it("rejects invalid numeric values and unsafe URL schemes", () => {
    expect(() => coerceFieldValue("12.5", "integer")).toThrow("whole number");
    expect(() => coerceFieldValue("12.0", "integer")).toThrow("without a decimal point");
    expect(() => coerceFieldValue("12.34.56", "currency")).toThrow("valid number");
    expect(() => coerceFieldValue("javascript:alert(1)", "url")).toThrow("HTTP or HTTPS");
  });

  it("normalizes database dates for date inputs and no-op comparisons", () => {
    expect(fieldValueForInput("2026-07-22T00:00:00.000Z", "date")).toBe("2026-07-22");
    expect(fieldValueChanged("2026-07-22", "2026-07-22T00:00:00.000Z", "date")).toBe(false);
  });
});

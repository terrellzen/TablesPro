import { describe, expect, it } from "vitest";
import { HttpError } from "../../apps/api/src/domains/http.js";
import { validateFieldValue, validateRecordValues } from "../../apps/api/src/domains/field-value.js";

describe("field value validation", () => {
  it("accepts valid booleans and dropdown text", () => {
    expect(validateFieldValue(true, "boolean")).toBe(true);
    expect(validateFieldValue("  In progress  ", "single_select")).toBe("In progress");
  });

  it("rejects incorrectly typed booleans and numbers", () => {
    expect(() => validateFieldValue("true", "boolean")).toThrow(HttpError);
    expect(() => validateFieldValue(Number.NaN, "currency")).toThrow(HttpError);
    expect(() => validateFieldValue(1.5, "integer")).toThrow(HttpError);
  });

  it("validates dates, URLs, and email addresses", () => {
    expect(validateFieldValue("2026-07-22", "date")).toBe("2026-07-22");
    expect(validateFieldValue("https://example.com/path", "url")).toBe("https://example.com/path");
    expect(validateFieldValue("person@example.com", "email")).toBe("person@example.com");
    expect(validateFieldValue(42.25, "decimal")).toBe(42.25);
    expect(() => validateFieldValue("22/07/2026", "date")).toThrow(HttpError);
    expect(() => validateFieldValue("2026-02-30", "date")).toThrow(HttpError);
    expect(() => validateFieldValue("javascript:alert(1)", "url")).toThrow(HttpError);
    expect(() => validateFieldValue("invalid", "email")).toThrow(HttpError);
  });

  it("normalizes a field-keyed record value object", () => {
    expect(validateRecordValues(
      [{ field_id: "done", field_type: "boolean" }],
      { done: false }
    )).toEqual({ done: false });
  });
});

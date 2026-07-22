import { describe, expect, it } from "vitest";
import { HttpError } from "../../apps/api/src/domains/http.js";
import { parseFilter, parseSelectedFields, parseSort, readRecordValues } from "../../apps/api/src/domains/record-input.js";

describe("record request parsing", () => {
  it("parses selected field lists", () => {
    expect(parseSelectedFields("first, second")).toEqual(["first", "second"]);
    expect(parseSelectedFields(undefined)).toEqual([]);
  });

  it("reports malformed filter JSON as a validation error", () => {
    expect(() => parseFilter("{")).toThrow(HttpError);
  });

  it("validates sort entries", () => {
    expect(parseSort('[{"fieldId":"field-1","direction":"asc"}]')).toEqual([
      { fieldId: "field-1", direction: "asc" }
    ]);
    expect(() => parseSort('[{"fieldId":"field-1","direction":"sideways"}]')).toThrow(HttpError);
  });

  it("requires record values to be an object", () => {
    expect(readRecordValues({ values: { field: "value" } })).toEqual({ field: "value" });
    expect(() => readRecordValues({ values: [] })).toThrow(HttpError);
  });
});

import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "../../packages/database/src/cursor.js";
import { sanitizeCsvCell } from "../../packages/database/src/csv-safety.js";
import { compileFilter } from "../../packages/database/src/filter-compiler.js";
import { calculateRetry } from "../../packages/database/src/job-retry.js";
import { quoteAppDataTable, quoteIdentifier, toPhysicalFieldName } from "../../packages/database/src/safe-identifiers.js";

const id = "018f2f92-3fd5-7c10-9f9a-f1bba5800001";
const fieldId = "018f2f92-3fd5-7c10-9f9a-f1bba5800002";

describe("safe identifiers", () => {
  it("generates quoted physical table and field names from internal IDs", () => {
    expect(quoteAppDataTable(id)).toBe('"app_data"."records_018f2f923fd57c109f9af1bba5800001"');
    expect(toPhysicalFieldName(fieldId)).toBe("f_018f2f923fd57c109f9af1bba5800002");
  });

  it("rejects unsafe identifiers", () => {
    expect(() => quoteIdentifier("users; drop table users")).toThrow("Unsafe SQL identifier");
  });
});

describe("cursor signing", () => {
  it("round-trips signed cursor payloads", () => {
    const secret = "a-very-long-local-test-secret-value";
    const cursor = encodeCursor({ tableId: id, recordId: id, sort: [] }, secret);
    expect(decodeCursor(cursor, secret)).toEqual({ tableId: id, recordId: id, sort: [] });
  });

  it("rejects tampered cursors", () => {
    const secret = "a-very-long-local-test-secret-value";
    const cursor = encodeCursor({ tableId: id, recordId: id, sort: [] }, secret);
    const [body, signature] = cursor.split(".");
    const tamperedSignature = signature?.endsWith("A") ? `${signature.slice(0, -1)}B` : `${signature?.slice(0, -1)}A`;
    expect(() => decodeCursor(`${body}.${tamperedSignature}`, secret)).toThrow("Invalid cursor");
  });
});

describe("filter compiler", () => {
  it("compiles a parameterized filter AST", () => {
    const compiled = compileFilter(
      {
        kind: "group",
        conjunction: "and",
        children: [
          { kind: "rule", fieldId, operator: "contains", value: "acme" },
          { kind: "rule", fieldId, operator: "is_not_empty" }
        ]
      },
      [{ fieldId, fieldType: "short_text" }]
    );

    expect(compiled.sql).toContain("ILIKE $1");
    expect(compiled.params).toEqual(["%acme%"]);
  });

  it("does not accept raw or unknown fields", () => {
    expect(() =>
      compileFilter({ kind: "rule", fieldId: "missing", operator: "equals", value: "x" }, [])
    ).toThrow("Unknown filter field");
  });
});

describe("csv safety", () => {
  it("escapes spreadsheet formulas on export", () => {
    expect(sanitizeCsvCell("=IMPORTXML('https://example.test')")).toBe("'=IMPORTXML('https://example.test')");
  });
});

describe("job retry", () => {
  it("uses exponential backoff before max attempts", () => {
    const now = new Date("2026-07-18T00:00:00.000Z");
    expect(calculateRetry(3, 5, now)).toEqual({
      shouldRetry: true,
      nextRunAt: new Date("2026-07-18T00:00:08.000Z"),
      nextAttempt: 4
    });
  });
});

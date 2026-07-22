import { describe, expect, it } from "vitest";
import {
  HttpError, readLimit, readOptionalUuid, readRequiredString, readUuidParam
} from "../../apps/api/src/domains/http.js";

describe("HTTP input readers", () => {
  it("trims required strings", () => {
    expect(readRequiredString({ name: "  Example  " }, "name")).toBe("Example");
  });

  it("rejects empty required strings", () => {
    expect(() => readRequiredString({ name: "  " }, "name")).toThrow(HttpError);
  });

  it("accepts canonical UUID parameters", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect(readUuidParam({ id }, "id")).toBe(id);
  });

  it("rejects malformed UUID parameters", () => {
    expect(() => readUuidParam({ id: "------------------------------------" }, "id")).toThrow(HttpError);
    expect(() => readUuidParam({ id: "123e4567e89b12d3a456426614174000" }, "id")).toThrow(HttpError);
  });

  it("allows omitted optional UUID values", () => {
    expect(readOptionalUuid({}, "workspaceId")).toBeNull();
    expect(() => readOptionalUuid({ workspaceId: "invalid" }, "workspaceId")).toThrow(HttpError);
  });

  it("bounds requested page sizes", () => {
    expect(readLimit({}, 100, 250)).toBe(100);
    expect(readLimit({ limit: "500" }, 100, 250)).toBe(250);
    expect(() => readLimit({ limit: "0" })).toThrow(HttpError);
  });
});

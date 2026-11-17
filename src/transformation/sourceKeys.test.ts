// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  assertUniqueSourceFields,
  normalizeSourceRecord,
  trimBackendWhitespace,
} from "./sourceKeys";

describe("backend source-key normalization", () => {
  it("matches Python whitespace while preserving FEFF and zero-width characters", () => {
    const spaces = [
      9, 10, 11, 12, 13, 28, 29, 30, 31, 32, 133, 160, 5760, 8192, 8193, 8194,
      8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287,
      12288,
    ];
    for (const code of spaces) {
      const space = String.fromCharCode(code);
      expect(trimBackendWhitespace(`${space}Name${space}`)).toBe("Name");
    }
    expect(trimBackendWhitespace("\uFEFFName\uFEFF")).toBe("\uFEFFName\uFEFF");
    expect(trimBackendWhitespace("\u200BName\u200B")).toBe("\u200BName\u200B");
  });
  it("rejects normalized duplicates regardless of order", () => {
    expect(() =>
      assertUniqueSourceFields(["Name", " Name\u0085"], "input.json"),
    ).toThrow("Ambiguous source fields");
    expect(() =>
      assertUniqueSourceFields([" Name\u0085", "Name"], "input.json"),
    ).toThrow("Ambiguous source fields");
    expect(() =>
      assertUniqueSourceFields(["Name", "\uFEFFName"], "input.csv"),
    ).not.toThrow();
  });
  it("keeps literal special keys as own data without prototype mutation", () => {
    const value = JSON.parse(
      '{" __proto__ ":"literal"," constructor ":"value"}',
    );
    const normalized = normalizeSourceRecord(value, "input.json");
    expect(Object.hasOwn(normalized, "__proto__")).toBe(true);
    expect(normalized.__proto__).toBe("literal");
    expect(Object.getPrototypeOf(normalized)).toBe(Object.prototype);
    expect(value).toHaveProperty(" __proto__ ", "literal");
  });
});

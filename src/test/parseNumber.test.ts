import { describe, expect, it } from "vitest";
import { parseNumber } from "@/lib/parseNumber";

describe("parseNumber", () => {
  it("reads rates the way they are actually typed", () => {
    expect(parseNumber("7200")).toBe(7200);
    expect(parseNumber("$7,200")).toBe(7200);
    expect(parseNumber("  7200  ")).toBe(7200);
    expect(parseNumber("$1,234,567")).toBe(1234567);
    expect(parseNumber("2.5")).toBe(2.5);
    expect(parseNumber("-100")).toBe(-100);
  });

  it("treats a blank entry as clearing the field", () => {
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("   ")).toBeNull();
    expect(parseNumber("$")).toBeNull();
  });

  // undefined means "reject" — the cell stays open instead of writing junk to
  // a money column.
  it("rejects anything that is not a number", () => {
    expect(parseNumber("abc")).toBeUndefined();
    expect(parseNumber("7200 units")).toBeUndefined();
    expect(parseNumber("1.2.3")).toBeUndefined();
    expect(parseNumber("--5")).toBeUndefined();
    expect(parseNumber("NaN")).toBeUndefined();
  });

  it("does not quietly turn Infinity into a stored value", () => {
    expect(parseNumber("Infinity")).toBeUndefined();
    expect(parseNumber("-Infinity")).toBeUndefined();
  });
});

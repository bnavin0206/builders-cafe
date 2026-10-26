import { describe, test, expect } from "vitest";
import { cleanText } from "@/lib/cafe/text";

describe("cleanText", () => {
  test("trims and collapses whitespace and line breaks", () => {
    expect(cleanText("  Acme \n  Ltd  ")).toBe("Acme Ltd");
  });
  test("returns an empty string for blank input", () => {
    expect(cleanText("   \n ")).toBe("");
  });
  test("limits the length", () => {
    expect(cleanText("x".repeat(200))).toHaveLength(80);
    expect(cleanText("abcdef", 3)).toBe("abc");
  });
});

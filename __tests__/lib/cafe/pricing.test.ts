import { describe, test, expect } from "vitest";
import type { MenuItem } from "@/types";
import {
  totalPaise,
  formatTotal,
  formatMenu,
  parseItem,
  itemsIn,
  isFree,
} from "@/lib/cafe/pricing";

const item = (
  title: string,
  price: number | undefined,
  category?: "coffee" | "savoury",
): MenuItem => ({ title, shortTitle: title, description: "", price, category });

const latte = item("Latte", 0, "coffee");
const coldBrew = item("Cold Brew", 120, "coffee");
const puff = item("Veg Puff", 0, "savoury");
const croissant = item("Cheese Croissant", 90.5, "savoury");

describe("pricing", () => {
  test("unset price counts as free", () => {
    expect(isFree(item("Tea", undefined))).toBe(true);
  });

  test("totals in paise", () => {
    expect(totalPaise([latte, puff])).toBe(0);
    expect(totalPaise([coldBrew, puff])).toBe(12000);
    expect(totalPaise([coldBrew, croissant])).toBe(21050);
    expect(totalPaise([])).toBe(0);
  });

  test("formats totals", () => {
    expect(formatTotal(0)).toBe("FREE");
    expect(formatTotal(12000)).toBe("₹120");
  });

  test("lists items by category, defaulting to coffee", () => {
    const all = [latte, coldBrew, puff, croissant, item("Tea", 0)];
    expect(itemsIn(all, "savoury").map((i) => i.title)).toEqual([
      "Veg Puff",
      "Cheese Croissant",
    ]);
    expect(itemsIn(all, "coffee").map((i) => i.title)).toEqual([
      "Latte",
      "Cold Brew",
      "Tea",
    ]);
  });

  test("formats a numbered menu with prices", () => {
    expect(formatMenu([latte, coldBrew])).toBe(
      "1. Latte (FREE)\n2. Cold Brew (₹120)",
    );
  });

  test("parses a reply as a number or a name", () => {
    const menu = [latte, coldBrew];
    expect(parseItem("2", menu)).toBe(coldBrew);
    expect(parseItem(" cold brew ", menu)).toBe(coldBrew);
    expect(parseItem("3", menu)).toBeNull();
    expect(parseItem("0", menu)).toBeNull();
    expect(parseItem("espresso", menu)).toBeNull();
    expect(parseItem("", menu)).toBeNull();
  });
});

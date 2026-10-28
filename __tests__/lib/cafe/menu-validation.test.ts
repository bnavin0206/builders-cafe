import { describe, test, expect } from "vitest";
import menus from "@/config/menus";
import { validateSelection, MAX_MENU_ITEMS } from "@/lib/cafe/menu-validation";
import { modes } from "@/types";
import type { MenuItem, Selection } from "@/types";

const item = (over: Partial<MenuItem> = {}): MenuItem => ({
  title: "Latte",
  shortTitle: "Latte",
  description: "Hot",
  category: "coffee",
  price: 80,
  ...over,
});

const sel = (items: MenuItem[], modifiers: string[] = ["No sugar"]): Selection => ({
  mode: modes.barista,
  items,
  modifiers,
});

describe("validateSelection", () => {
  test("the shipped menu is valid", () => {
    expect(
      validateSelection(sel(menus.barista.items, menus.barista.modifiers ?? [])),
    ).toBeNull();
  });

  test("an empty menu is allowed", () => {
    expect(validateSelection(sel([], []))).toBeNull();
  });

  test.each([null, undefined, {}, { items: "x", modifiers: [] }, { items: [] }])(
    "rejects a menu in the wrong format: %j",
    (bad) => {
      expect(validateSelection(bad)).toMatch(/expected format/);
    },
  );

  test("prices must be whole rupees from 0 to 10000", () => {
    for (const price of [-1, 1.5, 10001, NaN, "80" as any]) {
      expect(validateSelection(sel([item({ price })]))).toMatch(/price of "Latte"/);
    }
    for (const price of [0, 1, 80, 100, 10000]) {
      expect(validateSelection(sel([item({ price })]))).toBeNull();
    }
  });

  test("an item without a price (or with null) is free", () => {
    expect(validateSelection(sel([item({ price: undefined })]))).toBeNull();
    expect(validateSelection(sel([item({ price: null as any })]))).toBeNull();
  });

  test("needs a name of at most 24 characters", () => {
    expect(validateSelection(sel([item({ title: "  " })]))).toMatch(/needs a name/);
    expect(validateSelection(sel([item({ title: "x".repeat(25) })]))).toMatch(/longer than 24/);
  });

  test("short titles must be unique", () => {
    const r = validateSelection(
      sel([item({ title: "A", shortTitle: "Same" }), item({ title: "B", shortTitle: "Same" })]),
    );
    expect(r).toMatch(/share the short title "Same"/);
  });

  test("a free and a paid item may share a title; two of one kind may not", () => {
    const free = item({ shortTitle: "Latte (Free)", price: 0 });
    const paid = item({ shortTitle: "Latte", price: 80 });
    expect(validateSelection(sel([free, paid]))).toBeNull();

    const paid2 = item({ shortTitle: "Latte 2", price: 100 });
    expect(validateSelection(sel([paid, paid2]))).toMatch(/twice at a paid price/);
    const free2 = item({ shortTitle: "Latte (Free) 2", price: 0 });
    expect(validateSelection(sel([free, free2]))).toMatch(/twice at the free price/);
  });

  test("description length, category and item count are limited", () => {
    expect(validateSelection(sel([item({ description: "x".repeat(73) })]))).toMatch(/description/);
    expect(validateSelection(sel([item({ category: "dessert" as any })]))).toMatch(/category/);
    const many = Array.from({ length: MAX_MENU_ITEMS + 1 }, (_, i) =>
      item({ title: `Item ${i}`, shortTitle: `Item ${i}` }),
    );
    expect(validateSelection(sel(many))).toMatch(/at most 30/);
  });

  test("add-ons need a short name", () => {
    expect(validateSelection(sel([item()], [""]))).toMatch(/Add-ons/);
    expect(validateSelection(sel([item()], ["x".repeat(25)]))).toMatch(/Add-ons/);
  });
});

import { describe, test, expect } from "vitest";
import menus from "@/config/menus";
import { fitScale, layoutMenu, menuForBoard, panelTitle } from "@/lib/cafe/menu-board";
import type { MenuItem } from "@/types";

const it = (title: string, price: number, description = "Hot", over: Partial<MenuItem> = {}): MenuItem => ({
  title,
  shortTitle: title,
  description,
  price,
  ...over,
});

describe("menu for the board", () => {
  test("switched-off items are left out; veg is the default", () => {
    const out = menuForBoard([
      it("Latte", 80),
      it("Mocha", 80, "Hot", { available: false }),
      it("Chicken Puff", 100, "Savoury", { veg: false }),
      it("Veg Puff", 100, "Savoury", { veg: true }),
    ]);
    expect(out.map((i) => i.title)).toEqual(["Latte", "Chicken Puff", "Veg Puff"]);
    expect(out.map((i) => i.veg)).toEqual([true, false, true]);
  });

  test("odd prices and spacing are cleaned", () => {
    const [a] = menuForBoard([it("  Cafe   Latte ", 79.9, "  Hot ")]);
    expect(a).toEqual({ title: "Cafe Latte", price: 79, group: "Hot", veg: true });
    const [b] = menuForBoard([{ ...it("Free one", 0), price: undefined }]);
    expect(b!.price).toBe(0);
  });

  test("the shipped menu: non-veg items are marked", () => {
    const board = menuForBoard(menus.barista.items);
    expect(board.filter((i) => !i.veg).map((i) => i.title).sort()).toEqual([
      "Chicken Cutlet",
      "Chicken Puff",
      "Chicken Sandwich 1",
      "Chicken Sandwich 2",
      "Chicken Sandwich 3",
      "Egg Puff",
    ]);
  });
});

describe("layout", () => {
  test("free items get their own panel; paid groups keep menu order", () => {
    const l = layoutMenu(menuForBoard(menus.barista.items));
    expect(l.free.map((i) => i.title)).toEqual(["Cappuccino", "Cafe Latte", "Masala Chai", "Tapri Coffee"]);
    const names = l.columns.flat().map((g) => g.name);
    expect(names).toEqual(["Hot drinks", "Cold drinks", "Sandwiches", "Savoury", "Pastries"]);
  });

  test("the two columns are balanced and never reorder groups", () => {
    const l = layoutMenu(menuForBoard(menus.barista.items));
    const h = (g: typeof l.columns[0]) => g.reduce((n, x) => n + x.items.length, 0);
    expect(Math.abs(h(l.columns[0]) - h(l.columns[1]))).toBeLessThanOrEqual(8);
    expect(l.columns[0].length).toBeGreaterThan(0);
    expect(l.columns[1].length).toBeGreaterThan(0);
  });

  test("a group's price shows only when every item costs the same", () => {
    const l = layoutMenu(menuForBoard([it("A", 80), it("B", 80), it("C", 120, "Cold"), it("D", 100, "Cold")]));
    const all = l.columns.flat();
    expect(all.find((g) => g.name === "Hot drinks")!.price).toBe(80);
    expect(all.find((g) => g.name === "Cold drinks")!.price).toBeNull();
  });

  test("with no free items the free list is empty; with one group the other column is empty", () => {
    const l = layoutMenu(menuForBoard([it("A", 80)]));
    expect(l.free).toEqual([]);
    expect(l.columns[0].length + l.columns[1].length).toBe(1);
  });

  test("an empty menu gives an empty layout", () => {
    expect(layoutMenu([])).toEqual({ free: [], columns: [[], []] });
  });

  test("unknown group names are shown as typed, and a blank one is 'More'", () => {
    const l = layoutMenu(menuForBoard([it("A", 80, "Brunch"), it("B", 80, "")]));
    expect(l.columns.flat().map((g) => g.name).sort()).toEqual(["Brunch", "More"]);
  });

  test("a panel title joins its groups, and says '& more' when there are too many for the arch", () => {
    const l = layoutMenu(menuForBoard(menus.barista.items));
    expect(panelTitle(l.columns[0])).toBe("Hot & Cold");
    expect(panelTitle(l.columns[1])).toBe("Sandwiches & more");
    const small = layoutMenu(menuForBoard([it("A", 80, "Hot"), it("B", 100, "Savoury")]));
    expect(panelTitle([...small.columns[0], ...small.columns[1]])).toBe("Hot & Savoury");
  });
});

describe("fit", () => {
  test("the current menu (25 paid items) is shrunk a little to fit, never below 50%", () => {
    const l = layoutMenu(menuForBoard(menus.barista.items));
    expect(fitScale(l, "landscape")).toBeGreaterThanOrEqual(0.6);
    expect(fitScale(l, "portrait")).toBeGreaterThanOrEqual(0.5);
  });

  test("the proposed 23-item menu fits at full size on a wide screen", () => {
    const food = menus.barista.items.filter((i) => i.category === "savoury");
    const l = layoutMenu(
      menuForBoard([
        it("Cappuccino", 0),
        it("Americano", 0),
        it("Masala Chai", 0),
        it("Espresso", 0),
        it("Cafe Mocha", 80),
        it("Cafe Latte", 80),
        it("Hot Chocolate", 80),
        it("Elachi Chai", 80),
        ...food,
      ]),
    );
    expect(fitScale(l, "landscape")).toBe(1);
  });

  test("a long menu is shrunk, but never below 50%", () => {
    const many = Array.from({ length: 40 }, (_, i) => it(`Item ${i}`, 100, i < 20 ? "Hot" : "Cold"));
    const l = layoutMenu(menuForBoard(many));
    const k = fitScale(l, "landscape");
    expect(k).toBeLessThan(1);
    expect(k).toBeGreaterThanOrEqual(0.5);
  });
});

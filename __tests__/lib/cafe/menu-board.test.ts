import { describe, test, expect } from "vitest";
import menus from "@/config/menus";
import { fitDisplayScale, fitScale, layoutMenu, menuForBoard, panelTitle } from "@/lib/cafe/menu-board";
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
      "Chicken Sandwich",
      "Egg Puff",
    ]);
  });
});

describe("layout", () => {
  test("free items get their own panel; paid groups keep menu order", () => {
    const l = layoutMenu(menuForBoard(menus.barista.items));
    expect(l.free.map((i) => i.title)).toEqual(["Cappuccino", "Americano", "Masala Chai", "Espresso"]);
    const names = l.columns.flat().map((g) => g.name);
    expect(names).toEqual(["Drinks", "Sandwiches", "Savoury", "Pastries"]);
    // Veg first, then non-veg, in every section.
    const savoury = l.columns.flat().find((g) => g.name === "Savoury")!;
    expect(savoury.items.map((i) => i.title)).toEqual(["Veg Puff", "Veg Spring Roll", "Veg Cutlet", "Chicken Cutlet", "Chicken Puff", "Egg Puff"]);
  });

  test("the two columns are balanced and never reorder groups", () => {
    const l = layoutMenu(menuForBoard(menus.barista.items));
    const h = (g: typeof l.columns[0]) => g.reduce((n, x) => n + x.items.length, 0);
    expect(Math.abs(h(l.columns[0]) - h(l.columns[1]))).toBeLessThanOrEqual(8);
    expect(l.columns[0].length).toBeGreaterThan(0);
    expect(l.columns[1].length).toBeGreaterThan(0);
  });

  test("veg items are listed before non-veg ones within a group, keeping menu order otherwise", () => {
    const l = layoutMenu(
      menuForBoard([
        it("Chicken A", 100, "Savoury", { veg: false }),
        it("Veg A", 100, "Savoury"),
        it("Chicken B", 100, "Savoury", { veg: false }),
        it("Veg B", 100, "Savoury"),
      ]),
    );
    expect(l.columns.flat()[0]!.items.map((i) => i.title)).toEqual(["Veg A", "Veg B", "Chicken A", "Chicken B"]);
  });

  test("a group's price shows only when every item costs the same", () => {
    const l = layoutMenu(menuForBoard([it("A", 80), it("B", 80), it("C", 120, "Cold"), it("D", 100, "Cold")]));
    const all = l.columns.flat();
    expect(all.find((g) => g.name === "Hot drinks")!.price).toBe(80);
    expect(layoutMenu(menuForBoard(menus.barista.items)).columns.flat().find((g) => g.name === "Drinks")!.price).toBeNull(); // water is Rs 20
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
    expect(panelTitle(l.columns[0])).toBe("Drinks & Sandwiches");
    expect(panelTitle(l.columns[1])).toBe("Savoury & Pastries");
    const three = layoutMenu(menuForBoard([it("A", 80, "Hot"), it("B", 80, "Cold"), it("C", 100, "Sandwich"), it("D", 100, "Pastry"), it("E", 100, "Savoury"), it("F", 100, "Savoury")]));
    expect(panelTitle(three.columns.flat())).toBe("Hot & more");
    const small = layoutMenu(menuForBoard([it("A", 80, "Hot"), it("B", 100, "Savoury")]));
    expect(panelTitle([...small.columns[0], ...small.columns[1]])).toBe("Hot & Savoury");
  });
});

describe("fit", () => {
  test("the 28-item menu still fits at over 70% size on a wide and on an upright screen", () => {
    const l = layoutMenu(menuForBoard(menus.barista.items));
    expect(fitScale(l, "landscape")).toBeGreaterThanOrEqual(0.7);
    expect(fitScale(l, "portrait")).toBeGreaterThanOrEqual(0.7);
  });

  test("a long menu is shrunk, but never below 50%", () => {
    const many = Array.from({ length: 40 }, (_, i) => it(`Item ${i}`, 100, i < 20 ? "Hot" : "Cold"));
    const l = layoutMenu(menuForBoard(many));
    const k = fitScale(l, "landscape");
    expect(k).toBeLessThan(1);
    expect(k).toBeGreaterThanOrEqual(0.5);
  });
});

describe("fit on the menu and orders page", () => {
  test("the 27-item menu still fits at over 70% size on both screens", () => {
    const l = layoutMenu(menuForBoard(menus.barista.items));
    expect(fitDisplayScale(l, "landscape")).toBeGreaterThanOrEqual(0.7);
    expect(fitDisplayScale(l, "portrait")).toBeGreaterThanOrEqual(0.7);
  });

  test("a longer menu shrinks, and never below half size", () => {
    const many = Array.from({ length: 40 }, (_, i) => it(`Item ${i}`, 100, i < 20 ? "Hot" : "Cold"));
    const l = layoutMenu(menuForBoard(many));
    for (const o of ["landscape", "portrait"] as const) {
      const k = fitDisplayScale(l, o);
      expect(k).toBeLessThan(0.9);
      expect(k).toBeGreaterThanOrEqual(0.5);
    }
  });

  test("an empty menu does not break it", () => {
    expect(fitDisplayScale(layoutMenu([]), "landscape")).toBe(1);
  });
});

import { describe, test, expect } from "vitest";
import menus from "@/config/menus";
import { cafeRules } from "@/config/cafe-rules";
import { isFree, itemsIn } from "@/lib/cafe/pricing";

const { items } = menus.barista;

describe("Builder's Cafe menu", () => {
  const free = items.filter(isFree);
  const paid = items.filter((i) => !isFree(i));

  test("the dashboard picker identifies items by shortTitle, so each is unique", () => {
    expect(new Set(items.map((i) => i.shortTitle)).size).toBe(items.length);
  });

  test("every item has a category and a non-negative price", () => {
    for (const i of items) {
      expect(["coffee", "savoury"]).toContain(i.category);
      expect(typeof i.price).toBe("number");
      expect(i.price).toBeGreaterThanOrEqual(0);
    }
  });

  test("the free menu is the four quiz prizes", () => {
    expect(free.map((i) => i.title)).toEqual(["Cappuccino", "Americano", "Masala Chai", "Espresso"]);
  });

  test("the paid menu: four drinks at Rs 100, a bottle of water at Rs 20, 15 food items at Rs 100", () => {
    const drinks = paid.filter((i) => i.category !== "savoury");
    const water = paid.find((i) => i.title === "Water Bottle");
    const food = paid.filter((i) => i.category === "savoury" && i.title !== "Water Bottle");
    expect(drinks.map((i) => i.title)).toEqual(["Cafe Mocha", "Cafe Latte", "Hot Chocolate", "Elachi Chai"]);
    for (const i of drinks) {
      expect(i.price).toBe(100);
      expect(i.description).toBe("Drinks");
    }
    // Water is in the Drinks section but is not a drink to add sugar to: no add-ons.
    expect(water).toMatchObject({ price: 20, description: "Drinks", category: "savoury" });
    expect(food).toHaveLength(15);
    for (const i of food) {
      expect(i.price).toBe(100);
      expect(["Sandwich", "Savoury", "Pastry"]).toContain(i.description);
    }
    expect(paid.length + free.length).toBeLessThanOrEqual(30);
    expect(paid.some((i) => i.price === 80)).toBe(false);
  });

  test("in every section the veg items come first, then the non-veg ones", () => {
    for (const group of ["Drinks", "Sandwich", "Savoury", "Pastry"]) {
      const flags = paid.filter((i) => i.description === group).map((i) => i.veg !== false);
      expect(flags.length).toBeGreaterThan(0);
      const firstNonVeg = flags.indexOf(false);
      if (firstNonVeg !== -1) expect(flags.slice(firstNonVeg).every((v) => v === false)).toBe(true);
    }
    expect(paid.filter((i) => i.description === "Savoury").map((i) => i.title)).toEqual([
      "Veg Puff",
      "Veg Spring Roll",
      "Veg Cutlet",
      "Chicken Cutlet",
      "Chicken Puff",
      "Egg Puff",
    ]);
  });

  test("no title is repeated within the free menu or within the paid menu", () => {
    for (const list of [free, paid]) {
      expect(new Set(list.map((i) => i.title)).size).toBe(list.length);
    }
  });

  test("offers add-ons", () => {
    expect((menus.barista.modifiers ?? []).length).toBeGreaterThan(0);
  });

  test("a failed quiz still has something to buy", () => {
    expect(itemsIn(items, "coffee").filter((i) => !isFree(i)).length).toBeGreaterThan(0);
  });
});

describe("default rules are marked as defaults", () => {
  test("the rule values the client brief asks about", () => {
    expect(cafeRules.quizQuestionCount).toBe(3);
    expect(cafeRules.passMark).toBe(3);
    expect(cafeRules.maxQuizAttempts).toBe(1);
    expect(cafeRules.freeCoffeesPerEvent).toBe(1);
    expect(cafeRules.paymentExpiryMinutes).toBe(2);
    expect(cafeRules.blockIfFoundInSegment).toBe(true);
  });
});

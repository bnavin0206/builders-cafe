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
    expect(free.map((i) => i.title)).toEqual([
      "Cappuccino",
      "Cafe Latte",
      "Masala Chai",
      "Tapri Coffee",
    ]);
  });

  test("the paid menu has ten drinks (hot Rs 80, cold Rs 100) and 15 food items at Rs 100", () => {
    const drinks = paid.filter((i) => i.category !== "savoury");
    const food = paid.filter((i) => i.category === "savoury");
    expect(drinks.map((i) => i.title)).toEqual([
      "Espresso",
      "Cappuccino",
      "Cafe Latte",
      "Cold Coffee",
      "Frappe Mocha",
      "Tapri Coffee",
      "Masala Chai",
      "Hot Chocolate",
      "Cold Chocolate",
      "Cold Americano",
    ]);
    for (const i of drinks) {
      expect(i.price).toBe(i.description === "Cold" ? 100 : 80);
      expect(["Hot", "Cold"]).toContain(i.description);
    }
    expect(drinks.filter((i) => i.description === "Cold").map((i) => i.title)).toEqual([
      "Cold Coffee",
      "Frappe Mocha",
      "Cold Chocolate",
      "Cold Americano",
    ]);
    expect(food).toHaveLength(15);
    for (const i of food) {
      expect(i.price).toBe(100);
      expect(["Sandwich", "Savoury", "Pastry"]).toContain(i.description);
    }
    expect(paid.length + free.length).toBeLessThanOrEqual(30);
  });

  test("a drink is free and priced under the same title, never twice in one menu", () => {
    for (const list of [free, paid]) {
      expect(new Set(list.map((i) => i.title)).size).toBe(list.length);
    }
    expect(free.every((f) => paid.some((p) => p.title === f.title))).toBe(true);
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

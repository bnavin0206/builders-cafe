import { describe, test, expect } from "vitest";
import menus from "@/config/menus";
import { cafeRules } from "@/config/cafe-rules";
import { isFree, itemsIn } from "@/lib/cafe/pricing";

const { items } = menus.barista;

describe("Builder's Cafe menu", () => {
  test("has at most 9 items with unique titles", () => {
    expect(items.length).toBeLessThanOrEqual(9);
    expect(new Set(items.map((i) => i.title)).size).toBe(items.length);
  });

  test("every item has a category and a non-negative price", () => {
    for (const i of items) {
      expect(["coffee", "savoury"]).toContain(i.category);
      expect(typeof i.price).toBe("number");
      expect(i.price).toBeGreaterThanOrEqual(0);
    }
  });

  test("offers a free coffee and a paid coffee", () => {
    const coffee = itemsIn(items, "coffee");
    expect(coffee.some(isFree)).toBe(true);
    expect(coffee.some((i) => !isFree(i))).toBe(true);
  });

  test("offers add-ons and a paid snack for the paid options", () => {
    expect((menus.barista.modifiers ?? []).length).toBeGreaterThan(0);
    expect(itemsIn(items, "savoury").some((i) => !isFree(i))).toBe(true);
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

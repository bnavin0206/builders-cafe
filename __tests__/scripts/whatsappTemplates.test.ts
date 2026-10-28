import {
  getCafeListTemplate,
  getOrderReadyTemplate,
  getShowHelpTemplate,
} from "@/scripts/buildContentTemplates";
import { describe, expect, test } from "vitest";

describe("getShowHelpTemplate", () => {
  test("should return an object with the correct structure", () => {
    const result = getShowHelpTemplate(1, "testTemplate");
    expect(result).toHaveProperty("friendly_name", "testTemplate");
    expect(result).toHaveProperty("language", "en");
    expect(result).toHaveProperty("variables");
    expect(result).toHaveProperty("types");
  });

  test("should map French to the 'fr' Content API language code", () => {
    const result = getShowHelpTemplate(1, "testTemplate", "fr");
    expect(result).toHaveProperty("language", "fr");
  });

  test("should return an object with the correct number of variables", () => {
    const numOptions = 2;
    const result = getShowHelpTemplate(numOptions, "testTemplate");
    // intro ({{0}}) + 3 vars per option + outro ({{numOptions*3+1}})
    expect(Object.keys(result.variables)).toHaveLength(numOptions * 3 + 2);
  });

  test("should return an object with the correct types", () => {
    const result = getShowHelpTemplate(1, "testTemplate");
    expect(result.types).toHaveProperty("twilio/list-picker");
    expect(result.types).toHaveProperty("twilio/text");
  });

  test('should return an object with the correct number of items in "twilio/list-picker"', () => {
    const numOptions = 2;
    const result = getShowHelpTemplate(numOptions, "testTemplate");
    expect(result.types["twilio/list-picker"]?.items).toHaveLength(numOptions);
  });

  test("all values in the returned variables should be non-empty strings", () => {
    const numOptions = Math.floor(Math.random() * 10) + 1; // random number between 1 and 10
    const result = getShowHelpTemplate(numOptions, "testTemplate");
    const values = Object.values(result.variables);
    values.forEach((value) => expect(value).not.toBe(""));
  });
});

describe("getOrderReadyTemplate", () => {
  test.each(["en", "pt-BR", "fr"] as const)(
    "%s: plain text that names only the item",
    (lang) => {
      const t = getOrderReadyTemplate("t", lang);
      // Card templates without buttons are rejected by Twilio when sent.
      expect(Object.keys(t.types)).toEqual(["twilio/text"]);
      const body = t.types["twilio/text"]!.body;
      expect(body).toContain("{{1}}"); // item
      expect(body).not.toMatch(/\{\{[02-9]\}\}/);
      expect(Object.keys(t.variables)).toEqual(["1"]);
    },
  );

  test("English says the order is ready and will be served shortly", () => {
    const body = getOrderReadyTemplate("t", "en").types["twilio/text"]!.body;
    expect(body).toBe("Your {{1}} is ready ☕\n\nWill be served to you shortly.");
  });
});

describe("getCafeListTemplate", () => {
  test.each([1, 4, 10])("%i rows: ids and variables line up", (n) => {
    const t = getCafeListTemplate(n, "t");
    const list = t.types["twilio/list-picker"]!;
    expect(list.items).toHaveLength(n);
    expect(list.body).toBe("{{1}}");
    expect(list.button.length).toBeLessThanOrEqual(20);
    list.items.forEach((row, i) => {
      expect(row.item).toBe(`{{${i * 3 + 2}}}`);
      expect(row.id).toBe(`{{${i * 3 + 3}}}`);
      expect(row.description).toBe(`{{${i * 3 + 4}}}`);
    });
    // Numbered 1..(3n+1) with no gaps and no 0.
    expect(Object.keys(t.variables).map(Number)).toEqual(
      Array.from({ length: 1 + n * 3 }, (_, k) => k + 1),
    );
    expect(t.types["twilio/text"]!.body).toBe("{{1}}");
  });
});

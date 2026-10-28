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
  const base = "https://example.test";

  test.each(["en", "pt-BR", "fr"] as const)(
    "%s: every variant shows the order number and the pickup place",
    (lang) => {
      const t = getOrderReadyTemplate("t", base, lang);
      const bodies = [
        t.types["whatsapp/card"]!.body,
        t.types["twilio/card"]!.body,
        t.types["twilio/text"]!.body,
      ];
      for (const body of bodies) {
        expect(body).toContain("{{2}}"); // order number
        expect(body).toContain("{{3}}"); // pickup place
        expect(body).not.toContain("{{0}}");
      }
      expect(t.types["twilio/text"]!.body).toContain("{{1}}"); // item
      expect(Object.keys(t.variables)).toEqual(["1", "2", "3"]);
    },
  );

  test("English asks for the order number or the name and wishes an enjoyable drink", () => {
    const body = getOrderReadyTemplate("t", base, "en").types["twilio/text"]!.body;
    expect(body).toContain("order number *{{2}}* or your name");
    expect(body).toContain("Enjoy your drink!");
  });

  test("the image address is built from the base URL", () => {
    const t = getOrderReadyTemplate("t", base, "en");
    expect(t.types["whatsapp/card"]!.media).toEqual([`${base}/rcs-resources/ready.png`]);
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

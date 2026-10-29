import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync("src/app/(layout-free)/event/[slug]/board/board.css", "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** Every rule as [selector, body], including the ones inside @media blocks. */
function rules(text: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push([m[1]!.trim(), m[2]!.trim()]);
  return out;
}

describe("order board stylesheet", () => {
  test("braces are balanced", () => {
    expect(css.split("{").length).toBe(css.split("}").length);
  });

  test("every selector is a board class, never a fragment glued onto another rule", () => {
    for (const [selector] of rules(css)) {
      if (selector.startsWith("@") || /^\d+%|^from|^to/.test(selector)) continue;
      for (const part of selector.split(",")) {
        const p = part.trim();
        // A rule begins with a class, and no selector ends with a bare class prefix + newline.
        expect(p, `selector: ${selector}`).toMatch(/^[.]/);
        expect(p).not.toMatch(/\n/);
      }
    }
  });

  test("the lists of orders are grids for every panel (no panel-specific display rule)", () => {
    const base = rules(css).find(([s]) => s === ".tokens");
    expect(base).toBeTruthy();
    expect(base![1]).toContain("display: grid");
  });

  test("portrait puts the Ready panel first and stacks the three panels", () => {
    expect(css).toMatch(/@media \(orientation: portrait\)/);
    expect(css).toMatch(/\.panel--ready \{ order: -1; \}/);
    expect(css).toMatch(/grid-template-rows: 46fr 31fr 23fr/);
  });

  test("sizes scale with the screen: no fixed pixel sizes for text or tokens", () => {
    const sizes = rules(css).flatMap(([, body]) => body.match(/font-size:\s*[^;]+/g) ?? []);
    for (const s of sizes) expect(s).not.toMatch(/\d(px|rem)\b/);
  });
});

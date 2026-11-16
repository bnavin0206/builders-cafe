import { describe, expect, it } from "vitest";
import { newestFirst } from "./order-sort";

describe("newest first", () => {
  it("puts the most recently changed order first", () => {
    const out = newestFirst([
      { index: 0, dateUpdated: new Date("2026-11-16T06:00:00Z") },
      { index: 3, dateUpdated: new Date("2026-11-16T08:00:00Z") },
      { index: 6, dateUpdated: new Date("2026-11-16T07:00:00Z") },
    ]);
    expect(out.map((i) => i.index)).toEqual([3, 6, 0]);
  });
  it("breaks a tie by the higher order position, and does not change the input", () => {
    const input = [{ index: 1, dateUpdated: "2026-11-16T06:00:00Z" }, { index: 2, dateUpdated: "2026-11-16T06:00:00Z" }];
    expect(newestFirst(input).map((i) => i.index)).toEqual([2, 1]);
    expect(input.map((i) => i.index)).toEqual([1, 2]);
  });
  it("copes with a missing time", () => {
    expect(newestFirst([{ index: 1 }, { index: 2, dateUpdated: "2026-11-16T06:00:00Z" }]).map((i) => i.index)).toEqual([2, 1]);
  });
});

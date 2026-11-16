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

import { groupByDay } from "./order-sort";

describe("group by day", () => {
  const NOW = new Date("2026-11-16T08:00:00Z"); // Monday 13:30 IST
  const o = (index: number, iso: string) => ({ index, dateUpdated: new Date(iso) });
  it("makes one section per Bengaluru day, newest day first, newest order first inside", () => {
    const s = groupByDay(
      [o(1, "2026-11-13T06:00:00Z"), o(2, "2026-11-16T05:00:00Z"), o(3, "2026-11-16T07:00:00Z"), o(4, "2026-11-15T10:00:00Z"), o(5, "2026-11-13T09:00:00Z")],
      NOW,
    );
    expect(s.map((x) => [x.label, x.items.map((i) => i.index)])).toEqual([
      ["Today", [3, 2]],
      ["Yesterday", [4]],
      ["Fri 13 Nov", [5, 1]],
    ]);
  });
  it("keeps the date itself next to Today and Yesterday", () => {
    const s = groupByDay([o(1, "2026-11-16T05:00:00Z"), o(2, "2026-11-15T10:00:00Z")], NOW);
    expect(s.map((x) => x.dateLabel)).toEqual(["Mon 16 Nov", "Sun 15 Nov"]);
  });
  it("00:30 IST belongs to the new day", () => {
    expect(groupByDay([o(1, "2026-11-15T19:00:00Z")], NOW)[0].day).toBe("2026-11-16");
  });
  it("an order with no time goes in 'Earlier'", () => {
    expect(groupByDay([{ index: 1 }], NOW).map((x) => x.label)).toEqual(["Earlier"]);
  });
  it("is empty with no orders", () => {
    expect(groupByDay([], NOW)).toEqual([]);
  });
});

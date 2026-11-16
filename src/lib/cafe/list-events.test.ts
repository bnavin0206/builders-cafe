import { describe, expect, it } from "vitest";
import { applyItemAdded, applyItemRemoved, applyItemUpdated } from "./list-events";

const it_ = (index: number, status = "queued") => ({ index, data: { status } });

describe("live list events", () => {
  it("an update with only item.index (what Twilio sends) replaces the order", () => {
    const items = [it_(0), it_(3), it_(6)];
    const out = applyItemUpdated(items, { item: it_(3, "ready") });
    expect(out.map((i) => i.data.status)).toEqual(["queued", "ready", "queued"]);
    expect(out).toHaveLength(3);
  });
  it("does not change the list when the update has no usable index", () => {
    const items = [it_(0)];
    expect(applyItemUpdated(items, { item: {} as any })).toBe(items);
  });
  it("an update for an order the page never saw adds it", () => {
    expect(applyItemUpdated([it_(0)], { item: it_(9, "ready") }).map((i) => i.index)).toEqual([0, 9]);
  });
  it("a new order is added once, even if the event repeats it", () => {
    const once = applyItemAdded([it_(0)], { item: it_(3) });
    expect(applyItemAdded(once, { item: it_(3, "ready") }).map((i) => [i.index, i.data.status])).toEqual([[0, "queued"], [3, "ready"]]);
  });
  it("removes by index", () => {
    expect(applyItemRemoved([it_(0), it_(3)], { index: 3 }).map((i) => i.index)).toEqual([0]);
    expect(applyItemRemoved([it_(0), it_(3)], { item: it_(0) }).map((i) => i.index)).toEqual([3]);
  });
});

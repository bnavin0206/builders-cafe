import { describe, test, expect } from "vitest";
import { buildBoard, type RawOrder } from "@/lib/cafe/board";

const NOW = new Date("2026-11-12T10:00:00Z");
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000);

const order = (
  index: number,
  status: string,
  updatedMinutesAgo: number,
  extra: Record<string, unknown> = {},
): RawOrder => ({
  index,
  dateUpdated: ago(updatedMinutesAgo),
  data: { item: "Cappuccino", status, ...extra },
});

describe("buildBoard", () => {
  test("sorts orders into preparing, ready and delivered", () => {
    const b = buildBoard(
      [order(1, "queued", 5), order(2, "ready", 4), order(3, "delivered", 3)],
      NOW,
    );
    expect(b.preparing.map((o) => o.no)).toEqual([1]);
    expect(b.ready.map((o) => o.no)).toEqual([2]);
    expect(b.delivered.map((o) => o.no)).toEqual([3]);
    expect(b.serverTime).toBe(NOW.toISOString());
  });

  test("cancelled orders and unknown statuses are not shown", () => {
    const b = buildBoard([order(1, "cancelled", 1), order(2, "weird", 1), order(3, "", 1)], NOW);
    expect([...b.preparing, ...b.ready, ...b.delivered]).toEqual([]);
  });

  test("the items are the drink plus the paid extras, joined with a plus", () => {
    const b = buildBoard(
      [order(7, "queued", 1, { item: "Cappuccino", extras: "Cold Chocolate, Espresso ×2" })],
      NOW,
    );
    expect(b.preparing[0]!.items).toBe("Cappuccino + Cold Chocolate, Espresso ×2");
  });

  test("add-ons are not on the board", () => {
    const b = buildBoard([order(7, "queued", 1, { modifiers: "No sugar, Extra hot" })], NOW);
    expect(b.preparing[0]!.items).toBe("Cappuccino");
    expect(JSON.stringify(b)).not.toContain("sugar");
  });

  test("nothing personal can reach the board", () => {
    const b = buildBoard(
      [
        order(9, "ready", 1, {
          name: "Asha Rao",
          address: "whatsapp:+91****598",
          key: "+919800000001",
          paymentId: "pay_secret",
          amountPaise: 8000,
          channel: "whatsapp",
          email: "asha@example.com",
        }),
      ],
      NOW,
    );
    const json = JSON.stringify(b);
    for (const leak of ["Asha", "whatsapp", "+91", "pay_secret", "8000", "asha@"]) {
      expect(json).not.toContain(leak);
    }
    expect(Object.keys(b.ready[0]!).sort()).toEqual(["items", "no", "updatedAt"]);
  });

  test("preparing: oldest number first. ready and delivered: latest change first", () => {
    const b = buildBoard(
      [
        order(5, "queued", 1),
        order(3, "queued", 9),
        order(4, "ready", 8),
        order(6, "ready", 2),
        order(1, "delivered", 7),
        order(2, "delivered", 1),
      ],
      NOW,
    );
    expect(b.preparing.map((o) => o.no)).toEqual([3, 5]);
    expect(b.ready.map((o) => o.no)).toEqual([6, 4]);
    expect(b.delivered.map((o) => o.no)).toEqual([2, 1]);
  });

  test("delivered orders drop off after ten minutes", () => {
    const b = buildBoard([order(1, "delivered", 9.9), order(2, "delivered", 10.5)], NOW);
    expect(b.delivered.map((o) => o.no)).toEqual([1]);
  });

  test("the delivered window can be changed", () => {
    const raw = [order(1, "delivered", 20)];
    expect(buildBoard(raw, NOW, 30).delivered).toHaveLength(1);
    expect(buildBoard(raw, NOW, 5).delivered).toHaveLength(0);
  });

  test("only the latest twenty delivered orders are kept", () => {
    const raw = Array.from({ length: 30 }, (_, i) => order(i + 1, "delivered", 0.1 + i / 100));
    expect(buildBoard(raw, NOW).delivered).toHaveLength(20);
  });

  test("an order with no item, or a bad number, is skipped; odd text is tidied", () => {
    const b = buildBoard(
      [
        { index: 1, dateUpdated: NOW, data: { status: "queued" } },
        { index: NaN, dateUpdated: NOW, data: { item: "Latte", status: "queued" } },
        { index: 2, dateUpdated: NOW, data: null },
        { index: 3, dateUpdated: NOW, data: { item: "  Cafe \n  Latte ", status: "queued" } },
      ],
      NOW,
    );
    expect(b.preparing.map((o) => [o.no, o.items])).toEqual([[3, "Cafe Latte"]]);
  });

  test("an invalid time is never shown as delivered, but queued still shows", () => {
    const b = buildBoard(
      [
        { index: 1, dateUpdated: "not a date", data: { item: "A", status: "delivered" } },
        { index: 2, dateUpdated: "not a date", data: { item: "B", status: "queued" } },
      ],
      NOW,
    );
    expect(b.delivered).toEqual([]);
    expect(b.preparing[0]).toMatchObject({ no: 2, updatedAt: NOW.toISOString() });
  });

  test("an empty list gives three empty groups", () => {
    expect(buildBoard([], NOW)).toEqual({
      preparing: [],
      ready: [],
      delivered: [],
      serverTime: NOW.toISOString(),
    });
  });
});

import { describe, expect, it } from "vitest";
import { todayStats } from "./today-stats";

const o = (iso: string, data: object) => ({ dateCreated: new Date(iso), data });
const live = (updated: string, data: object) => ({ dateUpdated: new Date(updated), data }); // as the browser sees it
const NOW = new Date("2026-11-16T08:00:00Z"); // 13:30 IST on 16 Nov

describe("today's stats", () => {
  it("counts only today's orders (Bengaluru day), by status", () => {
    const s = todayStats(
      [
        o("2026-11-13T07:00:00Z", { status: "delivered", freeCoffee: true }), // Friday: not counted
        o("2026-11-15T19:00:00Z", { status: "delivered" }), // 00:30 IST on the 16th: counted
        o("2026-11-16T06:00:00Z", { status: "queued", freeCoffee: true, amountPaise: 0 }),
        o("2026-11-16T06:30:00Z", { status: "ready", amountPaise: 5000, paymentId: "pay_1" }),
        o("2026-11-16T07:00:00Z", { status: "delivered", freeCoffee: true, amountPaise: 10000, paymentId: "pay_2" }),
        o("2026-11-16T07:10:00Z", { status: "cancelled", amountPaise: 5000, paymentId: "pay_3" }),
      ],
      NOW,
    );
    expect(s).toEqual({ total: 4, queued: 1, ready: 1, delivered: 2, cancelled: 1, free: 2, paid: 2, paidRupees: 150 });
  });
  it("is all zeros with no orders", () => {
    expect(todayStats([], NOW)).toEqual({ total: 0, queued: 0, ready: 0, delivered: 0, cancelled: 0, free: 0, paid: 0, paidRupees: 0 });
  });
  it("a day that just ended no longer counts", () => {
    const s = todayStats([o("2026-11-16T08:00:00Z", { status: "delivered" })], new Date("2026-11-16T19:00:00Z")); // 00:30 IST on the 17th
    expect(s.total).toBe(0);
  });

  it("uses createdAt when the order has one, and the last change for older orders", () => {
    const s = todayStats(
      [
        live("2026-11-16T07:00:00Z", { status: "delivered", createdAt: "2026-11-13T07:00:00Z" }), // made on Friday, changed today: Friday's
        live("2026-11-16T07:00:00Z", { status: "queued", createdAt: "2026-11-16T06:00:00Z" }), // today
        live("2026-11-16T07:00:00Z", { status: "delivered" }), // older order, no createdAt: last change was today
        live("2026-11-13T09:00:00Z", { status: "delivered" }), // older order, last change on Friday
      ],
      NOW,
    );
    expect(s.total).toBe(2);
    expect(s.queued).toBe(1);
    expect(s.delivered).toBe(1);
  });
});

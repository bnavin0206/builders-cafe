import { describe, expect, it } from "vitest";
import { orderTag } from "./order-tag";
import { buildBoard } from "./board";

describe("order tag", () => {
  it("free coffee only", () => expect(orderTag({ amountPaise: 0, freeCoffee: true })).toEqual({ text: "FREE", color: "green" }));
  it("paid through WhatsApp", () => expect(orderTag({ amountPaise: 10000, paymentId: "pay_1" })).toEqual({ text: "PAID ₹100", color: "blue" }));
  it("free coffee plus paid items", () => expect(orderTag({ amountPaise: 10000, paymentId: "pay_1", freeCoffee: true })).toEqual({ text: "FREE + PAID ₹100", color: "purple" }));
  it("counter sales say how they were paid", () => {
    expect(orderTag({ amountPaise: 20000, paymentId: "ctr_1", payMode: "cash", manual: true })).toEqual({ text: "COUNTER · Cash ₹200", color: "orange" });
    expect(orderTag({ amountPaise: 10000, payMode: "pos" }).text).toBe("COUNTER · POS ₹100");
  });
  it("a hand-made order with no payment", () => expect(orderTag({ manual: true })).toEqual({ text: "MANUAL", color: "gray" }));
});

describe("board order numbers", () => {
  const row = (index: number, orderNumber?: number) => ({
    index,
    dateUpdated: new Date(),
    data: { item: "Latte", status: "queued", ...(orderNumber ? { orderNumber } : {}) },
  });
  it("shows the order number, not the list position", () => {
    expect(buildBoard([row(6, 3)]).preparing[0].no).toBe(3);
  });
  it("falls back to the list position for older orders", () => {
    expect(buildBoard([row(6)]).preparing[0].no).toBe(6);
  });
});

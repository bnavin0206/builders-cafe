import { describe, expect, it } from "vitest";
import { counterMenu, invoiceChatLink, parseInvoiceRequest, resolveCart } from "./counter";
import { buildInvoice, invoiceHtml } from "./invoice";
import { paidOrdersForDay, reportCsv } from "./daily-report";
import type { Event } from "@/types";

const ev = {
  selection: {
    items: [
      { title: "Cafe Latte", price: 100 },
      { title: "Cappuccino", price: 0 },
      { title: "Veg Puff", price: 100, available: false },
      { title: "Water Bottle", price: 20 },
    ],
  },
} as unknown as Event;

describe("counter sale", () => {
  it("lists only paid items that are on", () => {
    expect(counterMenu(ev).map((i) => i.title)).toEqual(["Cafe Latte", "Water Bottle"]);
  });
  it("prices the cart from the menu, not from the browser", () => {
    const r = resolveCart(ev, [{ title: "Cafe Latte", qty: 2 }, { title: "Water Bottle", qty: 1 }]);
    expect("error" in r ? 0 : r.amountPaise).toBe(22000);
  });
  it("rejects free, switched-off, unknown items and bad quantities", () => {
    for (const l of [{ title: "Cappuccino", qty: 1 }, { title: "Veg Puff", qty: 1 }, { title: "X", qty: 1 }, { title: "Cafe Latte", qty: 0 }, { title: "Cafe Latte", qty: 99 }]) {
      expect("error" in resolveCart(ev, [l])).toBe(true);
    }
    expect("error" in resolveCart(ev, [])).toBe(true);
  });
  it("builds the invoice QR link and reads the request back", () => {
    const link = invoiceChatLink(["whatsapp:+918197025003"], "ctr_abc.123")!;
    expect(link).toBe("https://wa.me/918197025003?text=INVOICE%20ctr_abc.123");
    expect(parseInvoiceRequest("INVOICE ctr_abc.123")).toBe("ctr_abc.123");
    expect(parseInvoiceRequest("invoice   x ")).toBe("x");
    expect(parseInvoiceRequest("hi")).toBeNull();
  });
  it("shows the payment mode on the invoice and in the finance CSV", () => {
    const inv = buildInvoice({ seq: 2, issuedAt: new Date(), eventName: "Cafe", orderNumber: 5, paymentId: "ctr_1", amountPaise: 10000, items: [{ title: "Cafe Latte", price: 100 }], customer: {}, payMode: "cash" });
    expect(invoiceHtml(inv)).toContain("Paid at the counter: Cash");
    const orders = paidOrdersForDay(
      [{ index: 5, dateCreated: new Date("2026-11-12T05:00:00Z"), data: { item: "Cafe Latte", amountPaise: 10000, paymentId: "ctr_1", status: "queued", channel: "other", payMode: "cash" } }],
      "2026-11-12",
    );
    orders[0].invoiceNo = inv.number;
    const csv = reportCsv(orders, "2026-11-12");
    expect(csv).toContain("Counter: Cash");
    expect(csv).toContain("MMC/TBC/00002");
  });
});

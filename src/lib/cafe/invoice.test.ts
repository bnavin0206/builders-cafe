import { describe, expect, it } from "vitest";
import { amountInWords, buildInvoice, formatInvoiceNumber, invoiceHtml, invoiceToken, paymentIdFromToken, splitInclusive } from "./invoice";

const base = {
  seq: 1, issuedAt: new Date("2026-11-12T09:00:00Z"), eventName: "Cafe", orderNumber: 37, paymentId: "pay_1",
  customer: { name: "Asha", phone: "+919800000021" },
};

describe("invoice", () => {
  it("numbers like MMC/TBC/00001", () => {
    expect(formatInvoiceNumber(1)).toBe("MMC/TBC/00001");
    expect(formatInvoiceNumber(123)).toBe("MMC/TBC/00123");
  });
  it("splits a GST-inclusive price", () => {
    expect(splitInclusive(10000)).toEqual({ taxablePaise: 9524, cgstPaise: 238, sgstPaise: 238 });
    const s = splitInclusive(2000);
    expect(s.taxablePaise + s.cgstPaise + s.sgstPaise).toBe(2000);
  });
  it("totals match the money paid", () => {
    const inv = buildInvoice({ ...base, amountPaise: 20000, items: [{ title: "Latte", price: 100 }, { title: "Puff", price: 100 }] });
    expect(inv.lines).toHaveLength(2);
    expect(inv.taxablePaise + inv.cgstPaise + inv.sgstPaise).toBe(20000);
    expect(inv.totalPaise).toBe(20000);
  });
  it("groups repeated items", () => {
    const inv = buildInvoice({ ...base, amountPaise: 20000, items: [{ title: "Latte", price: 100 }, { title: "Latte", price: 100 }] });
    expect(inv.lines).toEqual([expect.objectContaining({ name: "Latte", qty: 2, grossPaise: 20000 })]);
  });
  it("falls back to one line when items do not add up", () => {
    const inv = buildInvoice({ ...base, amountPaise: 15000, items: [{ title: "Latte", price: 100 }] });
    expect(inv.lines).toHaveLength(1);
    expect(inv.lines[0].name).toBe("Order #37");
    expect(inv.totalPaise).toBe(15000);
  });
  it("writes amounts in words", () => {
    expect(amountInWords(20000)).toBe("Rupees Two Hundred only");
    expect(amountInWords(12050)).toBe("Rupees One Hundred Twenty and Fifty Paise only");
  });
  it("renders seller details and escapes customer text", () => {
    const inv = buildInvoice({ ...base, customer: { name: "<b>x</b>" }, amountPaise: 10000, items: [{ title: "Latte", price: 100 }] });
    const html = invoiceHtml(inv);
    expect(html).toContain("29AAGCD8430N1Z4");
    expect(html).toContain("MMC/TBC/00001");
    expect(html).not.toContain("<b>x</b>");
  });
  it("signed links only open for their own payment", () => {
    process.env.INVOICE_LINK_SECRET = "s3cret";
    const t = invoiceToken("pay_1")!;
    expect(paymentIdFromToken(t)).toBe("pay_1");
    expect(paymentIdFromToken("pay_2." + t.split(".")[1])).toBeUndefined();
    expect(paymentIdFromToken("garbage")).toBeUndefined();
  });
});

describe("test invoices", () => {
  it("use their own TEST/MMC/ series and say so on the page", () => {
    expect(formatInvoiceNumber(1, true)).toBe("TEST/MMC/00001");
    const inv = buildInvoice({ ...base, test: true, amountPaise: 10000, items: [{ title: "Latte", price: 100 }] });
    expect(inv.number).toBe("TEST/MMC/00001");
    expect(invoiceHtml(inv)).toContain("TEST INVOICE");
    expect(invoiceHtml(buildInvoice({ ...base, amountPaise: 10000, items: [{ title: "Latte", price: 100 }] }))).not.toContain("TEST INVOICE");
  });
  it("is test mode unless Razorpay has live keys", async () => {
    const { isTestMode } = await import("./invoice");
    expect(isTestMode({ RAZORPAY_KEY_ID: "rzp_test_x" })).toBe(true);
    expect(isTestMode({})).toBe(true);
    expect(isTestMode({ RAZORPAY_KEY_ID: "rzp_live_x" })).toBe(false);
  });
});

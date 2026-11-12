import { describe, expect, it, vi } from "vitest";
import { normalizePhone } from "./phone";
import { sendInvoiceMessage, type InvoiceSender } from "./invoice-send";

const args = { to: "+919876543210", from: "whatsapp:+918197025003", number: "MMC/TBC/00007", totalPaise: 20000, link: "https://x/invoice/t", templateSid: "HX1" };

describe("phone numbers", () => {
  it("accepts common Indian formats", () => {
    for (const v of ["9876543210", "98765 43210", "09876543210", "919876543210", "+91 98765-43210"]) expect(normalizePhone(v)).toBe("+919876543210");
  });
  it("keeps other countries that start with +", () => {
    expect(normalizePhone("+1 415 555 0100")).toBe("+14155550100");
  });
  it("rejects things that are not mobile numbers", () => {
    for (const v of ["", "12345", "5876543210", "abc", "98765432101234567"]) expect(normalizePhone(v)).toBeNull();
  });
});

describe("sending an invoice", () => {
  it("sends a plain message first", async () => {
    const s: InvoiceSender = { sendText: vi.fn(async () => ({ sid: "SM1" })), sendTemplate: vi.fn() as any };
    expect(await sendInvoiceMessage(s, args)).toEqual({ ok: true, via: "message", sid: "SM1" });
    expect(s.sendTemplate).not.toHaveBeenCalled();
  });
  it("uses the template when the 24-hour window is closed", async () => {
    const s: InvoiceSender = {
      sendText: vi.fn(async () => { throw { code: 63016 }; }),
      sendTemplate: vi.fn(async () => ({ sid: "SM2" })),
    };
    expect(await sendInvoiceMessage(s, args)).toEqual({ ok: true, via: "template", sid: "SM2" });
    expect((s.sendTemplate as any).mock.calls[0][0].variables).toEqual({ "1": "MMC/TBC/00007", "2": "200.00", "3": "https://x/invoice/t" });
  });
  it("says so when there is no template yet", async () => {
    const s: InvoiceSender = { sendText: async () => { throw { code: 63016 }; }, sendTemplate: vi.fn() as any };
    expect(await sendInvoiceMessage(s, { ...args, templateSid: undefined })).toEqual({ ok: false, reason: "no-template" });
  });
  it("does not fall back to the template for other errors", async () => {
    const s: InvoiceSender = { sendText: async () => { throw { code: 21211 }; }, sendTemplate: vi.fn() as any };
    expect(await sendInvoiceMessage(s, args)).toEqual({ ok: false, reason: "failed" });
    expect(s.sendTemplate).not.toHaveBeenCalled();
  });
});

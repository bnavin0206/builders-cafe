import { describe, test, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

const confirmPayment = vi.fn();

vi.mock("@/config/env", () => ({
  env: { razorpayWebhookSecret: "whsec_test", razorpayKeyId: "", razorpayKeySecret: "" },
}));
vi.mock("@/lib/cafe/io", () => ({ makeRazorpayIo: () => ({}) }));
vi.mock("@/lib/cafe/payment", () => ({ confirmPayment: (...a: unknown[]) => confirmPayment(...a) }));

import { POST } from "@/app/webhooks/razorpay/route";

const sign = (b: string) => createHmac("sha256", "whsec_test").update(b).digest("hex");
const req = (body: string, signature: string | null = sign(body)) =>
  new Request("http://localhost/webhooks/razorpay", {
    method: "POST",
    body,
    headers: signature ? { "x-razorpay-signature": signature } : {},
  });

const paidEvent = {
  event: "payment_link.paid",
  payload: {
    payment_link: { entity: { id: "plink_1", amount_paid: 12000, notes: { phone: "+919800000001" } } },
    payment: { entity: { id: "pay_1", amount: 12000 } },
  },
};

beforeEach(() => {
  confirmPayment.mockReset();
  confirmPayment.mockResolvedValue("placed");
});

describe("POST /webhooks/razorpay", () => {
  test("rejects a bad signature without doing anything", async () => {
    const res = await POST(req(JSON.stringify(paidEvent), "deadbeef"));
    expect(res.status).toBe(400);
    expect(confirmPayment).not.toHaveBeenCalled();
  });

  test("rejects a missing signature", async () => {
    const res = await POST(req(JSON.stringify(paidEvent), null));
    expect(res.status).toBe(400);
  });

  test("confirms a paid payment link", async () => {
    const res = await POST(req(JSON.stringify(paidEvent)));
    expect(res.status).toBe(200);
    expect(confirmPayment).toHaveBeenCalledWith(
      { phone: "+919800000001", linkId: "plink_1", paymentId: "pay_1", amountPaise: 12000 },
      expect.anything(),
    );
  });

  test("ignores other events with a 200", async () => {
    const body = JSON.stringify({ event: "payment.failed" });
    const res = await POST(req(body));
    expect(res.status).toBe(200);
    expect(confirmPayment).not.toHaveBeenCalled();
  });

  test("returns 200 and skips when fields are missing", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const body = JSON.stringify({ event: "payment_link.paid", payload: {} });
    const res = await POST(req(body));
    expect(res.status).toBe(200);
    expect(confirmPayment).not.toHaveBeenCalled();
    err.mockRestore();
  });

  test("returns 500 so Razorpay retries when processing fails", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    confirmPayment.mockRejectedValue(new Error("sync down"));
    const res = await POST(req(JSON.stringify(paidEvent)));
    expect(res.status).toBe(500);
    err.mockRestore();
  });

  test("returns 400 for a signed body that is not JSON", async () => {
    const res = await POST(req("not json"));
    expect(res.status).toBe(400);
  });
});

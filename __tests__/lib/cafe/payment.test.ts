import { describe, test, expect, vi } from "vitest";
import { createHmac } from "node:crypto";
import { EventState } from "@/lib/utils";
import { modes, Stages } from "@/types";
import type { AttendeeRecord, Event, Order } from "@/types";
import { confirmPayment, type PaymentIo } from "@/lib/cafe/payment";
import type { CafeDeps } from "@/lib/cafe/flow";
import { verifyWebhookSignature } from "@/lib/razorpay";

const PHONE = "+919800000001";

const evt: Event = {
  name: "Builder's Cafe",
  slug: "builders-cafe",
  state: EventState.OPEN,
  leadCollection: "MANUAL",
  senders: [],
  pickupLocation: "Counter",
  maxOrders: 5,
  welcomeMessage: "",
  selection: {
    mode: modes.barista,
    modifiers: [],
    items: [
      { title: "Cold Brew", shortTitle: "Cold Brew", description: "", price: 120, category: "coffee" },
      { title: "Cheese Croissant", shortTitle: "Cheese Croissant", description: "", price: 90, category: "savoury" },
    ],
  },
};

function setup(record: Partial<AttendeeRecord> = {}, event: Event | null = evt) {
  const state = {
    record: {
      event: "builders-cafe",
      stage: Stages.AWAITING_PAYMENT,
      from: "whatsapp:+14155238886",
      pendingOrder: {
        coffee: "Cold Brew",
        amountPaise: 12000,
        linkId: "plink_1",
        linkUrl: "https://rzp.io/i/x",
        expiresAt: "2026-11-12T10:10:00.000Z",
      },
      ...record,
    } as AttendeeRecord,
    sent: [] as string[],
    orders: [] as Order[],
  };
  const deps: CafeDeps = {
    now: () => new Date("2026-11-12T10:05:00Z"),
    rng: Math.random,
    save: async (_p, patch) => {
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete (state.record as any)[k];
        else (state.record as any)[k] = v;
      }
    },
    send: (t) => void state.sent.push(t),
    addOrder: async (o) => {
      state.orders.push(o);
      return 100 + state.orders.length;
    },
    createPaymentLink: async () => ({ id: "x", url: "x" }),
    cancelPaymentLink: async () => {},
  };
  const io: PaymentIo = {
    getRecord: async () => state.record,
    getEvent: async () => event,
    makeDeps: () => deps,
  };
  return { state, io };
}

const paid = { phone: PHONE, linkId: "plink_1", paymentId: "pay_1", amountPaise: 12000 };

describe("confirmPayment", () => {
  test("places the pending order once payment arrives", async () => {
    const { state, io } = setup();
    expect(await confirmPayment(paid, io)).toBe("placed");
    expect(state.orders).toEqual([
      expect.objectContaining({ item: "Cold Brew", amountPaise: 12000, paymentId: "pay_1", status: "queued" }),
    ]);
    expect(state.record.stage).toBe(Stages.FIRST_ORDER);
    expect(state.record.pendingOrder).toBeUndefined();
    expect(state.record.lastPaymentId).toBe("pay_1");
    expect(state.sent.at(-1)).toBe(
      "Payment received. Order #101 confirmed: Cold Brew. We'll message you when it's ready.",
    );
  });

  test("includes the savoury in the order", async () => {
    const { state, io } = setup({
      pendingOrder: {
        coffee: "Cold Brew",
        savoury: "Cheese Croissant",
        amountPaise: 21000,
        linkId: "plink_1",
        linkUrl: "u",
        expiresAt: "2026-11-12T10:10:00.000Z",
      },
    });
    await confirmPayment({ ...paid, amountPaise: 21000 }, io);
    expect(state.orders[0]).toMatchObject({ item: "Cold Brew", modifiers: "Cheese Croissant" });
  });

  test("a retried webhook does not place a second order", async () => {
    const { state, io } = setup();
    await confirmPayment(paid, io);
    expect(await confirmPayment(paid, io)).toBe("duplicate");
    expect(state.orders).toHaveLength(1);
  });

  test("a payment with no pending order is flagged, not queued", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { state, io } = setup({ pendingOrder: undefined });
    expect(await confirmPayment(paid, io)).toBe("orphan");
    expect(state.orders).toHaveLength(0);
    expect(state.sent.at(-1)).toContain("pay_1");
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  test("a payment for a different link is flagged, not queued", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { state, io } = setup();
    expect(await confirmPayment({ ...paid, linkId: "plink_other" }, io)).toBe("orphan");
    expect(state.orders).toHaveLength(0);
    expect(state.record.pendingOrder).toBeDefined();
    err.mockRestore();
  });

  test("an amount that differs from the order is flagged, not queued", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { state, io } = setup();
    expect(await confirmPayment({ ...paid, amountPaise: 100 }, io)).toBe("amount-mismatch");
    expect(state.orders).toHaveLength(0);
    err.mockRestore();
  });

  test("an attendee with no active event is reported", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { state, io } = setup({}, null);
    expect(await confirmPayment(paid, io)).toBe("no-event");
    expect(state.orders).toHaveLength(0);
    err.mockRestore();
  });

  test("an item removed from the menu is flagged, not queued", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { state, io } = setup({
      pendingOrder: { coffee: "Gone", amountPaise: 12000, linkId: "plink_1", linkUrl: "u", expiresAt: "x" },
    });
    expect(await confirmPayment(paid, io)).toBe("orphan");
    expect(state.orders).toHaveLength(0);
    err.mockRestore();
  });
});

describe("verifyWebhookSignature", () => {
  const body = '{"event":"payment_link.paid"}';
  const sign = (b: string, secret: string) => createHmac("sha256", secret).update(b).digest("hex");

  test("accepts a correct signature", () => {
    expect(verifyWebhookSignature(body, sign(body, "s3cret"), "s3cret")).toBe(true);
  });
  test("rejects a changed body", () => {
    expect(verifyWebhookSignature(body + " ", sign(body, "s3cret"), "s3cret")).toBe(false);
  });
  test("rejects the wrong secret", () => {
    expect(verifyWebhookSignature(body, sign(body, "other"), "s3cret")).toBe(false);
  });
  test("rejects a missing signature or secret", () => {
    expect(verifyWebhookSignature(body, null, "s3cret")).toBe(false);
    expect(verifyWebhookSignature(body, sign(body, ""), "")).toBe(false);
  });
  test("rejects a signature of the wrong length without throwing", () => {
    expect(verifyWebhookSignature(body, "abc", "s3cret")).toBe(false);
  });
});

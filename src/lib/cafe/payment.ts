import type { AttendeeRecord, Event } from "@/types";
import { orderSummary, placeOrder, type CafeDeps } from "./flow";
import { msg } from "./messages";

export interface PaymentIo {
  getRecord(phone: string): Promise<AttendeeRecord>;
  getEvent(slug: string): Promise<Event | null | undefined>;
  /** Dependencies bound to the attendee's WhatsApp sender. */
  makeDeps(event: Event, sender: string, from: string): CafeDeps;
}

export interface PaidPayload {
  phone: string;
  linkId: string;
  paymentId: string;
  amountPaise: number;
}

export type PaidResult =
  | "placed"
  | "duplicate"
  | "orphan"
  | "amount-mismatch"
  | "no-event";

/**
 * A Razorpay payment link was paid. Place the pending order, once.
 * The caller has already verified the webhook signature.
 */
export async function confirmPayment(
  paid: PaidPayload,
  io: PaymentIo,
): Promise<PaidResult> {
  const record = await io.getRecord(paid.phone);
  if (record.lastPaymentId && record.lastPaymentId === paid.paymentId) {
    return "duplicate"; // Razorpay retried a webhook we already handled
  }

  const event = record.event ? await io.getEvent(record.event) : null;
  if (!event) {
    console.error("Payment for an attendee with no active event", paid);
    return "no-event";
  }
  const sender = `whatsapp:${paid.phone}`;
  const from = (record.from as string | undefined) ?? "";
  const deps = io.makeDeps(event, sender, from);

  const pending = record.pendingOrder;
  if (!pending || pending.linkId !== paid.linkId) {
    // Money was taken but there is no matching pending order (for example the
    // link was cancelled after the attendee opened it). Tell the attendee and
    // leave a trace for a refund.
    console.error("Payment without a matching pending order", paid);
    deps.send(msg.paymentOrphan(paid.paymentId));
    return "orphan";
  }
  if (pending.amountPaise !== paid.amountPaise) {
    console.error("Payment amount does not match the order", paid, pending);
    deps.send(msg.paymentOrphan(paid.paymentId));
    return "amount-mismatch";
  }

  const coffee = event.selection.items.find((i) => i.title === pending.coffee);
  const extra = pending.extra
    ? event.selection.items.find((i) => i.title === pending.extra)
    : undefined;
  if (!coffee) {
    console.error("Pending order item is no longer on the menu", pending);
    deps.send(msg.paymentOrphan(paid.paymentId));
    return "orphan";
  }

  const n = await placeOrder({ event, phone: paid.phone, record }, deps, {
    coffee,
    addOns: pending.addOns,
    extra,
    amountPaise: paid.amountPaise,
    paymentId: paid.paymentId,
  });
  deps.send(msg.paymentReceived(n, orderSummary(coffee, pending.addOns, extra)));
  return "placed";
}

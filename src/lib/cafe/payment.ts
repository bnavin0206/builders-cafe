import type { AttendeeRecord, Event } from "@/types";
import { findItem, orderSummary, placeOrder, type CafeDeps } from "./flow";
import { msg } from "./messages";
import { Stages } from "@/types";

export interface PaymentIo {
  getRecord(phone: string): Promise<AttendeeRecord>;
  getEvent(slug: string): Promise<Event | null | undefined>;
  /** Dependencies bound to the attendee's WhatsApp sender. */
  makeDeps(event: Event, sender: string, from: string): CafeDeps;
  /** Creates the GST invoice and returns its link (when invoices are set up). */
  issueInvoice?(args: {
    eventName: string;
    orderNumber: number;
    paymentId: string;
    amountPaise: number;
    items: Array<{ title: string; price?: number }>;
    customer: { name?: string; phone?: string; email?: string };
  }): Promise<{ number: string; link?: string }>;
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

  const coffee = pending.coffee ? findItem(event, pending.coffee, "free") : undefined;
  const titles = pending.items ?? (pending.extra ? [pending.extra] : []);
  const items = titles.map((t) => findItem(event, t, "paid"));
  if (
    (pending.coffee && !coffee) ||
    items.some((i) => !i) ||
    (!coffee && items.length === 0)
  ) {
    console.error("Pending order item is no longer on the menu", pending);
    deps.send(msg.paymentOrphan(paid.paymentId));
    return "orphan";
  }
  const paidItems = items as NonNullable<(typeof items)[number]>[];

  const n = await placeOrder({ event, phone: paid.phone, record }, deps, {
    coffee,
    addOns: pending.addOns,
    items: paidItems,
    amountPaise: paid.amountPaise,
    paymentId: paid.paymentId,
  });
  deps.send(msg.paymentReceived(n, orderSummary(coffee, pending.addOns, paidItems)));
  // The invoice must never get in the way of the order: if it fails, we log it and carry on.
  if (io.issueInvoice) {
    try {
      const inv = await io.issueInvoice({
        eventName: event.name,
        orderNumber: n,
        paymentId: paid.paymentId,
        amountPaise: paid.amountPaise,
        items: paidItems,
        customer: { name: record.fullName, phone: `+${paid.phone.replace(/\D/g, "")}`, email: record.email },
      });
      deps.send(msg.invoiceReady(inv.number, inv.link));
    } catch (e) {
      console.error("Invoice failed", paid.paymentId, (e as Error)?.message);
    }
  }
  return "placed";
}

export interface FailedPayload {
  phone: string;
  paymentId: string;
  /** Razorpay's reason, for example "Payment declined by the bank". */
  reason?: string;
}

export type FailedResult = "notified" | "no-pending" | "expired" | "duplicate" | "limit" | "no-event";

const MAX_FAIL_NOTICES = 3;
// Our own expiry is 2 minutes, but Razorpay keeps a link open for at least 16.
const LINK_GRACE_MS = 14 * 60_000;

/** A short, safe version of Razorpay's reason (no links, no odd characters). */
function cleanReason(reason: string | undefined): string {
  const r = (reason ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  return !r || /https?:|www\./i.test(r) ? "" : r.slice(0, 100);
}

/**
 * A payment attempt failed (declined card or UPI, and so on). Tell the customer
 * once per attempt, up to three times, and show the same link so they can try again.
 * The caller has already verified the webhook signature.
 */
export async function handlePaymentFailed(failed: FailedPayload, io: PaymentIo): Promise<FailedResult> {
  const record = await io.getRecord(failed.phone);
  const pending = record.pendingOrder;
  if (!pending || record.stage !== Stages.AWAITING_PAYMENT) return "no-pending";
  if (pending.lastFailedPaymentId === failed.paymentId) return "duplicate";

  const event = record.event ? await io.getEvent(record.event) : null;
  if (!event) return "no-event";
  const deps = io.makeDeps(event, `whatsapp:${failed.phone}`, (record.from as string | undefined) ?? "");

  if (deps.now().getTime() > new Date(pending.expiresAt).getTime() + LINK_GRACE_MS) return "expired";
  const notices = pending.failNotices ?? 0;
  if (notices >= MAX_FAIL_NOTICES) return "limit";

  await deps.save(failed.phone, {
    pendingOrder: { ...pending, failNotices: notices + 1, lastFailedPaymentId: failed.paymentId },
  });
  deps.send(msg.paymentFailed(cleanReason(failed.reason), pending.linkUrl));
  return "notified";
}

export type ExpiredResult = "notified" | "no-pending" | "no-event";

/** A payment link ran out unpaid: tell the customer how to start again. */
export async function handleLinkExpired(
  expired: { phone: string; linkId: string },
  io: PaymentIo,
): Promise<ExpiredResult> {
  const record = await io.getRecord(expired.phone);
  const pending = record.pendingOrder;
  if (!pending || pending.linkId !== expired.linkId || record.stage !== Stages.AWAITING_PAYMENT) return "no-pending";
  const event = record.event ? await io.getEvent(record.event) : null;
  if (!event) return "no-event";
  const deps = io.makeDeps(event, `whatsapp:${expired.phone}`, (record.from as string | undefined) ?? "");
  await deps.save(expired.phone, { stage: Stages.VERIFIED_USER, pendingOrder: undefined });
  deps.send(msg.payExpired);
  return "notified";
}

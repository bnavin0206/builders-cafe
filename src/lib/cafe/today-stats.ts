import { istDay } from "./free-limit";

export interface TodayStats {
  /** Orders placed today (Bengaluru day), not counting cancelled ones. */
  total: number;
  /** Waiting to be made. */
  queued: number;
  /** Made and waiting at the counter. */
  ready: number;
  delivered: number;
  cancelled: number;
  /** Orders that include the free coffee. */
  free: number;
  /** Orders with a payment (WhatsApp, or counter sales with an amount). */
  paid: number;
  /** Money from those orders, in rupees. */
  paidRupees: number;
}

/**
 * Today's numbers, worked out from the live order list so they change as orders
 * come in and move. "Today" is the Bengaluru calendar day, so yesterday's orders
 * that are still in the list do not count.
 */
export function todayStats(
  items: Array<{ dateCreated?: Date | string; dateUpdated?: Date | string; data: unknown }>,
  now: Date = new Date(),
): TodayStats {
  const today = istDay(now);
  const s: TodayStats = { total: 0, queued: 0, ready: 0, delivered: 0, cancelled: 0, free: 0, paid: 0, paidRupees: 0 };
  for (const i of items) {
    const d = (i.data ?? {}) as { status?: string; freeCoffee?: boolean; amountPaise?: number; paymentId?: string; createdAt?: string };
    // The browser's live list has no creation time, so new orders carry their own
    // (createdAt). Older ones use the time of their last change.
    const when = new Date(d.createdAt ?? i.dateCreated ?? i.dateUpdated ?? NaN);
    if (Number.isNaN(when.getTime()) || istDay(when) !== today) continue;
    if (d.status === "cancelled") {
      s.cancelled++;
      continue;
    }
    s.total++;
    if (d.status === "queued") s.queued++;
    else if (d.status === "ready") s.ready++;
    else if (d.status === "delivered") s.delivered++;
    if (d.freeCoffee === true) s.free++;
    if (Number(d.amountPaise) > 0 && d.paymentId) {
      s.paid++;
      s.paidRupees += Number(d.amountPaise) / 100;
    }
  }
  return s;
}

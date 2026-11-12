import { istDay } from "./free-limit";

/** One paid order as the daily report shows it. No phone, email or name. */
export interface ReportOrder {
  no: number;
  time: Date;
  items: string;
  amountPaise: number;
  paymentId: string;
  status: string;
  channel: string;
  payMode?: string;
  invoiceNo?: string;
}

export interface ReportSummary {
  count: number;
  totalPaise: number;
  cancelledCount: number;
  cancelledPaise: number;
}

const rupees = (paise: number) => (paise / 100).toFixed(2);
const inr = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

function csvCell(value: unknown): string {
  const str = value == null ? "" : String(value);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/** The orders of one Bengaluru day that were paid for (an amount above 0 and a payment id), oldest first. */
export function paidOrdersForDay(
  items: Array<{ index: number; dateCreated: Date; data: unknown }>,
  day: string,
): ReportOrder[] {
  const out: ReportOrder[] = [];
  for (const i of items) {
    const d = i.data as {
      item?: string;
      extras?: string;
      amountPaise?: number;
      paymentId?: string;
      status?: string;
      channel?: string;
      payMode?: string;
    } | null;
    if (!d || !(Number(d.amountPaise) > 0) || !d.paymentId) continue;
    if (istDay(new Date(i.dateCreated)) !== day) continue;
    out.push({
      no: i.index,
      time: new Date(i.dateCreated),
      items: [d.item, d.extras].filter(Boolean).join(" + "),
      amountPaise: Number(d.amountPaise),
      paymentId: d.paymentId,
      status: d.status ?? "",
      channel: d.channel ?? "",
      payMode: d.payMode,
    });
  }
  return out.sort((a, b) => a.time.getTime() - b.time.getTime());
}

export function summarize(orders: ReportOrder[]): ReportSummary {
  const live = orders.filter((o) => o.status !== "cancelled");
  const cancelled = orders.filter((o) => o.status === "cancelled");
  return {
    count: live.length,
    totalPaise: live.reduce((n, o) => n + o.amountPaise, 0),
    cancelledCount: cancelled.length,
    cancelledPaise: cancelled.reduce((n, o) => n + o.amountPaise, 0),
  };
}

const timeIST = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);

/** A CSV that opens in Excel (with a byte order mark so ₹ and accents show right). */
export function reportCsv(orders: ReportOrder[], day: string): string {
  const header = ["Date", "Time (IST)", "Order no", "Invoice no", "Items", "Amount (INR)", "Payment mode", "Payment ID", "Status"];
  const rows = orders.map((o) => [
    day,
    timeIST(o.time),
    o.no,
    o.invoiceNo ?? "",
    o.items,
    rupees(o.amountPaise),
    o.payMode ? ({ pos: "Counter: POS machine", upi: "Counter: UPI QR", cash: "Counter: Cash" } as Record<string, string>)[o.payMode] ?? o.payMode : o.channel === "whatsapp" ? "Razorpay (WhatsApp)" : "Razorpay",
    o.paymentId,
    o.status,
  ]);
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

const dayLabel = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};

export interface ReportEmail {
  subject: string;
  text: string;
  filename: string;
  csv: string;
}

/** The email for one day: a short summary in the body and the CSV attached. */
export function buildReportEmail(args: {
  eventName: string;
  day: string;
  orders: ReportOrder[];
  test: boolean;
}): ReportEmail {
  const { eventName, day, orders, test } = args;
  const s = summarize(orders);
  const subject = `${test ? "[TEST] " : ""}${eventName}: paid orders, ${dayLabel(day)} (${s.count} ${s.count === 1 ? "order" : "orders"}, ${inr(s.totalPaise)})`;
  const lines = [
    ...(test ? ["TEST DATA: Razorpay is in test mode, so these are not real payments. Do not book them.", ""] : []),
    `${eventName}: paid orders for ${dayLabel(day)} (Bengaluru time)`,
    "",
    `Paid orders: ${s.count}`,
    `Total received: ${inr(s.totalPaise)}`,
    ...(s.cancelledCount > 0
      ? [`Cancelled after payment: ${s.cancelledCount} (${inr(s.cancelledPaise)}), shown in the CSV with status "cancelled". Check whether they were refunded.`]
      : []),
    "",
    "The attached CSV lists every paid order with its time, GST invoice number, items, amount and payment ID.",
    "It has no customer names, phone numbers or emails.",
    "",
    "Counter sales are included, with the way they were paid (POS machine, UPI QR or cash) in the Payment mode column.",
  ];
  return {
    subject,
    text: lines.join("\n"),
    filename: `paid-orders-${day}.csv`,
    csv: reportCsv(orders, day),
  };
}

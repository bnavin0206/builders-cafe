import { createHmac, timingSafeEqual } from "node:crypto";
import { SELLER } from "@/config/seller";

export type PayMode = "razorpay" | "pos" | "upi" | "cash";
export const PAY_MODE_LABEL: Record<PayMode, string> = {
  razorpay: "Razorpay (WhatsApp)",
  pos: "POS machine",
  upi: "UPI QR",
  cash: "Cash",
};

export interface InvoiceLine {
  name: string;
  qty: number;
  /** What the customer paid for this line, GST included (paise). */
  grossPaise: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
}

export interface Invoice {
  number: string;
  seq: number;
  issuedAt: string; // ISO
  eventName: string;
  orderNumber: number;
  paymentId: string;
  customer: { name?: string; phone?: string; email?: string };
  /** True for a test sale (number starts TEST/). */
  test?: boolean;
  /** How it was paid. Unset means online through Razorpay. */
  payMode?: PayMode;
  lines: InvoiceLine[];
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  totalPaise: number;
}

/** True unless Razorpay is on live keys. Test sales get their own TEST/MMC/ series. */
export const isTestMode = (env: Record<string, string | undefined> = process.env) =>
  !/^rzp_live_/.test(env.RAZORPAY_KEY_ID ?? "");

export const formatInvoiceNumber = (seq: number, test = false) =>
  (test ? SELLER.testNumberPrefix : SELLER.numberPrefix) + String(seq).padStart(SELLER.numberDigits, "0");

/** Splits a GST-inclusive amount into taxable value and CGST + SGST (same state). */
export function splitInclusive(grossPaise: number, percent = SELLER.gstPercent) {
  const taxablePaise = Math.round((grossPaise * 100) / (100 + percent));
  const tax = grossPaise - taxablePaise;
  const cgstPaise = Math.round(tax / 2);
  return { taxablePaise, cgstPaise, sgstPaise: tax - cgstPaise };
}

/**
 * Builds the invoice for a paid order. `items` are the paid menu items (one per
 * unit, price in rupees, GST included). If they do not add up to what was paid,
 * one line for the whole amount is used instead, so the invoice always matches
 * the money received.
 */
export function buildInvoice(input: {
  seq: number;
  issuedAt: Date;
  eventName: string;
  orderNumber: number;
  paymentId: string;
  amountPaise: number;
  items: Array<{ title: string; price?: number }>;
  customer: Invoice["customer"];
  payMode?: PayMode;
  test?: boolean;
}): Invoice {
  const grouped = new Map<string, { qty: number; unit: number }>();
  for (const i of input.items) {
    const unit = Math.round((i.price ?? 0) * 100);
    if (unit <= 0) continue;
    const g = grouped.get(i.title) ?? { qty: 0, unit };
    g.qty += 1;
    grouped.set(i.title, g);
  }
  let lines: InvoiceLine[] = [...grouped].map(([name, g]) => ({
    name,
    qty: g.qty,
    grossPaise: g.qty * g.unit,
    ...splitInclusive(g.qty * g.unit),
  }));
  if (lines.reduce((s, l) => s + l.grossPaise, 0) !== input.amountPaise) {
    lines = [
      {
        name: `Order #${input.orderNumber}`,
        qty: 1,
        grossPaise: input.amountPaise,
        ...splitInclusive(input.amountPaise),
      },
    ];
  }
  const sum = (k: "taxablePaise" | "cgstPaise" | "sgstPaise") => lines.reduce((s, l) => s + l[k], 0);
  return {
    number: formatInvoiceNumber(input.seq, input.test),
    ...(input.test ? { test: true } : {}),
    seq: input.seq,
    issuedAt: input.issuedAt.toISOString(),
    eventName: input.eventName,
    orderNumber: input.orderNumber,
    paymentId: input.paymentId,
    customer: input.customer,
    ...(input.payMode ? { payMode: input.payMode } : {}),
    lines,
    taxablePaise: sum("taxablePaise"),
    cgstPaise: sum("cgstPaise"),
    sgstPaise: sum("sgstPaise"),
    totalPaise: input.amountPaise,
  };
}

const rupees = (paise: number) => (paise / 100).toFixed(2);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function words(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
  if (n < 1000) return ONES[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + words(n % 100) : "");
  if (n < 100000) return words(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + words(n % 1000) : "");
  return words(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + words(n % 100000) : "");
}
export function amountInWords(paise: number): string {
  const r = Math.floor(paise / 100);
  const p = paise % 100;
  return `Rupees ${r === 0 ? "Zero" : words(r)}${p ? ` and ${words(p)} Paise` : ""} only`;
}

export function istDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(iso)) + " IST";
}

/** The invoice as a printable page. The customer can print it or save it as a PDF. */
export function invoiceHtml(inv: Invoice): string {
  const c = inv.customer;
  const rows = inv.lines
    .map(
      (l, i) =>
        `<tr><td>${i + 1}</td><td>${esc(l.name)}</td><td>${SELLER.sac}</td><td class=n>${l.qty}</td><td class=n>${rupees(l.taxablePaise)}</td><td class=n>${rupees(l.cgstPaise)}</td><td class=n>${rupees(l.sgstPaise)}</td><td class=n>${rupees(l.grossPaise)}</td></tr>`,
    )
    .join("");
  const half = SELLER.gstPercent / 2;
  return `<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><meta name=robots content=noindex><title>Invoice ${esc(inv.number)}</title><style>
body{font:13px/1.45 Arial,sans-serif;color:#111;margin:0;padding:24px;max-width:760px}
h1{font-size:20px;margin:0}.r{text-align:right}.mut{color:#555}
.top,.box{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap}.box{margin-top:16px}
table{width:100%;border-collapse:collapse;margin-top:14px}th,td{padding:7px 8px;border-bottom:1px solid #ddd;text-align:left}
th{background:#f3f3f3;font-size:12px}td.n,th.n{text-align:right}
.tot{width:300px;margin-left:auto}.tot td{border:0;padding:3px 8px}.big td{font-weight:700;font-size:15px;border-top:2px solid #111}
.scroll{overflow-x:auto}@media print{button{display:none}}
</style></head><body>
${inv.test ? '<div style="background:#fde8e8;color:#a00;padding:8px;text-align:center;font-weight:700;margin-bottom:10px">TEST INVOICE: not a real sale, do not use for accounts</div>' : ""}<div class=top><div><h1>TAX INVOICE</h1><div class=mut>Original for recipient</div></div>
<div class=r><b>Invoice No:</b> ${esc(inv.number)}<br><b>Date:</b> ${istDateTime(inv.issuedAt)}</div></div>
<div class=box><div><b>${esc(SELLER.name)}</b><br>${SELLER.address.map(esc).join("<br>")}<br><b>GSTIN:</b> ${SELLER.gstin}</div>
<div><b>Billed to</b><br>${esc(c.name || "Customer")}${c.phone ? `<br>${esc(c.phone)}` : ""}${c.email ? `<br>${esc(c.email)}` : ""}<br>Place of supply: ${SELLER.stateName} (${SELLER.stateCode})</div></div>
<div class=mut style="margin-top:10px">${esc(inv.eventName)}${inv.orderNumber > 0 ? `, order #${inv.orderNumber}` : ""} &nbsp;|&nbsp; ${inv.payMode && inv.payMode !== "razorpay" ? `Paid at the counter: ${PAY_MODE_LABEL[inv.payMode]}` : `Paid online, Razorpay ID ${esc(inv.paymentId)}`}</div>
<div class=scroll><table><tr><th>#</th><th>Item</th><th>SAC</th><th class=n>Qty</th><th class=n>Taxable (₹)</th><th class=n>CGST ${half}%</th><th class=n>SGST ${half}%</th><th class=n>Total (₹)</th></tr>${rows}</table></div>
<table class=tot><tr><td>Taxable value</td><td class=n>${rupees(inv.taxablePaise)}</td></tr><tr><td>CGST @ ${half}%</td><td class=n>${rupees(inv.cgstPaise)}</td></tr><tr><td>SGST @ ${half}%</td><td class=n>${rupees(inv.sgstPaise)}</td></tr><tr class=big><td>Total paid</td><td class=n>₹${rupees(inv.totalPaise)}</td></tr></table>
<div class=mut style="margin-top:14px">Amount in words: ${amountInWords(inv.totalPaise)}. Prices include GST. This is a computer-generated invoice and needs no signature.</div>
<p><button onclick="print()">Print or save as PDF</button></p></body></html>`;
}

// The link sent to the customer: the Razorpay payment ID plus a signature,
// so it cannot be guessed and only works for that payment.
const secret = () => process.env.INVOICE_LINK_SECRET || process.env.RAZORPAY_WEBHOOK_SECRET || "";
const sign = (paymentId: string) => createHmac("sha256", secret()).update("invoice:" + paymentId).digest("hex").slice(0, 24);

export function invoiceToken(paymentId: string): string | undefined {
  return secret() ? `${paymentId}.${sign(paymentId)}` : undefined;
}

export function paymentIdFromToken(token: string): string | undefined {
  const i = token.lastIndexOf(".");
  if (i < 1 || !secret()) return undefined;
  const id = token.slice(0, i);
  const a = Buffer.from(token.slice(i + 1));
  const b = Buffer.from(sign(id));
  return a.length === b.length && timingSafeEqual(a, b) ? id : undefined;
}

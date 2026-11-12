import { headers } from "next/headers";
import { Privilege, getAuthenticatedRole } from "@/proxy";
import { addOrder, getEvent } from "@/app/webhooks/mixologist-helper";
import { COUNTER_MODES, counterMenu, invoiceChatLink, resolveCart, type CounterMode } from "@/lib/cafe/counter";
import { getInvoiceByPayment, issueInvoice } from "@/lib/cafe/invoice-store";
import { invoiceToken } from "@/lib/cafe/invoice";
import { summarizeItems } from "@/lib/cafe/pricing";
import type { Order } from "@/types";

async function allowed() {
  const role = getAuthenticatedRole((await headers()).get("Authorization") || "");
  return role === Privilege.ADMIN || role === Privilege.MIXOLOGIST;
}

/** The items the barista can sell. GET /api/counter?event=<slug> */
export async function GET(request: Request) {
  if (!(await allowed())) return new Response("Unauthorized", { status: 401 });
  const event = await getEvent(new URL(request.url).searchParams.get("event") ?? "");
  if (!event) return new Response("No such event", { status: 404 });
  return Response.json({
    items: counterMenu(event).map((i) => ({ title: i.title, price: i.price, veg: i.veg !== false })),
  });
}

/**
 * Records a counter sale that has already been paid (POS machine, UPI QR or cash):
 * puts the order in the queue and creates the GST invoice. Sending the same
 * `saleId` again returns the same sale, so a double tap never charges twice.
 * Body: { event, saleId, mode: "pos" | "upi" | "cash", lines: [{ title, qty }] }
 */
export async function POST(request: Request) {
  if (!(await allowed())) return new Response("Unauthorized", { status: 401 });
  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const mode = body?.mode as CounterMode;
  const saleId = String(body?.saleId ?? "");
  if (!COUNTER_MODES.includes(mode)) return new Response("Choose how it was paid", { status: 400 });
  if (!/^[A-Za-z0-9-]{8,64}$/.test(saleId)) return new Response("Missing sale id", { status: 400 });

  const event = await getEvent(String(body?.event ?? ""));
  if (!event) return new Response("No such event", { status: 404 });
  const cart = resolveCart(event, Array.isArray(body?.lines) ? body.lines : []);
  if ("error" in cart) return new Response(cart.error, { status: 400 });

  const paymentId = `ctr_${saleId}`;
  let inv = await getInvoiceByPayment(paymentId);
  if (!inv) {
    const order: Order = {
      key: "counter",
      item: summarizeItems(cart.items.map((i) => i.title)),
      status: "queued",
      channel: "other",
      amountPaise: cart.amountPaise,
      paymentId,
      payMode: mode,
    };
    const orderNumber = await addOrder(event.slug, order);
    inv = await issueInvoice({
      eventName: event.name,
      orderNumber,
      paymentId,
      amountPaise: cart.amountPaise,
      items: cart.items,
      customer: {},
      payMode: mode,
    });
  }

  const token = invoiceToken(paymentId);
  const base = (process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  return Response.json({
    orderNumber: inv.orderNumber,
    invoiceNumber: inv.number,
    totalPaise: inv.totalPaise,
    invoiceUrl: token && base ? `${base}/invoice/${encodeURIComponent(token)}` : null,
    whatsappLink: token ? invoiceChatLink(event.senders, token) : null,
  });
}

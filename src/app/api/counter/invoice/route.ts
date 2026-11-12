import { headers } from "next/headers";
import { Privilege, getAuthenticatedRole } from "@/proxy";
import { getEvent } from "@/app/webhooks/mixologist-helper";
import { twilioClient } from "@/lib/twilio/client";
import { attachPhone, getInvoiceByPayment, markSent } from "@/lib/cafe/invoice-store";
import { invoiceToken } from "@/lib/cafe/invoice";
import { normalizePhone } from "@/lib/cafe/phone";
import { sendInvoiceMessage } from "@/lib/cafe/invoice-send";

async function allowed() {
  const role = getAuthenticatedRole((await headers()).get("Authorization") || "");
  return role === Privilege.ADMIN || role === Privilege.MIXOLOGIST;
}

const MAX_SENDS = 3;

/**
 * Sends a counter-sale invoice to a typed WhatsApp number.
 * Body: { event, paymentId, phone, consent: true }
 */
export async function POST(request: Request) {
  if (!(await allowed())) return new Response("Unauthorized", { status: 401 });
  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (body?.consent !== true) return new Response("Tick that the customer agrees first", { status: 400 });
  const phone = normalizePhone(String(body?.phone ?? ""));
  if (!phone) return new Response("That does not look like a mobile number", { status: 400 });

  const event = await getEvent(String(body?.event ?? ""));
  const from = (event?.senders ?? []).find((s) => s.startsWith("whatsapp:"));
  if (!event || !from) return new Response("No WhatsApp number is set for this event", { status: 400 });

  const paymentId = String(body?.paymentId ?? "");
  const inv = await getInvoiceByPayment(paymentId);
  if (!inv) return new Response("Invoice not found", { status: 404 });
  if ((inv.sends ?? 0) >= MAX_SENDS) return new Response("Already sent three times", { status: 429 });

  const token = invoiceToken(paymentId);
  const base = (process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  if (!token || !base) return new Response("Invoice links are not set up", { status: 500 });

  const result = await sendInvoiceMessage(
    {
      sendText: async ({ to, from, body }) => ({ sid: (await twilioClient.messages.create({ to, from, body })).sid }),
      sendTemplate: async ({ to, from, contentSid, variables }) => ({
        sid: (await twilioClient.messages.create({ to, from, contentSid, contentVariables: JSON.stringify(variables) } as any)).sid,
      }),
    },
    {
      to: phone,
      from,
      number: inv.number,
      totalPaise: inv.totalPaise,
      link: `${base}/invoice/${encodeURIComponent(token)}`,
      templateSid: process.env.INVOICE_TEMPLATE_SID || undefined,
    },
  );
  if (!result.ok) {
    return Response.json(
      { ok: false, reason: result.reason },
      { status: result.reason === "no-template" ? 409 : 502 },
    );
  }
  await attachPhone(paymentId, phone).catch(() => {});
  await markSent(paymentId).catch(() => {});
  return Response.json({ ok: true, via: result.via, sid: result.sid });
}

/** Delivery status of a message just sent: GET /api/counter/invoice?sid=SM... */
export async function GET(request: Request) {
  if (!(await allowed())) return new Response("Unauthorized", { status: 401 });
  const sid = new URL(request.url).searchParams.get("sid") ?? "";
  if (!/^SM[0-9a-f]{32}$/i.test(sid)) return new Response("Bad id", { status: 400 });
  const m = await twilioClient.messages(sid).fetch();
  return Response.json({ status: m.status, errorCode: m.errorCode ?? null });
}

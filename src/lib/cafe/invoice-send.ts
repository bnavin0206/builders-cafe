import { msg } from "./messages";

export interface InvoiceSender {
  /** Sends a plain message. Rejects with a Twilio error (code 63016 when outside the 24-hour window). */
  sendText(args: { to: string; from: string; body: string }): Promise<{ sid: string }>;
  /** Sends the approved template. */
  sendTemplate(args: { to: string; from: string; contentSid: string; variables: Record<string, string> }): Promise<{ sid: string }>;
}

export type InvoiceSendResult =
  | { ok: true; via: "message" | "template"; sid: string }
  | { ok: false; reason: "no-template" | "failed" };

/** Codes Twilio returns when a plain message is not allowed (needs a template). */
const NEEDS_TEMPLATE = new Set([63016, 63018, 63049]);

/**
 * Sends an invoice link to a WhatsApp number. A plain message goes first, which
 * works when the customer wrote to us in the last 24 hours. Otherwise Twilio
 * refuses it and the approved template is used instead.
 */
export async function sendInvoiceMessage(
  sender: InvoiceSender,
  args: { to: string; from: string; number: string; totalPaise: number; link: string; templateSid?: string },
): Promise<InvoiceSendResult> {
  const to = `whatsapp:${args.to}`;
  try {
    const r = await sender.sendText({ to, from: args.from, body: msg.invoiceReady(args.number, args.link) });
    return { ok: true, via: "message", sid: r.sid };
  } catch (e: any) {
    if (!NEEDS_TEMPLATE.has(Number(e?.code))) {
      console.error("Invoice message failed", e?.code, e?.message);
      return { ok: false, reason: "failed" };
    }
  }
  if (!args.templateSid) return { ok: false, reason: "no-template" };
  try {
    const r = await sender.sendTemplate({
      to,
      from: args.from,
      contentSid: args.templateSid,
      variables: { "1": args.number, "2": (args.totalPaise / 100).toFixed(2), "3": args.link },
    });
    return { ok: true, via: "template", sid: r.sid };
  } catch (e: any) {
    console.error("Invoice template failed", e?.code, e?.message);
    return { ok: false, reason: "failed" };
  }
}

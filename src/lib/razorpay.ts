import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/config/env";

const API = "https://api.razorpay.com/v1";

// Razorpay rejects payment links that expire too soon. We keep our own, shorter
// expiry in the attendee record and cancel the link when it passes.
const MIN_LINK_LIFETIME_SECONDS = 16 * 60;

function authHeader() {
  const token = Buffer.from(
    `${env.razorpayKeyId}:${env.razorpayKeySecret}`,
  ).toString("base64");
  return `Basic ${token}`;
}

async function call(path: string, body?: unknown) {
  if (!env.razorpayKeyId || !env.razorpayKeySecret) {
    throw new Error("Razorpay keys are not set");
  }
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `Razorpay ${path} failed: ${res.status} ${json?.error?.description ?? ""}`.trim(),
    );
  }
  return json;
}

export interface CreateLinkArgs {
  amountPaise: number;
  referenceId: string;
  phone: string;
  name?: string;
  email?: string;
  description: string;
  expiresAt: Date;
}

export async function createPaymentLink(args: CreateLinkArgs) {
  const minExpiry = Date.now() / 1000 + MIN_LINK_LIFETIME_SECONDS;
  const expireBy = Math.ceil(Math.max(args.expiresAt.getTime() / 1000, minExpiry));
  const json = await call("/payment_links", {
    amount: args.amountPaise,
    currency: "INR",
    accept_partial: false,
    reference_id: args.referenceId,
    description: args.description,
    customer: {
      ...(args.name ? { name: args.name } : {}),
      contact: args.phone,
      ...(args.email ? { email: args.email } : {}),
    },
    // We send the link ourselves in WhatsApp.
    notify: { sms: false, email: false },
    reminder_enable: false,
    expire_by: expireBy,
    notes: { phone: args.phone },
  });
  return { id: json.id as string, url: json.short_url as string };
}

export async function cancelPaymentLink(linkId: string) {
  await call(`/payment_links/${encodeURIComponent(linkId)}/cancel`);
}

/** Checks the X-Razorpay-Signature header against the raw request body. */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret: string = env.razorpayWebhookSecret,
): boolean {
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

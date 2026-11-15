import { makeRazorpayIo } from "@/lib/cafe/io";
import { confirmPayment, handleLinkExpired, handlePaymentFailed } from "@/lib/cafe/payment";
import { normalizePhone } from "@/lib/cafe/phone";
import { verifyWebhookSignature } from "@/lib/razorpay";

/**
 * Razorpay webhook. Configure in the Razorpay dashboard for the events
 * "payment_link.paid" (places the order), "payment.failed" and
 * "payment_link.expired" (tell the customer), with the secret in RAZORPAY_WEBHOOK_SECRET.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyWebhookSignature(raw, request.headers.get("x-razorpay-signature"))) {
    return new Response("Invalid signature", { status: 400 });
  }

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // The customer notices below are best effort: a failure is logged but never
  // makes Razorpay retry, so nobody gets the same message twice.
  if (body?.event === "payment.failed") {
    const payment = body.payload?.payment?.entity;
    const phone = normalizePhone(String(payment?.notes?.phone ?? payment?.contact ?? ""));
    if (payment?.id && phone) {
      try {
        await handlePaymentFailed({ phone, paymentId: payment.id, reason: payment.error_description }, makeRazorpayIo());
      } catch (e) {
        console.error("Could not tell the customer about a failed payment", (e as Error)?.message);
      }
    }
    return new Response(null, { status: 200 });
  }
  if (body?.event === "payment_link.expired") {
    const link = body.payload?.payment_link?.entity;
    if (link?.id && link?.notes?.phone) {
      try {
        await handleLinkExpired({ phone: link.notes.phone, linkId: link.id }, makeRazorpayIo());
      } catch (e) {
        console.error("Could not tell the customer their link expired", (e as Error)?.message);
      }
    }
    return new Response(null, { status: 200 });
  }

  if (body?.event !== "payment_link.paid") {
    return new Response(null, { status: 200 }); // not an event we act on
  }

  const link = body.payload?.payment_link?.entity;
  const payment = body.payload?.payment?.entity;
  const phone = link?.notes?.phone;
  if (!link?.id || !payment?.id || !phone) {
    console.error("Razorpay webhook missing fields", body?.event);
    return new Response(null, { status: 200 });
  }

  try {
    await confirmPayment(
      {
        phone,
        linkId: link.id,
        paymentId: payment.id,
        amountPaise: Number(link.amount_paid ?? payment.amount),
      },
      makeRazorpayIo(),
    );
  } catch (e) {
    console.error(e);
    return new Response("Error", { status: 500 }); // Razorpay will retry
  }
  return new Response(null, { status: 200 });
}

import { makeRazorpayIo } from "@/lib/cafe/io";
import { confirmPayment } from "@/lib/cafe/payment";
import { verifyWebhookSignature } from "@/lib/razorpay";

/**
 * Razorpay webhook. Configure in the Razorpay dashboard for the
 * "payment_link.paid" event, with the secret in RAZORPAY_WEBHOOK_SECRET.
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

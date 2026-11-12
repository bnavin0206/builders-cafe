import { getInvoiceByPayment } from "@/lib/cafe/invoice-store";
import { invoiceHtml, paymentIdFromToken } from "@/lib/cafe/invoice";

/** The customer's invoice page. The link is signed, so only the person we sent it to can open it. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const paymentId = paymentIdFromToken(decodeURIComponent((await params).token));
  const inv = paymentId ? await getInvoiceByPayment(paymentId) : undefined;
  if (!inv) return new Response("Invoice not found", { status: 404 });
  return new Response(invoiceHtml(inv), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" },
  });
}

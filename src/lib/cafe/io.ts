import { getEvent } from "@/app/webhooks/mixologist-helper";
import { loadRecord, realDeps } from "./deps";
import type { PaymentIo } from "./payment";
import { issueInvoice } from "./invoice-store";
import { invoiceToken } from "./invoice";

export function makeRazorpayIo(): PaymentIo {
  return {
    getRecord: loadRecord,
    getEvent: (slug) => getEvent(slug),
    makeDeps: realDeps,
    issueInvoice: async (args) => {
      const inv = await issueInvoice(args);
      const base = (process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
      const token = invoiceToken(inv.paymentId);
      return { number: inv.number, link: base && token ? `${base}/invoice/${encodeURIComponent(token)}` : undefined };
    },
  };
}

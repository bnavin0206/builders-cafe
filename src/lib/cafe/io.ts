import { getEvent } from "@/app/webhooks/mixologist-helper";
import { loadRecord, realDeps } from "./deps";
import type { PaymentIo } from "./payment";

export function makeRazorpayIo(): PaymentIo {
  return {
    getRecord: loadRecord,
    getEvent: (slug) => getEvent(slug),
    makeDeps: realDeps,
  };
}

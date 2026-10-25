import type { Event } from "@/types";
import { begin } from "./flow";
import { loadRecord, realDeps } from "./deps";

/** Start the cafe flow (quiz or menu) for an attendee who has finished sign-up. */
export async function startCafe(sender: string, event: Event, from: string) {
  const phone = sender.replace(/^(whatsapp:|rcs:|sms:)/, "");
  const record = await loadRecord(phone);
  await begin(
    { message: "", event, phone, record, unlimited: isUnlimited(phone) },
    realDeps(event, sender, from),
  );
}

export function isUnlimited(phone: string): boolean {
  return (process.env.UNLIMITED_ORDERS || "").split(",").includes(phone);
}

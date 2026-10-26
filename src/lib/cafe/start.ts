import type { Event } from "@/types";
import { enter } from "./flow";
import { loadRecord, realDeps } from "./deps";

/** Start the cafe flow (quiz or menu) for an attendee who has finished sign-up. */
export async function startCafe(sender: string, event: Event, from: string) {
  const phone = sender.replace(/^(whatsapp:|rcs:|sms:)/, "");
  const record = await loadRecord(phone);
  await enter(
    { message: "", event, phone, record },
    realDeps(event, sender, from),
  );
}


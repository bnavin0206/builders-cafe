import {
  addOrder as addOrderToQueue,
} from "@/app/webhooks/mixologist-helper";
import {
  createSyncMapItemIfNotExists,
  sendMessage,
  updateOrCreateSyncMapItem,
} from "@/lib/twilio";
import { cancelPaymentLink, createPaymentLink } from "@/lib/razorpay";
import { redact, EventLengthInSeconds } from "@/lib/utils";
import type { AttendeeRecord, Event } from "@/types";
import type { CafeDeps } from "./flow";

const ATTENDEES_MAP = process.env.NEXT_PUBLIC_ATTENDEES_MAP || "";

/** Sync merges objects and drops undefined, so a cleared value is sent as null. */
function nullify(patch: Partial<AttendeeRecord>) {
  return Object.fromEntries(
    Object.entries(patch).map(([k, v]) => [k, v === undefined ? null : v]),
  );
}

/** The flow's dependencies wired to Twilio Sync, Twilio messaging and Razorpay. */
export function realDeps(event: Event, sender: string, from: string): CafeDeps {
  return {
    now: () => new Date(),
    rng: Math.random,
    save: async (phone, patch) => {
      await updateOrCreateSyncMapItem(
        ATTENDEES_MAP,
        phone,
        nullify(patch),
        EventLengthInSeconds,
      );
    },
    send: (text) => {
      sendMessage(sender, text, undefined, undefined, from);
    },
    addOrder: async (order) =>
      addOrderToQueue(event.slug, { ...order, address: await redact(sender) }),
    createPaymentLink,
    cancelPaymentLink: async (id) => {
      try {
        await cancelPaymentLink(id);
      } catch (e) {
        console.error("Could not cancel payment link", id, e);
      }
    },
  };
}

export async function loadRecord(phone: string): Promise<AttendeeRecord> {
  const { data } = await createSyncMapItemIfNotExists(ATTENDEES_MAP, phone);
  return data as AttendeeRecord;
}

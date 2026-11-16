import {
  addOrder as addOrderToQueue,
} from "@/app/webhooks/mixologist-helper";
import {
  createSyncMapItemIfNotExists,
  getSyncService,
  sendMessage,
  updateOrCreateSyncMapItem,
} from "@/lib/twilio";
import { cancelPaymentLink, createPaymentLink } from "@/lib/razorpay";
import { fetchSyncListItems } from "@/lib/twilio";
import { countFreeCoffees } from "./free-limit";
import { buildLead, sendLead } from "./leads-sink";
import { makeOrderedQueue } from "./ordered-send";
import { makeRecordSaver, type SavedItem } from "./record-saver";
import { getCafeListMessage } from "@/scripts/fetchContentTemplates";
import { redact, EventLengthInSeconds } from "@/lib/utils";
import type { AttendeeRecord, Event } from "@/types";
import type { CafeDeps } from "./flow";

const ATTENDEES_MAP = process.env.NEXT_PUBLIC_ATTENDEES_MAP || "";
const FREE_COUNT_CACHE_MS = 20_000;
const freeCountCache = new Map<string, { at: number; n: number }>();

/** Sync merges objects and drops undefined, so a cleared value is sent as null. */
function nullify(patch: Partial<AttendeeRecord>) {
  return Object.fromEntries(
    Object.entries(patch).map(([k, v]) => [k, v === undefined ? null : v]),
  );
}

/** The flow's dependencies wired to Twilio Sync, Twilio messaging and Razorpay. */
export function realDeps(
  event: Event,
  sender: string,
  from: string,
  /** The attendee record as already read for this message, so saves can be a single call. */
  initial?: SavedItem,
): CafeDeps {
  // Everything this customer is sent during one request goes out in the order it
  // was written, so a short message never arrives after the question that follows it.
  const inOrder = makeOrderedQueue();
  const saveRecord = makeRecordSaver(
    {
      writeIfUnchanged: async (phone, data, ifMatch) => {
        const service = await getSyncService();
        // @ts-ignore ifMatch is supported by the API but missing from the typings
        const item = await service.syncMaps()(ATTENDEES_MAP).syncMapItems(phone).update({ data, ttl: EventLengthInSeconds, ifMatch });
        return { data: item.data as Record<string, unknown>, revision: String(item.revision) };
      },
      readMergeWrite: async (phone, patch) => {
        const item = await updateOrCreateSyncMapItem(ATTENDEES_MAP, phone, patch, EventLengthInSeconds);
        return { data: item.data as Record<string, unknown>, revision: String(item.revision) };
      },
    },
    initial,
  );
  return {
    now: () => new Date(),
    rng: Math.random,
    save: async (phone, patch) => {
      await saveRecord(phone, nullify(patch));
    },
    send: (text) => {
      void inOrder(() => sendMessage(sender, text, undefined, undefined, from));
    },
    sendList: async (prompt, rows) => {
      try {
        const m = await getCafeListMessage(prompt, rows);
        void inOrder(() => sendMessage(sender, "", m.contentSid, m.contentVariables, from));
        return true;
      } catch (e) {
        // Most likely the list templates are not created yet: use text.
        console.error("List picker unavailable, sending the text menu", e);
        return false;
      }
    },
    freeCoffeesToday: async () => {
      // Counting means reading every order of the day; once every 20 seconds is plenty.
      const hit = freeCountCache.get(event.slug);
      if (hit && Date.now() - hit.at < FREE_COUNT_CACHE_MS) return hit.n;
      const n = countFreeCoffees(await fetchSyncListItems(event.slug), new Date());
      freeCountCache.set(event.slug, { at: Date.now(), n });
      return n;
    },
    updateLead: async (record) => {
      // Do not make the customer wait for the leads endpoint: send in the background.
      void sendLead(buildLead(record, event)).catch((e) => console.error("Could not send the lead", e));
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

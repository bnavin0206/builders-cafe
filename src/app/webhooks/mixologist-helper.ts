import type { Event, Order } from "@/types";

import { nextInSequence } from "@/lib/cafe/sequence";
import {
  getSyncService,
  fetchSyncListItem,
  findSyncMapItems,
  pushToSyncList,
  updateSyncListItem,
  updateSyncMapItem,
} from "@/lib/twilio";
import { EventState } from "@/lib/utils";

const NEXT_PUBLIC_EVENTS_MAP = process.env.NEXT_PUBLIC_EVENTS_MAP || "";

export function verifyOrder(item: string, event: Event, modifiers?: string[]) {
  if (item === "") {
    return false;
  }

  if (!event.selection.items.find((i) => i.title === item)) {
    return false;
  }

  if (modifiers && modifiers.length > 0) {
    for (const modifier of modifiers) {
      if (!event.selection.modifiers.includes(modifier)) {
        return false;
      }
    }
  }

  return true;
}

export async function updateOrder(event: string, index: number, data: Order) {
  const item = await updateSyncListItem(event, index, data);
  return item;
}

export async function cancelOrder(event: Event, index: number, data: Order) {
  updateOrder(event.slug, index, { ...data, status: "cancelled" });

  await updateSyncMapItem(NEXT_PUBLIC_EVENTS_MAP, event.slug, {
    cancelledCount: Number(event.cancelledCount) + 1,
  });
}

/**
 * Where the numbers continue from when the counter is first created: just past
 * the highest list position in use (older orders were numbered by position), with
 * a small margin so an order placed by a server still on the old version cannot clash.
 */
async function highestOrderIndex(event: string): Promise<number> {
  const service = await getSyncService();
  const last = await service.syncLists()(event).syncListItems.list({ limit: 1, order: "desc" });
  return last.length > 0 ? last[0].index + 3 : 0;
}

/**
 * Adds an order and returns its number: 1, 2, 3, ... in the order they come in.
 * (The position in the Sync list is not used, because Twilio counts every
 * change to the list, so it jumps.) If the counter is unavailable, the list
 * position is used instead so the order is never lost.
 */
export async function addOrder(event: string, order: Order) {
  let orderNumber: number | undefined;
  try {
    orderNumber = await nextInSequence(`OrderCounter-${event}`, () => highestOrderIndex(event));
  } catch (e) {
    console.error("Order counter failed, using the list position", (e as Error)?.message);
  }
  const { index } = await pushToSyncList(event, orderNumber ? { ...order, orderNumber } : order);
  return orderNumber ?? index;
}

export async function fetchOrder(event: string, index: number) {
  try {
    const item = await fetchSyncListItem(event, index);
    return item;
  } catch (err: any) {
    if (err.status === 404) {
      return null;
    }
    return null;
  }
}

export async function getEvent(event: string) {
  const syncItems = await findSyncMapItems(NEXT_PUBLIC_EVENTS_MAP, {
    slug: event,
  });

  // @ts-ignore thinks is a object but actually it's an event
  const assignedEvent = syncItems[0]?.data as Event;
  if (
    assignedEvent?.state === EventState.OPEN ||
    assignedEvent?.state === EventState.CLOSED
  ) {
    // If assigned event is active
    return assignedEvent;
  } else {
    return null;
  }
}

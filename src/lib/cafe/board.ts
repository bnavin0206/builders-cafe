import { cafeRules } from "@/config/cafe-rules";

/** What the TV shows for one order. Nothing personal: no name, phone or payment. */
export interface BoardOrder {
  /** The order number the barista and the customer both see. */
  no: number;
  /** "Cappuccino + Cold Chocolate": the drink and its paid extras, no add-ons. */
  items: string;
  /** When the order last changed status (ISO time). */
  updatedAt: string;
}

export interface Board {
  /** Queued orders, oldest first. */
  preparing: BoardOrder[];
  /** Ready orders, the one that became ready last first. */
  ready: BoardOrder[];
  /** Delivered in the last few minutes, the latest first. */
  delivered: BoardOrder[];
  serverTime: string;
}

/** An item of the order list in Twilio Sync, as far as the board needs it. */
export interface RawOrder {
  index: number;
  data: unknown;
  dateUpdated: Date | string;
}

const MAX_DELIVERED = 20;
const MAX_ITEMS_LENGTH = 120;

function text(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/**
 * Turns the order list into the three groups the TV shows. Only the order
 * number, the items and the times are copied, so nothing else in an order can
 * reach a public screen. Cancelled orders and unknown statuses are left out.
 */
export function buildBoard(
  raw: RawOrder[],
  now: Date = new Date(),
  deliveredMinutes: number = cafeRules.boardDeliveredMinutes,
): Board {
  const preparing: BoardOrder[] = [];
  const ready: BoardOrder[] = [];
  const delivered: BoardOrder[] = [];
  const cutoff = now.getTime() - deliveredMinutes * 60_000;

  for (const order of raw) {
    const data = (order.data ?? {}) as Record<string, unknown>;
    const items = [text(data.item), text(data.extras)]
      .filter(Boolean)
      .join(" + ")
      .slice(0, MAX_ITEMS_LENGTH);
    if (!items || !Number.isFinite(order.index)) continue;

    const updated = new Date(order.dateUpdated);
    const valid = !Number.isNaN(updated.getTime());
    const entry: BoardOrder = {
      no: order.index,
      items,
      updatedAt: (valid ? updated : now).toISOString(),
    };

    switch (data.status) {
      case "queued":
        preparing.push(entry);
        break;
      case "ready":
        ready.push(entry);
        break;
      case "delivered":
        if (valid && updated.getTime() >= cutoff) delivered.push(entry);
        break;
    }
  }

  const newestFirst = (a: BoardOrder, b: BoardOrder) =>
    b.updatedAt.localeCompare(a.updatedAt) || b.no - a.no;
  return {
    preparing: preparing.sort((a, b) => a.no - b.no),
    ready: ready.sort(newestFirst),
    delivered: delivered.sort(newestFirst).slice(0, MAX_DELIVERED),
    serverTime: now.toISOString(),
  };
}

import type { Event, MenuItem } from "@/types";

export const COUNTER_MODES = ["pos", "upi", "cash"] as const;
export type CounterMode = (typeof COUNTER_MODES)[number];

/** Items that can be sold at the counter: paid and currently switched on. */
export function counterMenu(event: Event): MenuItem[] {
  return (event.selection?.items ?? []).filter((i) => Number(i.price ?? 0) > 0 && i.available !== false);
}

/** Turns the cart (title and quantity) into one entry per unit, from the real menu prices. */
export function resolveCart(
  event: Event,
  lines: Array<{ title: string; qty: number }>,
): { items: MenuItem[]; amountPaise: number } | { error: string } {
  const menu = counterMenu(event);
  const items: MenuItem[] = [];
  for (const l of lines) {
    const qty = Math.floor(Number(l.qty));
    if (!(qty >= 1) || qty > 20) return { error: `Bad quantity for ${l.title}` };
    const item = menu.find((m) => m.title === l.title);
    if (!item) return { error: `${l.title} is not on the menu right now` };
    for (let n = 0; n < qty; n++) items.push(item);
  }
  if (items.length === 0) return { error: "The cart is empty" };
  return { items, amountPaise: items.reduce((s, i) => s + Math.round(Number(i.price) * 100), 0) };
}

/** The WhatsApp link behind the invoice QR: it opens a chat with "INVOICE <token>" typed in. */
export function invoiceChatLink(senders: string[] | undefined, token: string): string | null {
  const wa = (senders ?? []).find((s) => s.startsWith("whatsapp:"));
  const digits = wa?.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent("INVOICE " + token)}` : null;
}

/** Pulls the token out of a message like "INVOICE pay_1.abc". */
export function parseInvoiceRequest(body: string): string | null {
  const m = /^\s*invoice\s+(\S+)\s*$/i.exec(body);
  return m ? m[1] : null;
}

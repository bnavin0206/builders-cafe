import type { MenuItem, MenuCategory } from "@/types";

export function priceOf(item: MenuItem): number {
  return item.price ?? 0;
}

export function isFree(item: MenuItem): boolean {
  return priceOf(item) === 0;
}

export function itemsIn(items: MenuItem[], category: MenuCategory): MenuItem[] {
  return items.filter((i) => (i.category ?? "coffee") === category);
}

export function formatPrice(item: MenuItem): string {
  return isFree(item) ? "FREE" : `₹${priceOf(item)}`;
}

/** Total in paise, the unit Razorpay expects. */
export function totalPaise(items: MenuItem[]): number {
  return items.reduce((sum, i) => sum + Math.round(priceOf(i) * 100), 0);
}

export function formatTotal(paise: number): string {
  return paise === 0 ? "FREE" : `₹${paise / 100}`;
}

/** Numbered text menu: "1. Latte (FREE)". Numbers start at 1. */
export function formatMenu(items: MenuItem[]): string {
  return items.map((i, n) => `${n + 1}. ${i.title} (${formatPrice(i)})`).join("\n");
}

/** Turn a reply such as "2" or "latte" into one of `items`, or null. */
export function parseItem(reply: string, items: MenuItem[]): MenuItem | null {
  const text = reply.trim().toLowerCase();
  if (!text) return null;
  if (/^\d+$/.test(text)) {
    const n = Number(text);
    return items[n - 1] ?? null;
  }
  return (
    items.find((i) => i.title.trim().toLowerCase() === text) ??
    items.find((i) => i.shortTitle.trim().toLowerCase() === text) ??
    null
  );
}

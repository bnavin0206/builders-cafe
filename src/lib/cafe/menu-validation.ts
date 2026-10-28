import type { Selection } from "@/types";

export const MAX_MENU_ITEMS = 30;
export const MAX_PRICE_RUPEES = 10000;
const TITLE_MAX = 24; // WhatsApp list row titles are cut at 24 characters
const DESCRIPTION_MAX = 72;

/**
 * Checks a menu a barista or admin edited in the dashboard before it is saved.
 * Returns the first problem as a short sentence, or null when it is fine.
 *
 * The cafe flow finds an item by its title and whether it is free, so a free
 * and a priced item may share a title, but two items of the same kind may not.
 * The dashboard picker identifies items by shortTitle, which must be unique.
 */
export function validateSelection(selection: unknown): string | null {
  const sel = selection as Partial<Selection> | null;
  if (!sel || !Array.isArray(sel.items) || !Array.isArray(sel.modifiers)) {
    return "The menu is not in the expected format.";
  }
  if (sel.items.length > MAX_MENU_ITEMS) {
    return `A menu can have at most ${MAX_MENU_ITEMS} items.`;
  }

  const shortTitles = new Set<string>();
  const freeTitles = new Set<string>();
  const paidTitles = new Set<string>();

  for (const item of sel.items) {
    const name = typeof item?.title === "string" ? item.title.trim() : "";
    if (!name) return "Every item needs a name.";
    if (name.length > TITLE_MAX) {
      return `"${name}" is longer than ${TITLE_MAX} characters.`;
    }

    const short = typeof item.shortTitle === "string" ? item.shortTitle.trim() : "";
    if (!short || short.length > TITLE_MAX) {
      return `"${name}" needs a short title of up to ${TITLE_MAX} characters.`;
    }
    if (shortTitles.has(short)) return `Two items share the short title "${short}".`;
    shortTitles.add(short);

    if (typeof item.description !== "string" || item.description.length > DESCRIPTION_MAX) {
      return `The description of "${name}" must be at most ${DESCRIPTION_MAX} characters.`;
    }

    const price = item.price ?? 0;
    if (
      typeof price !== "number" ||
      !Number.isInteger(price) ||
      price < 0 ||
      price > MAX_PRICE_RUPEES
    ) {
      return `The price of "${name}" must be a whole number of rupees from 0 to ${MAX_PRICE_RUPEES}.`;
    }

    if (item.category !== undefined && item.category !== "coffee" && item.category !== "savoury") {
      return `"${name}" has an unknown category.`;
    }

    const seen = price === 0 ? freeTitles : paidTitles;
    if (seen.has(name)) {
      return `"${name}" is on the menu twice at ${price === 0 ? "the free" : "a paid"} price.`;
    }
    seen.add(name);
  }

  for (const m of sel.modifiers) {
    if (typeof m !== "string" || !m.trim() || m.length > TITLE_MAX) {
      return `Add-ons need a name of up to ${TITLE_MAX} characters.`;
    }
  }
  return null;
}

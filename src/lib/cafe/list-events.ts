/**
 * How a live Sync list changes when Twilio reports an event. Kept separate from
 * the React hook so it can be tested.
 *
 * The "item updated" event carries the item (item.index) but not a separate
 * `index`, so the position must be read from the item. The older code looked
 * for `event.index`, found nothing, and the page never showed an update until
 * it was refreshed.
 */
export interface ListItemLike {
  index: number;
}

const indexOfEvent = (e: { index?: number; item?: ListItemLike }): number | undefined =>
  typeof e.item?.index === "number" ? e.item.index : typeof e.index === "number" ? e.index : undefined;

/** A new item: added at the end, unless it is already there (the first load and the event can overlap). */
export function applyItemAdded<T extends ListItemLike>(items: T[], e: { item: T }): T[] {
  return items.some((i) => i.index === e.item.index) ? items.map((i) => (i.index === e.item.index ? e.item : i)) : [...items, e.item];
}

/** A changed item replaces the old one; if it was missed earlier it is added. */
export function applyItemUpdated<T extends ListItemLike>(items: T[], e: { item: T; index?: number }): T[] {
  const idx = indexOfEvent(e);
  if (idx === undefined) return items;
  return items.some((i) => i.index === idx) ? items.map((i) => (i.index === idx ? e.item : i)) : [...items, e.item];
}

export function applyItemRemoved<T extends ListItemLike>(items: T[], e: { index?: number; item?: ListItemLike }): T[] {
  const idx = indexOfEvent(e);
  return idx === undefined ? items : items.filter((i) => i.index !== idx);
}

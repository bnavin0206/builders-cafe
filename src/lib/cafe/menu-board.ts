import type { MenuItem } from "@/types";

/** What the menu board needs of one item. Nothing else leaves the server. */
export interface BoardMenuItem {
  title: string;
  price: number;
  group: string;
  veg: boolean;
}

export interface MenuGroup {
  /** The name shown as a heading. */
  name: string;
  /** A short form for the panel title. */
  short: string;
  /** The price when every item in the group costs the same, else null. */
  price: number | null;
  items: BoardMenuItem[];
}

export interface MenuLayout {
  free: BoardMenuItem[];
  /** The paid groups in two columns, in menu order, balanced by number of rows. */
  columns: [MenuGroup[], MenuGroup[]];
}

const NAMES: Record<string, { name: string; short: string }> = {
  hot: { name: "Hot drinks", short: "Hot" },
  cold: { name: "Cold drinks", short: "Cold" },
  sandwich: { name: "Sandwiches", short: "Sandwiches" },
  savoury: { name: "Savoury", short: "Savoury" },
  pastry: { name: "Pastries", short: "Pastries" },
};

const clean = (t: string | undefined) => (t ?? "").replace(/\s+/g, " ").trim();

/** The items to show: switched-off items are left out, the rest keep their order. */
export function menuForBoard(items: MenuItem[]): BoardMenuItem[] {
  return items
    .filter((i) => i.available !== false)
    .map((i) => ({
      title: clean(i.title),
      price: Number.isFinite(i.price) ? Math.max(0, Math.floor(i.price as number)) : 0,
      group: clean(i.description),
      veg: i.veg !== false,
    }))
    .filter((i) => i.title !== "");
}

function groupsOf(items: BoardMenuItem[]): MenuGroup[] {
  const order: string[] = [];
  const by = new Map<string, BoardMenuItem[]>();
  for (const i of items) {
    const key = i.group || "More";
    if (!by.has(key)) {
      by.set(key, []);
      order.push(key);
    }
    by.get(key)!.push(i);
  }
  return order.map((key) => {
    const list = by.get(key)!;
    const names = NAMES[key.toLowerCase()] ?? { name: key, short: key };
    const prices = new Set(list.map((i) => i.price));
    return { ...names, price: prices.size === 1 ? list[0]!.price : null, items: list };
  });
}

/**
 * Free items go in their own panel. The paid groups are split into two
 * columns, keeping the menu order, at the point that makes the taller column
 * as short as possible (a heading counts as one row and a half).
 */
export function layoutMenu(items: BoardMenuItem[]): MenuLayout {
  const free = items.filter((i) => i.price === 0);
  const groups = groupsOf(items.filter((i) => i.price > 0));
  const height = (g: MenuGroup[]) => g.reduce((n, x) => n + x.items.length + 1.5, 0);

  let best = 0;
  let bestMax = Infinity;
  for (let cut = 0; cut <= groups.length; cut++) {
    const worst = Math.max(height(groups.slice(0, cut)), height(groups.slice(cut)));
    if (worst < bestMax) {
      bestMax = worst;
      best = cut;
    }
  }
  return { free, columns: [groups.slice(0, best), groups.slice(best)] };
}

/**
 * The name of a panel: its group names joined, such as "Hot & Savoury". When
 * that would not fit the arch (three or more groups) it is the first group and
 * "& more".
 */
export function panelTitle(groups: MenuGroup[]): string {
  const joined = groups.map((g) => g.short).join(" & ");
  return joined.length <= 22 || groups.length < 3 ? joined : `${groups[0]!.short} & more`;
}

/**
 * How much to shrink the rows so the longest column still fits its screen.
 * 1 means full size. The numbers are in "rem" of the design (1920x1080 or
 * 1080x1920, where 1rem is 16px).
 */
export function fitScale(layout: MenuLayout, orientation: "landscape" | "portrait"): number {
  const rows = (g: MenuGroup[]) => g.reduce((n, x) => n + x.items.length, 0);
  // A column is a fixed part (title arch, padding, the lines under headings)
  // plus a part that shrinks with the scale (rows and headings).
  const fit = (g: MenuGroup[], fixed: number, heading: number, row: number, avail: number) =>
    (avail - fixed - g.length * 0.8) / Math.max(g.length * heading + rows(g) * row, 1);
  const nFree = layout.free.length;
  let k: number;
  if (orientation === "landscape") {
    const avail = 52;
    const free = (avail - (7.4 + 1.6 + 3.4 + 3 + 12.5)) / Math.max(nFree * 4.7, 1);
    const cols = layout.columns.map((c) => fit(c, 10.4, 3.6, 3.3, avail));
    k = Math.min(1, free, ...cols);
  } else {
    const freeH = 7.2 + 2 + Math.ceil(nFree / 2) * 4.2 + 2.2 + 12.4;
    const avail = 120 - 7.5 - 5.5 - 1.2 - 1.6 - freeH - 1;
    const cols = layout.columns.map((c) => fit(c, 9.4, 3.9, 3.75, avail));
    k = Math.min(1, ...cols);
  }
  return Math.max(0.5, Math.round(k * 100) / 100);
}

/**
 * Most recent first: by the time of the last change (for a delivered order, when it
 * was delivered), and by order position when two changed at the same moment.
 */
export function newestFirst<T extends { index: number; dateUpdated?: Date | string }>(items: T[]): T[] {
  const time = (i: T) => (i.dateUpdated ? new Date(i.dateUpdated).getTime() : 0) || 0;
  return [...items].sort((a, b) => time(b) - time(a) || b.index - a.index);
}

import { istDay } from "./free-limit";

export interface DaySection<T> {
  /** YYYY-MM-DD in Bengaluru time. */
  day: string;
  /** "Today", "Yesterday" or "Fri 13 Nov". */
  label: string;
  /** Always the date itself, such as "Mon 16 Nov" ("" when unknown). */
  dateLabel: string;
  items: T[];
}

const dateOf = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(Date.UTC(y!, m! - 1, d!)));
};
const labelOf = (day: string, now: Date) => {
  if (day === istDay(now)) return "Today";
  if (day === istDay(new Date(now.getTime() - 24 * 3600 * 1000))) return "Yesterday";
  return dateOf(day);
};

/**
 * Groups orders by the day of their last change (for delivered orders, the day
 * they were delivered), newest day first and newest order first inside a day.
 */
export function groupByDay<T extends { index: number; dateUpdated?: Date | string }>(
  items: T[],
  now: Date = new Date(),
): Array<DaySection<T>> {
  const sorted = newestFirst(items);
  const sections: Array<DaySection<T>> = [];
  for (const item of sorted) {
    const when = item.dateUpdated ? new Date(item.dateUpdated) : null;
    const day = when && !Number.isNaN(when.getTime()) ? istDay(when) : "unknown";
    let section = sections.find((s) => s.day === day);
    if (!section) {
      section = { day, label: day === "unknown" ? "Earlier" : labelOf(day, now), dateLabel: day === "unknown" ? "" : dateOf(day), items: [] };
      sections.push(section);
    }
    section.items.push(item);
  }
  return sections;
}

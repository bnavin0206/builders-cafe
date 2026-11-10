/** The calendar day in Bengaluru time, as YYYY-MM-DD. */
export function istDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Free coffees given today: orders that include the free coffee, were placed on
 * today's Bengaluru day and are not cancelled. Counting the orders themselves
 * means a cancelled order gives its coffee back with nothing else to update.
 */
export function countFreeCoffees(
  items: Array<{ dateCreated: Date; data: unknown }>,
  now: Date,
): number {
  const today = istDay(now);
  return items.filter((i) => {
    const d = i.data as { freeCoffee?: boolean; status?: string } | null;
    return d?.freeCoffee === true && d.status !== "cancelled" && istDay(i.dateCreated) === today;
  }).length;
}

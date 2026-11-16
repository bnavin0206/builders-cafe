/**
 * Most recent first: by the time of the last change (for a delivered order, when it
 * was delivered), and by order position when two changed at the same moment.
 */
export function newestFirst<T extends { index: number; dateUpdated?: Date | string }>(items: T[]): T[] {
  const time = (i: T) => (i.dateUpdated ? new Date(i.dateUpdated).getTime() : 0) || 0;
  return [...items].sort((a, b) => time(b) - time(a) || b.index - a.index);
}

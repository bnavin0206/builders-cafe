/**
 * Saves changes to an attendee's record. The flow saves once or twice per reply,
 * and each save used to read the record first and then write it (two round trips).
 * When the revision of the copy already in hand is known, the write is sent in a
 * single call that only succeeds if nobody changed the record meanwhile; if it was
 * changed (or anything else goes wrong), the careful way (read, merge, write) is used.
 */
export interface SavedItem {
  data: Record<string, unknown>;
  revision: string;
}

export interface SaverOps {
  /** Writes `data` only if the stored revision is still `ifMatch`. Rejects with status 412 otherwise. */
  writeIfUnchanged(phone: string, data: Record<string, unknown>, ifMatch: string): Promise<SavedItem>;
  /** Reads, merges `patch` and writes (the older, safe way). */
  readMergeWrite(phone: string, patch: Record<string, unknown>): Promise<SavedItem>;
}

export function makeRecordSaver(ops: SaverOps, initial?: SavedItem) {
  let known = initial;
  return async (phone: string, patch: Record<string, unknown>): Promise<void> => {
    if (known) {
      try {
        known = await ops.writeIfUnchanged(phone, { ...known.data, ...patch }, known.revision);
        return;
      } catch (e) {
        // Changed by someone else, or any other problem: fall through to the careful way.
        known = undefined;
      }
    }
    known = await ops.readMergeWrite(phone, patch);
  };
}

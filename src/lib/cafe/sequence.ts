import { getSyncService } from "@/lib/twilio";

/**
 * The next number of a named counter: 1, 2, 3, ... with nothing skipped.
 * The counter lives in a Twilio Sync document and is updated only if nobody
 * else changed it in between, so two orders at the same moment get different
 * numbers. `initial` gives the starting value the first time the counter is
 * created, so a counter added while orders already exist continues after them.
 */
export async function nextInSequence(name: string, initial?: () => Promise<number>): Promise<number> {
  const service = await getSyncService();
  try {
    await service.documents()(name).fetch();
  } catch (e: any) {
    if (e?.status !== 404) throw e;
    try {
      let start = 0;
      try {
        start = Math.max(0, Math.floor((await initial?.()) ?? 0));
      } catch (i) {
        console.error("Could not read the starting number", (i as Error)?.message);
      }
      await service.documents().create({ uniqueName: name, data: { last: start } });
    } catch (c: any) {
      if (c?.status !== 409) throw c;
    }
  }
  for (let attempt = 0; attempt < 10; attempt++) {
    const doc = await service.documents()(name).fetch();
    const next = Number((doc.data as { last?: number }).last ?? 0) + 1;
    try {
      // @ts-ignore ifMatch is supported by the API but missing from the typings
      await service.documents()(name).update({ data: { last: next }, ifMatch: doc.revision });
      return next;
    } catch (e: any) {
      if (e?.status !== 412) throw e;
    }
  }
  throw new Error(`Could not allocate a number from ${name}`);
}

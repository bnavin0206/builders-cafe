import { getSyncService } from "@/lib/twilio";

/**
 * The next number of a named counter: 1, 2, 3, ... with nothing skipped.
 * The counter lives in a Twilio Sync document and is updated only if nobody
 * else changed it in between, so two orders at the same moment get different
 * numbers.
 */
export async function nextInSequence(name: string): Promise<number> {
  const service = await getSyncService();
  try {
    await service.documents()(name).fetch();
  } catch (e: any) {
    if (e?.status !== 404) throw e;
    try {
      await service.documents().create({ uniqueName: name, data: { last: 0 } });
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

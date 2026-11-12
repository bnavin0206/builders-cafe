import { getSyncService } from "@/lib/twilio";
import type { Invoice } from "./invoice";
import { buildInvoice } from "./invoice";

const COUNTER = "InvoiceCounter";
const MAP = "Invoices";

async function ensure(kind: "doc" | "map") {
  const service = await getSyncService();
  try {
    if (kind === "doc") await service.documents()(COUNTER).fetch();
    else await service.syncMaps()(MAP).fetch();
  } catch (e: any) {
    if (e?.status !== 404) throw e;
    try {
      if (kind === "doc") await service.documents().create({ uniqueName: COUNTER, data: { last: 0 } });
      else await service.syncMaps().create({ uniqueName: MAP });
    } catch (c: any) {
      if (c?.status !== 409) throw c;
    }
  }
  return service;
}

/** Next invoice number. Safe when two payments arrive together. */
async function nextSeq(): Promise<number> {
  const service = await ensure("doc");
  for (let attempt = 0; attempt < 10; attempt++) {
    const doc = await service.documents()(COUNTER).fetch();
    const next = Number((doc.data as { last?: number }).last ?? 0) + 1;
    try {
      // @ts-ignore ifMatch is supported by the API but missing from the typings
      await service.documents()(COUNTER).update({ data: { last: next }, ifMatch: doc.revision });
      return next;
    } catch (e: any) {
      if (e?.status !== 412) throw e;
    }
  }
  throw new Error("Could not allocate an invoice number");
}

export async function getInvoiceByPayment(paymentId: string): Promise<Invoice | undefined> {
  const service = await ensure("map");
  try {
    return (await service.syncMaps()(MAP).syncMapItems(paymentId).fetch()).data as Invoice;
  } catch (e: any) {
    if (e?.status === 404) return undefined;
    throw e;
  }
}

/** Creates the invoice for a payment once; asking again returns the same one. */
export async function issueInvoice(
  args: Omit<Parameters<typeof buildInvoice>[0], "seq" | "issuedAt">,
): Promise<Invoice> {
  const existing = await getInvoiceByPayment(args.paymentId);
  if (existing) return existing;
  const seq = await nextSeq();
  const inv = buildInvoice({ ...args, seq, issuedAt: new Date() });
  const service = await ensure("map");
  try {
    await service.syncMaps()(MAP).syncMapItems.create({ key: args.paymentId, data: inv });
  } catch (e: any) {
    if (e?.status === 409) return (await getInvoiceByPayment(args.paymentId))!;
    throw e;
  }
  return inv;
}

export async function listInvoices(): Promise<Invoice[]> {
  const service = await ensure("map");
  const items = await service.syncMaps()(MAP).syncMapItems.list({ limit: 1000 });
  return items.map((i) => i.data as Invoice).sort((a, b) => a.seq - b.seq);
}

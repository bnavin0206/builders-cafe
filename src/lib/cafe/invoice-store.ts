import { getSyncService } from "@/lib/twilio";
import type { Invoice } from "./invoice";
import { buildInvoice, isTestMode } from "./invoice";
import { nextInSequence } from "./sequence";

const COUNTER = "InvoiceCounter";
const TEST_COUNTER = "InvoiceCounterTest";
const counterName = (test: boolean) => (test ? TEST_COUNTER : COUNTER);
const MAP = "Invoices";

async function ensure(kind: "doc" | "map", name = COUNTER) {
  const service = await getSyncService();
  try {
    if (kind === "doc") await service.documents()(name).fetch();
    else await service.syncMaps()(MAP).fetch();
  } catch (e: any) {
    if (e?.status !== 404) throw e;
    try {
      if (kind === "doc") await service.documents().create({ uniqueName: name, data: { last: 0 } });
      else await service.syncMaps().create({ uniqueName: MAP });
    } catch (c: any) {
      if (c?.status !== 409) throw c;
    }
  }
  return service;
}

/** Next invoice number. Safe when two payments arrive together. */
async function nextSeq(test: boolean): Promise<number> {
  return nextInSequence(counterName(test));
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
  args: Omit<Parameters<typeof buildInvoice>[0], "seq" | "issuedAt" | "test"> & { forceTest?: boolean },
): Promise<Invoice> {
  const existing = await getInvoiceByPayment(args.paymentId);
  if (existing) return existing;
  const test = args.forceTest || isTestMode();
  const seq = await nextSeq(test);
  const { forceTest: _f, ...rest } = args;
  const inv = buildInvoice({ ...rest, seq, issuedAt: new Date(), test });
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

/** Remembers the number a customer scanned the invoice QR from (if the invoice has none yet). */
export async function attachPhone(paymentId: string, phone: string): Promise<void> {
  const inv = await getInvoiceByPayment(paymentId);
  if (!inv || inv.customer.phone) return;
  const service = await ensure("map");
  await service.syncMaps()(MAP).syncMapItems(paymentId).update({ data: { ...inv, customer: { ...inv.customer, phone } } });
}

export async function markSent(paymentId: string): Promise<void> {
  const inv = await getInvoiceByPayment(paymentId);
  if (!inv) return;
  const service = await ensure("map");
  await service.syncMaps()(MAP).syncMapItems(paymentId).update({ data: { ...inv, sends: (inv.sends ?? 0) + 1 } });
}

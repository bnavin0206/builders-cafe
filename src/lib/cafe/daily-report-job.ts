import { fetchSyncListItems, findSyncMapItems, getSyncService } from "@/lib/twilio";
import { EventState } from "@/lib/utils";
import { sendMail } from "@/lib/mail";
import { listInvoices } from "./invoice-store";
import { runDailyReports, type DayStatus, type ReportDeps } from "./daily-report-run";

const EVENTS_MAP = process.env.NEXT_PUBLIC_EVENTS_MAP || "";
const REPORTS_MAP = "DailyReports";
const RETRY_AFTER_MS = 30 * 60 * 1000;
const KEEP_SECONDS = 90 * 24 * 3600;

let mapReady = false;
async function reportsMap() {
  const service = await getSyncService();
  if (!mapReady) {
    try {
      await service.syncMaps()(REPORTS_MAP).fetch();
    } catch (e: any) {
      if (e?.status !== 404) throw e;
      try {
        await service.syncMaps().create({ uniqueName: REPORTS_MAP });
      } catch (c: any) {
        if (c?.status !== 409) throw c;
      }
    }
    mapReady = true;
  }
  return service.syncMaps()(REPORTS_MAP);
}

/** The real connections: Twilio Sync for events, orders and the sent-marker, and the email sender. */
export function realReportDeps(): ReportDeps {
  return {
    listOpenEvents: async () => {
      const items = (await findSyncMapItems(EVENTS_MAP, { state: EventState.OPEN })) as Array<{ data: any }>;
      return items.map((i) => ({ slug: String(i.data?.slug ?? ""), name: String(i.data?.name ?? i.data?.slug ?? "") })).filter((e) => e.slug);
    },
    fetchOrders: async (slug) => {
      const items = await fetchSyncListItems(slug);
      return items.map((i: any) => ({ index: i.index, dateCreated: i.dateCreated, data: i.data }));
    },
    invoiceNumbers: async () => Object.fromEntries((await listInvoices()).map((i) => [i.paymentId, i.number])),
    claim: async (slug, day) => {
      const map = await reportsMap();
      const key = `${slug}:${day}`;
      const data = { status: "sending", at: new Date().toISOString() };
      try {
        await map.syncMapItems.create({ key, data, ttl: KEEP_SECONDS });
        return true;
      } catch (e: any) {
        if (e?.status !== 409) throw e;
      }
      const item = await map.syncMapItems(key).fetch();
      const d = item.data as { status?: string; at?: string };
      const retry = (d.status === "failed" || d.status === "skipped") && Date.now() - Date.parse(d.at ?? "") > RETRY_AFTER_MS;
      if (!retry) return false;
      try {
        // @ts-ignore ifMatch is a documented option the typings omit
        await map.syncMapItems(key).update({ data, ifMatch: item.revision });
        return true;
      } catch (e: any) {
        if (e?.status === 412) return false; // another pass took it
        throw e;
      }
    },
    mark: async (slug, day, status: DayStatus) => {
      const map = await reportsMap();
      await map.syncMapItems(`${slug}:${day}`).update({ data: { status, at: new Date().toISOString() } });
    },
    send: (mail) => sendMail(mail),
  };
}

let started = false;
/** Starts the checking loop (every 10 minutes). Does nothing unless DAILY_REPORT_ENABLED=true. */
export function startDailyReportTimer() {
  if (started || (process.env.DAILY_REPORT_ENABLED ?? "").toLowerCase() !== "true") return;
  started = true;
  const deps = realReportDeps();
  const pass = () =>
    runDailyReports(deps)
      .then((r) => r.length && console.log("Daily report pass:", JSON.stringify(r)))
      .catch((e) => console.error("Daily report pass failed", e?.message));
  setTimeout(pass, 60_000).unref?.();
  setInterval(pass, 10 * 60_000).unref?.();
}

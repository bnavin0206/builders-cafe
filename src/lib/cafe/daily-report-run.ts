import { buildReportEmail, paidOrdersForDay } from "./daily-report";
import { istDay } from "./free-limit";
import type { Mail, MailResult } from "@/lib/mail";

export interface ReportConfig {
  enabled: boolean;
  /** Minutes after midnight (Bengaluru) when the day's report is sent. */
  sendMinutes: number;
  to: string[];
  cc: string[];
  /** Where reports go while Razorpay is in test mode. */
  testTo: string[];
  live: boolean;
  sendEmpty: boolean;
}

const list = (v: string | undefined) =>
  (v ?? "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes("@"));

export function reportConfig(env: Record<string, string | undefined> = process.env): ReportConfig {
  const m = /^(\d{1,2}):(\d{2})$/.exec((env.REPORT_SEND_TIME ?? "23:30").trim());
  const sendMinutes = m ? Math.min(23, Number(m[1])) * 60 + Math.min(59, Number(m[2])) : 23 * 60 + 30;
  return {
    enabled: (env.DAILY_REPORT_ENABLED ?? "").toLowerCase() === "true",
    sendMinutes,
    to: list(env.REPORT_TO),
    cc: list(env.REPORT_CC),
    testTo: list(env.REPORT_TEST_TO).length ? list(env.REPORT_TEST_TO) : list(env.REPORT_CC),
    // Only live Razorpay keys reach the finance team.
    live: /^rzp_live_/.test(env.RAZORPAY_KEY_ID ?? ""),
    sendEmpty: (env.REPORT_SEND_EMPTY ?? "").toLowerCase() === "true",
  };
}

export type DayStatus = "sending" | "sent" | "empty" | "failed" | "skipped";

export interface ReportDeps {
  listOpenEvents(): Promise<Array<{ slug: string; name: string }>>;
  fetchOrders(slug: string): Promise<Array<{ index: number; dateCreated: Date; data: unknown }>>;
  /** True for exactly one caller per event and day (a failed day can be claimed again later). */
  claim(slug: string, day: string): Promise<boolean>;
  mark(slug: string, day: string, status: DayStatus): Promise<void>;
  send(mail: Mail): Promise<MailResult>;
}

const minutesIST = (d: Date) => {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  return Number(p.find((x) => x.type === "hour")!.value) * 60 + Number(p.find((x) => x.type === "minute")!.value);
};

/** Builds and sends the report for one event and day. Returns what happened. */
export async function sendReportFor(
  deps: Pick<ReportDeps, "fetchOrders" | "send">,
  event: { slug: string; name: string },
  day: string,
  cfg: ReportConfig,
  forceTest = false,
): Promise<{ result: MailResult | "empty" | "no-recipient"; orders: number }> {
  const orders = paidOrdersForDay(await deps.fetchOrders(event.slug), day);
  if (orders.length === 0 && !cfg.sendEmpty) return { result: "empty", orders: 0 };
  const test = !cfg.live || forceTest;
  const to = test ? cfg.testTo : cfg.to;
  if (to.length === 0) return { result: "no-recipient", orders: orders.length };
  const email = buildReportEmail({ eventName: event.name, day, orders, test });
  const result = await deps.send({
    to,
    cc: test ? [] : cfg.cc,
    subject: email.subject,
    text: email.text,
    attachments: [{ filename: email.filename, content: email.csv, type: "text/csv" }],
  });
  return { result, orders: orders.length };
}

/**
 * One pass of the daily job. Yesterday is always checked (to catch up after a
 * restart), and today once the send time has passed. Each event and day is
 * claimed before sending, so it is sent once even if two passes overlap.
 */
export async function runDailyReports(
  deps: ReportDeps,
  env: Record<string, string | undefined> = process.env,
  now: Date = new Date(),
): Promise<Array<{ slug: string; day: string; result: string }>> {
  const cfg = reportConfig(env);
  if (!cfg.enabled) return [];
  const days = [istDay(new Date(now.getTime() - 24 * 3600 * 1000))];
  if (minutesIST(now) >= cfg.sendMinutes) days.push(istDay(now));

  const out: Array<{ slug: string; day: string; result: string }> = [];
  for (const event of await deps.listOpenEvents()) {
    for (const day of days) {
      if (!(await deps.claim(event.slug, day))) continue;
      try {
        const r = await sendReportFor(deps, event, day, cfg);
        const status: DayStatus = r.result === "sent" ? "sent" : r.result === "empty" ? "empty" : r.result === "skipped" ? "skipped" : "failed";
        await deps.mark(event.slug, day, status);
        out.push({ slug: event.slug, day, result: r.result });
      } catch (e) {
        console.error("Daily report failed", (e as Error)?.message);
        await deps.mark(event.slug, day, "failed");
        out.push({ slug: event.slug, day, result: "failed" });
      }
    }
  }
  return out;
}

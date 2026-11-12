import { describe, expect, it, vi } from "vitest";
import { reportConfig, runDailyReports, type ReportDeps } from "./daily-report-run";

const order = (n: number, iso: string) => ({
  index: n,
  dateCreated: new Date(iso),
  data: { orderNumber: n, items: [{ name: "Latte", quantity: 1 }], amountPaise: 10000, paymentId: "pay_" + n, status: "delivered" },
});

const env = (o: Record<string, string> = {}) => ({
  DAILY_REPORT_ENABLED: "true",
  REPORT_TO: "finance@makemycampaign.in",
  REPORT_CC: "naveen@makemycampaign.in",
  REPORT_TEST_TO: "naveen@makemycampaign.in",
  RAZORPAY_KEY_ID: "rzp_test_x",
  ...o,
});

function deps(over: Partial<ReportDeps> = {}): ReportDeps & { sent: any[] } {
  const sent: any[] = [];
  return {
    sent,
    listOpenEvents: async () => [{ slug: "e", name: "Cafe" }],
    fetchOrders: async () => [order(1, "2026-11-12T05:00:00Z")],
    claim: async () => true,
    mark: async () => {},
    send: async (m) => (sent.push(m), "sent" as const),
    ...over,
  };
}
const after = new Date("2026-11-12T18:30:00Z"); // 00:00 IST next day -> yesterday = 12th

describe("daily report", () => {
  it("does nothing unless enabled", async () => {
    const d = deps();
    expect(await runDailyReports(d, env({ DAILY_REPORT_ENABLED: "" }), after)).toEqual([]);
    expect(d.sent).toHaveLength(0);
  });
  it("in test mode goes only to the test address", async () => {
    const d = deps();
    await runDailyReports(d, env(), after);
    expect(d.sent[0].to).toEqual(["naveen@makemycampaign.in"]);
    expect(d.sent[0].cc).toEqual([]);
    expect(d.sent[0].subject).toMatch(/^\[TEST\]/);
  });
  it("with live keys goes to finance with the copy", async () => {
    const d = deps();
    await runDailyReports(d, env({ RAZORPAY_KEY_ID: "rzp_live_x" }), after);
    expect(d.sent[0].to).toEqual(["finance@makemycampaign.in"]);
    expect(d.sent[0].cc).toEqual(["naveen@makemycampaign.in"]);
  });
  it("skips days already claimed", async () => {
    const d = deps({ claim: vi.fn(async () => false) });
    await runDailyReports(d, env(), after);
    expect(d.sent).toHaveLength(0);
  });
  it("sends nothing on empty days", async () => {
    const d = deps({ fetchOrders: async () => [] });
    await runDailyReports(d, env(), after);
    expect(d.sent).toHaveLength(0);
  });
  it("parses the send time", () => {
    expect(reportConfig({ REPORT_SEND_TIME: "21:15" }).sendMinutes).toBe(21 * 60 + 15);
    expect(reportConfig({}).sendMinutes).toBe(23 * 60 + 30);
  });
});

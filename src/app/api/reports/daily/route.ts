import { headers } from "next/headers";
import { Privilege, getAuthenticatedRole } from "@/proxy";
import { istDay } from "@/lib/cafe/free-limit";
import { reportConfig, sendReportFor } from "@/lib/cafe/daily-report-run";
import { realReportDeps } from "@/lib/cafe/daily-report-job";

/**
 * Admin only. Sends the paid-orders report for one day right now, to see how it
 * looks. By default (`send=test`) it goes only to the test address. `send=live`
 * goes to the finance team, and is refused while Razorpay is in test mode.
 *   POST /api/reports/daily?day=2026-11-12&send=test&event=builders-cafe
 */
export async function POST(request: Request) {
  const role = getAuthenticatedRole((await headers()).get("Authorization") || "");
  if (role !== Privilege.ADMIN) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const day = url.searchParams.get("day") || istDay(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return new Response("day must look like 2026-11-12", { status: 400 });
  const live = url.searchParams.get("send") === "live";
  const cfg = reportConfig();
  if (live && !cfg.live) {
    return new Response("Razorpay is in test mode, so reports are only sent to the test address", { status: 400 });
  }

  const deps = realReportDeps();
  const events = await deps.listOpenEvents();
  const wanted = url.searchParams.get("event");
  const event = events.find((e) => e.slug === wanted) ?? events[0];
  if (!event) return new Response("No open event", { status: 404 });

  const r = await sendReportFor(deps, event, day, { ...cfg, sendEmpty: true }, !live);
  return Response.json({ event: event.slug, day, sentTo: live ? "finance team" : "test address", result: r.result, orders: r.orders });
}

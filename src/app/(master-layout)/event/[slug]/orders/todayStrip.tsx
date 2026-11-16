"use client";

import { useEffect, useState } from "react";
import { getCookie } from "cookies-next";
import { Privilege } from "@/proxy";
import { todayStats } from "@/lib/cafe/today-stats";

/**
 * Today's numbers at the top of the orders page. They come from the live order
 * list, so they change as soon as an order arrives or moves on, and they start
 * again at zero each Bengaluru day (the list itself keeps older days).
 */
export default function TodayStrip({
  orders,
  freeLimit,
}: {
  orders: Array<{ data: unknown; dateUpdated?: Date | string }>;
  freeLimit: number;
}) {
  // Re-count every minute too, so the numbers reset at midnight even if no order moves.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const s = todayStats(
    (Array.isArray(orders) ? orders : []).map((o) => ({ data: o.data, dateUpdated: o.dateUpdated })),
    now,
  );
  const isAdmin = getCookie("privilege") === Privilege.ADMIN;
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" }).format(now);

  const cards: Array<{ label: string; value: string; tone: string }> = [
    { label: "Orders today", value: String(s.total), tone: "bg-twilio-ink text-white" },
    { label: "Waiting", value: String(s.queued), tone: "bg-amber-100 text-amber-900" },
    { label: "Ready", value: String(s.ready), tone: "bg-emerald-100 text-emerald-900" },
    { label: "Delivered", value: String(s.delivered), tone: "bg-gray-100 text-gray-800" },
    { label: "Free coffees", value: freeLimit > 0 ? `${s.free} / ${freeLimit}` : String(s.free), tone: "bg-green-100 text-green-900" },
    { label: "Paid orders", value: isAdmin ? `${s.paid} · ₹${s.paidRupees.toLocaleString("en-IN")}` : String(s.paid), tone: "bg-blue-100 text-blue-900" },
  ];

  return (
    <section aria-label="Today's orders" className="mb-4">
      <div className="mb-1 flex items-baseline justify-between text-xs text-gray-500">
        <span className="font-semibold uppercase tracking-wide">Today · {date}</span>
        {s.cancelled > 0 && <span>{s.cancelled} cancelled</span>}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-lg px-3 py-2 ${c.tone}`}>
            <div className="text-lg font-bold leading-tight">{c.value}</div>
            <div className="text-[11px] font-medium opacity-80">{c.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

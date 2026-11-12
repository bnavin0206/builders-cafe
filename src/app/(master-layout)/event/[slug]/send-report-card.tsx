"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

/** Admin button: emails the paid-orders report for a day to the finance team. */
export default function SendReportCard({ slug }: { slug: string }) {
  const { toast } = useToast();
  const [day, setDay] = useState(today());
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!window.confirm(`Email the paid-orders report for ${day} to the finance team?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/reports/daily?send=finance&event=${encodeURIComponent(slug)}&day=${day}`, { method: "POST" });
      if (!res.ok) {
        toast({ title: "Report not sent", description: await res.text() });
        return;
      }
      const r = await res.json();
      const where = r.testMode ? "the test address only (Razorpay is in test mode)" : "finance";
      toast({
        title: r.result === "sent" ? "Report sent" : "Report not sent",
        description:
          r.result === "sent"
            ? `${r.orders} paid order(s) for ${day} sent to ${where}.`
            : r.result === "skipped"
              ? "Email is not set up yet (sender and SMTP settings are missing)."
              : r.result === "no-recipient"
                ? "No recipient is configured."
                : "The email could not be sent. Check the sender settings.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily report to finance</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <input
          type="date"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          className="rounded-md border px-3 py-2 text-sm"
          aria-label="Report day"
        />
        <Button onClick={send} disabled={busy || !day}>
          {busy ? "Sending…" : "Send report to finance"}
        </Button>
        <p className="w-full text-xs text-gray-500">
          Also sent automatically every day at 23:30 IST once switched on. Paid orders only, as a CSV.
        </p>
      </CardContent>
    </Card>
  );
}

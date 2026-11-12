"use client";

import { use, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { isClientAuth } from "@/lib/customHooks";
import { Privilege } from "@/proxy";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Item = { title: string; price: number; veg: boolean };
type Mode = "pos" | "upi" | "cash";
type Done = { paymentId?: string; training?: boolean; orderNumber: number; invoiceNumber: string; totalPaise: number; invoiceUrl: string | null; qr: string | null };

const MODES: Array<[Mode, string]> = [
  ["pos", "POS machine"],
  ["upi", "UPI QR"],
  ["cash", "Cash"],
];
const rs = (paise: number) => `₹${(paise / 100).toFixed(0)}`;
const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9-]/g, "");

function CounterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [items, setItems] = useState<Item[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<Mode | null>(null);
  const [saleId, setSaleId] = useState(newId);
  const [training, setTraining] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Done | null>(null);
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [sendState, setSendState] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch(`/api/counter?event=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load the menu"))))
      .then((d) => setItems(d.items))
      .catch((e) => setError(e.message));
  }, [slug]);

  const total = useMemo(
    () => items.reduce((s, i) => s + (cart[i.title] ?? 0) * Math.round(i.price * 100), 0),
    [items, cart],
  );
  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  const change = (title: string, d: number) =>
    setCart((c) => ({ ...c, [title]: Math.max(0, Math.min(20, (c[title] ?? 0) + d)) }));

  const submit = async () => {
    if (!mode || count === 0) return;
    const label = MODES.find((m) => m[0] === mode)![1];
    if (!window.confirm(training ? `TRAINING: practise a ${rs(total)} sale by ${label}? No order is created.` : `Payment of ${rs(total)} received by ${label}? This creates the invoice.`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/counter", {
        method: "POST",
        body: JSON.stringify({
          event: slug,
          saleId,
          mode,
          training,
          lines: Object.entries(cart).filter(([, q]) => q > 0).map(([title, qty]) => ({ title, qty })),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const d = await res.json();
      const qr = d.whatsappLink ? await QRCode.toDataURL(d.whatsappLink, { margin: 1, width: 260 }) : null;
      setDone({ ...d, qr });
    } catch (e: any) {
      setError(e?.message || "Something went wrong. Check the orders list before trying again.");
    } finally {
      setBusy(false);
    }
  };

  const sendInvoice = async () => {
    if (!done?.paymentId) return;
    setSending(true);
    setSendState("Sending…");
    try {
      const res = await fetch("/api/counter/invoice", {
        method: "POST",
        body: JSON.stringify({ event: slug, paymentId: done.paymentId, phone, consent }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) {
        setSendState(
          d?.reason === "no-template"
            ? "WhatsApp needs the invoice template, which is not approved yet. Use the QR instead."
            : d?.reason === "failed"
              ? "WhatsApp could not send it. Check the number, or use the QR."
              : (await Promise.resolve(d ? JSON.stringify(d) : res.statusText)) || "Could not send",
        );
        return;
      }
      setSendState("Sent. Checking delivery…");
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        const st = await fetch(`/api/counter/invoice?sid=${d.sid}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (st?.status === "delivered" || st?.status === "read") return setSendState("Delivered to WhatsApp ✓");
        if (st?.status === "failed" || st?.status === "undelivered") return setSendState(`Not delivered (code ${st.errorCode ?? "?"}). Check the number, or use the QR.`);
      }
      setSendState("Sent. Delivery not confirmed yet.");
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    setPhone("");
    setConsent(false);
    setSendState("");
    setCart({});
    setMode(null);
    setDone(null);
    setError("");
    setSaleId(newId());
  };

  if (done) {
    return (
      <main className="mx-auto max-w-md space-y-4 p-4">
        <Card>
          <CardHeader>
            <CardTitle>{done.training ? "Training sale (no order created)" : `Order #${done.orderNumber} created`}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-center">
            <p>
              Invoice <b>{done.invoiceNumber}</b>, total <b>{rs(done.totalPaise)}</b>
            </p>
            {done.qr ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={done.qr} alt="Scan to get the invoice on WhatsApp" className="mx-auto" width={260} height={260} />
                <p className="text-sm text-gray-600">Customer scans this, taps Send in WhatsApp, and the invoice arrives in the chat.</p>
              </>
            ) : (
              <p className="text-sm text-red-600">No WhatsApp number is set for this event, so there is no QR. Use Print below.</p>
            )}
            <div className="space-y-2 rounded border p-3 text-left">
              <label className="block text-sm font-medium" htmlFor="invphone">
                Or send to a WhatsApp number (optional)
              </label>
              <input
                id="invphone"
                type="tel"
                inputMode="tel"
                placeholder="98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-md border px-3 py-2"
              />
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
                Customer agrees to get the invoice on WhatsApp
              </label>
              <Button className="w-full" disabled={sending || !consent || phone.trim().length < 8 || !done.paymentId} onClick={sendInvoice}>
                Send invoice on WhatsApp
              </Button>
              {sendState && <p className="text-sm">{sendState}</p>}
            </div>
            {done.invoiceUrl && (
              <Button variant="outline" onClick={() => window.open(done.invoiceUrl!, "_blank")}>
                Open / print invoice
              </Button>
            )}
            <Button className="w-full" onClick={reset}>
              New sale
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Counter sale</CardTitle>
          <label className="flex items-center gap-2 pt-2 text-sm">
            <input type="checkbox" checked={training} onChange={(e) => setTraining(e.target.checked)} />
            Training mode (practice: TEST invoice, no order)
          </label>
          {training && (
            <p className="rounded bg-yellow-100 px-2 py-1 text-sm font-semibold text-yellow-900">
              TRAINING: nothing here is a real sale.
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {items.length === 0 && !error && <p className="text-sm text-gray-500">Loading the menu…</p>}
          {items.map((i) => (
            <div key={i.title} className="flex items-center justify-between gap-2 border-b py-2">
              <div>
                <span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${i.veg ? "bg-green-600" : "bg-red-600"}`} />
                {i.title} <span className="text-gray-500">₹{i.price}</span>
              </div>
              <div className="flex items-center gap-3">
                <Button size="sm" variant="outline" onClick={() => change(i.title, -1)} aria-label={`Remove ${i.title}`}>−</Button>
                <span className="w-5 text-center">{cart[i.title] ?? 0}</span>
                <Button size="sm" variant="outline" onClick={() => change(i.title, 1)} aria-label={`Add ${i.title}`}>+</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="text-lg font-semibold">Total {rs(total)} ({count} items, GST included)</div>
          <div className="grid grid-cols-3 gap-2">
            {MODES.map(([m, label]) => (
              <Button key={m} variant={mode === m ? "default" : "outline"} onClick={() => setMode(m)}>
                {label}
              </Button>
            ))}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button className="w-full" disabled={busy || !mode || count === 0} onClick={submit}>
            {busy ? "Creating…" : training ? "Practise: create TEST invoice" : "Payment received: create invoice"}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

export default isClientAuth([Privilege.ADMIN, Privilege.MIXOLOGIST], CounterPage);

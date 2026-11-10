"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { Board, BoardOrder } from "@/lib/cafe/board";
import {
  fitDisplayScale,
  layoutMenu,
  panelTitle,
  type BoardMenuItem,
  type MenuGroup,
} from "@/lib/cafe/menu-board";
import "./display.css";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// Twilio Sans loads from twilio-fonts.css; these are only the fallback if it cannot.
const FONTS =
  "https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700;800;900&family=Hanken+Grotesk:wght@500;700;800&family=JetBrains+Mono:wght@500;700&display=swap";

function Clock({ stale }: { stale: boolean }) {
  const [time, setTime] = useState("");
  useEffect(() => {
    const tick = () =>
      setTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className={`dp-clock${stale ? " dp-clock--stale" : ""}`} title={stale ? "Reconnecting" : undefined}>
      {stale ? "Reconnecting…" : time}
    </div>
  );
}

function Mark({ veg }: { veg: boolean }) {
  return <i className={`dp-mark ${veg ? "dp-mark--veg" : "dp-mark--non"}`} role="img" aria-label={veg ? "Veg" : "Non-veg"} />;
}

function Row({ item, free }: { item: BoardMenuItem; free?: boolean }) {
  return (
    <li className="dp-item">
      <Mark veg={item.veg} />
      <span className="dp-name">{item.title}</span>
      <span className="dp-leader" />
      <b className={`dp-tok${free ? " dp-tok--free" : ""}`}>{free ? "FREE" : `₹${item.price}`}</b>
    </li>
  );
}

function Section({ group }: { group: MenuGroup }) {
  return (
    <div className="dp-sec">
      <h3>
        {group.name}
        {group.price != null && <small>₹{group.price} each</small>}
      </h3>
      <ul>
        {group.items.map((i) => (
          <Row key={i.title} item={i} />
        ))}
      </ul>
    </div>
  );
}

function MenuPanel({ groups }: { groups: MenuGroup[] }) {
  const title = panelTitle(groups);
  return (
    <section className="dp-panel">
      <div className="dp-crest">
        <h2 style={{ "--n": title.length } as CSSProperties}>{title}</h2>
      </div>
      {groups.map((g) => (
        <Section key={g.name} group={g} />
      ))}
    </section>
  );
}

/**
 * One order status panel. Orders that do not fit are hidden, never cut in
 * half, and counted as "+N more".
 */
function StatusPanel({
  kind,
  title,
  label,
  orders,
  fresh,
  empty,
}: {
  kind: "preparing" | "ready" | "delivered";
  title: string;
  label: string;
  orders: BoardOrder[];
  fresh: Set<number>;
  empty: string;
}) {
  const panel = useRef<HTMLElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const badge = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(0);
  const [size, setSize] = useState(0);

  useEffect(() => {
    const onResize = () => setSize((n) => n + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useIsoLayoutEffect(() => {
    if (!panel.current || !list.current) return;
    const bottom = panel.current.getBoundingClientRect().bottom;
    const items = Array.from(list.current.children) as HTMLElement[];
    const fit = (limit: number) => {
      let hidden = 0;
      for (const el of items) {
        const fits = el.getBoundingClientRect().bottom <= limit + 1;
        el.style.visibility = fits ? "visible" : "hidden";
        if (!fits) hidden += 1;
      }
      return hidden;
    };
    let hidden = fit(bottom);
    if (hidden > 0) hidden = fit(bottom - (badge.current?.offsetHeight ?? 0));
    setMore(hidden);
  }, [orders, size]);

  return (
    <section ref={panel} className={`dp-status dp-status--${kind}`} aria-labelledby={`dp-h-${kind}`}>
      <div className="dp-head">
        <h2 id={`dp-h-${kind}`}>{title}</h2>
        <p>{label}</p>
      </div>
      {orders.length === 0 ? (
        <p className="dp-empty">{empty}</p>
      ) : (
        <ol ref={list} className="dp-tokens" aria-live={kind === "ready" ? "polite" : "off"}>
          {orders.map((o) => (
            <li key={o.no} className={`dp-token${fresh.has(o.no) ? " dp-token--new" : ""}`}>
              <span className="dp-no" style={{ "--n": String(o.no).length } as CSSProperties}>
                <i>#</i>
                {o.no}
              </span>
              <span className="dp-token-items">
                <span>{o.items}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      <div
        ref={badge}
        className="dp-more"
        style={{ visibility: more > 0 ? "visible" : "hidden" }}
        aria-hidden={more === 0}
      >
        +{more} more
      </div>
    </section>
  );
}

/** The menu and the order status together, for a display of either shape. */
export function DisplayView({
  board,
  menu,
  qrSvg,
  fresh = new Set<number>(),
  stale = false,
  notice,
}: {
  board: Board | null;
  menu: BoardMenuItem[];
  qrSvg: string | null;
  fresh?: Set<number>;
  stale?: boolean;
  notice?: string;
}) {
  const data: Board = board ?? { preparing: [], ready: [], delivered: [], serverTime: "" };
  const layout = layoutMenu(menu);
  const vars = {
    "--k-land": fitDisplayScale(layout, "landscape"),
    "--k-port": fitDisplayScale(layout, "portrait"),
  } as CSSProperties;

  return (
    <div className="dp-root" style={vars}>
      <link rel="stylesheet" href={FONTS} precedence="default" />
      <header className="dp-bar">
        <div className="dp-brand">
          Builder&apos;s Cafe <small>MENU &amp; ORDERS</small>
        </div>
        <div className="dp-end">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="dp-logo" src="/twilio.svg" alt="Twilio" />
          <Clock stale={stale} />
        </div>
      </header>

      {notice ? (
        <main className="dp-main dp-main--notice">
          <div className="dp-notice">{notice}</div>
        </main>
      ) : (
        <main className="dp-main">
          <div className="dp-menu">
            <section className="dp-free">
              <div className="dp-free-text">
                <div className="dp-eyebrow">For quiz winners</div>
                <h2>Free coffee</h2>
                <p className="dp-how">Get all 3 quiz answers right on WhatsApp. While free coffees last.</p>
              </div>
              {layout.free.length > 0 && (
                <ul className="dp-free-list">
                  {layout.free.map((i) => (
                    <Row key={i.title} item={i} free />
                  ))}
                </ul>
              )}
              {qrSvg && (
                <div className="dp-scan">
                  <div className="dp-qr" dangerouslySetInnerHTML={{ __html: qrSvg }} />
                  <div>
                    <b>Scan to order</b>
                    <span>Opens WhatsApp. Pay with UPI or card.</span>
                  </div>
                </div>
              )}
            </section>
            <div className="dp-paid">
              {layout.columns.map((groups, n) => (groups.length > 0 ? <MenuPanel key={n} groups={groups} /> : null))}
            </div>
          </div>
          <div className="dp-orders">
            <StatusPanel
              kind="ready"
              title="Ready"
              label="Collect at the counter"
              orders={data.ready}
              fresh={fresh}
              empty="Nothing ready yet. Your number shows here."
            />
            <StatusPanel
              kind="preparing"
              title="Preparing"
              label={`${data.preparing.length} ${data.preparing.length === 1 ? "order" : "orders"}`}
              orders={data.preparing}
              fresh={fresh}
              empty="Nothing brewing right now."
            />
            <StatusPanel
              kind="delivered"
              title="Delivered"
              label="Last 10 min"
              orders={data.delivered}
              fresh={fresh}
              empty="No deliveries yet."
            />
          </div>
        </main>
      )}

      <footer className="dp-foot">
        <div className="dp-legend">
          <span>
            <Mark veg /> Veg
          </span>
          <span>
            <Mark veg={false} /> Non-veg
          </span>
        </div>
        <div>Your order number appears on the order board</div>
      </footer>
    </div>
  );
}

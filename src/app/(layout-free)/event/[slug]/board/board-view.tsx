"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Board, BoardOrder } from "@/lib/cafe/board";
import "./board.css";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const FONTS =
  "https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700;800;900&family=Hanken+Grotesk:wght@500;700&family=JetBrains+Mono:wght@500;700&display=swap";

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
    <div className={`board-clock${stale ? " board-clock--stale" : ""}`} title={stale ? "Reconnecting" : undefined}>
      {stale ? "Reconnecting…" : time}
    </div>
  );
}

/**
 * One status panel. Orders that do not fit on the screen are hidden, never cut
 * in half, and counted in the header as "+N more".
 */
function Panel({
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
    // Show every order that fits whole; hide the rest. If some are hidden, the
    // "+N more" badge sits at the bottom, so leave room for it and measure again.
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
    <section ref={panel} className={`panel panel--${kind}`} aria-labelledby={`h-${kind}`}>
      <div className="panel__head">
        <h2 id={`h-${kind}`}>{title}</h2>
        <p>{label}</p>
      </div>
      {orders.length === 0 ? (
        <p className="panel__empty">{empty}</p>
      ) : (
        <ol ref={list} className="tokens" aria-live={kind === "ready" ? "polite" : "off"}>
          {orders.map((o) => (
            <li key={o.no} className={`token${fresh.has(o.no) ? " token--new" : ""}`}>
              <span className="token__no">
                <i>#</i>
                {o.no}
              </span>
              <span className="token__items">
                <span>{o.items}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      <div
        ref={badge}
        className="panel__more"
        style={{ visibility: more > 0 ? "visible" : "hidden" }}
        aria-hidden={more === 0}
      >
        +{more} more
      </div>
    </section>
  );
}

/** The board as shown on the TV. `fresh` holds orders that just became ready. */
export function BoardView({
  board,
  fresh = new Set<number>(),
  stale = false,
  notice,
}: {
  board: Board | null;
  fresh?: Set<number>;
  stale?: boolean;
  notice?: string;
}) {
  const data: Board = board ?? { preparing: [], ready: [], delivered: [], serverTime: "" };
  return (
    <div className="board-root">
      <link rel="stylesheet" href={FONTS} precedence="default" />
      <header className="board-bar">
        <div className="board-brand">
          Builder&apos;s Cafe <small>ORDER BOARD</small>
        </div>
        <Clock stale={stale} />
      </header>
      {notice ? (
        <main className="board-panels">
          <div className="board-notice">{notice}</div>
        </main>
      ) : (
        <main className="board-panels">
          <Panel
            kind="preparing"
            title="Preparing"
            label={`${data.preparing.length} ${data.preparing.length === 1 ? "order" : "orders"}`}
            orders={data.preparing}
            fresh={fresh}
            empty="Nothing brewing right now."
          />
          <Panel
            kind="ready"
            title="Ready"
            label="Collect at the counter"
            orders={data.ready}
            fresh={fresh}
            empty="Nothing ready yet. Your number shows here."
          />
          <Panel
            kind="delivered"
            title="Delivered"
            label="Last 10 min"
            orders={data.delivered}
            fresh={fresh}
            empty="No deliveries yet."
          />
        </main>
      )}
    </div>
  );
}

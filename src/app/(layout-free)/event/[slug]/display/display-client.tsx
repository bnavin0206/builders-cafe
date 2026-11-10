"use client";

import { useEffect, useRef, useState } from "react";
import type { Board } from "@/lib/cafe/board";
import type { BoardMenuItem } from "@/lib/cafe/menu-board";
import { DisplayView } from "./display-view";

const ORDERS_POLL_MS = 3000;
const MENU_POLL_MS = 15_000;
const STALE_AFTER_MS = 10_000;
const FRESH_MS = 8000;

/**
 * Fetches the orders every few seconds and the menu every few more, and shows
 * both. Each keeps its last good copy when a fetch fails.
 */
export default function DisplayClient({
  slug,
  boardKey,
  initialMenu,
  qrSvg,
}: {
  slug: string;
  boardKey: string;
  initialMenu: BoardMenuItem[];
  qrSvg: string | null;
}) {
  const [board, setBoard] = useState<Board | null>(null);
  const [menu, setMenu] = useState<BoardMenuItem[]>(initialMenu);
  const [stale, setStale] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const seenReady = useRef<Set<number> | null>(null);
  const lastOk = useRef(Date.now());

  useEffect(() => {
    let stopped = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const base = `/api/event/${encodeURIComponent(slug)}`;
    const key = `?key=${encodeURIComponent(boardKey)}`;

    async function loadOrders() {
      try {
        const res = await fetch(`${base}/board${key}`, { cache: "no-store" });
        if (stopped) return;
        if (res.status === 404) {
          setInvalid(true);
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const next: Board = await res.json();
        if (stopped) return;

        // An order that was not ready on the last look and is now: stamp it.
        const nowReady = new Set(next.ready.map((o) => o.no));
        const before = seenReady.current;
        seenReady.current = nowReady;
        if (before) {
          const added = [...nowReady].filter((n) => !before.has(n));
          if (added.length > 0) {
            setFresh((f) => new Set([...f, ...added]));
            const t = setTimeout(() => {
              setFresh((f) => {
                const g = new Set(f);
                added.forEach((n) => g.delete(n));
                return g;
              });
              timers.delete(t);
            }, FRESH_MS);
            timers.add(t);
          }
        }
        lastOk.current = Date.now();
        setBoard(next);
        setStale(false);
        setInvalid(false);
      } catch {
        if (!stopped && Date.now() - lastOk.current > STALE_AFTER_MS) setStale(true);
      }
    }

    async function loadMenu() {
      try {
        const res = await fetch(`${base}/menu-board${key}`, { cache: "no-store" });
        if (!res.ok || stopped) return;
        const data = (await res.json()) as { items: BoardMenuItem[] };
        if (!stopped && Array.isArray(data.items)) setMenu(data.items);
      } catch {
        // keep showing the last menu
      }
    }

    loadOrders();
    const ordersPoll = setInterval(loadOrders, ORDERS_POLL_MS);
    const menuPoll = setInterval(loadMenu, MENU_POLL_MS);
    return () => {
      stopped = true;
      clearInterval(ordersPoll);
      clearInterval(menuPoll);
      timers.forEach(clearTimeout);
    };
  }, [slug, boardKey]);

  return (
    <DisplayView
      board={board}
      menu={menu}
      qrSvg={qrSvg}
      fresh={fresh}
      stale={stale}
      notice={invalid ? "This link is not valid. Ask the cafe for a new one." : undefined}
    />
  );
}

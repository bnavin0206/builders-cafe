"use client";

import { useEffect, useRef, useState } from "react";
import type { Board } from "@/lib/cafe/board";
import { BoardView } from "./board-view";

const POLL_MS = 3000;
const STALE_AFTER_MS = 10_000;
const FRESH_MS = 8000;

/** Fetches the feed every few seconds and shows it; keeps the last good board on a failure. */
export default function BoardClient({ slug, boardKey }: { slug: string; boardKey: string }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [stale, setStale] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const seenReady = useRef<Set<number> | null>(null);
  const lastOk = useRef(Date.now());

  useEffect(() => {
    let stopped = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    async function load() {
      try {
        const res = await fetch(
          `/api/event/${encodeURIComponent(slug)}/board?key=${encodeURIComponent(boardKey)}`,
          { cache: "no-store" },
        );
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

    load();
    const poll = setInterval(load, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(poll);
      timers.forEach(clearTimeout);
    };
  }, [slug, boardKey]);

  return (
    <BoardView
      board={board}
      fresh={fresh}
      stale={stale}
      notice={invalid ? "This board link is not valid. Ask the cafe for a new one." : undefined}
    />
  );
}

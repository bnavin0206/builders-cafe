"use client";

import { useEffect, useRef, useState } from "react";
import type { BoardMenuItem } from "@/lib/cafe/menu-board";
import { MenuBoardView } from "./menu-board-view";

const POLL_MS = 15_000;

/** Shows the menu and refreshes it every few seconds; keeps the last good menu on a failure. */
export default function MenuBoardClient({
  slug,
  boardKey,
  initial,
  qrSvg,
}: {
  slug: string;
  boardKey: string;
  initial: BoardMenuItem[];
  qrSvg: string | null;
}) {
  const [items, setItems] = useState<BoardMenuItem[]>(initial);
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const res = await fetch(
          `/api/event/${encodeURIComponent(slug)}/menu-board?key=${encodeURIComponent(boardKey)}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const data = (await res.json()) as { items: BoardMenuItem[] };
          if (!stopped.current && Array.isArray(data.items)) setItems(data.items);
        }
      } catch {
        // keep showing the last menu
      }
      if (!stopped.current) timer = setTimeout(load, POLL_MS);
    }
    timer = setTimeout(load, POLL_MS);
    return () => {
      stopped.current = true;
      clearTimeout(timer);
    };
  }, [slug, boardKey]);

  return <MenuBoardView items={items} qrSvg={qrSvg} />;
}

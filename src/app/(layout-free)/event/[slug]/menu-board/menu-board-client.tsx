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
  initialFreeForAll = false,
  qrSvg,
}: {
  slug: string;
  boardKey: string;
  initial: BoardMenuItem[];
  initialFreeForAll?: boolean;
  qrSvg: string | null;
}) {
  const [items, setItems] = useState<BoardMenuItem[]>(initial);
  const [freeForAll, setFreeForAll] = useState(initialFreeForAll);
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
          const data = (await res.json()) as { items: BoardMenuItem[]; freeForAll?: boolean };
          if (!stopped.current && Array.isArray(data.items)) setItems(data.items);
          if (!stopped.current) setFreeForAll(data.freeForAll === true);
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

  return <MenuBoardView items={items} freeForAll={freeForAll} qrSvg={qrSvg} />;
}

import { describe, test, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, act, within } from "@testing-library/react";
import { BoardView } from "@/app/(layout-free)/event/[slug]/board/board-view";
import BoardClient from "@/app/(layout-free)/event/[slug]/board/board-client";
import type { Board } from "@/lib/cafe/board";

const entry = (no: number, items: string) => ({ no, items, updatedAt: "2026-11-12T10:00:00.000Z" });
const board = (over: Partial<Board> = {}): Board => ({
  preparing: [entry(14, "Cold Coffee ×2 + Espresso"), entry(15, "Masala Chai")],
  ready: [entry(13, "Cafe Latte"), entry(12, "Cappuccino")],
  delivered: [entry(11, "Hot Chocolate")],
  serverTime: "2026-11-12T10:00:00.000Z",
  ...over,
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("BoardView", () => {
  test("shows the three panels with each order's number and items", () => {
    const { container } = render(<BoardView board={board()} />);
    const prep = container.querySelector(".panel--preparing") as HTMLElement;
    const ready = container.querySelector(".panel--ready") as HTMLElement;
    const done = container.querySelector(".panel--delivered") as HTMLElement;

    expect(within(prep).getByText("Preparing")).toBeTruthy();
    expect(within(prep).getByText("2 orders")).toBeTruthy();
    expect(within(prep).getByText("Cold Coffee ×2 + Espresso")).toBeTruthy();
    expect(within(prep).getByText("14")).toBeTruthy();
    expect(within(ready).getByText("Ready")).toBeTruthy();
    expect(within(ready).getByText("Collect at the counter")).toBeTruthy();
    expect(within(ready).getByText("Cafe Latte")).toBeTruthy();
    expect(within(done).getByText("Delivered")).toBeTruthy();
    expect(within(done).getByText("Hot Chocolate")).toBeTruthy();
  });

  test("a single order reads '1 order'", () => {
    render(<BoardView board={board({ preparing: [entry(1, "Latte")] })} />);
    expect(screen.getByText("1 order")).toBeTruthy();
  });

  test("an empty panel says so", () => {
    render(<BoardView board={board({ preparing: [], ready: [], delivered: [] })} />);
    expect(screen.getByText("Nothing brewing right now.")).toBeTruthy();
    expect(screen.getByText("Nothing ready yet. Your number shows here.")).toBeTruthy();
    expect(screen.getByText("No deliveries yet.")).toBeTruthy();
  });

  test("before the first load all three panels are empty, not broken", () => {
    const { container } = render(<BoardView board={null} />);
    expect(container.querySelectorAll(".panel")).toHaveLength(3);
    expect(container.querySelectorAll(".token")).toHaveLength(0);
  });

  test("an order that just became ready is marked to be stamped", () => {
    const { container } = render(<BoardView board={board()} fresh={new Set([13])} />);
    const stamped = container.querySelectorAll(".token--new");
    expect(stamped).toHaveLength(1);
    expect(stamped[0]!.textContent).toContain("13");
  });

  test("a notice replaces the panels", () => {
    const { container } = render(<BoardView board={board()} notice="This link is not valid." />);
    expect(screen.getByText("This link is not valid.")).toBeTruthy();
    expect(container.querySelectorAll(".panel")).toHaveLength(0);
  });

  test("shows Reconnecting when the feed has been failing", () => {
    render(<BoardView board={board()} stale />);
    expect(screen.getByText("Reconnecting…")).toBeTruthy();
  });
});

describe("BoardClient", () => {
  const KEY = "k3y-for-the-tv-0123456789abcdef";
  let responses: Array<{ status: number; body?: Board } | "fail">;
  let urls: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    responses = [];
    urls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        const r = responses.length > 1 ? responses.shift()! : responses[0]!;
        if (r === "fail") throw new Error("offline");
        return { status: r.status, ok: r.status < 300, json: async () => r.body } as Response;
      }),
    );
  });

  const flush = async (ms = 0) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  };

  test("loads the board with the key and shows it", async () => {
    responses = [{ status: 200, body: board() }];
    render(<BoardClient slug="builders-cafe" boardKey={KEY} />);
    await flush();
    expect(urls[0]).toBe(`/api/event/builders-cafe/board?key=${KEY}`);
    expect(screen.getByText("Cappuccino")).toBeTruthy();
  });

  test("refreshes every few seconds and stamps an order that turned ready", async () => {
    responses = [
      { status: 200, body: board({ ready: [entry(12, "Cappuccino")] }) },
      { status: 200, body: board({ ready: [entry(13, "Cafe Latte"), entry(12, "Cappuccino")] }) },
    ];
    const { container } = render(<BoardClient slug="builders-cafe" boardKey={KEY} />);
    await flush();
    expect(container.querySelectorAll(".token--new")).toHaveLength(0); // first look: nothing is "new"
    await flush(3000);
    expect(urls.length).toBeGreaterThanOrEqual(2);
    const stamped = container.querySelectorAll(".token--new");
    expect(stamped).toHaveLength(1);
    expect(stamped[0]!.textContent).toContain("13");
    await flush(9000); // the stamp is dropped after a few seconds
    expect(container.querySelectorAll(".token--new")).toHaveLength(0);
  });

  test("keeps the last board when the feed fails, and says Reconnecting after a while", async () => {
    responses = [{ status: 200, body: board() }, "fail"];
    render(<BoardClient slug="builders-cafe" boardKey={KEY} />);
    await flush();
    await flush(3000);
    expect(screen.getByText("Cappuccino")).toBeTruthy();
    expect(screen.queryByText("Reconnecting…")).toBeNull();
    await flush(9000);
    expect(screen.getByText("Cappuccino")).toBeTruthy();
    expect(screen.getByText("Reconnecting…")).toBeTruthy();
  });

  test("a rejected key shows a clear message", async () => {
    responses = [{ status: 404 }];
    render(<BoardClient slug="builders-cafe" boardKey="wrong" />);
    await flush();
    expect(screen.getByText(/board link is not valid/i)).toBeTruthy();
  });

  test("stops asking when the page is closed", async () => {
    responses = [{ status: 200, body: board() }];
    const { unmount } = render(<BoardClient slug="builders-cafe" boardKey={KEY} />);
    await flush();
    unmount();
    const before = urls.length;
    await flush(10_000);
    expect(urls.length).toBe(before);
  });
});

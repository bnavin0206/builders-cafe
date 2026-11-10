import { describe, test, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.BOARD_KEY = "k".repeat(24);
});

const state = vi.hoisted(() => ({ event: null as any, throwErr: false }));
vi.mock("@/app/webhooks/mixologist-helper", () => ({
  getEvent: async () => {
    if (state.throwErr) throw new Error("sync down");
    return state.event;
  },
}));

import { GET } from "@/app/api/event/[slug]/menu-board/route";

const KEY = "k".repeat(24);
const call = (slug: string, key?: string) =>
  GET(new Request(`https://x.test/api/event/${slug}/menu-board${key ? `?key=${key}` : ""}`), {
    params: Promise.resolve({ slug }),
  });

beforeEach(() => {
  state.throwErr = false;
  state.event = {
    slug: "builders-cafe",
    selection: {
      items: [
        { title: "Latte", shortTitle: "Latte", description: "Hot", price: 80 },
        { title: "Mocha", shortTitle: "Mocha", description: "Hot", price: 80, available: false },
        { title: "Chicken Puff", shortTitle: "Chicken Puff", description: "Savoury", price: 100, veg: false },
      ],
      modifiers: [],
    },
    senders: ["whatsapp:+910000000000"],
  };
});

describe("menu board feed", () => {
  test("a wrong key, no key and a bad slug all answer 404", async () => {
    expect((await call("builders-cafe")).status).toBe(404);
    expect((await call("builders-cafe", "x".repeat(24))).status).toBe(404);
    expect((await call("../evil", KEY)).status).toBe(404);
  });

  test("an unknown event answers 404", async () => {
    state.event = null;
    expect((await call("builders-cafe", KEY)).status).toBe(404);
  });

  test("the menu: switched-off items left out, only the fields the board needs", async () => {
    const res = await call("builders-cafe", KEY);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      items: [
        { title: "Latte", price: 80, group: "Hot", veg: true },
        { title: "Chicken Puff", price: 100, group: "Savoury", veg: false },
      ],
    });
  });

  test("a failure answers 503 without details", async () => {
    state.throwErr = true;
    const res = await call("builders-cafe", KEY);
    expect(res.status).toBe(503);
    expect(await res.text()).toBe("Unavailable");
  });
});

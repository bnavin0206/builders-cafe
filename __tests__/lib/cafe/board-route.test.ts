import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const sync = vi.hoisted(() => ({
  items: [] as any[],
  fail: null as any,
  asked: [] as any[],
}));

vi.mock("@/lib/twilio", () => ({
  getSyncService: async () => ({
    syncLists: () => (name: string) => ({
      syncListItems: {
        list: async (opts: any) => {
          sync.asked.push({ name, opts });
          if (sync.fail) throw sync.fail;
          return sync.items;
        },
      },
    }),
  }),
}));

import { GET } from "@/app/api/event/[slug]/board/route";

const KEY = "k3y-for-the-tv-0123456789abcdef";
const original = process.env.BOARD_KEY;
const call = (slug: string, query = "") =>
  GET(new Request(`http://localhost/api/event/${slug}/board${query}`), {
    params: Promise.resolve({ slug }),
  });

beforeEach(() => {
  process.env.BOARD_KEY = KEY;
  sync.items = [];
  sync.fail = null;
  sync.asked.length = 0;
});
afterEach(() => {
  if (original === undefined) delete process.env.BOARD_KEY;
  else process.env.BOARD_KEY = original;
});

describe("order board feed", () => {
  test("a wrong or missing key gets 404 and never reads the orders", async () => {
    for (const q of ["", "?key=nope", `?key=${KEY}x`]) {
      expect((await call("builders-cafe", q)).status).toBe(404);
    }
    expect(sync.asked).toHaveLength(0);
  });

  test("with no BOARD_KEY the feed is off", async () => {
    delete process.env.BOARD_KEY;
    expect((await call("builders-cafe", `?key=${KEY}`)).status).toBe(404);
    expect((await call("builders-cafe", "?key=")).status).toBe(404);
  });

  test("an odd event name is refused", async () => {
    expect((await call("../secret", `?key=${KEY}`)).status).toBe(404);
    expect((await call("Builders Cafe", `?key=${KEY}`)).status).toBe(404);
    expect(sync.asked).toHaveLength(0);
  });

  test("with the key it returns the three groups, uncached, with nothing personal", async () => {
    const now = new Date();
    sync.items = [
      { index: 3, dateUpdated: now, data: { item: "Cafe Latte", status: "queued", name: "Asha", address: "whatsapp:+91****1" } },
      { index: 2, dateUpdated: now, data: { item: "Cappuccino", extras: "Espresso", status: "ready", paymentId: "pay_1" } },
      { index: 1, dateUpdated: now, data: { item: "Masala Chai", status: "delivered" } },
    ];
    const res = await call("builders-cafe", `?key=${KEY}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body.preparing.map((o: any) => [o.no, o.items])).toEqual([[3, "Cafe Latte"]]);
    expect(body.ready.map((o: any) => [o.no, o.items])).toEqual([[2, "Cappuccino + Espresso"]]);
    expect(body.delivered.map((o: any) => o.no)).toEqual([1]);
    const json = JSON.stringify(body);
    for (const leak of ["Asha", "whatsapp", "pay_1"]) expect(json).not.toContain(leak);
    expect(sync.asked[0]).toEqual({ name: "builders-cafe", opts: { limit: 100, order: "desc" } });
  });

  test("an event with no order list is 404; a Twilio failure is 503", async () => {
    sync.fail = { status: 404 };
    expect((await call("builders-cafe", `?key=${KEY}`)).status).toBe(404);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    sync.fail = new Error("down");
    expect((await call("builders-cafe", `?key=${KEY}`)).status).toBe(503);
    err.mockRestore();
  });
});

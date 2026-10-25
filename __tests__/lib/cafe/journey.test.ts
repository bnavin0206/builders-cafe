// End to end through the real webhook routes, with Twilio and Razorpay replaced
// by in-memory stand-ins. Covers sign-up, quiz, menu, payment and the queue.
import { describe, test, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_ATTENDEES_MAP = "Attendees";
  process.env.NEXT_PUBLIC_EVENTS_MAP = "Events";
  process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_test";
  process.env.RAZORPAY_KEY_ID = "rzp_test_x";
  process.env.RAZORPAY_KEY_SECRET = "secret";
});

const world = vi.hoisted(() => ({
  maps: new Map<string, Map<string, any>>(),
  lists: new Map<string, any[]>(),
  sent: [] as { to: string; body: string }[],
  links: [] as any[],
  cancelled: [] as string[],
}));

vi.mock("@/lib/twilio", () => {
  const map = (name: string) => {
    if (!world.maps.has(name)) world.maps.set(name, new Map());
    return world.maps.get(name)!;
  };
  return {
    createSyncMapItemIfNotExists: async (m: string, key: string, data: any = {}) => {
      const mm = map(m);
      if (!mm.has(key)) mm.set(key, { ...data });
      return { key, data: mm.get(key) };
    },
    updateOrCreateSyncMapItem: async (m: string, key: string, data: any = {}) => {
      const mm = map(m);
      mm.set(key, { ...(mm.get(key) ?? {}), ...data });
      return { key, data: mm.get(key) };
    },
    updateSyncMapItem: async (m: string, key: string, data: any = {}) => {
      const mm = map(m);
      mm.set(key, { ...(mm.get(key) ?? {}), ...data });
      return { key, data: mm.get(key) };
    },
    removeSyncMapItem: async (m: string, key: string) => void map(m).delete(key),
    findSyncMapItems: async (m: string, query: Record<string, unknown>) =>
      [...map(m).entries()]
        .filter(([, d]) => Object.entries(query).every(([k, v]) => d[k] === v))
        .map(([key, data]) => ({ key, data })),
    pushToSyncList: async (list: string, data: any) => {
      if (!world.lists.has(list)) world.lists.set(list, []);
      const items = world.lists.get(list)!;
      items.push(data);
      return { index: items.length };
    },
    sendMessage: (to: string, body: string) => void world.sent.push({ to, body }),
    createVerification: async () => ({ sid: "VE1" }),
    checkVerification: async (_sid: string, code: string) => ({ valid: code === "123456" }),
  };
});
vi.mock("@/scripts/fetchContentTemplates", () => ({
  getReadyToOrderMessage: vi.fn(),
  getEventRegistrationMessage: vi.fn(),
}));
vi.mock("@/lib/razorpay", async (orig) => ({
  ...(await orig<typeof import("@/lib/razorpay")>()),
  createPaymentLink: async (args: any) => {
    world.links.push(args);
    return { id: `plink_${world.links.length}`, url: `https://rzp.io/i/${world.links.length}` };
  },
  cancelPaymentLink: async (id: string) => void world.cancelled.push(id),
}));

import { POST as messaging } from "@/app/webhooks/messaging/route";
import { POST as razorpay } from "@/app/webhooks/razorpay/route";
import { quizBank } from "@/config/quiz-bank";
import { EventState } from "@/lib/utils";
import { modes } from "@/types";

const BOT = "whatsapp:+14155238886";
const attendees = () => world.maps.get("Attendees")!;

function seedEvent() {
  world.maps.set(
    "Events",
    new Map([
      [
        "builders-cafe",
        {
          name: "Builder's Cafe",
          slug: "builders-cafe",
          state: EventState.OPEN,
          leadCollection: "MANUAL",
          senders: [BOT],
          pickupLocation: "Builder's Cafe counter",
          maxOrders: 5,
          welcomeMessage: "",
          cancelledCount: 0,
          selection: {
            mode: modes.barista,
            modifiers: [],
            items: [
              { title: "Americano", shortTitle: "Americano", description: "", price: 0, category: "coffee" },
              { title: "Cold Brew", shortTitle: "Cold Brew", description: "", price: 120, category: "coffee" },
              { title: "Veg Puff", shortTitle: "Veg Puff", description: "", price: 0, category: "savoury" },
              { title: "Cheese Croissant", shortTitle: "Cheese Croissant", description: "", price: 90, category: "savoury" },
            ],
          },
        },
      ],
    ]),
  );
}

class Phone {
  constructor(readonly number: string) {}
  get key() {
    return this.number;
  }
  get record() {
    return attendees().get(this.number)!;
  }
  get inbox() {
    return world.sent.filter((m) => m.to === `whatsapp:${this.number}`).map((m) => m.body);
  }
  get last() {
    return this.inbox.at(-1) ?? "";
  }
  async say(text: string) {
    const body = new URLSearchParams({ From: `whatsapp:${this.number}`, To: BOT, Body: text });
    const res = await messaging(
      new Request("http://localhost/webhooks/messaging", {
        method: "POST",
        body,
        headers: { "content-type": "application/x-www-form-urlencoded" },
      }),
    );
    expect(res.status).toBeLessThan(300);
  }
  async signUp(name = "Asha Rao", email = "asha@example.com") {
    await this.say("Hi");
    await this.say(name);
    await this.say(email);
    await this.say("123456");
  }
  async passQuiz() {
    for (let i = 0; i < 3; i++) {
      const id = this.record.quizQuestions[this.record.quizIndex];
      const q = quizBank.find((x) => x.id === id)!;
      await this.say(String(q.correct + 1));
    }
  }
}

async function payWebhook(link: string, phone: string, payment: string, amount: number, signature?: string) {
  const body = JSON.stringify({
    event: "payment_link.paid",
    payload: {
      payment_link: { entity: { id: link, amount_paid: amount, notes: { phone } } },
      payment: { entity: { id: payment, amount } },
    },
  });
  const sig = signature ?? createHmac("sha256", "whsec_test").update(body).digest("hex");
  return razorpay(
    new Request("http://localhost/webhooks/razorpay", {
      method: "POST",
      body,
      headers: { "x-razorpay-signature": sig },
    }),
  );
}

beforeEach(() => {
  world.maps.clear();
  world.lists.clear();
  world.sent.length = 0;
  world.links.length = 0;
  world.cancelled.length = 0;
  seedEvent();
});

describe("full attendee journey through the webhooks", () => {
  test("sign-up saves the lead fields and starts the quiz", async () => {
    const p = new Phone("+919800000001");
    await p.signUp();
    expect(p.record).toMatchObject({
      fullName: "Asha Rao",
      email: "asha@example.com",
      event: "builders-cafe",
      completedSignup: true,
      foundInSegment: false,
      stage: "QUIZ",
    });
    expect(p.record.country).toBe("India");
    expect(p.inbox.some((m) => m.includes("Question 1 of 3"))).toBe(true);
  });

  test("a wrong code does not complete sign-up or start the quiz", async () => {
    const p = new Phone("+919800000002");
    await p.say("Hi");
    await p.say("Asha");
    await p.say("asha@example.com");
    await p.say("000000");
    expect(p.record.stage).toBe("VERIFYING");
    expect(p.record.completedSignup).toBeUndefined();
  });

  test("free coffee path: quiz, pick, no savoury, order queued, no payment", async () => {
    const p = new Phone("+919800000003");
    await p.signUp();
    await p.passQuiz();
    expect(p.last).toContain("1. Americano (FREE)");
    await p.say("1");
    await p.say("0");
    expect(world.links).toHaveLength(0);
    expect(world.lists.get("builders-cafe")).toEqual([
      expect.objectContaining({ item: "Americano", status: "queued", amountPaise: 0, address: expect.stringContaining("****") }),
    ]);
    expect(p.last).toBe("Order #1 confirmed: Americano. We'll message you when it's ready.");
    expect(p.record.stage).toBe("FIRST_ORDER");
  });

  test("paid path: nothing is queued until the payment webhook arrives", async () => {
    const p = new Phone("+919800000004");
    await p.signUp();
    await p.passQuiz();
    await p.say("2"); // Cold Brew
    await p.say("2"); // Cheese Croissant
    expect(world.links[0]).toMatchObject({ amountPaise: 21000, phone: "+919800000004", email: "asha@example.com" });
    expect(p.last).toContain("https://rzp.io/i/1");
    expect(world.lists.get("builders-cafe") ?? []).toHaveLength(0);

    const res = await payWebhook("plink_1", "+919800000004", "pay_9", 21000);
    expect(res.status).toBe(200);
    expect(world.lists.get("builders-cafe")).toEqual([
      expect.objectContaining({ item: "Cold Brew", modifiers: "Cheese Croissant", amountPaise: 21000, paymentId: "pay_9", status: "queued" }),
    ]);
    expect(p.last).toBe("Payment received. Order #1 confirmed: Cold Brew with Cheese Croissant. We'll message you when it's ready.");
    expect(p.record.stage).toBe("FIRST_ORDER");
  });

  test("a repeated webhook does not queue the order twice", async () => {
    const p = new Phone("+919800000005");
    await p.signUp();
    await p.passQuiz();
    await p.say("2");
    await p.say("0");
    await payWebhook("plink_1", "+919800000005", "pay_1", 12000);
    await payWebhook("plink_1", "+919800000005", "pay_1", 12000);
    expect(world.lists.get("builders-cafe")).toHaveLength(1);
  });

  test("a webhook with a bad signature changes nothing", async () => {
    const p = new Phone("+919800000006");
    await p.signUp();
    await p.passQuiz();
    await p.say("2");
    await p.say("0");
    const res = await payWebhook("plink_1", "+919800000006", "pay_1", 12000, "bad");
    expect(res.status).toBe(400);
    expect(world.lists.get("builders-cafe") ?? []).toHaveLength(0);
    expect(p.record.stage).toBe("AWAITING_PAYMENT");
  });

  test("failing the quiz twice leaves only paid items", async () => {
    const p = new Phone("+919800000007");
    await p.signUp();
    for (let i = 0; i < 6; i++) {
      const id = p.record.quizQuestions[p.record.quizIndex];
      const q = quizBank.find((x) => x.id === id)!;
      await p.say(String(((q.correct + 1) % 3) + 1));
    }
    expect(p.record.quizResult).toBe("failed");
    expect(p.last).toContain("1. Cold Brew (₹120)");
    expect(p.last).not.toContain("Americano");
  });

  test("waiting for payment, a message repeats the link; CANCEL cancels it", async () => {
    const p = new Phone("+919800000008");
    await p.signUp();
    await p.passQuiz();
    await p.say("2");
    await p.say("0");
    await p.say("hello?");
    expect(p.last).toContain("https://rzp.io/i/1");
    await p.say("cancel");
    expect(world.cancelled).toEqual(["plink_1"]);
    expect(p.record.pendingOrder).toBeNull();
    expect(p.record.stage).toBe("VERIFIED_USER");
  });

  test("a closed event stops orders", async () => {
    const p = new Phone("+919800000009");
    await p.signUp();
    world.maps.get("Events")!.get("builders-cafe").state = EventState.CLOSED;
    const before = p.inbox.length;
    await p.say("1");
    expect(p.inbox.length).toBe(before + 1);
    expect(p.last).not.toContain("Order #");
  });
});

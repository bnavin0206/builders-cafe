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
vi.mock("@/app/webhooks/messaging/segment", () => ({
  checkSegmentTraits: async (email?: string) => ({ foundInSegment: email === "seen@example.com" }),
}));
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
            modifiers: ["No sugar", "Less sugar"],
            items: [
              { title: "Americano", shortTitle: "Americano", description: "", price: 0, category: "coffee" },
              { title: "Cold Brew", shortTitle: "Cold Brew", description: "", price: 120, category: "coffee" },
              { title: "Veg Puff", shortTitle: "Veg Puff", description: "", price: 60, category: "savoury" },
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

  test("someone found in Segment is blocked and never reaches the quiz", async () => {
    const p = new Phone("+919800000010");
    await p.signUp("Ravi", "seen@example.com");
    expect(p.record).toMatchObject({ stage: "BLOCKED", foundInSegment: true, completedSignup: true });
    expect(p.last).toContain("already taken part");
    expect(p.inbox.some((m) => m.includes("Question 1"))).toBe(false);
    await p.say("menu");
    expect(p.last).toContain("already taken part");
    expect(world.lists.get("builders-cafe") ?? []).toHaveLength(0);
    expect(world.links).toHaveLength(0);
  });

  test("winner: free coffee, add-on, no extra: queued with no payment", async () => {
    const p = new Phone("+919800000003");
    await p.signUp();
    await p.passQuiz();
    expect(p.last).toContain("1. Americano (FREE)");
    expect(p.last).not.toContain("Cold Brew");
    await p.say("1");
    expect(p.last).toContain("1. No sugar");
    await p.say("2");
    expect(p.last).toContain("Veg Puff");
    await p.say("0");
    expect(world.links).toHaveLength(0);
    expect(world.lists.get("builders-cafe")).toEqual([
      expect.objectContaining({
        item: "Americano",
        modifiers: "Less sugar",
        status: "queued",
        amountPaise: 0,
        address: expect.stringContaining("****"),
      }),
    ]);
    expect(p.last).toBe("Order #1 confirmed: Americano (Less sugar). We'll message you when it's ready.");
    expect(p.record.stage).toBe("FIRST_ORDER");
    expect(p.record.freeCoffeesTaken).toBe(1);
  });

  test("winner with a paid snack: nothing is queued until payment arrives", async () => {
    const p = new Phone("+919800000004");
    await p.signUp();
    await p.passQuiz();
    await p.say("1");
    await p.say("0");
    await p.say("2"); // Veg Puff is the second paid item after Cold Brew
    expect(world.links[0]).toMatchObject({ amountPaise: 6000, phone: "+919800000004", email: "asha@example.com" });
    expect(p.last).toContain("https://rzp.io/i/1");
    expect(world.lists.get("builders-cafe") ?? []).toHaveLength(0);

    const res = await payWebhook("plink_1", "+919800000004", "pay_9", 6000);
    expect(res.status).toBe(200);
    expect(world.lists.get("builders-cafe")).toEqual([
      expect.objectContaining({ item: "Americano", extras: "Veg Puff", amountPaise: 6000, paymentId: "pay_9", status: "queued" }),
    ]);
    expect(p.last).toBe("Payment received. Order #1 confirmed: Americano with Veg Puff. We'll message you when it's ready.");
    expect(p.record.freeCoffeesTaken).toBe(1);
  });

  test("a wrong answer: paid menu only, then pay", async () => {
    const p = new Phone("+919800000007");
    await p.signUp();
    for (let i = 0; i < 3; i++) {
      const id = p.record.quizQuestions[p.record.quizIndex];
      const q = quizBank.find((x) => x.id === id)!;
      await p.say(String(((q.correct + 1) % 3) + 1));
    }
    expect(p.record.quizResult).toBe("failed");
    expect(p.last).toContain("1. Cold Brew (₹120)");
    expect(p.last).not.toContain("Americano");
    await p.say("1");
    await p.say("0");
    await p.say("0");
    expect(world.links[0]).toMatchObject({ amountPaise: 12000 });
  });

  test("a repeated webhook does not queue the order twice", async () => {
    const p = new Phone("+919800000005");
    await p.signUp();
    await p.passQuiz();
    await p.say("1");
    await p.say("0");
    await p.say("1"); // Cold Brew as the paid extra
    await payWebhook("plink_1", "+919800000005", "pay_1", 12000);
    await payWebhook("plink_1", "+919800000005", "pay_1", 12000);
    expect(world.lists.get("builders-cafe")).toHaveLength(1);
  });

  test("a webhook with a bad signature changes nothing", async () => {
    const p = new Phone("+919800000006");
    await p.signUp();
    await p.passQuiz();
    await p.say("1");
    await p.say("0");
    await p.say("1");
    const res = await payWebhook("plink_1", "+919800000006", "pay_1", 12000, "bad");
    expect(res.status).toBe(400);
    expect(world.lists.get("builders-cafe") ?? []).toHaveLength(0);
    expect(p.record.stage).toBe("AWAITING_PAYMENT");
  });

  test("while waiting a message repeats the link and cancel does nothing", async () => {
    const p = new Phone("+919800000008");
    await p.signUp();
    await p.passQuiz();
    await p.say("1");
    await p.say("0");
    await p.say("1");
    await p.say("hello?");
    expect(p.last).toContain("https://rzp.io/i/1");
    await p.say("cancel");
    expect(world.cancelled).toEqual([]);
    expect(p.record.stage).toBe("AWAITING_PAYMENT");
  });

  test("scanning the QR code again after the quiz goes to the paid menu", async () => {
    const p = new Phone("+919800000011");
    await p.signUp();
    await p.passQuiz();
    await p.say("1");
    await p.say("0");
    await p.say("0"); // free Americano ordered
    await p.say("Send this message to order a coffee at Builder's Cafe ☕️");
    expect(p.last).toContain("already taken part in the quiz");
    expect(p.last).toContain("1. Cold Brew (₹120)");
    expect(p.last).not.toContain("Americano");
    expect(p.record.stage).toBe("PICK_COFFEE");
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

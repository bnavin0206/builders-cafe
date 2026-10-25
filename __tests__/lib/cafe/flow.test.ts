import { describe, test, expect } from "vitest";
import { cafeRules } from "@/config/cafe-rules";
import { quizBank } from "@/config/quiz-bank";
import {
  begin,
  handleCafeMessage,
  placeOrder,
  type CafeDeps,
  type PaymentLinkRequest,
} from "@/lib/cafe/flow";
import { EventState } from "@/lib/utils";
import { modes, Stages } from "@/types";
import type { AttendeeRecord, Event, Order } from "@/types";

const PHONE = "+919800000001";

const event = (over: Partial<Event> = {}): Event => ({
  name: "Builder's Cafe",
  slug: "builders-cafe",
  state: EventState.OPEN,
  leadCollection: "MANUAL",
  senders: [],
  pickupLocation: "Builder's Cafe counter",
  maxOrders: 5,
  welcomeMessage: "",
  selection: {
    mode: modes.barista,
    modifiers: [],
    items: [
      { title: "Americano", shortTitle: "Americano", description: "", price: 0, category: "coffee" },
      { title: "Latte", shortTitle: "Latte", description: "", price: 0, category: "coffee" },
      { title: "Cold Brew", shortTitle: "Cold Brew", description: "", price: 120, category: "coffee" },
      { title: "Veg Puff", shortTitle: "Veg Puff", description: "", price: 0, category: "savoury" },
      { title: "Cheese Croissant", shortTitle: "Cheese Croissant", description: "", price: 90, category: "savoury" },
    ],
  },
  ...over,
});

/** A phone conversation against in-memory fakes. */
class Sim {
  record: AttendeeRecord = {
    stage: Stages.VERIFIED_USER,
    fullName: "Asha",
    email: "asha@example.com",
  };
  sent: string[] = [];
  orders: Order[] = [];
  links: PaymentLinkRequest[] = [];
  cancelled: string[] = [];
  failLink = false;
  clock = new Date("2026-11-12T10:00:00Z");
  evt: Event;
  rules = { ...cafeRules };
  private seed = 42;

  constructor(evt: Event = event()) {
    this.evt = evt;
  }

  deps: CafeDeps = {
    now: () => this.clock,
    rng: () => {
      this.seed = (this.seed * 16807) % 2147483647;
      return (this.seed - 1) / 2147483646;
    },
    save: async (_phone, patch) => {
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete (this.record as any)[k];
        else (this.record as any)[k] = v;
      }
    },
    send: (text) => {
      this.sent.push(text);
    },
    addOrder: async (order) => {
      this.orders.push(order);
      return 100 + this.orders.length;
    },
    createPaymentLink: async (req) => {
      if (this.failLink) throw new Error("razorpay down");
      this.links.push(req);
      return { id: `plink_${this.links.length}`, url: `https://rzp.io/i/test${this.links.length}` };
    },
    cancelPaymentLink: async (id) => {
      this.cancelled.push(id);
    },
  };

  private input(message: string) {
    return { message, event: this.evt, phone: PHONE, record: this.record };
  }

  async start() {
    await begin(this.input(""), this.deps, this.rules);
  }

  async say(message: string) {
    await handleCafeMessage(this.input(message), this.deps, this.rules);
  }

  get last() {
    return this.sent[this.sent.length - 1] ?? "";
  }

  /** Reply to the current quiz question correctly or wrongly. */
  async answer(correct: boolean) {
    const id = this.record.quizQuestions![this.record.quizIndex!]!;
    const q = quizBank.find((x) => x.id === id)!;
    const option = correct ? q.correct : (q.correct + 1) % 3;
    await this.say(String(option + 1));
  }

  async passQuiz() {
    await this.start();
    for (let i = 0; i < this.rules.quizQuestionCount; i++) await this.answer(true);
  }
}

describe("quiz", () => {
  test("starts with an intro and question 1 of 3", async () => {
    const s = new Sim();
    await s.start();
    expect(s.record.stage).toBe(Stages.QUIZ);
    expect(s.record.quizQuestions).toHaveLength(3);
    expect(new Set(s.record.quizQuestions).size).toBe(3);
    expect(s.sent[0]).toContain("Builder's Cafe");
    expect(s.last).toContain("Question 1 of 3");
  });

  test("the question message does not reveal which option is right", async () => {
    const s = new Sim();
    await s.start();
    const q = quizBank.find((x) => x.id === s.record.quizQuestions![0])!;
    const shown = s.last.split("\n").filter((l) => /^\d\. /.test(l));
    expect(shown).toEqual(q.options.map((o, i) => `${i + 1}. ${o}`));
    expect(s.last).not.toMatch(/answer is|✓|✔/i);
  });

  test("an invalid reply repeats the question without moving on", async () => {
    const s = new Sim();
    await s.start();
    await s.say("banana");
    expect(s.record.quizIndex).toBe(0);
    expect(s.last).toContain("Question 1 of 3");
  });

  test("all correct opens the full coffee menu", async () => {
    const s = new Sim();
    await s.passQuiz();
    expect(s.record.stage).toBe(Stages.PICK_COFFEE);
    expect(s.record.quizPassedDate).toBe("2026-11-12");
    expect(s.last).toContain("1. Americano (FREE)");
    expect(s.last).toContain("3. Cold Brew (₹120)");
  });

  test("a wrong answer gives one retry with new questions", async () => {
    const s = new Sim();
    await s.start();
    const first = [...s.record.quizQuestions!];
    await s.answer(false);
    await s.answer(true);
    await s.answer(true);
    expect(s.record.stage).toBe(Stages.QUIZ);
    expect(s.sent.some((m) => m.includes("1 more try"))).toBe(true);
    expect(s.record.quizAttempts).toBe(2);
    expect(s.record.quizQuestions!.some((id) => first.includes(id))).toBe(false);
  });

  test("after the last failed attempt only paid items are offered", async () => {
    const s = new Sim();
    await s.start();
    for (let i = 0; i < 3; i++) await s.answer(false);
    for (let i = 0; i < 3; i++) await s.answer(false);
    expect(s.record.quizResult).toBe("failed");
    expect(s.record.stage).toBe(Stages.PICK_COFFEE);
    expect(s.last).toContain("1. Cold Brew (₹120)");
    expect(s.last).not.toContain("Americano");
  });

  test("ends politely when failed attempts may not buy paid items", async () => {
    const s = new Sim();
    s.rules = { ...cafeRules, failedQuizCanBuyPaidItems: false } as any;
    await s.start();
    for (let i = 0; i < 6; i++) await s.answer(false);
    expect(s.record.stage).toBe(Stages.QUIZ_FAILED);
    expect(s.last).toContain("not enough");
  });

  test("a lower pass mark can be configured", async () => {
    const s = new Sim();
    s.rules = { ...cafeRules, passMark: 2 } as any;
    await s.start();
    await s.answer(true);
    await s.answer(true);
    await s.answer(false);
    expect(s.record.stage).toBe(Stages.PICK_COFFEE);
  });

  test("a failed attempt is remembered for the rest of the day", async () => {
    const s = new Sim();
    await s.start();
    for (let i = 0; i < 6; i++) await s.answer(false);
    s.record.stage = Stages.VERIFIED_USER;
    await s.say("hi");
    expect(s.record.stage).toBe(Stages.PICK_COFFEE);
    expect(s.last).not.toContain("Americano");
  });
});

describe("free orders", () => {
  test("free coffee and no savoury is placed straight away", async () => {
    const s = new Sim();
    await s.passQuiz();
    await s.say("1");
    expect(s.last).toContain("Add a savoury?");
    await s.say("0");
    expect(s.links).toHaveLength(0);
    expect(s.orders).toEqual([
      expect.objectContaining({ item: "Americano", status: "queued", amountPaise: 0, channel: "whatsapp" }),
    ]);
    expect(s.orders[0]!.modifiers).toBeUndefined();
    expect(s.last).toMatch(/Order #101 confirmed: Americano\. We'll message you when it's ready\./);
    expect(s.record.stage).toBe(Stages.FIRST_ORDER);
    expect(s.record.freeUsedDate).toBe("2026-11-12");
    expect(s.record.lastOrderNumber).toBe(101);
  });

  test("free coffee and free savoury", async () => {
    const s = new Sim();
    await s.passQuiz();
    await s.say("2");
    await s.say("1");
    expect(s.orders[0]).toMatchObject({ item: "Latte", modifiers: "Veg Puff", amountPaise: 0 });
    expect(s.last).toContain("Latte with Veg Puff");
  });

  test("replies by name work as well as numbers", async () => {
    const s = new Sim();
    await s.passQuiz();
    await s.say("latte");
    await s.say("veg puff");
    expect(s.orders[0]).toMatchObject({ item: "Latte", modifiers: "Veg Puff" });
  });

  test("an unknown choice repeats the menu", async () => {
    const s = new Sim();
    await s.passQuiz();
    await s.say("9");
    expect(s.record.stage).toBe(Stages.PICK_COFFEE);
    expect(s.last).toContain("not on the menu");
    expect(s.last).toContain("1. Americano");
    await s.say("1");
    await s.say("7");
    expect(s.record.stage).toBe(Stages.PICK_SAVOURY);
    expect(s.last).toContain("not on the menu");
  });

  test("the savoury can be required by rule", async () => {
    const s = new Sim();
    s.rules = { ...cafeRules, savouryOptional: false } as any;
    await s.passQuiz();
    await s.say("1");
    expect(s.last).not.toContain("0 for none");
    await s.say("0");
    expect(s.record.stage).toBe(Stages.PICK_SAVOURY);
    expect(s.orders).toHaveLength(0);
  });
});

describe("paid orders", () => {
  test("a priced coffee creates a payment link and waits", async () => {
    const s = new Sim();
    await s.passQuiz();
    await s.say("3");
    await s.say("0");
    expect(s.orders).toHaveLength(0);
    expect(s.links).toHaveLength(1);
    expect(s.links[0]).toMatchObject({ amountPaise: 12000, phone: PHONE, name: "Asha", email: "asha@example.com" });
    expect(s.links[0]!.expiresAt.toISOString()).toBe("2026-11-12T10:10:00.000Z");
    expect(s.record.stage).toBe(Stages.AWAITING_PAYMENT);
    expect(s.record.pendingOrder).toMatchObject({ coffee: "Cold Brew", amountPaise: 12000, linkId: "plink_1" });
    expect(s.last).toContain("https://rzp.io/i/test1");
    expect(s.last).toContain("10 minutes");
    expect(s.sent.some((m) => m.includes("Total: ₹120"))).toBe(true);
  });

  test("a free coffee with a priced savoury charges only for the savoury", async () => {
    const s = new Sim();
    await s.passQuiz();
    await s.say("1");
    await s.say("2");
    expect(s.links[0]!.amountPaise).toBe(9000);
    expect(s.record.pendingOrder).toMatchObject({ coffee: "Americano", savoury: "Cheese Croissant" });
  });

  test("a priced coffee with a priced savoury adds both", async () => {
    const s = new Sim();
    await s.passQuiz();
    await s.say("3");
    await s.say("2");
    expect(s.links[0]!.amountPaise).toBe(21000);
  });

  test("a payment link failure ends cleanly and nothing is queued", async () => {
    const s = new Sim();
    s.failLink = true;
    await s.passQuiz();
    await s.say("3");
    await s.say("0");
    expect(s.orders).toHaveLength(0);
    expect(s.record.stage).toBe(Stages.VERIFIED_USER);
    expect(s.record.pendingOrder).toBeUndefined();
    expect(s.last).toContain("could not create your payment link");
  });

  test("while waiting, a message repeats the link", async () => {
    const s = new Sim();
    await s.passQuiz();
    await s.say("3");
    await s.say("0");
    await s.say("did it work?");
    expect(s.last).toContain("https://rzp.io/i/test1");
    expect(s.record.stage).toBe(Stages.AWAITING_PAYMENT);
  });

  test("CANCEL clears the pending order", async () => {
    const s = new Sim();
    await s.passQuiz();
    await s.say("3");
    await s.say("0");
    await s.say("cancel");
    expect(s.record.stage).toBe(Stages.VERIFIED_USER);
    expect(s.record.pendingOrder).toBeUndefined();
    expect(s.last).toContain("cancelled");
    expect(s.cancelled).toEqual(["plink_1"]);
  });

  test("an expired link is cleared on the next message", async () => {
    const s = new Sim();
    await s.passQuiz();
    await s.say("3");
    await s.say("0");
    s.clock = new Date("2026-11-12T10:11:00Z");
    await s.say("hello?");
    expect(s.record.stage).toBe(Stages.VERIFIED_USER);
    expect(s.last).toContain("expired");
    expect(s.cancelled).toEqual(["plink_1"]);
  });

  test("placeOrder after payment queues a paid order with the payment id", async () => {
    const s = new Sim();
    await s.passQuiz();
    await s.say("3");
    await s.say("0");
    const e = s.evt;
    const cold = e.selection.items.find((i) => i.title === "Cold Brew")!;
    const n = await placeOrder(
      { event: e, phone: PHONE, record: s.record },
      s.deps,
      { coffee: cold, amountPaise: 12000, paymentId: "pay_ABC" },
    );
    expect(n).toBe(101);
    expect(s.orders[0]).toMatchObject({ item: "Cold Brew", amountPaise: 12000, paymentId: "pay_ABC", status: "queued" });
    expect(s.record.stage).toBe(Stages.FIRST_ORDER);
    expect(s.record.pendingOrder).toBeUndefined();
    expect(s.record.freeUsedDate).toBeUndefined();
  });
});

describe("limits", () => {
  test("only one free coffee per day, then paid items only", async () => {
    const s = new Sim();
    await s.passQuiz();
    await s.say("1");
    await s.say("0");
    expect(s.orders).toHaveLength(1);
    await s.say("menu");
    expect(s.record.stage).toBe(Stages.PICK_COFFEE);
    expect(s.last).toContain("already had your free coffee");
    expect(s.last).toContain("1. Cold Brew (₹120)");
    expect(s.last).not.toContain("Americano");
  });

  test("the free coffee is available again the next day", async () => {
    const s = new Sim();
    await s.passQuiz();
    await s.say("1");
    await s.say("0");
    s.clock = new Date("2026-11-13T10:00:00Z");
    await s.say("hi");
    expect(s.record.stage).toBe(Stages.QUIZ);
    expect(s.record.quizAttempts).toBe(1);
  });

  test("the daily order limit is enforced", async () => {
    const s = new Sim(event({ maxOrders: 1 }));
    await s.passQuiz();
    await s.say("1");
    await s.say("0");
    await s.say("menu");
    await s.say("1");
    await s.say("0");
    expect(s.orders).toHaveLength(1);
    expect(s.last).toContain("daily limit of 1");
  });

  test("unlimited numbers skip the daily limit", async () => {
    const s = new Sim(event({ maxOrders: 1 }));
    await s.passQuiz();
    await s.say("1");
    await s.say("0");
    await s.say("menu");
    await handleCafeMessage(
      { message: "1", event: s.evt, phone: PHONE, record: s.record, unlimited: true },
      s.deps,
      s.rules,
    );
    await handleCafeMessage(
      { message: "0", event: s.evt, phone: PHONE, record: s.record, unlimited: true },
      s.deps,
      s.rules,
    );
    expect(s.last).not.toContain("daily limit");
    expect(s.links).toHaveLength(1);
  });
});

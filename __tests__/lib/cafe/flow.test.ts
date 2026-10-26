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

const event = (modifiers = ["No sugar", "Less sugar"]): Event => ({
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
    modifiers,
    items: [
      { title: "Americano", shortTitle: "Americano", description: "", price: 0, category: "coffee" },
      { title: "Latte", shortTitle: "Latte", description: "", price: 0, category: "coffee" },
      { title: "Cold Brew", shortTitle: "Cold Brew", description: "", price: 120, category: "coffee" },
      { title: "Veg Puff", shortTitle: "Veg Puff", description: "", price: 60, category: "savoury" },
      { title: "Cheese Croissant", shortTitle: "Cheese Croissant", description: "", price: 90, category: "savoury" },
    ],
  },
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
  rules: any = { ...cafeRules };
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

  async failQuiz() {
    await this.start();
    for (let i = 0; i < this.rules.quizQuestionCount; i++) await this.answer(false);
  }

  /** Simulates Razorpay confirming the pending payment. */
  async pay(paymentId = "pay_1") {
    const p = this.record.pendingOrder!;
    const coffee = this.evt.selection.items.find((i) => i.title === p.coffee)!;
    const extra = p.extra ? this.evt.selection.items.find((i) => i.title === p.extra) : undefined;
    return placeOrder({ event: this.evt, phone: PHONE, record: this.record }, this.deps, {
      coffee,
      addOns: p.addOns,
      extra,
      amountPaise: p.amountPaise,
      paymentId,
    });
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

  test("all correct opens only the free coffees", async () => {
    const s = new Sim();
    await s.passQuiz();
    expect(s.record.stage).toBe(Stages.PICK_COFFEE);
    expect(s.record.quizResult).toBe("passed");
    expect(s.last).toContain("1. Americano (FREE)");
    expect(s.last).toContain("2. Latte (FREE)");
    expect(s.last).not.toContain("Cold Brew");
  });

  test("one wrong answer leaves only the paid menu, with no retry", async () => {
    const s = new Sim();
    await s.start();
    await s.answer(false);
    await s.answer(true);
    await s.answer(true);
    expect(s.record.quizResult).toBe("failed");
    expect(s.record.stage).toBe(Stages.PICK_COFFEE);
    expect(s.last).toContain("1. Cold Brew (₹120)");
    expect(s.last).not.toContain("Americano");
  });

  test("a failed quiz stays failed on later visits", async () => {
    const s = new Sim();
    await s.failQuiz();
    s.record.stage = Stages.VERIFIED_USER;
    s.clock = new Date("2026-11-20T10:00:00Z");
    await s.say("hi");
    expect(s.record.stage).toBe(Stages.PICK_COFFEE);
    expect(s.last).toContain("Cold Brew");
    expect(s.last).not.toContain("Americano");
    expect(s.record.quizAttempts).toBe(1);
  });

  test("a retry can be switched on and shows new questions", async () => {
    const s = new Sim();
    s.rules = { ...cafeRules, maxQuizAttempts: 2 };
    await s.start();
    const first = [...s.record.quizQuestions!];
    await s.answer(false);
    await s.answer(true);
    await s.answer(true);
    expect(s.record.stage).toBe(Stages.QUIZ);
    expect(s.sent.some((m) => m.includes("1 more try"))).toBe(true);
    expect(s.record.quizQuestions!.some((id) => first.includes(id))).toBe(false);
  });

  test("a lower pass mark can be configured", async () => {
    const s = new Sim();
    s.rules = { ...cafeRules, passMark: 2 };
    await s.start();
    await s.answer(true);
    await s.answer(true);
    await s.answer(false);
    expect(s.record.quizResult).toBe("passed");
  });

  test("ends politely when a failed quiz may not buy paid items", async () => {
    const s = new Sim();
    s.rules = { ...cafeRules, failedQuizCanBuyPaidItems: false };
    await s.failQuiz();
    expect(s.record.stage).toBe(Stages.QUIZ_FAILED);
    expect(s.last).toContain("not enough");
    await s.say("menu");
    expect(s.last).toContain("not enough");
  });
});

describe("free coffee with add-ons", () => {
  test("free coffee, no add-ons, no extra: placed at once", async () => {
    const s = new Sim();
    await s.passQuiz();
    await s.say("1");
    expect(s.record.stage).toBe(Stages.PICK_ADDONS);
    expect(s.last).toContain("1. No sugar");
    await s.say("0");
    expect(s.record.stage).toBe(Stages.PICK_EXTRA);
    expect(s.last).toContain("1. Cold Brew (₹120)");
    expect(s.last).toContain("2. Veg Puff (₹60)");
    await s.say("0");
    expect(s.links).toHaveLength(0);
    expect(s.orders).toEqual([
      expect.objectContaining({ item: "Americano", status: "queued", amountPaise: 0, channel: "whatsapp" }),
    ]);
    expect(s.orders[0]!.modifiers).toBeUndefined();
    expect(s.orders[0]!.extras).toBeUndefined();
    expect(s.last).toBe("Order #101 confirmed: Americano. We'll message you when it's ready.");
    expect(s.record.stage).toBe(Stages.FIRST_ORDER);
    expect(s.record.freeCoffeesTaken).toBe(1);
    expect(s.record.lastOrderNumber).toBe(101);
  });

  test("add-ons are saved on the order", async () => {
    const s = new Sim();
    await s.passQuiz();
    await s.say("2"); // Latte
    await s.say("2"); // Less sugar
    await s.say("0");
    expect(s.orders[0]).toMatchObject({ item: "Latte", modifiers: "Less sugar" });
    expect(s.last).toContain("Latte (Less sugar)");
  });

  test("several add-ons can be picked in one reply", async () => {
    const s = new Sim();
    await s.passQuiz();
    await s.say("1");
    await s.say("1, 2");
    await s.say("0");
    expect(s.orders[0]!.modifiers).toBe("No sugar, Less sugar");
  });

  test("an invalid add-on reply repeats the list", async () => {
    const s = new Sim();
    await s.passQuiz();
    await s.say("1");
    await s.say("9");
    expect(s.record.stage).toBe(Stages.PICK_ADDONS);
    expect(s.last).toContain("1. No sugar");
    await s.say("sugar please");
    expect(s.record.stage).toBe(Stages.PICK_ADDONS);
  });

  test("with no add-ons configured the step is skipped", async () => {
    const s = new Sim(event([]));
    await s.passQuiz();
    await s.say("1");
    expect(s.record.stage).toBe(Stages.PICK_EXTRA);
  });

  test("replies by name work as well as numbers", async () => {
    const s = new Sim();
    await s.passQuiz();
    await s.say("latte");
    await s.say("0");
    await s.say("none");
    expect(s.orders[0]).toMatchObject({ item: "Latte" });
  });

  test("an unknown coffee or extra repeats the menu", async () => {
    const s = new Sim();
    await s.passQuiz();
    await s.say("9");
    expect(s.record.stage).toBe(Stages.PICK_COFFEE);
    expect(s.last).toContain("not on the menu");
    await s.say("1");
    await s.say("0");
    await s.say("7");
    expect(s.record.stage).toBe(Stages.PICK_EXTRA);
    expect(s.last).toContain("not on the menu");
  });

  test("the extra step is skipped when no extras are allowed", async () => {
    const s = new Sim();
    s.rules = { ...cafeRules, maxExtraItems: 0 };
    await s.passQuiz();
    await s.say("1");
    await s.say("0");
    expect(s.orders).toHaveLength(1);
  });
});

describe("paid options", () => {
  test("a winner adds a paid snack: the total is the snack only", async () => {
    const s = new Sim();
    await s.passQuiz();
    await s.say("1");
    await s.say("0");
    await s.say("2"); // Veg Puff
    expect(s.orders).toHaveLength(0);
    expect(s.links).toHaveLength(1);
    expect(s.links[0]).toMatchObject({ amountPaise: 6000, phone: PHONE, name: "Asha", email: "asha@example.com" });
    expect(s.links[0]!.expiresAt.toISOString()).toBe("2026-11-12T10:02:00.000Z");
    expect(s.record.stage).toBe(Stages.AWAITING_PAYMENT);
    expect(s.record.pendingOrder).toMatchObject({ coffee: "Americano", extra: "Veg Puff", amountPaise: 6000, linkId: "plink_1" });
    expect(s.last).toContain("https://rzp.io/i/test1");
    expect(s.last).toContain("2 minutes");
    expect(s.sent.some((m) => m.includes("Total: ₹60"))).toBe(true);
  });

  test("a winner can add a paid drink as the extra", async () => {
    const s = new Sim();
    await s.passQuiz();
    await s.say("1");
    await s.say("0");
    await s.say("1"); // Cold Brew
    expect(s.links[0]!.amountPaise).toBe(12000);
  });

  test("after payment the free coffee counts as taken", async () => {
    const s = new Sim();
    await s.passQuiz();
    await s.say("1");
    await s.say("0");
    await s.say("2");
    const n = await s.pay();
    expect(n).toBe(101);
    expect(s.orders[0]).toMatchObject({ item: "Americano", extras: "Veg Puff", amountPaise: 6000, paymentId: "pay_1" });
    expect(s.record.freeCoffeesTaken).toBe(1);
    expect(s.record.pendingOrder).toBeUndefined();
    expect(s.record.stage).toBe(Stages.FIRST_ORDER);
  });

  test("an unpaid winner keeps the free coffee until the order is placed", async () => {
    const s = new Sim();
    await s.passQuiz();
    await s.say("1");
    await s.say("0");
    await s.say("2");
    expect(s.record.freeCoffeesTaken).toBeUndefined();
  });

  test("a non-winner picks a priced drink, add-ons and a priced snack", async () => {
    const s = new Sim();
    await s.failQuiz();
    await s.say("1"); // Cold Brew
    await s.say("1"); // No sugar
    expect(s.last).toContain("1. Veg Puff (₹60)");
    expect(s.last).not.toContain("Cold Brew");
    await s.say("2"); // Cheese Croissant
    expect(s.links[0]!.amountPaise).toBe(21000);
    expect(s.record.pendingOrder).toMatchObject({ coffee: "Cold Brew", addOns: ["No sugar"], extra: "Cheese Croissant" });
  });

  test("a non-winner with no extra pays for the drink only", async () => {
    const s = new Sim();
    await s.failQuiz();
    await s.say("1");
    await s.say("0");
    await s.say("0");
    expect(s.links[0]!.amountPaise).toBe(12000);
  });

  test("a payment link failure ends cleanly and nothing is queued", async () => {
    const s = new Sim();
    s.failLink = true;
    await s.failQuiz();
    await s.say("1");
    await s.say("0");
    await s.say("0");
    expect(s.orders).toHaveLength(0);
    expect(s.record.stage).toBe(Stages.VERIFIED_USER);
    expect(s.record.pendingOrder).toBeUndefined();
    expect(s.last).toContain("could not create your payment link");
  });
});

describe("waiting for payment", () => {
  async function waiting() {
    const s = new Sim();
    await s.failQuiz();
    await s.say("1");
    await s.say("0");
    await s.say("0");
    return s;
  }

  test("a message repeats the link", async () => {
    const s = await waiting();
    await s.say("did it work?");
    expect(s.last).toContain("https://rzp.io/i/test1");
    expect(s.record.stage).toBe(Stages.AWAITING_PAYMENT);
  });

  test("there is no cancel: the word does nothing", async () => {
    const s = await waiting();
    await s.say("cancel");
    expect(s.record.stage).toBe(Stages.AWAITING_PAYMENT);
    expect(s.cancelled).toEqual([]);
    expect(s.last).toContain("https://rzp.io/i/test1");
  });

  test("after 2 minutes the link expires and is cancelled", async () => {
    const s = await waiting();
    s.clock = new Date("2026-11-12T10:02:01Z");
    await s.say("hello?");
    expect(s.record.stage).toBe(Stages.VERIFIED_USER);
    expect(s.record.pendingOrder).toBeUndefined();
    expect(s.cancelled).toEqual(["plink_1"]);
    expect(s.last).toContain("expired");
  });

  test("after expiry MENU starts the order again", async () => {
    const s = await waiting();
    s.clock = new Date("2026-11-12T10:05:00Z");
    await s.say("hello?");
    await s.say("menu");
    expect(s.record.stage).toBe(Stages.PICK_COFFEE);
    expect(s.last).toContain("Cold Brew");
  });
});

describe("limits", () => {
  async function tookFreeCoffee() {
    const s = new Sim();
    await s.passQuiz();
    await s.say("1");
    await s.say("0");
    await s.say("0");
    return s;
  }

  test("after the free coffee only the paid menu is offered", async () => {
    const s = await tookFreeCoffee();
    expect(s.orders).toHaveLength(1);
    await s.say("menu");
    expect(s.record.stage).toBe(Stages.PICK_COFFEE);
    expect(s.last).toContain("already had your free coffee");
    expect(s.last).toContain("1. Cold Brew (₹120)");
    expect(s.last).not.toContain("Americano");
  });

  test("the free coffee does not come back on a later day", async () => {
    const s = await tookFreeCoffee();
    s.clock = new Date("2026-11-25T10:00:00Z");
    await s.say("menu");
    expect(s.last).toContain("already had your free coffee");
    expect(s.last).not.toContain("Americano");
    expect(s.record.quizAttempts).toBe(1);
  });

  test("paid orders have no limit", async () => {
    const s = await tookFreeCoffee();
    for (let round = 0; round < 3; round++) {
      await s.say("menu");
      await s.say("1");
      await s.say("0");
      await s.say("0");
      await s.pay(`pay_${round}`);
    }
    expect(s.orders).toHaveLength(4);
    expect(s.links).toHaveLength(3);
  });

  test("a stale free menu cannot take a second free coffee", async () => {
    const s = await tookFreeCoffee();
    s.record.stage = Stages.PICK_COFFEE;
    s.record.menuMode = "free";
    await s.say("1");
    expect(s.orders).toHaveLength(1);
    expect(s.last).toContain("already had your free coffee");
  });

  test("an attendee who has just ordered is not shown the menu again", async () => {
    const s = await tookFreeCoffee();
    await s.say("thanks!");
    expect(s.last).toBe("Reply MENU to order again.");
    expect(s.record.stage).toBe(Stages.FIRST_ORDER);
  });

  test("a blocked attendee only ever gets the blocked message", async () => {
    const s = new Sim();
    s.record.stage = Stages.BLOCKED;
    await s.say("menu");
    expect(s.last).toContain("already taken part");
    expect(s.orders).toHaveLength(0);
    expect(s.links).toHaveLength(0);
  });
});

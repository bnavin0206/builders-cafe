import { describe, test, expect } from "vitest";
import { cafeRules } from "@/config/cafe-rules";
import menus from "@/config/menus";
import { quizBank } from "@/config/quiz-bank";
import {
  begin,
  enter,
  hasTakenPart,
  handleCafeMessage,
  placeOrder,
  type CafeDeps,
  type PaymentLinkRequest,
} from "@/lib/cafe/flow";
import { EventState } from "@/lib/utils";
import { modes, Stages } from "@/types";
import type { AttendeeRecord, Event, ListRow, Order } from "@/types";

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
  lists: { prompt: string; rows: ListRow[] }[] = [];
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

  /** Lets the flow send WhatsApp list pickers; `ok` false simulates a failed send. */
  enableLists(ok = true) {
    this.deps.sendList = async (prompt, rows) => {
      if (ok) this.lists.push({ prompt, rows });
      return ok;
    };
  }

  get lastList() {
    return this.lists[this.lists.length - 1];
  }

  private input(message: string) {
    return { message, event: this.evt, phone: PHONE, record: this.record };
  }

  async start() {
    await begin(this.input(""), this.deps, this.rules);
  }

  /** Sign-up just finished, or the QR code was scanned again. */
  async scan() {
    await enter(this.input(""), this.deps, this.rules);
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
    const option = correct ? q.correct : (q.correct + 1) % q.options.length;
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
    const find = (t: string) => this.evt.selection.items.find((i) => i.title === t)!;
    return placeOrder({ event: this.evt, phone: PHONE, record: this.record }, this.deps, {
      coffee: p.coffee ? find(p.coffee) : undefined,
      addOns: p.addOns,
      items: (p.items ?? []).map(find),
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

  test("the attendee's name is saved on the order", async () => {
    const s = new Sim();
    await s.passQuiz();
    await s.say("2"); // Latte
    await s.say("0");
    await s.say("0");
    expect(s.orders[0]).toMatchObject({ item: "Latte", name: "Asha" });
  });

  test("an order is still queued when the record has no name", async () => {
    const s = new Sim();
    delete s.record.fullName;
    await s.passQuiz();
    await s.say("2");
    await s.say("0");
    await s.say("0");
    expect(s.orders).toHaveLength(1);
    expect(s.orders[0]!.name).toBeUndefined();
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
    s.rules = { ...cafeRules, maxItemsPerOrder: 1 };
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
    expect(s.record.pendingOrder).toMatchObject({ coffee: "Americano", items: ["Veg Puff"], amountPaise: 6000, linkId: "plink_1" });
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

  test("a non-winner's paid menu lists every priced item, drinks and snacks", async () => {
    const s = new Sim();
    await s.failQuiz();
    expect(s.record.stage).toBe(Stages.PICK_COFFEE);
    expect(s.last).toContain("1. Cold Brew (₹120)");
    expect(s.last).toContain("2. Veg Puff (₹60)");
    expect(s.last).toContain("3. Cheese Croissant (₹90)");
    expect(s.last).not.toContain("Americano");
  });

  test("a non-winner picks a drink and add-ons, then pays", async () => {
    const s = new Sim();
    await s.failQuiz();
    await s.say("1"); // Cold Brew
    expect(s.record.stage).toBe(Stages.PICK_ADDONS);
    await s.say("1"); // No sugar
    expect(s.links[0]!.amountPaise).toBe(12000);
    expect(s.record.pendingOrder).toMatchObject({ items: ["Cold Brew"], addOns: ["No sugar"] });
    expect(s.record.pendingOrder!.coffee).toBeUndefined();
  });

  test("a non-winner with no add-ons pays for the drink only", async () => {
    const s = new Sim();
    await s.failQuiz();
    await s.say("1");
    await s.say("0");
    expect(s.links[0]!.amountPaise).toBe(12000);
  });

  test("a payment link failure ends cleanly and nothing is queued", async () => {
    const s = new Sim();
    s.failLink = true;
    await s.failQuiz();
    await s.say("1");
    await s.say("0");
    expect(s.orders).toHaveLength(0);
    expect(s.record.stage).toBe(Stages.VERIFIED_USER);
    expect(s.record.pendingOrder).toBeUndefined();
    expect(s.record.cartItems).toBeUndefined();
    expect(s.last).toContain("could not create your payment link");
  });
});

describe("several items on the paid menus", () => {
  test("several numbers in one reply: drinks and snacks together", async () => {
    const s = new Sim();
    await s.failQuiz();
    await s.say("1, 2, 3");
    expect(s.record.stage).toBe(Stages.PICK_ADDONS); // a drink is in the order
    await s.say("0");
    expect(s.links[0]!.amountPaise).toBe(27000); // 120 + 60 + 90
    expect(s.record.pendingOrder!.items).toEqual(["Cold Brew", "Veg Puff", "Cheese Croissant"]);
    expect(s.sent.some((m) => m.includes("Total: ₹270"))).toBe(true);
  });

  test("a repeated number is a quantity", async () => {
    const s = new Sim();
    await s.failQuiz();
    await s.say("1 1");
    await s.say("0");
    expect(s.links[0]!.amountPaise).toBe(24000);
    expect(s.record.pendingOrder!.items).toEqual(["Cold Brew", "Cold Brew"]);
    expect(s.sent.some((m) => m.includes("2 × Cold Brew (₹240)"))).toBe(true);
    expect(s.links[0]!.description).toBe("Cold Brew ×2");
  });

  test("a snacks-only order skips the add-ons", async () => {
    const s = new Sim();
    await s.failQuiz();
    await s.say("2, 3");
    expect(s.record.stage).toBe(Stages.AWAITING_PAYMENT);
    expect(s.links[0]!.amountPaise).toBe(15000);
    expect(s.sent.some((m) => m.startsWith("Add-ons for"))).toBe(false);
  });

  test("a paid order needs at least one item", async () => {
    const s = new Sim();
    await s.failQuiz();
    await s.say("0");
    expect(s.record.stage).toBe(Stages.PICK_COFFEE);
    expect(s.last).toContain("Please pick at least one item");
    expect(s.links).toHaveLength(0);
  });

  test("an invalid number in a list of numbers repeats the menu", async () => {
    const s = new Sim();
    await s.failQuiz();
    await s.say("1, 9");
    expect(s.record.stage).toBe(Stages.PICK_COFFEE);
    expect(s.last).toContain("not on the menu");
  });

  test("the order size is capped", async () => {
    const s = new Sim();
    s.rules = { ...cafeRules, maxItemsPerOrder: 3 };
    await s.failQuiz();
    await s.say("1 1 1 1");
    expect(s.sent.some((m) => m.includes("up to 3 items"))).toBe(true);
    expect(s.record.stage).toBe(Stages.PICK_COFFEE);
    expect(s.links).toHaveLength(0);
    await s.say("1 1 1");
    await s.say("0");
    expect(s.links[0]!.amountPaise).toBe(36000);
  });

  test("a winner can add several paid extras to the free coffee", async () => {
    const s = new Sim();
    await s.passQuiz();
    await s.say("1"); // Americano, free
    await s.say("0"); // no add-ons
    await s.say("2, 3"); // Veg Puff and Cheese Croissant
    expect(s.links[0]!.amountPaise).toBe(15000);
    expect(s.record.pendingOrder).toMatchObject({
      coffee: "Americano",
      items: ["Veg Puff", "Cheese Croissant"],
    });
    await s.pay();
    expect(s.orders[0]).toMatchObject({
      item: "Americano",
      extras: "Veg Puff, Cheese Croissant",
      amountPaise: 15000,
    });
    expect(s.record.freeCoffeesTaken).toBe(1);
  });

  test("a paid-only order is queued as its items and leaves the free coffee alone", async () => {
    const s = new Sim();
    await s.failQuiz();
    await s.say("1 1 2");
    await s.say("1");
    await s.pay();
    expect(s.orders[0]).toMatchObject({
      item: "Cold Brew ×2, Veg Puff",
      modifiers: "No sugar",
      amountPaise: 30000,
      name: "Asha",
    });
    expect(s.orders[0]!.extras).toBeUndefined();
    expect(s.record.freeCoffeesTaken).toBeUndefined();
  });
});

describe("waiting for payment", () => {
  async function waiting() {
    const s = new Sim();
    await s.failQuiz();
    await s.say("1");
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

describe("after sign-up or a re-scan", () => {
  test("someone new starts the quiz", async () => {
    const s = new Sim();
    await s.scan();
    expect(s.record.stage).toBe(Stages.QUIZ);
    expect(s.last).toContain("Question 1 of 3");
  });

  test("someone who failed the quiz goes to the paid menu, not back to the quiz", async () => {
    const s = new Sim();
    await s.failQuiz();
    s.record.stage = Stages.VERIFIED_USER;
    await s.scan();
    expect(s.record.stage).toBe(Stages.PICK_COFFEE);
    expect(s.sent.at(-1)).toContain("already taken part in the quiz");
    expect(s.last).toContain("1. Cold Brew (₹120)");
    expect(s.last).not.toContain("Americano");
    expect(s.record.quizAttempts).toBe(1);
  });

  test("someone who already ordered goes to the paid menu", async () => {
    const s = new Sim();
    await s.passQuiz();
    await s.say("1");
    await s.say("0");
    await s.say("0");
    await s.scan();
    expect(s.last).toContain("already taken part in the quiz");
    expect(s.last).toContain("Cold Brew");
    expect(s.last).not.toContain("Americano");
  });

  test("a winner who has not taken the free coffee also goes to the paid menu", async () => {
    const s = new Sim();
    await s.passQuiz();
    s.record.stage = Stages.VERIFIED_USER;
    await s.scan();
    expect(s.last).toContain("Cold Brew");
    expect(s.last).not.toContain("Americano");
    // They can still ask for the menu to get the free coffee they won.
    await s.say("menu");
    expect(s.last).toContain("Americano (FREE)");
  });

  test("that rule can be switched off", async () => {
    const s = new Sim();
    s.rules = { ...cafeRules, rescanAfterQuizGoesToPaid: false };
    await s.passQuiz();
    s.record.stage = Stages.VERIFIED_USER;
    await s.scan();
    expect(s.last).toContain("Americano (FREE)");
  });

  test("a re-scan in the middle of the quiz repeats the question without penalty", async () => {
    const s = new Sim();
    await s.start();
    await s.answer(true);
    const index = s.record.quizIndex;
    await s.scan();
    expect(s.record.stage).toBe(Stages.QUIZ);
    expect(s.record.quizResult).toBeUndefined();
    expect(s.record.quizIndex).toBe(index);
    expect(s.last).toContain("Question 2 of 3");
  });

  test("a re-scan while waiting for payment repeats the link", async () => {
    const s = new Sim();
    await s.failQuiz();
    await s.say("1");
    await s.say("0");
    await s.say("0");
    await s.scan();
    expect(s.record.stage).toBe(Stages.AWAITING_PAYMENT);
    expect(s.last).toContain("https://rzp.io/i/test1");
    expect(s.links).toHaveLength(1);
  });

  test("a blocked attendee stays blocked", async () => {
    const s = new Sim();
    s.record.stage = Stages.BLOCKED;
    await s.scan();
    expect(s.last).toContain("already taken part");
    expect(s.record.stage).toBe(Stages.BLOCKED);
  });
});

describe("mobile number check", () => {
  test("a number with no quiz history has not taken part", () => {
    expect(hasTakenPart({})).toBe(false);
    expect(hasTakenPart({ stage: Stages.VERIFIED_USER, fullName: "Asha" })).toBe(false);
  });

  test("a quiz result or an attempt means the number has taken part", () => {
    expect(hasTakenPart({ quizResult: "passed" })).toBe(true);
    expect(hasTakenPart({ quizResult: "failed" })).toBe(true);
    expect(hasTakenPart({ quizAttempts: 1 })).toBe(true);
  });

  test("a cleared (null) result does not count", () => {
    expect(hasTakenPart({ quizResult: null as any, quizAttempts: 0 })).toBe(false);
  });
});

describe("list picker", () => {
  test("a winner gets the free coffees as a list, with numbers as ids", async () => {
    const s = new Sim();
    s.enableLists();
    await s.passQuiz();
    expect(s.record.stage).toBe(Stages.PICK_COFFEE);
    expect(s.lastList!.prompt).toContain("Your coffee is free");
    expect(s.lastList!.rows).toEqual([
      { id: "1", title: "Americano", description: "FREE" },
      { id: "2", title: "Latte", description: "FREE" },
    ]);
    // Nothing is sent as text for the menu.
    expect(s.last).not.toContain("1. Americano");
  });

  test("the coffee is chosen by the row id, or by its title", async () => {
    const a = new Sim();
    a.enableLists();
    await a.passQuiz();
    await a.say("2");
    expect(a.record.cartCoffee).toBe("Latte");

    const b = new Sim();
    b.enableLists();
    await b.passQuiz();
    await b.say("Americano");
    expect(b.record.cartCoffee).toBe("Americano");
  });

  test("add-ons are a list; one at a time, then Done", async () => {
    const s = new Sim(event(["No sugar", "Less sugar", "Extra shot"]));
    s.enableLists();
    await s.passQuiz();
    await s.say("1"); // Americano
    expect(s.record.stage).toBe(Stages.PICK_ADDONS);
    expect(s.lastList!.rows.map((r) => r.title)).toEqual([
      "No sugar",
      "Less sugar",
      "Extra shot",
      "No add-ons",
    ]);

    await s.say("3"); // Extra shot
    expect(s.record.stage).toBe(Stages.PICK_ADDONS);
    expect(s.record.cartAddOns).toEqual(["Extra shot"]);
    expect(s.lastList!.prompt).toContain("Added Extra shot");
    expect(s.lastList!.rows.map((r) => [r.id, r.title])).toEqual([
      ["1", "No sugar"],
      ["2", "Less sugar"],
      ["0", "Done"],
    ]);

    await s.say("Less sugar"); // by name
    expect(s.record.cartAddOns).toEqual(["Extra shot", "Less sugar"]);

    await s.say("0"); // Done
    expect(s.record.stage).toBe(Stages.PICK_EXTRA);
    expect(s.record.cartAddOns).toEqual(["Extra shot", "Less sugar"]);
  });

  test("picking the last remaining add-on moves on to the extra", async () => {
    const s = new Sim(event(["No sugar", "Less sugar"]));
    s.enableLists();
    await s.passQuiz();
    await s.say("1");
    await s.say("1");
    await s.say("2");
    expect(s.record.stage).toBe(Stages.PICK_EXTRA);
    expect(s.record.cartAddOns).toEqual(["No sugar", "Less sugar"]);
  });

  test("an add-on already picked is not added twice", async () => {
    const s = new Sim(event(["No sugar", "Less sugar", "Extra shot"]));
    s.enableLists();
    await s.passQuiz();
    await s.say("1");
    await s.say("1");
    await s.say("1");
    expect(s.record.cartAddOns).toEqual(["No sugar"]);
    expect(s.record.stage).toBe(Stages.PICK_ADDONS);
  });

  test("several numbers in one reply still work and move on", async () => {
    const s = new Sim(event(["No sugar", "Less sugar", "Extra shot"]));
    s.enableLists();
    await s.passQuiz();
    await s.say("1");
    await s.say("1 3");
    expect(s.record.cartAddOns).toEqual(["No sugar", "Extra shot"]);
    expect(s.record.stage).toBe(Stages.PICK_EXTRA);
  });

  test("the extra is a list ending with No thanks", async () => {
    const s = new Sim();
    s.enableLists();
    await s.passQuiz();
    await s.say("1");
    await s.say("0");
    expect(s.record.stage).toBe(Stages.PICK_EXTRA);
    const rows = s.lastList!.rows;
    expect(rows[rows.length - 1]).toEqual({ id: "0", title: "No thanks", description: "Place my order as is" });
    expect(rows[0]).toEqual({ id: "1", title: "Cold Brew", description: "₹120" });
    await s.say("No thanks");
    expect(s.orders).toHaveLength(1);
  });

  test("a full paid order works through lists", async () => {
    const s = new Sim();
    s.enableLists();
    await s.passQuiz();
    await s.say("2"); // Latte
    await s.say("0"); // no add-ons
    await s.say("2"); // Veg Puff
    expect(s.record.stage).toBe(Stages.PICK_EXTRA); // a list: tap more or Done
    await s.say("0"); // Done
    expect(s.links).toHaveLength(1);
    expect(s.links[0]!.amountPaise).toBe(6000);
    expect(s.record.stage).toBe(Stages.AWAITING_PAYMENT);
  });

  test("the paid menu is a list with no Done row until something is picked", async () => {
    const s = new Sim();
    s.enableLists();
    await s.failQuiz();
    expect(s.lastList!.rows.map((r) => r.title)).toEqual(["Cold Brew", "Veg Puff", "Cheese Croissant"]);
    expect(s.lastList!.rows.some((r) => r.id === "0")).toBe(false);
    await s.say("0");
    expect(s.lastList!.prompt).toContain("at least one item");
  });

  test("paid items are tapped one at a time, repeats allowed, then Done", async () => {
    const s = new Sim();
    s.enableLists();
    await s.failQuiz();
    await s.say("1"); // Cold Brew
    expect(s.record.stage).toBe(Stages.PICK_COFFEE);
    expect(s.record.cartItems).toEqual(["Cold Brew"]);
    expect(s.lastList!.prompt).toContain("Added Cold Brew. So far: Cold Brew.");
    expect(s.lastList!.rows.at(-1)).toMatchObject({ id: "0", title: "Done" });

    await s.say("Cold Brew"); // the same again, by name
    expect(s.record.cartItems).toEqual(["Cold Brew", "Cold Brew"]);
    expect(s.lastList!.prompt).toContain("So far: Cold Brew ×2.");

    await s.say("2"); // Veg Puff
    expect(s.lastList!.prompt).toContain("So far: Cold Brew ×2, Veg Puff.");

    await s.say("0"); // Done: a drink is in the order, so add-ons come next
    expect(s.record.stage).toBe(Stages.PICK_ADDONS);
    await s.say("0"); // no add-ons
    expect(s.links[0]!.amountPaise).toBe(30000);
    expect(s.record.pendingOrder!.items).toEqual(["Cold Brew", "Cold Brew", "Veg Puff"]);
  });

  test("a list order stops by itself at the size limit", async () => {
    const s = new Sim();
    s.rules = { ...cafeRules, maxItemsPerOrder: 2 };
    s.enableLists();
    await s.failQuiz();
    await s.say("2");
    await s.say("2"); // second item reaches the limit
    expect(s.record.stage).toBe(Stages.AWAITING_PAYMENT);
    expect(s.links[0]!.amountPaise).toBe(12000);
  });

  test("the winner's extras: No thanks first, then Done after the first pick", async () => {
    const s = new Sim();
    s.enableLists();
    await s.passQuiz();
    await s.say("1");
    await s.say("0");
    expect(s.lastList!.rows.at(-1)).toMatchObject({ id: "0", title: "No thanks" });
    await s.say("3"); // Cheese Croissant
    expect(s.lastList!.rows.at(-1)).toMatchObject({ id: "0", title: "Done" });
    await s.say("2"); // Veg Puff
    await s.say("0");
    expect(s.links[0]!.amountPaise).toBe(15000);
  });

  test("a wrong reply shows the list again", async () => {
    const s = new Sim();
    s.enableLists();
    await s.passQuiz();
    const before = s.lists.length;
    await s.say("banana");
    expect(s.lists.length).toBe(before + 1);
    expect(s.lastList!.prompt).toContain("not on the menu");
    expect(s.record.stage).toBe(Stages.PICK_COFFEE);
  });

  test("falls back to the text menu when the list cannot be sent", async () => {
    const s = new Sim();
    s.enableLists(false);
    await s.passQuiz();
    expect(s.lists).toHaveLength(0);
    expect(s.last).toContain("1. Americano (FREE)");
    expect(s.last).toContain("2. Latte (FREE)");
    await s.say("1");
    expect(s.record.stage).toBe(Stages.PICK_ADDONS);
    expect(s.last).toContain("1. No sugar");
    await s.say("1");
    expect(s.record.stage).toBe(Stages.PICK_EXTRA);
  });

  test("a menu with more than 10 rows is sent as text", async () => {
    const big = event();
    big.selection.items = Array.from({ length: 11 }, (_, i) => ({
      title: `Drink ${i + 1}`,
      shortTitle: `Drink ${i + 1}`,
      description: "",
      price: 0,
      category: "coffee" as const,
    }));
    const s = new Sim(big);
    s.enableLists();
    await s.passQuiz();
    expect(s.lists).toHaveLength(0);
    expect(s.last).toContain("11. Drink 11 (FREE)");
  });

  test("long titles and descriptions are cut to WhatsApp's limits", async () => {
    const e = event();
    e.selection.items[0] = {
      title: "Extra Large Hazelnut Caramel Cappuccino",
      shortTitle: "XL",
      description: "x".repeat(100),
      price: 0,
      category: "coffee",
    };
    const s = new Sim(e);
    s.enableLists();
    await s.passQuiz();
    const row = s.lastList!.rows[0]!;
    expect(row.title.length).toBeLessThanOrEqual(24);
    expect(row.title.endsWith("…")).toBe(true);
    expect(row.description.length).toBeLessThanOrEqual(72);
    expect(row.id).toBe("1");
  });

  test("text mode is unchanged: a single add-on number moves straight on", async () => {
    const s = new Sim();
    await s.passQuiz();
    await s.say("1");
    await s.say("1");
    expect(s.record.stage).toBe(Stages.PICK_EXTRA);
    expect(s.lists).toHaveLength(0);
  });
});

describe("the real menu", () => {
  const realEvent = (): Event => {
    const e = event();
    e.selection = {
      mode: modes.barista,
      items: menus.barista.items,
      modifiers: menus.barista.modifiers ?? [],
    };
    return e;
  };

  test("a winner picks from four free drinks", async () => {
    const s = new Sim(realEvent());
    s.enableLists();
    await s.passQuiz();
    expect(s.lastList!.rows.map((r) => r.title)).toEqual([
      "Cappuccino",
      "Cafe Latte",
      "Masala Chai",
      "Tapri Coffee",
    ]);
    expect(s.lastList!.rows[0]).toMatchObject({ description: "FREE · Hot" });
  });

  test("the paid list opens on the Hot page, with a row for Cold", async () => {
    const s = new Sim(realEvent());
    s.enableLists();
    await s.failQuiz();
    const { rows, prompt } = s.lastList!;
    expect(rows.map((r) => r.title)).toEqual([
      "Espresso",
      "Cappuccino",
      "Cafe Latte",
      "Tapri Coffee",
      "Masala Chai",
      "Hot Chocolate",
      "Cold ▸",
    ]);
    expect(rows[0]).toMatchObject({ id: "1", description: "₹80 · Hot" });
    expect(rows.at(-1)).toMatchObject({ id: "page:1", description: "Show the Cold items" });
    expect(rows.some((r) => r.id === "0")).toBe(false); // nothing picked yet
    expect(prompt).toContain("Showing: Hot");
    expect(rows.every((r) => r.title.length <= 24 && r.description.length <= 72)).toBe(true);
  });

  test("tapping Cold shows the cold drinks and adds nothing", async () => {
    const s = new Sim(realEvent());
    s.enableLists();
    await s.failQuiz();
    await s.say("page:1");
    expect(s.record.cartItems ?? []).toEqual([]);
    expect(s.record.cartGroup).toBe("Cold");
    expect(s.lastList!.rows.map((r) => r.title)).toEqual([
      "Cold Coffee",
      "Frappe Mocha",
      "Cold Chocolate",
      "Cold Americano",
      "Hot ▸",
    ]);
    expect(s.lastList!.prompt).toContain("Showing: Cold");
    expect(s.record.stage).toBe(Stages.PICK_COFFEE);
  });

  test("items from both pages go into one order, and the list has a Done row", async () => {
    const s = new Sim(realEvent());
    s.enableLists();
    await s.failQuiz();
    await s.say("page:1");
    await s.say("4"); // Cold Coffee: stays on the Cold page
    expect(s.record.cartItems).toEqual(["Cold Coffee"]);
    expect(s.record.cartGroup).toBe("Cold");
    expect(s.lastList!.prompt).toContain("So far: Cold Coffee");
    expect(s.lastList!.prompt).toContain("Showing: Cold");
    expect(s.lastList!.rows.at(-1)).toMatchObject({ id: "0", title: "Done" });
    expect(s.lastList!.rows.at(-2)).toMatchObject({ id: "page:0", title: "Hot ▸" });
    expect(s.lastList!.rows).toHaveLength(6);

    await s.say("page:0"); // back to Hot, the cart is kept
    expect(s.lastList!.prompt).toContain("So far: Cold Coffee");
    expect(s.lastList!.rows.at(-1)).toMatchObject({ id: "0", title: "Done" });
    await s.say("1"); // Espresso
    expect(s.record.cartItems).toEqual(["Cold Coffee", "Espresso"]);
    await s.say("1"); // another Espresso
    expect(s.lastList!.prompt).toContain("So far: Cold Coffee, Espresso ×2");

    await s.say("0"); // Done
    expect(s.record.stage).toBe(Stages.PICK_ADDONS);
    await s.say("0"); // no add-ons
    expect(s.links[0]!.amountPaise).toBe(26000); // 100 + 80 + 80
    expect(s.record.cartGroup).toBeUndefined();
  });

  test("a group can also be switched by typing its name", async () => {
    const s = new Sim(realEvent());
    s.enableLists();
    await s.failQuiz();
    await s.say("cold");
    expect(s.record.cartGroup).toBe("Cold");
    expect(s.lastList!.rows.map((r) => r.title)).toContain("Cold Americano");
  });

  test("a row that arrives as its title works: Cold ▸ switches the page", async () => {
    const s = new Sim(realEvent());
    s.enableLists();
    await s.failQuiz();
    await s.say("Cold ▸");
    expect(s.record.cartGroup).toBe("Cold");
    await s.say("Frappe Mocha"); // an item by title
    expect(s.record.cartItems).toEqual(["Frappe Mocha"]);
    await s.say("Hot ▸");
    expect(s.record.cartGroup).toBe("Hot");
    await s.say("Done");
    expect(s.record.stage).toBe(Stages.PICK_ADDONS);
  });

  test("typing done still finishes, and a typed list of numbers works", async () => {
    const s = new Sim(realEvent());
    s.enableLists();
    await s.failQuiz();
    await s.say("1, 4"); // Espresso and Cold Coffee in one reply
    expect(s.record.stage).toBe(Stages.PICK_ADDONS);
    await s.say("0");
    expect(s.links[0]!.amountPaise).toBe(18000);

    const t = new Sim(realEvent());
    t.enableLists();
    await t.failQuiz();
    await t.say("2");
    await t.say("done");
    expect(t.record.stage).toBe(Stages.PICK_ADDONS);
  });

  test("a winner's extras list is paged too, with No thanks then Done", async () => {
    const s = new Sim(realEvent());
    s.enableLists();
    await s.passQuiz();
    await s.say("1"); // free Cappuccino
    await s.say("0"); // no add-ons
    expect(s.lastList!.rows.at(-1)).toMatchObject({ id: "0", title: "No thanks" });
    expect(s.lastList!.rows.at(-2)).toMatchObject({ id: "page:1", title: "Cold ▸" });
    expect(s.lastList!.prompt).toContain("Showing: Hot");
    await s.say("page:1");
    expect(s.lastList!.rows.map((r) => r.title)).toEqual([
      "Cold Coffee",
      "Frappe Mocha",
      "Cold Chocolate",
      "Cold Americano",
      "Hot ▸",
      "No thanks",
    ]);
  });

  test("a winner picks a cold extra from the second page and finishes with Done", async () => {
    const s = new Sim(realEvent());
    s.enableLists();
    await s.passQuiz();
    await s.say("1");
    await s.say("0");
    await s.say("page:1");
    await s.say("9"); // Cold Chocolate
    expect(s.record.cartItems).toEqual(["Cold Chocolate"]);
    expect(s.lastList!.rows.at(-1)).toMatchObject({ id: "0", title: "Done" });
    await s.say("0");
    expect(s.links[0]!.amountPaise).toBe(10000);
    expect(s.record.pendingOrder).toMatchObject({ coffee: "Cappuccino", items: ["Cold Chocolate"] });
  });

  test("text mode has no pages: the whole menu is numbered", async () => {
    const s = new Sim(realEvent());
    await s.failQuiz();
    expect(s.last).toContain("1. Espresso (₹80)");
    expect(s.last).toContain("10. Cold Americano (₹100)");
    await s.say("cold"); // not a page in text mode
    expect(s.last).toContain("not on the menu");
  });

  test("a long menu that cannot be split falls back to typing DONE", async () => {
    const big = event();
    big.selection.items = Array.from({ length: 11 }, (_, i) => ({
      title: `Drink ${i + 1}`,
      shortTitle: `Drink ${i + 1}`,
      description: "",
      price: 50,
      category: "coffee" as const,
    }));
    const s = new Sim(big);
    s.enableLists();
    await s.failQuiz();
    expect(s.lists).toHaveLength(0); // 11 rows do not fit: plain text menu
    expect(s.last).toContain("11. Drink 11 (₹50)");
    await s.say("3");
    expect(s.record.stage).toBe(Stages.PICK_ADDONS);
  });

  test("the same drink free and paid: each is found by its own price", async () => {
    const s = new Sim(realEvent());
    await s.passQuiz();
    await s.say("1"); // free Cappuccino
    await s.say("0"); // no add-ons
    await s.say("2"); // paid Cappuccino
    expect(s.links[0]!.amountPaise).toBe(8000); // only the paid one is charged
    expect(s.record.pendingOrder).toMatchObject({ coffee: "Cappuccino", items: ["Cappuccino"] });
    await s.pay();
    expect(s.orders[0]).toMatchObject({ item: "Cappuccino", extras: "Cappuccino", amountPaise: 8000 });
    expect(s.record.freeCoffeesTaken).toBe(1);
  });

  test("hot and cold drinks add up", async () => {
    const s = new Sim(realEvent());
    await s.failQuiz();
    await s.say("1, 4, 4"); // Espresso, Cold Coffee x2
    await s.say("0");
    expect(s.links[0]!.amountPaise).toBe(28000); // 80 + 100 + 100
  });
});

import { cafeRules, type CafeRules } from "@/config/cafe-rules";
import { quizBank, type QuizQuestion } from "@/config/quiz-bank";
import type {
  AttendeeRecord,
  Event,
  MenuItem,
  Order,
  PendingOrder,
} from "@/types";
import { Stages } from "@/types";
import {
  formatMenu,
  formatPrice,
  formatTotal,
  isFree,
  itemsIn,
  parseItem,
  totalPaise,
} from "./pricing";
import {
  formatQuestion,
  isCorrect,
  parseOption,
  pickQuestions,
  questionById,
} from "./quiz";
import { msg } from "./messages";

export interface PaymentLinkRequest {
  amountPaise: number;
  referenceId: string;
  phone: string;
  name?: string;
  email?: string;
  expiresAt: Date;
  description: string;
}

/** Everything the flow needs from the outside world. Faked in tests. */
export interface CafeDeps {
  now(): Date;
  rng(): number;
  /** Merge `patch` into the attendee record; undefined values remove a key. */
  save(phone: string, patch: Partial<AttendeeRecord>): Promise<void>;
  send(text: string): void;
  /** Adds the order to the barista queue and returns its order number. */
  addOrder(order: Order): Promise<number>;
  createPaymentLink(
    req: PaymentLinkRequest,
  ): Promise<{ id: string; url: string }>;
}

export interface CafeInput {
  message: string;
  event: Event;
  phone: string;
  record: AttendeeRecord;
  unlimited?: boolean;
}

const today = (deps: CafeDeps) => deps.now().toISOString().split("T")[0]!;

const isReset = (m: string) => /^(menu|start|order|hi|hello)$/i.test(m.trim());

/**
 * Entry point for every message from an attendee who has finished sign-up.
 * Decides what the message means from the saved stage and answers it.
 */
export async function handleCafeMessage(
  input: CafeInput,
  deps: CafeDeps,
  rules: CafeRules = cafeRules,
  bank: QuizQuestion[] = quizBank,
): Promise<void> {
  const stage = input.record.stage;
  switch (stage) {
    case Stages.QUIZ:
      return answerQuiz(input, deps, rules, bank);
    case Stages.PICK_COFFEE:
      return pickCoffee(input, deps, rules);
    case Stages.PICK_SAVOURY:
      return pickSavoury(input, deps, rules);
    case Stages.AWAITING_PAYMENT:
      return awaitingPayment(input, deps);
    default:
      return begin(input, deps, rules, bank);
  }
}

/**
 * Start a visit: quiz first, unless the attendee already passed it today.
 * Called after sign-up, and for any message from an idle attendee.
 */
export async function begin(
  input: CafeInput,
  deps: CafeDeps,
  rules: CafeRules = cafeRules,
  bank: QuizQuestion[] = quizBank,
): Promise<void> {
  const { record, phone } = input;
  const day = today(deps);

  if (record.quizPassedDate === day) {
    const mode = record.freeUsedDate === day ? "free-used" : "free";
    return showCoffeeMenu(input, deps, mode === "free" ? "free" : "paid", {
      intro: mode === "free-used" ? msg.freeUsed : msg.coffeePrompt,
    });
  }
  if (record.quizResult === "failed" && record.quizAttemptDate === day) {
    return showCoffeeMenu(input, deps, "paid", { intro: msg.quizFailedPaid });
  }

  const attempts = record.quizAttemptDate === day ? (record.quizAttempts ?? 0) : 0;
  const seen = record.quizAttemptDate === day ? (record.quizSeen ?? []) : [];
  const ids = pickQuestions(bank, rules.quizQuestionCount, seen, deps.rng);
  await deps.save(phone, {
    stage: Stages.QUIZ,
    quizQuestions: ids,
    quizSeen: [...seen, ...ids],
    quizIndex: 0,
    quizCorrect: 0,
    quizAttempts: attempts + 1,
    quizAttemptDate: day,
    quizResult: undefined,
  });
  deps.send(msg.quizIntro(rules.quizQuestionCount));
  deps.send(formatQuestion(questionById(bank, ids[0]!)!, 1, ids.length));
}

async function answerQuiz(
  input: CafeInput,
  deps: CafeDeps,
  rules: CafeRules,
  bank: QuizQuestion[],
) {
  const { record, phone, message } = input;
  const ids = record.quizQuestions ?? [];
  const index = record.quizIndex ?? 0;
  const question = questionById(bank, ids[index] ?? "");
  if (!question) return begin({ ...input, record: { ...record, stage: undefined } }, deps, rules, bank);

  const option = parseOption(message, question);
  if (option === null) {
    deps.send(msg.quizNeedsAnswer);
    deps.send(formatQuestion(question, index + 1, ids.length));
    return;
  }

  const correct = (record.quizCorrect ?? 0) + (isCorrect(question, option) ? 1 : 0);
  if (index + 1 < ids.length) {
    await deps.save(phone, { quizIndex: index + 1, quizCorrect: correct });
    const next = questionById(bank, ids[index + 1]!)!;
    deps.send(formatQuestion(next, index + 2, ids.length));
    return;
  }

  // Last question answered.
  if (correct >= rules.passMark) {
    await deps.save(phone, {
      quizCorrect: correct,
      quizResult: "passed",
      quizPassedDate: today(deps),
    });
    const freeUsed = record.freeUsedDate === today(deps);
    return showCoffeeMenu(
      { ...input, record: { ...record, quizResult: "passed" } },
      deps,
      freeUsed ? "paid" : "free",
      { intro: freeUsed ? msg.freeUsed : msg.quizPassed },
    );
  }

  const attempts = record.quizAttempts ?? 1;
  if (attempts < rules.maxQuizAttempts) {
    const ids2 = pickQuestions(bank, rules.quizQuestionCount, record.quizSeen ?? [], deps.rng);
    await deps.save(phone, {
      quizQuestions: ids2,
      quizSeen: [...(record.quizSeen ?? []), ...ids2],
      quizIndex: 0,
      quizCorrect: 0,
      quizAttempts: attempts + 1,
    });
    deps.send(msg.quizRetry(rules.maxQuizAttempts - attempts));
    deps.send(formatQuestion(questionById(bank, ids2[0]!)!, 1, ids2.length));
    return;
  }

  await deps.save(phone, { quizCorrect: correct, quizResult: "failed" });
  if (rules.failedQuizCanBuyPaidItems) {
    return showCoffeeMenu(input, deps, "paid", { intro: msg.quizFailedPaid });
  }
  await deps.save(phone, { stage: Stages.QUIZ_FAILED });
  deps.send(msg.quizFailedEnd);
}

function coffeeChoices(event: Event, mode: "free" | "paid"): MenuItem[] {
  const all = itemsIn(event.selection.items, "coffee");
  return mode === "paid" ? all.filter((i) => !isFree(i)) : all;
}

function savouryChoices(event: Event, mode: "free" | "paid"): MenuItem[] {
  const all = itemsIn(event.selection.items, "savoury");
  return mode === "paid" ? all.filter((i) => !isFree(i)) : all;
}

async function showCoffeeMenu(
  input: CafeInput,
  deps: CafeDeps,
  mode: "free" | "paid",
  opts: { intro: string | (() => string) },
) {
  const items = coffeeChoices(input.event, mode);
  if (items.length === 0) {
    await deps.save(input.phone, { stage: Stages.VERIFIED_USER });
    deps.send(msg.noItems);
    return;
  }
  await deps.save(input.phone, {
    stage: Stages.PICK_COFFEE,
    menuMode: mode,
    cartCoffee: undefined,
  });
  const intro = typeof opts.intro === "function" ? opts.intro() : opts.intro;
  deps.send(`${intro}\n\n${formatMenu(items)}`);
}

async function pickCoffee(input: CafeInput, deps: CafeDeps, rules: CafeRules) {
  const { record, phone, message, event } = input;
  if (isReset(message)) return showCoffeeMenu(input, deps, record.menuMode ?? "free", { intro: msg.coffeePrompt });
  const mode = record.menuMode ?? "free";
  const items = coffeeChoices(event, mode);
  const chosen = parseItem(message, items);
  if (!chosen) {
    deps.send(`${msg.notOnMenu}\n\n${formatMenu(items)}`);
    return;
  }

  if (isFree(chosen) && record.freeUsedDate === today(deps)) {
    // Guard in case a stale menu was answered after the free item was used.
    return showCoffeeMenu(input, deps, "paid", { intro: msg.freeUsed });
  }

  const savouries = savouryChoices(event, mode);
  if (savouries.length === 0) {
    return finalize(input, deps, rules, chosen.title, undefined);
  }
  await deps.save(phone, { stage: Stages.PICK_SAVOURY, cartCoffee: chosen.title });
  deps.send(
    `${msg.savouryPrompt(rules.savouryOptional)}\n\n${formatMenu(savouries)}`,
  );
}

async function pickSavoury(input: CafeInput, deps: CafeDeps, rules: CafeRules) {
  const { record, message, event } = input;
  const coffee = record.cartCoffee;
  if (!coffee) return showCoffeeMenu(input, deps, record.menuMode ?? "free", { intro: msg.coffeePrompt });

  const text = message.trim().toLowerCase();
  if (rules.savouryOptional && ["0", "no", "none", "skip", "no thanks"].includes(text)) {
    return finalize(input, deps, rules, coffee, undefined);
  }
  const items = savouryChoices(event, record.menuMode ?? "free");
  const chosen = parseItem(message, items);
  if (!chosen) {
    deps.send(`${msg.notOnMenu}\n\n${formatMenu(items)}`);
    return;
  }
  return finalize(input, deps, rules, coffee, chosen.title);
}

function findItem(event: Event, title: string): MenuItem | undefined {
  return event.selection.items.find((i) => i.title === title);
}

async function finalize(
  input: CafeInput,
  deps: CafeDeps,
  rules: CafeRules,
  coffeeTitle: string,
  savouryTitle: string | undefined,
) {
  const { event, phone, record } = input;
  const coffee = findItem(event, coffeeTitle);
  const savoury = savouryTitle ? findItem(event, savouryTitle) : undefined;
  if (!coffee) return showCoffeeMenu(input, deps, record.menuMode ?? "free", { intro: msg.coffeePrompt });

  const day = today(deps);
  const dailyCount = record.dailyOrderDate === day ? Number(record.dailyOrderCount ?? 0) : 0;
  if (!input.unlimited && dailyCount >= event.maxOrders) {
    await deps.save(phone, { stage: Stages.VERIFIED_USER, cartCoffee: undefined });
    deps.send(msg.dailyLimit(event.maxOrders));
    return;
  }

  const chosen = [coffee, ...(savoury ? [savoury] : [])];
  const amount = totalPaise(chosen);
  const lines = chosen.map((i) => `${i.title} (${formatPrice(i)})`);
  deps.send(msg.summary(lines, formatTotal(amount)));

  if (amount === 0) {
    const n = await placeOrder(input, deps, { coffee, savoury, amountPaise: 0 });
    deps.send(msg.orderPlaced(n, orderSummary(coffee, savoury)));
    return;
  }

  const expiresAt = new Date(deps.now().getTime() + rules.paymentExpiryMinutes * 60_000);
  let link: { id: string; url: string };
  try {
    link = await deps.createPaymentLink({
      amountPaise: amount,
      referenceId: `${phone}-${deps.now().getTime()}`,
      phone,
      name: record.fullName,
      email: record.email,
      expiresAt,
      description: orderSummary(coffee, savoury),
    });
  } catch (e) {
    console.error(e);
    await deps.save(phone, { stage: Stages.VERIFIED_USER, cartCoffee: undefined });
    deps.send(msg.paymentError);
    return;
  }
  const pending: PendingOrder = {
    coffee: coffee.title,
    ...(savoury ? { savoury: savoury.title } : {}),
    amountPaise: amount,
    linkId: link.id,
    linkUrl: link.url,
    expiresAt: expiresAt.toISOString(),
  };
  await deps.save(phone, { stage: Stages.AWAITING_PAYMENT, pendingOrder: pending, cartCoffee: undefined });
  deps.send(msg.payPrompt(link.url, rules.paymentExpiryMinutes));
}

export function orderSummary(coffee: MenuItem, savoury?: MenuItem): string {
  return savoury ? `${coffee.title} with ${savoury.title}` : coffee.title;
}

/** Puts a free or paid order on the barista queue and updates the attendee. */
export async function placeOrder(
  input: Pick<CafeInput, "event" | "phone" | "record">,
  deps: CafeDeps,
  order: { coffee: MenuItem; savoury?: MenuItem; amountPaise: number; paymentId?: string },
): Promise<number> {
  const { event, phone, record } = input;
  const day = today(deps);
  const dailyCount = record.dailyOrderDate === day ? Number(record.dailyOrderCount ?? 0) : 0;
  const orderCount = Number(record.orderCount ?? 0) + 1;

  const queued: Order = {
    key: phone,
    item: order.coffee.title,
    ...(order.savoury ? { modifiers: order.savoury.title } : {}),
    status: "queued",
    channel: "whatsapp",
    amountPaise: order.amountPaise,
    ...(order.paymentId ? { paymentId: order.paymentId } : {}),
  };
  const n = await deps.addOrder(queued);
  await deps.save(phone, {
    event: event.slug,
    stage: orderCount === 1 ? Stages.FIRST_ORDER : Stages.REPEAT_CUSTOMER,
    lastOrderNumber: n,
    orderCount,
    dailyOrderCount: dailyCount + 1,
    dailyOrderDate: day,
    ...(isFree(order.coffee) ? { freeUsedDate: day } : {}),
    pendingOrder: undefined,
    cartCoffee: undefined,
  });
  return n;
}

async function awaitingPayment(input: CafeInput, deps: CafeDeps) {
  const { record, phone, message } = input;
  const pending = record.pendingOrder;
  const expired = !pending || new Date(pending.expiresAt) <= deps.now();
  if (/^cancel$/i.test(message.trim()) || expired) {
    await deps.save(phone, { stage: Stages.VERIFIED_USER, pendingOrder: undefined });
    deps.send(expired ? msg.payExpired : msg.payCancelled);
    return;
  }
  deps.send(msg.stillWaiting(pending.linkUrl));
}

import { cafeRules, type CafeRules } from "@/config/cafe-rules";
import { quizBank, type QuizQuestion } from "@/config/quiz-bank";
import type {
  AttendeeRecord,
  Event,
  MenuItem,
  ListRow,
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
  priceOf,
  parseItem,
  parseItems,
  summarizeItems,
  totalPaise,
} from "./pricing";
import {
  formatQuestion,
  isCorrect,
  parseOption,
  pickQuestions,
  questionById,
} from "./quiz";
import { listMsg, msg } from "./messages";

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
  /** Best effort: stops an unpaid link from being paid after we gave up on it. */
  cancelPaymentLink(linkId: string): Promise<void>;
  /**
   * Optional: send `prompt` with `rows` as a WhatsApp list picker. Returns
   * false when it could not be sent (for example the template does not exist
   * yet); the flow then sends the plain text menu instead.
   */
  sendList?(prompt: string, rows: ListRow[]): Promise<boolean>;
}

export interface CafeInput {
  message: string;
  event: Event;
  phone: string;
  record: AttendeeRecord;
}

const isReset = (m: string) => /^(menu|start|order|hi|hello)$/i.test(m.trim());
const isNone = (m: string) =>
  ["0", "no", "none", "skip", "no thanks", "done", "no add-ons", "no more"].includes(
    m.trim().toLowerCase(),
  );

const MAX_LIST_ROWS = 10; // WhatsApp list pickers hold 1 to 10 rows
const LIST_BODY_MAX = 1024;
const LIST_TITLE_MAX = 24;
const LIST_DESCRIPTION_MAX = 72;

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/** Row id = the option number the text menu would show, so both read the same. */
function itemRow(item: MenuItem, number: number): ListRow {
  const detail = item.description ? ` · ${item.description}` : "";
  return {
    id: String(number),
    title: clip(item.title, LIST_TITLE_MAX),
    description: clip(`${formatPrice(item)}${detail}`, LIST_DESCRIPTION_MAX),
  };
}

const noneRow = (title: string, description: string): ListRow => ({
  id: "0",
  title,
  description,
});

/**
 * Offer a choice: as a list picker when the deps can send one (and it fits),
 * otherwise as the text menu. A list that fails to send also falls back to text.
 */
async function offer(
  deps: CafeDeps,
  prompt: { text: string; list: string },
  rows: ListRow[],
  textMenu: string,
): Promise<void> {
  if (deps.sendList && rows.length >= 1 && rows.length <= MAX_LIST_ROWS) {
    const sent = await deps.sendList(clip(prompt.list, LIST_BODY_MAX), rows);
    if (sent) return;
  }
  deps.send(`${prompt.text}\n\n${textMenu}`);
}

const isPicking = (stage?: string) =>
  stage === Stages.PICK_COFFEE ||
  stage === Stages.PICK_ADDONS ||
  stage === Stages.PICK_EXTRA;

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
  const { stage } = input.record;
  if (stage === Stages.BLOCKED) {
    deps.send(msg.blocked);
    return;
  }
  if (isPicking(stage) && isReset(input.message)) {
    return begin(input, deps, rules, bank);
  }
  switch (stage) {
    case Stages.QUIZ:
      return answerQuiz(input, deps, rules, bank);
    case Stages.PICK_COFFEE:
      return pickCoffee(input, deps, rules);
    case Stages.PICK_ADDONS:
      return pickAddOns(input, deps, rules);
    case Stages.PICK_EXTRA:
      return pickExtra(input, deps, rules);
    case Stages.AWAITING_PAYMENT:
      return awaitingPayment(input, deps);
    case Stages.QUIZ_FAILED:
      deps.send(msg.quizFailedEnd);
      return;
    case Stages.FIRST_ORDER:
    case Stages.REPEAT_CUSTOMER:
      if (!isReset(input.message)) {
        deps.send(msg.idle);
        return;
      }
      return begin(input, deps, rules, bank);
    default:
      return begin(input, deps, rules, bank);
  }
}

/**
 * The mobile number check. Attendee records are keyed by phone number (the
 * same number gives the same record on WhatsApp and SMS), so a record with a
 * quiz result or a quiz attempt means this number has already taken part.
 */
export function hasTakenPart(record: Partial<AttendeeRecord>): boolean {
  return record.quizResult != null || (record.quizAttempts ?? 0) > 0;
}

/**
 * Entry after sign-up or when the attendee scans the QR code again.
 * - Blocked attendees stay blocked.
 * - In the middle of a step (quiz, menu, add-ons, payment) the current prompt
 *   is sent again, with no penalty.
 * - Someone who has already taken part in the quiz goes to the paid menu.
 * - Everyone else starts the quiz.
 */
export async function enter(
  input: CafeInput,
  deps: CafeDeps,
  rules: CafeRules = cafeRules,
  bank: QuizQuestion[] = quizBank,
): Promise<void> {
  const { record } = input;
  if (record.stage === Stages.BLOCKED) {
    deps.send(msg.blocked);
    return;
  }
  if (
    record.stage === Stages.QUIZ ||
    isPicking(record.stage) ||
    record.stage === Stages.AWAITING_PAYMENT
  ) {
    return handleCafeMessage({ ...input, message: "" }, deps, rules, bank);
  }
  if (hasTakenPart(record) && rules.rescanAfterQuizGoesToPaid) {
    return showCoffeeMenu(input, deps, "paid", { text: msg.alreadyTookQuiz, list: listMsg.alreadyTookQuiz });
  }
  return begin(input, deps, rules, bank);
}

/**
 * Start a visit. Winners with the free coffee still unused see the free
 * coffees. Everyone else sees the paid menu. Anyone who has not taken the quiz
 * takes it first.
 */
export async function begin(
  input: CafeInput,
  deps: CafeDeps,
  rules: CafeRules = cafeRules,
  bank: QuizQuestion[] = quizBank,
): Promise<void> {
  const { record, phone } = input;

  if (record.quizResult === "failed") {
    return showCoffeeMenu(input, deps, "paid", { text: msg.quizFailedPaid, list: listMsg.quizFailedPaid });
  }
  if (record.quizResult === "passed") {
    return freeAvailable(record, rules)
      ? showCoffeeMenu(input, deps, "free", { text: msg.coffeePrompt, list: listMsg.coffeePrompt })
      : showCoffeeMenu(input, deps, "paid", { text: msg.freeUsed, list: listMsg.freeUsed });
  }

  const attempts = record.quizAttempts ?? 0;
  if (attempts >= rules.maxQuizAttempts) {
    return failQuiz(input, deps, rules, record.quizCorrect ?? 0);
  }
  const seen = record.quizSeen ?? [];
  const ids = pickQuestions(bank, rules.quizQuestionCount, seen, deps.rng);
  await deps.save(phone, {
    stage: Stages.QUIZ,
    quizQuestions: ids,
    quizSeen: [...seen, ...ids],
    quizIndex: 0,
    quizCorrect: 0,
    quizAttempts: attempts + 1,
  });
  deps.send(msg.quizIntro(rules.quizQuestionCount));
  deps.send(formatQuestion(questionById(bank, ids[0]!)!, 1, ids.length));
}

function freeAvailable(record: AttendeeRecord, rules: CafeRules): boolean {
  return (record.freeCoffeesTaken ?? 0) < rules.freeCoffeesPerEvent;
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
  if (!question) {
    return begin({ ...input, record: { ...record, stage: undefined } }, deps, rules, bank);
  }

  const option = parseOption(message, question);
  if (option === null) {
    deps.send(msg.quizNeedsAnswer);
    deps.send(formatQuestion(question, index + 1, ids.length));
    return;
  }

  const correct = (record.quizCorrect ?? 0) + (isCorrect(question, option) ? 1 : 0);
  if (index + 1 < ids.length) {
    await deps.save(phone, { quizIndex: index + 1, quizCorrect: correct });
    deps.send(
      formatQuestion(questionById(bank, ids[index + 1]!)!, index + 2, ids.length),
    );
    return;
  }

  // Last question answered.
  if (correct >= rules.passMark) {
    await deps.save(phone, { quizCorrect: correct, quizResult: "passed" });
    const next = { ...input, record: { ...record, quizResult: "passed" as const } };
    return freeAvailable(record, rules)
      ? showCoffeeMenu(next, deps, "free", { text: msg.quizPassed, list: listMsg.quizPassed })
      : showCoffeeMenu(next, deps, "paid", { text: msg.freeUsed, list: listMsg.freeUsed });
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
  return failQuiz(input, deps, rules, correct);
}

async function failQuiz(
  input: CafeInput,
  deps: CafeDeps,
  rules: CafeRules,
  correct: number,
) {
  await deps.save(input.phone, { quizCorrect: correct, quizResult: "failed" });
  if (rules.failedQuizCanBuyPaidItems) {
    return showCoffeeMenu(
      { ...input, record: { ...input.record, quizResult: "failed" } },
      deps,
      "paid",
      { text: msg.quizFailedPaid, list: listMsg.quizFailedPaid },
    );
  }
  await deps.save(input.phone, { stage: Stages.QUIZ_FAILED });
  deps.send(msg.quizFailedEnd);
}

/** Free mode: free coffees only. Paid mode: priced coffees only. */
/** The free menu is the free coffees; the paid menu is every priced item. */
function menuChoices(event: Event, mode: "free" | "paid"): MenuItem[] {
  if (mode === "paid") return event.selection.items.filter((i) => !isFree(i));
  return itemsIn(event.selection.items, "coffee").filter(isFree);
}

/** Rows for the paid-item list: every choice, plus Done once there is a cart. */
function itemRows(choices: MenuItem[], cart: string[], kind: "paid" | "extra"): ListRow[] {
  const rows = choices.map((i, n) => itemRow(i, n + 1));
  if (cart.length > 0) rows.push(noneRow("Done", "Continue with your order"));
  else if (kind === "extra") rows.push(noneRow("No thanks", "Place my order as is"));
  return rows;
}

async function showCoffeeMenu(
  input: CafeInput,
  deps: CafeDeps,
  mode: "free" | "paid",
  intro: { text: string; list: string },
) {
  const items = menuChoices(input.event, mode);
  if (items.length === 0) {
    await deps.save(input.phone, { stage: Stages.VERIFIED_USER });
    deps.send(msg.noItems);
    return;
  }
  await deps.save(input.phone, {
    stage: Stages.PICK_COFFEE,
    menuMode: mode,
    cartCoffee: undefined,
    cartItems: undefined,
    cartAddOns: undefined,
  });
  await offer(
    deps,
    intro,
    mode === "paid" ? itemRows(items, [], "paid") : items.map((i, n) => itemRow(i, n + 1)),
    formatMenu(items),
  );
}

async function pickCoffee(input: CafeInput, deps: CafeDeps, rules: CafeRules) {
  const { record, phone, message, event } = input;
  const mode = record.menuMode ?? "free";
  // The paid menu is a multi-item order; the free menu is the one free coffee.
  if (mode === "paid") return pickItems(input, deps, rules, "paid");

  const items = menuChoices(event, mode);
  const chosen = parseItem(message, items);
  if (!chosen) {
    await offer(
      deps,
      { text: msg.notOnMenu, list: listMsg.notOnMenu },
      items.map((i, n) => itemRow(i, n + 1)),
      formatMenu(items),
    );
    return;
  }
  if (!freeAvailable(record, rules)) {
    // A stale free menu answered after the free coffee was taken.
    return showCoffeeMenu(input, deps, "paid", { text: msg.freeUsed, list: listMsg.freeUsed });
  }
  await deps.save(phone, { cartCoffee: chosen.title, cartItems: [], cartAddOns: [] });
  return askAddOns(
    { ...input, record: { ...record, cartCoffee: chosen.title, cartItems: [], cartAddOns: [] } },
    deps,
    rules,
  );
}

/**
 * Pick paid items one reply at a time ("paid": the whole order; "extra": on top
 * of the free coffee). In a list picker each tap adds one item and the list is
 * shown again with Done; a typed reply may name several items at once.
 */
async function pickItems(
  input: CafeInput,
  deps: CafeDeps,
  rules: CafeRules,
  kind: "paid" | "extra",
) {
  const { event, message, phone, record } = input;
  const choices = menuChoices(event, "paid");
  const current = record.cartItems ?? [];
  const room = rules.maxItemsPerOrder - (record.cartCoffee ? 1 : 0);
  const again = (prompt: { text: string; list: string }, cart = current) =>
    offer(deps, prompt, itemRows(choices, cart, kind), formatMenu(choices));

  if (isNone(message)) {
    if (kind === "paid" && current.length === 0) {
      await again({ text: msg.pickAtLeastOne, list: listMsg.pickAtLeastOne });
      return;
    }
    return itemsDone(input, deps, rules, kind, current);
  }

  const picks = parseItems(message, choices);
  if (!picks) {
    await again({ text: msg.notOnMenu, list: listMsg.notOnMenu });
    return;
  }
  if (current.length + picks.length > room) {
    deps.send(msg.tooManyItems(rules.maxItemsPerOrder));
    await again({ text: msg.notOnMenu, list: listMsg.notOnMenu });
    return;
  }

  const next = [...current, ...picks.map((i) => i.title)];
  if (deps.sendList && picks.length === 1 && next.length < room) {
    const rows = itemRows(choices, next, kind);
    const so_far = summarizeItems(next);
    if (
      rows.length <= MAX_LIST_ROWS &&
      (await deps.sendList(
        clip(listMsg.itemAdded(picks[0]!.title, so_far), LIST_BODY_MAX),
        rows,
      ))
    ) {
      await deps.save(phone, { cartItems: next });
      return;
    }
  }
  return itemsDone(input, deps, rules, kind, next);
}

async function itemsDone(
  input: CafeInput,
  deps: CafeDeps,
  rules: CafeRules,
  kind: "paid" | "extra",
  items: string[],
) {
  await deps.save(input.phone, { cartItems: items });
  const next = { ...input, record: { ...input.record, cartItems: items } };
  // A paid-menu order asks for add-ons now (if it has a drink); extras come
  // after the add-ons, so the order is ready to total.
  return kind === "paid" ? askAddOns(next, deps, rules) : finalize(next, deps, rules);
}

/** True when the order so far includes a drink that add-ons (sugar...) apply to. */
function hasDrink(event: Event, record: AttendeeRecord): boolean {
  const titles = [...(record.cartCoffee ? [record.cartCoffee] : []), ...(record.cartItems ?? [])];
  return titles.some((t) => {
    const item = findItem(event, t);
    return item && (item.category ?? "coffee") === "coffee";
  });
}

/** After add-ons: a paid-menu order is done; a winner may add paid extras. */
function afterAddOns(input: CafeInput, deps: CafeDeps, rules: CafeRules) {
  return input.record.menuMode === "paid"
    ? finalize(input, deps, rules)
    : askExtra(input, deps, rules);
}

/** Add-ons still on offer (original numbers kept) plus the "Done" row. */
function addOnRows(addOns: string[], chosen: string[]): ListRow[] {
  const rows: ListRow[] = [];
  addOns.forEach((name, i) => {
    if (chosen.includes(name)) return;
    rows.push({ id: String(i + 1), title: clip(name, LIST_TITLE_MAX), description: "Add-on, free" });
  });
  rows.push(
    chosen.length > 0
      ? noneRow("Done", "Continue with your order")
      : noneRow("No add-ons", "Skip add-ons"),
  );
  return rows;
}

function addOnText(addOns: string[], chosen: string[]): string {
  return addOns
    .map((a, i) => (chosen.includes(a) ? null : `${i + 1}. ${a}`))
    .filter(Boolean)
    .join("\n");
}

async function askAddOns(input: CafeInput, deps: CafeDeps, rules: CafeRules) {
  const { event, record, phone } = input;
  const addOns = event.selection.modifiers;
  if (addOns.length === 0 || !hasDrink(event, record)) return afterAddOns(input, deps, rules);
  await deps.save(phone, { stage: Stages.PICK_ADDONS });
  const forWhat = record.cartCoffee ?? "drinks";
  await offer(
    deps,
    {
      text: msg.addOnsPrompt(forWhat),
      list: listMsg.addOnsPrompt(forWhat),
    },
    addOnRows(addOns, []),
    addOnText(addOns, []),
  );
}

/** "1", "1,3" or "1 3" into add-on names. Null if any part is not valid. */
function parseAddOns(reply: string, addOns: string[]): string[] | null {
  // A tapped list row can arrive as the add-on's name.
  const byName = addOns.find(
    (a) => a.trim().toLowerCase() === reply.trim().toLowerCase(),
  );
  if (byName) return [byName];
  const parts = reply.split(/[\s,]+/).filter(Boolean);
  if (parts.length === 0) return null;
  const picked: string[] = [];
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    const name = addOns[Number(p) - 1];
    if (!name) return null;
    if (!picked.includes(name)) picked.push(name);
  }
  return picked;
}

async function pickAddOns(input: CafeInput, deps: CafeDeps, rules: CafeRules) {
  const { event, message, phone, record } = input;
  const addOns = event.selection.modifiers;
  const already = record.cartAddOns ?? [];
  let chosen = already;
  if (!isNone(message)) {
    const parsed = parseAddOns(message, addOns);
    if (!parsed) {
      await offer(
        deps,
        { text: msg.addOnsInvalid, list: listMsg.addOnsInvalid },
        addOnRows(addOns, already),
        addOnText(addOns, already),
      );
      return;
    }
    chosen = [...already, ...parsed.filter((a) => !already.includes(a))];
    // In a list picker people tap one add-on at a time: show what is left. If
    // the list cannot be sent, behave like the text menu and move on.
    const remaining = addOns.filter((a) => !chosen.includes(a));
    if (deps.sendList && parsed.length === 1 && remaining.length > 0) {
      const rows = addOnRows(addOns, chosen);
      if (
        rows.length <= MAX_LIST_ROWS &&
        (await deps.sendList(clip(listMsg.addOnAdded(parsed[0]!), LIST_BODY_MAX), rows))
      ) {
        await deps.save(phone, { cartAddOns: chosen });
        return;
      }
    }
  }
  await deps.save(phone, { cartAddOns: chosen });
  return afterAddOns(
    { ...input, record: { ...input.record, cartAddOns: chosen } },
    deps,
    rules,
  );
}

async function askExtra(input: CafeInput, deps: CafeDeps, rules: CafeRules) {
  const { event, phone } = input;
  const choices = menuChoices(event, "paid");
  if (rules.maxItemsPerOrder <= 1 || choices.length === 0) {
    return finalize(input, deps, rules);
  }
  await deps.save(phone, { stage: Stages.PICK_EXTRA, cartItems: [] });
  await offer(
    deps,
    { text: msg.extraPrompt, list: listMsg.extraPrompt },
    itemRows(choices, [], "extra"),
    formatMenu(choices),
  );
}

async function pickExtra(input: CafeInput, deps: CafeDeps, rules: CafeRules) {
  if (!input.record.cartCoffee) return begin(input, deps, rules);
  return pickItems(input, deps, rules, "extra");
}

function findItem(event: Event, title: string): MenuItem | undefined {
  return event.selection.items.find((i) => i.title === title);
}

export function orderSummary(
  coffee: MenuItem | undefined,
  addOns: string[] = [],
  items: MenuItem[] = [],
): string {
  const paid = summarizeItems(items.map((i) => i.title));
  const withAddOns = (base: string) =>
    addOns.length > 0 ? `${base} (${addOns.join(", ")})` : base;
  if (coffee) return paid ? `${withAddOns(coffee.title)} with ${paid}` : withAddOns(coffee.title);
  return withAddOns(paid);
}

/** One line per distinct item: "Cold Brew (₹120)" or "2 × Cold Brew (₹240)". */
function orderLines(chosen: MenuItem[]): string[] {
  const counts = new Map<string, { item: MenuItem; n: number }>();
  for (const item of chosen) {
    const entry = counts.get(item.title);
    if (entry) entry.n += 1;
    else counts.set(item.title, { item, n: 1 });
  }
  return [...counts.values()].map(({ item, n }) =>
    n === 1
      ? `${item.title} (${formatPrice(item)})`
      : `${n} × ${item.title} (${isFree(item) ? "FREE" : `₹${priceOf(item) * n}`})`,
  );
}

async function finalize(input: CafeInput, deps: CafeDeps, rules: CafeRules) {
  const { event, phone, record } = input;
  const coffee = record.cartCoffee ? findItem(event, record.cartCoffee) : undefined;
  const items = (record.cartItems ?? []).map((t) => findItem(event, t));
  if (
    (record.cartCoffee && !coffee) ||
    items.some((i) => !i) ||
    (!coffee && items.length === 0)
  ) {
    return begin(input, deps, rules);
  }
  const paidItems = items as MenuItem[];
  const addOns = record.cartAddOns ?? [];

  const chosen = [...(coffee ? [coffee] : []), ...paidItems];
  const amount = totalPaise(chosen);
  const lines = [
    ...orderLines(chosen),
    ...(addOns.length > 0 ? [`Add-ons: ${addOns.join(", ")}`] : []),
  ];
  deps.send(msg.summary(lines, formatTotal(amount)));

  if (amount === 0) {
    const n = await placeOrder(input, deps, { coffee, addOns, items: paidItems, amountPaise: 0 });
    deps.send(msg.orderPlaced(n, orderSummary(coffee, addOns, paidItems)));
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
      description: orderSummary(coffee, addOns, paidItems),
    });
  } catch (e) {
    console.error(e);
    await deps.save(phone, {
      stage: Stages.VERIFIED_USER,
      cartCoffee: undefined,
      cartItems: undefined,
      cartAddOns: undefined,
    });
    deps.send(msg.paymentError);
    return;
  }
  const pending: PendingOrder = {
    ...(coffee ? { coffee: coffee.title } : {}),
    ...(paidItems.length > 0 ? { items: paidItems.map((i) => i.title) } : {}),
    ...(addOns.length > 0 ? { addOns } : {}),
    amountPaise: amount,
    linkId: link.id,
    linkUrl: link.url,
    expiresAt: expiresAt.toISOString(),
  };
  await deps.save(phone, {
    stage: Stages.AWAITING_PAYMENT,
    pendingOrder: pending,
    cartCoffee: undefined,
    cartItems: undefined,
    cartAddOns: undefined,
  });
  deps.send(msg.payPrompt(link.url, rules.paymentExpiryMinutes));
}

/** Puts a free or paid order on the barista queue and updates the attendee. */
export async function placeOrder(
  input: Pick<CafeInput, "event" | "phone" | "record">,
  deps: CafeDeps,
  order: {
    /** The free coffee, when there is one. */
    coffee?: MenuItem;
    addOns?: string[];
    /** Paid items, one entry per unit. */
    items?: MenuItem[];
    amountPaise: number;
    paymentId?: string;
  },
): Promise<number> {
  const { event, phone, record } = input;
  const orderCount = Number(record.orderCount ?? 0) + 1;
  const addOns = order.addOns ?? [];
  const paid = summarizeItems((order.items ?? []).map((i) => i.title));

  const queued: Order = {
    key: phone,
    ...(record.fullName ? { name: record.fullName } : {}),
    // With a free coffee that is the item and the paid items are extras;
    // otherwise the paid items are the order.
    item: order.coffee ? order.coffee.title : paid,
    ...(addOns.length > 0 ? { modifiers: addOns.join(", ") } : {}),
    ...(order.coffee && paid ? { extras: paid } : {}),
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
    ...(order.coffee && isFree(order.coffee)
      ? { freeCoffeesTaken: Number(record.freeCoffeesTaken ?? 0) + 1 }
      : {}),
    ...(order.paymentId ? { lastPaymentId: order.paymentId } : {}),
    pendingOrder: undefined,
    cartCoffee: undefined,
    cartItems: undefined,
    cartAddOns: undefined,
  });
  return n;
}

async function awaitingPayment(input: CafeInput, deps: CafeDeps) {
  const { record, phone } = input;
  const pending = record.pendingOrder;
  const expired = !pending || new Date(pending.expiresAt) <= deps.now();
  if (expired) {
    if (pending) await deps.cancelPaymentLink(pending.linkId);
    await deps.save(phone, { stage: Stages.VERIFIED_USER, pendingOrder: undefined });
    deps.send(msg.payExpired);
    return;
  }
  deps.send(msg.stillWaiting(pending.linkUrl));
}

// All attendee-facing text for the cafe flow. English only.
export const msg = {
  askEmail: "Thanks! What is your email address?",
  invalidEmail:
    "That does not look like an email address. Please send it like name@example.com.",
  askCompany: "Which company are you with?",
  askCity: "Which city are you in?",
  askAgain: "Please reply with a short text.",
  quizIntro: (count: number) =>
    `Welcome to Builder's Cafe! Answer ${count} quick questions to unlock your free coffee.`,
  quizRetry: (attemptsLeft: number) =>
    `Not quite. You have ${attemptsLeft} more ${attemptsLeft === 1 ? "try" : "tries"}, with new questions.`,
  quizNeedsAnswer: "Please reply with the number of your answer.",
  quizPassed:
    "All correct! Your coffee is free. Choose it by replying with its number.",
  quizFailedPaid:
    "Sorry, that was not enough for a free coffee. You can still order from our paid menu. Reply with the numbers of the items you want, like 1 or 1,3.",
  quizFailedEnd:
    "Sorry, that was not enough for a free coffee. Thanks for playing!",
  alreadyTookQuiz:
    "You have already taken part in the quiz, so you can order from our paid menu. Reply with the numbers of the items you want, like 1 or 1,3.",
  freeUsed:
    "You have already had your free coffee. You can still order from our paid menu. Reply with the numbers of the items you want, like 1 or 1,3.",
  blocked:
    "Sorry, we found that you have already taken part, so you can't take part again. Thank you!",
  coffeePrompt: "Choose your coffee by replying with its number:",
  addOnsPrompt: (coffee: string) =>
    `Add-ons for your ${coffee}? Reply with one or more numbers, like 1 or 1,3. Reply 0 for none:`,
  addOnsInvalid: "Please reply with the numbers of the add-ons you want, or 0 for none.",
  extraPrompt:
    "Want something extra? These are paid. Reply with one or more numbers, like 1 or 1,3. Reply 0 for none:",
  pickAtLeastOne: "Please pick at least one item from the menu.",
  tooManyItems: (max: number) => `You can order up to ${max} items at a time.`,
  itemAdded: (name: string, so_far: string) =>
    `Added ${name}. So far: ${so_far}. Reply with more numbers, or 0 when you are done:`,
  pickMore: (so_far: string) =>
    `So far: ${so_far}. Reply with more numbers, or 0 when you are done:`,
  pickFirst: "Reply with the numbers of the items you want, like 1 or 1,3:",
  notOnMenu: "Sorry, that is not on the menu. Please reply with a number.",
  noItems: "Sorry, nothing is available to order right now.",
  idle: "Reply MENU to order again.",
  summary: (lines: string[], total: string) =>
    `Your order:\n${lines.join("\n")}\nTotal: ${total}`,
  payPrompt: (url: string, minutes: number) =>
    `Pay here within ${minutes} minutes to place your order:\n${url}`,
  stillWaiting: (url: string) =>
    `We are waiting for your payment. Pay here:\n${url}`,
  payExpired: "Your payment link has expired. Reply MENU to order again.",
  orderPlaced: (n: number, summary: string) =>
    `Order #${n} confirmed: ${summary}. We'll message you when it's ready.`,
  paymentReceived: (n: number, summary: string) =>
    `Payment received. Order #${n} confirmed: ${summary}. We'll message you when it's ready.`,
  paymentOrphan: (paymentId: string) =>
    `We received your payment (${paymentId}) but could not match it to an order. Please show this message to the barista and we will sort it out.`,
  paymentError:
    "Sorry, we could not create your payment link. Please try again in a moment.",
  addOnAdded: (name: string) =>
    `Added ${name}. Reply with another number, or 0 when you are done:`,
};

// The same prompts worded for a WhatsApp list picker, where people tap a row
// instead of typing a number.
export const listMsg = {
  quizPassed: "All correct! Your coffee is free. Tap Choose to pick it.",
  quizFailedPaid:
    "Sorry, that was not enough for a free coffee. You can still order from our paid menu. Tap Choose and pick items one at a time, then tap Done.",
  alreadyTookQuiz:
    "You have already taken part in the quiz, so you can order from our paid menu. Tap Choose and pick items one at a time, then tap Done.",
  freeUsed:
    "You have already had your free coffee. You can still order from our paid menu. Tap Choose and pick items one at a time, then tap Done.",
  coffeePrompt: "Choose your coffee from the list:",
  notOnMenu: "Sorry, that is not on the menu. Tap Choose to pick an item.",
  addOnsPrompt: (coffee: string) =>
    `Add-ons for your ${coffee}? Pick one at a time, then tap Done.`,
  addOnAdded: (name: string) =>
    `Added ${name}. Anything else? Pick another, or tap Done.`,
  addOnsInvalid: "Please pick an add-on from the list, or tap Done.",
  extraPrompt:
    "Want something extra? These are paid. Pick items one at a time, then tap Done, or pick No thanks.",
  pickAtLeastOne: "Please pick at least one item from the list.",
  itemAdded: (name: string, so_far: string) =>
    `Added ${name}. So far: ${so_far}. Pick another, or tap Done.`,
  pickMore: (so_far: string) => `So far: ${so_far}. Pick another, or tap Done.`,
  pickFirst: "Tap Choose and pick items one at a time, then tap Done.",
};

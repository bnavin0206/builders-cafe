// All attendee-facing text for the cafe flow. English only.
export const msg = {
  quizIntro: (count: number) =>
    `Welcome to Builder's Cafe! Answer ${count} quick questions to unlock your free coffee.`,
  quizRetry: (attemptsLeft: number) =>
    `Not quite. You have ${attemptsLeft} more ${attemptsLeft === 1 ? "try" : "tries"}, with new questions.`,
  quizNeedsAnswer: "Please reply with 1, 2 or 3.",
  quizPassed: "All correct! Choose your coffee by replying with its number.",
  quizFailedPaid:
    "Sorry, that was not enough for a free coffee. You can still buy from these items. Reply with a number.",
  quizFailedEnd:
    "Sorry, that was not enough for a free coffee today. Thanks for playing!",
  freeUsed:
    "You have already had your free coffee today. You can still buy from these items. Reply with a number.",
  coffeePrompt: "Choose your coffee by replying with its number:",
  savouryPrompt: (optional: boolean) =>
    `Add a savoury? Reply with a number${optional ? ", or 0 for none" : ""}:`,
  notOnMenu: "Sorry, that is not on the menu. Please reply with a number.",
  noItems: "Sorry, nothing is available to order right now.",
  dailyLimit: (max: number) => `You have reached the daily limit of ${max} orders.`,
  summary: (lines: string[], total: string) =>
    `Your order:\n${lines.join("\n")}\nTotal: ${total}`,
  payPrompt: (url: string, minutes: number) =>
    `Pay here within ${minutes} minutes to place your order:\n${url}`,
  stillWaiting: (url: string) =>
    `We are waiting for your payment. Pay here:\n${url}\nReply CANCEL to start again.`,
  payExpired: "Your payment link has expired. Reply MENU to order again.",
  payCancelled: "Okay, your payment was cancelled. Reply MENU to order again.",
  orderPlaced: (n: number, summary: string) =>
    `Order #${n} confirmed: ${summary}. We'll message you when it's ready.`,
  paymentReceived: (n: number, summary: string) =>
    `Payment received. Order #${n} confirmed: ${summary}. We'll message you when it's ready.`,
  paymentOrphan: (paymentId: string) =>
    `We received your payment (${paymentId}) but could not match it to an order. Please show this message to the barista and we will sort it out.`,
  paymentError:
    "Sorry, we could not create your payment link. Please try again in a moment.",
};

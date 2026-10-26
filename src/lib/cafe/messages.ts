// All attendee-facing text for the cafe flow. English only.
export const msg = {
  quizIntro: (count: number) =>
    `Welcome to Builder's Cafe! Answer ${count} quick questions to unlock your free coffee.`,
  quizRetry: (attemptsLeft: number) =>
    `Not quite. You have ${attemptsLeft} more ${attemptsLeft === 1 ? "try" : "tries"}, with new questions.`,
  quizNeedsAnswer: "Please reply with 1, 2 or 3.",
  quizPassed:
    "All correct! Your coffee is free. Choose it by replying with its number.",
  quizFailedPaid:
    "Sorry, that was not enough for a free coffee. You can still order from our paid menu. Reply with a number.",
  quizFailedEnd:
    "Sorry, that was not enough for a free coffee. Thanks for playing!",
  freeUsed:
    "You have already had your free coffee. You can still order from our paid menu. Reply with a number.",
  blocked:
    "Sorry, we found that you have already taken part, so you can't take part again. Thank you!",
  coffeePrompt: "Choose your coffee by replying with its number:",
  addOnsPrompt: (coffee: string) =>
    `Add-ons for your ${coffee}? Reply with one or more numbers, like 1 or 1,3. Reply 0 for none:`,
  addOnsInvalid: "Please reply with the numbers of the add-ons you want, or 0 for none.",
  extraPrompt: "Want something extra? These are paid. Reply with a number, or 0 for none:",
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
};

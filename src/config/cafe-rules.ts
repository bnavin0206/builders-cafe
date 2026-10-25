// Builder's Cafe rules.
//
// DEFAULTS: every value below is a default chosen by the developer, NOT a
// client decision. They are to be confirmed or changed after the client
// meeting (see the client brief, "Questions for you"). Change them here only.
export const cafeRules = {
  // DEFAULT: 3 random questions per attendee.
  quizQuestionCount: 3,
  // DEFAULT: all 3 answers must be correct to open the free-coffee path.
  passMark: 3,
  // DEFAULT: one retry with new questions (2 attempts in total).
  maxQuizAttempts: 2,
  // DEFAULT: after the last failed attempt the attendee can still order, but
  // only items with a price above 0, at the listed price.
  failedQuizCanBuyPaidItems: true,
  // DEFAULT: one free (price 0) item per attendee per day.
  freeItemsPerDay: 1,
  // DEFAULT: the savoury is optional.
  savouryOptional: true,
  // DEFAULT: an order is one coffee plus at most one savoury.
  maxCoffeePerOrder: 1,
  maxSavouryPerOrder: 1,
  // DEFAULT: an unpaid Razorpay link expires after 10 minutes.
  paymentExpiryMinutes: 10,
} as const;

export type CafeRules = typeof cafeRules;

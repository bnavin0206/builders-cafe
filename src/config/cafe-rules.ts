// Builder's Cafe rules.
//
// Each value is marked CLIENT (taken from the client's updated brief, still to
// be confirmed at the meeting) or DEFAULT (a developer choice, not decided).
// Change values here only.
export const cafeRules = {
  // DEFAULT: 3 random questions per attendee.
  quizQuestionCount: 3,
  // CLIENT: all 3 answers must be correct.
  passMark: 3,
  // CLIENT: one attempt, no retry. A wrong answer leaves only paid options.
  maxQuizAttempts: 1,
  // CLIENT: after a wrong answer the attendee can still buy priced items.
  failedQuizCanBuyPaidItems: true,
  // CLIENT: "only paid option for future attempts too", so a failed quiz stays
  // failed for the whole event. To CONFIRM: does it ever reset?
  // CLIENT: one free coffee per attendee for the whole event; paid orders have
  // no limit. Enforced through the free coffee being used once.
  freeCoffeesPerEvent: 1,
  // DEFAULT: after the coffee and add-ons, at most one extra paid item.
  maxExtraItems: 1,
  // CLIENT: "on rescan FoundInSegment needed to block them". An attendee whose
  // verified email is already found in Segment cannot take part. To CONFIRM
  // with the client: does "found" mean "has taken part before" (then we must
  // also write each participant to Segment) or "is an existing contact"?
  blockIfFoundInSegment: true,
  // CLIENT: an unpaid payment link expires after 2 minutes.
  paymentExpiryMinutes: 2,
} as const;

export type CafeRules = typeof cafeRules;

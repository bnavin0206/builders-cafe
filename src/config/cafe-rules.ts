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
  // DEFAULT: at most this many items in one order (the free coffee counts as
  // one). Paid menus let attendees pick several items, repeats allowed.
  maxItemsPerOrder: 10,
  // CLIENT: no email verification code. We just ask for name, email, company
  // and city in the chat. Set to true to bring back the emailed code (needs
  // the Twilio Verify and SendGrid setup).
  verifyEmail: false,
  // CLIENT: after sign-up or a re-scan of the QR code, anyone who has already
  // taken part in the quiz goes straight to the paid menu. To CONFIRM: this
  // includes a winner who has not yet taken the free coffee (for example the
  // payment link expired); such a winner can still reply MENU to get it back.
  rescanAfterQuizGoesToPaid: true,
  // CLIENT: "on rescan FoundInSegment needed to block them". An attendee whose
  // verified email is already found in Segment cannot take part. To CONFIRM
  // with the client: does "found" mean "has taken part before" (then we must
  // also write each participant to Segment) or "is an existing contact"?
  blockIfFoundInSegment: true,
  // CLIENT: an unpaid payment link expires after 2 minutes.
  paymentExpiryMinutes: 2,
} as const;

export type CafeRules = typeof cafeRules;

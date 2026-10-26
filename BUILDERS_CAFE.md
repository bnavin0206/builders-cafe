# Builder's Cafe flow

This fork adds a quiz, priced menu and Razorpay payment to Twilio Mixologist.
The OpenAI agent is no longer used: attendees choose from the fixed menu by
replying with a number or an item name.

## Journey

1. QR code opens WhatsApp; welcome message.
2. Name, email, emailed code (existing `LEAD_COLLECTION=MANUAL` flow). On
   success `completedSignup` is saved.
3. Segment check: an attendee whose email is already found in Segment is
   blocked (stage `BLOCKED`) and goes no further.
4. Quiz: 3 random questions from the bank in `src/config/quiz-bank.ts`
   (20 placeholders). One attempt.
5. All correct: free coffee, then add-ons (sugar and others, from the event's
   modifier list), then one optional paid item (drink or snack).
   Any answer wrong: paid menu only (priced drink, add-ons, optional priced
   snack). A failed quiz stays failed for the whole event.
6. Total is added up on the server. Total 0: order is queued at once.
   Total above 0: a Razorpay payment link (valid 2 minutes) is sent in the
   chat. The order is queued only after the verified `payment_link.paid`
   webhook. There is no cancel option.
7. Barista Order Dashboard: Finish marks the order ready.

Code: `src/lib/cafe/` (flow, quiz, pricing, payment, messages),
`src/app/webhooks/razorpay/route.ts`, `src/lib/razorpay.ts`.

## Rules

All in `src/config/cafe-rules.ts`, each marked CLIENT (from the client's
updated brief, to confirm at the meeting) or DEFAULT (developer choice):

| Rule | Value | Source |
| --- | --- | --- |
| Questions per attendee | 3 | DEFAULT |
| Pass mark | all 3 correct | CLIENT |
| Attempts | 1, no retry; failed stays failed for the event | CLIENT (confirm if it ever resets) |
| After a failed quiz | can buy priced items | CLIENT |
| Free coffees per attendee | 1 for the whole event; paid orders unlimited | CLIENT |
| Extra paid items after the coffee | at most 1 | DEFAULT |
| Block if found in Segment | yes | CLIENT (confirm what "found" means) |
| Unpaid link expiry | 2 minutes | CLIENT |

Placeholders to replace: the 20 quiz questions, the add-on list and all
prices in `menus.ts`.

Open: the display board for ready order numbers is not built yet. The
WhatsApp ready message still comes from the dashboard's Finish button.

Attendee records are kept for 6 weeks (`EventLengthInSeconds`) so the quiz
result and the free coffee are remembered for the whole event.

## Setup

1. `cp .env.example .env.local` and fill in the Twilio values, as in the
   Mixologist README. `OPENAI_API_KEY` is not needed.
2. Add `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` (test keys first).
3. In the Razorpay dashboard add a webhook to
   `<PUBLIC_BASE_URL>/webhooks/razorpay` for the `payment_link.paid` event and
   put its secret in `RAZORPAY_WEBHOOK_SECRET`.
4. `pnpm run create-twilio-res`, then `pnpm run update-config` after any menu
   change, then `pnpm dev` behind a public HTTPS URL.
5. Test in the Twilio WhatsApp sandbox first, then move to the live sender.

The "order ready" message uses a WhatsApp Content template created by the
Mixologist scripts. Check it exists and is approved for the sender in use.

## Leads

`pnpm download <event-slug>` writes `attendees-<event-slug>.csv` with
FullName, Email, Country, FoundInSegment, CompletedSignup, Event, Stage,
QuizResult. Attendee records expire from Twilio Sync after 6 weeks. The
client wants leads in their own database: the way to send them is still to be
agreed.

## Tests

`pnpm test`. `__tests__/lib/cafe/` covers the quiz, pricing, the flow, payment
confirmation, the webhook signature check, the lead export and a full
journey through both webhook routes with in-memory Twilio. The five
`checkConfig` tests need live Twilio credentials and fail without them.

## Before production

Open items that must be settled and checked before go-live:

- [ ] **Client database for leads (decision pending).** The code is ready but
  switched off. Each verified sign-up is posted as signed JSON to
  `LEADS_WEBHOOK_URL` (secret in `LEADS_WEBHOOK_SECRET`, signature in the
  `X-Signature` header, `Idempotency-Key` header, no phone number). Needs the
  client's endpoint that writes to their database and upserts by email plus
  event. Until it is set, leads exist only in Twilio Sync (kept 6 weeks) and
  in `pnpm download <event>`.
- [ ] Confirm the DEFAULT and CLIENT rules in `src/config/cafe-rules.ts`.
- [ ] What "found in Segment" means (see the client document).
- [ ] Display board for ready order numbers (not built).
- [ ] Replace the placeholders: 20 quiz questions, add-ons, prices, menu.
- [ ] Switch Razorpay and the WhatsApp sender from test to live.
- [ ] Rotate every key and password that was used during testing.

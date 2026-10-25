# Builder's Cafe flow

This fork adds a quiz, priced menu and Razorpay payment to Twilio Mixologist.
The OpenAI agent is no longer used: attendees choose from the fixed menu by
replying with a number or an item name.

## Journey

1. QR code opens WhatsApp; welcome message.
2. Name, email, emailed code (existing `LEAD_COLLECTION=MANUAL` flow). On
   success `completedSignup` is saved and the quiz starts.
3. Quiz: 3 random questions from the bank in `src/config/quiz-bank.ts`.
4. Coffee menu, then optional savoury, with prices from `src/config/menus.ts`.
5. Total is added up on the server. Total 0: order is queued at once.
   Total above 0: a Razorpay payment link is sent in the chat. The order is
   queued only after the verified `payment_link.paid` webhook.
6. Barista Order Dashboard (unchanged): Finish sends the ready message.

Code: `src/lib/cafe/` (flow, quiz, pricing, payment, messages),
`src/app/webhooks/razorpay/route.ts`, `src/lib/razorpay.ts`.

## DEFAULT RULES (to confirm with the client)

All in `src/config/cafe-rules.ts`. These are developer defaults, not client
decisions:

| Rule | Default |
| --- | --- |
| Questions per attendee | 3 |
| Pass mark | all 3 correct |
| Attempts | 2 (one retry with new questions) |
| After the last failed attempt | can still buy items with a price above 0 |
| Free items per attendee per day | 1 |
| Savoury | optional, one coffee plus at most one savoury |
| Unpaid link expiry | 10 minutes |

Also placeholders to replace: the 15 quiz questions, the savoury items and
all prices in `menus.ts`.

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
QuizResult. Attendee records expire from Twilio Sync after 2 weeks, so export
weekly during a 5-week event.

## Tests

`pnpm test`. `__tests__/lib/cafe/` covers the quiz, pricing, the flow, payment
confirmation, the webhook signature check, the lead export and a full
journey through both webhook routes with in-memory Twilio. The five
`checkConfig` tests need live Twilio credentials and fail without them.

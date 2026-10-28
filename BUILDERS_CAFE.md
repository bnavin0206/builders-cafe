# Builder's Cafe flow

This fork adds a quiz, priced menu and Razorpay payment to Twilio Mixologist.
The OpenAI agent is no longer used: attendees choose from the fixed menu by
replying with a number or an item name.

## Journey

1. QR code opens WhatsApp; welcome message.
2. Sign-up in the chat: name, email, company, city. There is no emailed
   code (`verifyEmail: false` in `cafe-rules.ts`; set it to true to bring the
   code back). When the city arrives `completedSignup` is saved.
3. Segment check: an attendee whose email is already found in Segment is
   blocked (stage `BLOCKED`) and goes no further.
4. Quiz: anyone who has already taken part in the quiz (for example by
   scanning the QR code again) skips it and goes to the paid menu. Anyone in
   the middle of a step just gets the current prompt again. Everyone else
   gets 3 random questions from the bank in `src/config/quiz-bank.ts`
   (20 placeholders). One attempt.
5. All correct: free coffee, then add-ons (sugar and others, from the event's
   modifier list), then optional paid items: several can be picked, one at a
   time in the list (then Done) or as numbers in one reply ("1,3"), repeats
   allowed. Any answer wrong: the paid menu only, where the attendee picks
   several priced items (drinks and snacks) the same way, at least one, then
   add-ons if the order has a drink. At most `maxItemsPerOrder` items (10).
6. Total is added up on the server. Total 0: order is queued at once.
   Total above 0: a Razorpay payment link (valid 2 minutes) is sent in the
   chat. The order is queued only after the verified `payment_link.paid`
   webhook. There is no cancel option.
7. Barista Order Dashboard: Finish marks the order ready.

### WhatsApp list pickers

The coffee, add-on and extra menus are sent as WhatsApp list pickers (a button
that opens a list; each row has the item and its price). Add-ons are picked
one at a time, then "Done". Templates `mixologist_cafe_list_1` to `_10` (one
per row count; created by `create-twilio-res` and at app start) carry them.
Each row's id is the option number, so a typed number or item name works too.
If a list cannot be sent (template missing, more than 10 rows) the flow sends
the plain numbered text menu instead. Lists only work inside the 24-hour chat
window and need no Meta approval. Titles are cut to 24 characters and
descriptions to 72. The webhook logs the field names of the first list reply
("Interactive reply fields") so they can be checked against what Twilio sends.

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
| Items in one order | up to 10 (the free coffee counts as one); paid menus allow several items, repeats allowed | DEFAULT |
| Email verification code | off, just ask for email, company and city | CLIENT |
| Block if found in Segment | yes | CLIENT (confirm what "found" means; the email is not verified, so a different address gets past it) |
| Mobile number check | records are keyed by the phone number, the same on WhatsApp and SMS; a number with a quiz result or attempt has taken part | CLIENT |
| Already took the quiz, after sign-up or re-scan | go to the paid menu | CLIENT (confirm for winners who have not taken the free coffee; they can reply MENU) |
| Unpaid link expiry | 2 minutes | CLIENT |

Menu (from the client, may change later; `menus.ts`): free with the quiz are
Cappuccino, Cafe Latte, Masala Chai and Tapri Coffee. The paid menu has ten
drinks: Espresso, Cappuccino, Cafe Latte, Tapri Coffee, Masala Chai and Hot
Chocolate at Rs 80 (hot), Cold Coffee, Frappe Mocha, Cold Chocolate and Cold
Americano at Rs 100 (cold). A drink that is both free and paid is listed twice
under the same title; the app finds the free or the priced one by context. The
event's menu is copied into the event when it is created, so changing
`menus.ts` does not change a live event. To change names, prices and add-ons of
a live event, use the "Menu, prices and add-ons" section of the event page in
the dashboard (admin or barista login): edit an item's name or price (0 means
free, the quiz prize), add an item, or remove one. Changes save automatically
and apply to new orders; a menu that fails the checks (a price that is not a
whole number of rupees from 0 to 10000, a name over 24 characters, a repeated
short title, the same drink twice at the free or at a paid price) is shown but
not saved. The checks are in `src/lib/cafe/menu-validation.ts`.

Still placeholders: the add-on list. The quiz now has the client's 30 questions.

Open: the display board for ready order numbers is not built yet. The
WhatsApp ready message still comes from the dashboard's Finish button.

Attendee records are kept for 6 weeks (`EventLengthInSeconds`) so the quiz
result and the free coffee are remembered for the whole event.

## Setup

1. `cp .env.example .env.local` and fill in the Twilio values, as in the
   Mixologist README. Twilio Verify and SendGrid are not needed while
   `verifyEmail` is false. `OPENAI_API_KEY` is not needed.
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
- [ ] **"Forget me" lets a person retake the quiz.** It deletes the record,
  so the number is treated as new. Closing this needs a stored marker for the
  number (a salted hash) that survives deletion, which needs a privacy
  decision from the client.
- [ ] Confirm the DEFAULT and CLIENT rules in `src/config/cafe-rules.ts`.
- [ ] What "found in Segment" means (see the client document).
- [ ] **Order display (decision pending, not built).** A full-screen page for
  a TV, `/event/<slug>/board`, showing each order's number and items under
  three statuses: Preparing (queued), Ready (marked ready with the check mark)
  and Delivered (marked served; only the last 10 minutes or last N orders so it
  stays short; cancelled orders are not shown). It refreshes every few seconds
  from a new read-only feed that returns only the order number, the items and
  the status, never names, phones or payment details. A newly ready order is
  highlighted once; no sound, because browsers block autoplay.
  Design samples are in `docs/order-board/` (`landscape.html` for 1920x1080,
  `portrait.html` for 1080x1920, with preview images). Tokens look like tea
  stall chits: red order number on a stub, dashed tear line, punched notches;
  blue Preparing, marigold Ready (the biggest), grey Delivered. Landscape is
  three columns; portrait is three stacked bands, Ready first.
  To decide: (1) landscape, portrait, or one page that switches by itself
  (recommended, works on any TV); (2) access: a link with a secret key
  (recommended, nothing to type on the TV), a fully open page, or the kiosk
  login (`KIOSK_LOGIN`, which expires after a day); (3) how long Delivered
  stays; (4) add-ons on the TV or not (recommended: not); (5) changes to the
  colours, words or layout. Also to handle when building: more orders than fit
  on screen (show "+N more", newest first), and order numbers do not restart
  at #1 (rebuild the order list once before the event if wanted). The TV needs
  the app reachable, so this depends on the hosting decision.
- [ ] **Pickup flow and the "order ready" message.** Built: each order keeps
  the attendee's sign-up name, the dashboard shows it next to the masked
  number, and the ready message now reads "Your {item} is ready. Please show
  order number {N} or your name at the {pickup}. Enjoy your drink!" (en,
  pt-BR, fr). To finish: recreate the `order_ready` templates on Twilio
  (`OVERRIDE_TEMPLATES=1 pnpm run create-twilio-res` deletes and recreates
  all `mixologist_` templates), and for a real WhatsApp sender get the new
  text approved by Meta. Still undecided: a follow-up message when an order is
  marked served. Razorpay links already carry the attendee's name, email and
  phone.
- [ ] Confirm the menu, prices and the add-on list (the add-ons are still placeholders).
- [ ] Switch Razorpay and the WhatsApp sender from test to live.
- [ ] Rotate every key and password that was used during testing.

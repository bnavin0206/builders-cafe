// Central type definitions for the application.
// All shared interfaces and enums live here to avoid circular imports.

export enum EventState {
  OPEN = "OPEN",
  ENDED = "ENDED",
  CLOSED = "CLOSED",
}

export enum Stages {
  NEW_USER = "NEW_USER",
  NAME_CONFIRMED = "NAME_CONFIRMED",
  ASK_COMPANY = "ASK_COMPANY",
  ASK_CITY = "ASK_CITY",
  VERIFYING = "VERIFYING",
  VERIFIED_USER = "VERIFIED_USER",
  BLOCKED = "BLOCKED",
  QUIZ = "QUIZ",
  QUIZ_FAILED = "QUIZ_FAILED",
  PICK_COFFEE = "PICK_COFFEE",
  PICK_ADDONS = "PICK_ADDONS",
  PICK_EXTRA = "PICK_EXTRA",
  AWAITING_PAYMENT = "AWAITING_PAYMENT",
  FIRST_ORDER = "FIRST_ORDER",
  REPEAT_CUSTOMER = "REPEAT_CUSTOMER",
}

export enum modes {
  barista = "barista",
  smoothie = "smoothie",
  cocktail = "cocktail",
  tea = "tea",
  waffles = "waffles",
}

export type Language = "en" | "pt-BR" | "fr";

export type MenuCategory = "coffee" | "savoury";

export interface MenuItem {
  shortTitle: string;
  title: string;
  description: string;
  originalTitle?: string;
  // Price in INR (whole rupees). 0 means free. Unset is treated as free so
  // menus from the original app keep working.
  price?: number;
  category?: MenuCategory;
}

export type Menus = {
  [key in modes]: {
    items: MenuItem[];
    modifiers?: string[];
  };
};

export interface Order {
  key: string;
  manual?: boolean;
  item: string;
  modifiers?: string;
  address?: string;
  // Attendee's sign-up name, so staff can match a pickup by name.
  name?: string;
  orderNumber?: number;
  originalText?: string;
  status: "queued" | "cancelled" | "ready" | "delivered";
  reminded?: true;
  channel?: "rcs" | "whatsapp" | "sms" | "api" | "other";
  // Extra paid item chosen after the coffee (shown on the dashboard).
  extras?: string;
  // Set for orders that went through the cafe flow. A free order has
  // amountPaise 0 and no paymentId.
  amountPaise?: number;
  paymentId?: string;
}

/** One row of a WhatsApp list picker. */
export interface ListRow {
  /** Sent back to us when the row is tapped (not shown). */
  id: string;
  /** At most 24 characters. */
  title: string;
  /** At most 72 characters. */
  description: string;
}

export interface Selection {
  items: MenuItem[];
  modifiers: string[];
  originalModifiers?: string[];
  mode: modes;
}

export type LeadCollection = "MANUAL" | "WeAreDevs_QR" | "NONE";

export interface Event {
  name: string;
  slug: string;
  state: EventState;
  leadCollection: LeadCollection;
  senders: string[];
  selection: Selection;
  pickupLocation: string;
  maxOrders: number;
  welcomeMessage: string;
  followUpMessage?: string;
  language?: Language;
  // Verification email content. Unset promo code hides the promo block;
  // the code snippet shows unless explicitly set to false.
  emailPromoCode?: string;
  // Free text incl. currency, e.g. "$25". Defaults to "$25" when a code is set.
  emailPromoAmount?: string;
  emailShowCodeSnippet?: boolean;
  cancelledCount?: number;
  deliveredCount?: number;
  // ISO string; wheel-of-twilio stores an epoch-ms `clearedAt` for the same
  // concept. Kept as separate fields on purpose — the CSV cleanser doesn't
  // consume this field, so the shape divergence has no downstream effect.
  lastClearedAt?: string;
}

export interface SegmentData {
  foundInSegment: boolean;
  [trait: string]: unknown;
}

export interface PendingOrder {
  /** The free coffee, when the attendee won one. */
  coffee?: string;
  /** Paid items, one entry per unit (a repeated title means a quantity). */
  items?: string[];
  addOns?: string[];
  /** Older orders: a single paid extra. Read as `items: [extra]`. */
  extra?: string;
  amountPaise: number;
  linkId: string;
  linkUrl: string;
  expiresAt: string; // ISO time
}

export interface AttendeeRecord {
  from?: string;
  event?: string;
  stage?: Stages;
  orderCount?: number;
  lastOrderNumber?: number;
  dailyOrderCount?: number;
  dailyOrderDate?: string;
  aiHistory?: Array<{ role: string; content: string }>;
  profileId?: string;
  fullName?: string;
  email?: string;
  checkSid?: string;
  company?: string;
  jobTitle?: string;
  city?: string;
  country?: string;
  foundInSegment?: boolean;
  completedSignup?: boolean;
  // Quiz progress. The result and the free coffee count last for the whole event.
  quizQuestions?: string[];
  quizSeen?: string[];
  quizIndex?: number;
  quizCorrect?: number;
  quizAttempts?: number;
  quizResult?: "passed" | "failed";
  // "free" shows every item, "paid" shows only items with a price above 0.
  menuMode?: "free" | "paid";
  // Free coffees taken so far, for the whole event.
  freeCoffeesTaken?: number;
  cartCoffee?: string;
  // Paid items chosen so far, one entry per unit.
  cartItems?: string[];
  // Which page (group, such as Hot or Cold) of a long paid list was last shown.
  cartGroup?: string;
  cartAddOns?: string[];
  pendingOrder?: PendingOrder;
  lastPaymentId?: string;
  [traitKey: string]: unknown;
}

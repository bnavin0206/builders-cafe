import { createHash, createHmac } from "node:crypto";
import type { AttendeeRecord, Event } from "@/types";

/**
 * Sends each verified lead to the client's database.
 *
 * We do not connect to their database directly. We post a signed JSON body to
 * a URL they provide (LEADS_WEBHOOK_URL), and their side writes it to the
 * database. The body has no phone number. The endpoint should upsert by
 * `email` plus `event`, because the same lead can be sent more than once.
 */
export interface LeadPayload {
  fullName?: string;
  email?: string;
  country?: string;
  foundInSegment: boolean;
  completedSignup: boolean;
  event?: string;
  stage?: string;
  verifiedAt: string; // ISO time
}

const TIMEOUT_MS = 4000;

export function buildLead(
  record: Partial<AttendeeRecord>,
  event: Pick<Event, "slug">,
  now: Date = new Date(),
): LeadPayload {
  return {
    fullName: record.fullName,
    email: record.email,
    country: record.country,
    foundInSegment: record.foundInSegment === true,
    completedSignup: true,
    event: event.slug,
    stage: record.stage,
    verifiedAt: now.toISOString(),
  };
}

export function signBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/** Stable id so the receiver can ignore a lead it has already stored. */
export function idempotencyKey(lead: Pick<LeadPayload, "email" | "event">): string {
  return createHash("sha256")
    .update(`${(lead.email ?? "").toLowerCase()}|${lead.event ?? ""}`)
    .digest("hex");
}

export type SendResult = "sent" | "skipped" | "failed";

/**
 * Posts one lead. Never throws, so a slow or broken endpoint cannot stop the
 * attendee from taking part. Returns what happened.
 */
export async function sendLead(
  lead: LeadPayload,
  env: Record<string, string | undefined> = process.env,
  fetchFn: typeof fetch = fetch,
): Promise<SendResult> {
  const url = env.LEADS_WEBHOOK_URL;
  if (!url) return "skipped";

  const body = JSON.stringify(lead);
  const secret = env.LEADS_WEBHOOK_SECRET;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Idempotency-Key": idempotencyKey(lead),
    ...(secret ? { "X-Signature": signBody(body, secret) } : {}),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchFn(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`Lead endpoint answered ${res.status}`);
      return "failed";
    }
    return "sent";
  } catch (e) {
    console.error("Could not send lead", e);
    return "failed";
  } finally {
    clearTimeout(timer);
  }
}

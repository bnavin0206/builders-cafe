import { describe, test, expect } from "vitest";
import { getExpectedTwilioSignature } from "twilio/lib/webhooks/webhooks";
import { signatureMode, twilioSignatureValid } from "@/lib/twilio/webhook-signature";

const TOKEN = "t".repeat(32);
const BASE = "https://cafe.example.net";
const params = { From: "whatsapp:+919800000001", To: "whatsapp:+918197025003", Body: "Hi" };
const sign = (url: string, p: Record<string, string> = params) => getExpectedTwilioSignature(TOKEN, url, p);

describe("signature mode", () => {
  test("report is the default; true turns it on; off switches it off", () => {
    expect(signatureMode({})).toBe("report");
    expect(signatureMode({ REQUIRE_TWILIO_SIGNATURE: "" })).toBe("report");
    for (const v of ["true", "TRUE", "1", "yes", "enforce"]) expect(signatureMode({ REQUIRE_TWILIO_SIGNATURE: v })).toBe("enforce");
    for (const v of ["off", "false", "0", "no"]) expect(signatureMode({ REQUIRE_TWILIO_SIGNATURE: v })).toBe("off");
    expect(signatureMode({ REQUIRE_TWILIO_SIGNATURE: "maybe" })).toBe("report");
  });
});

describe("Twilio signature", () => {
  const check = (over: Partial<Parameters<typeof twilioSignatureValid>[0]> = {}) =>
    twilioSignatureValid({
      authToken: TOKEN,
      signature: sign(`${BASE}/webhooks/messaging`),
      publicBaseUrl: BASE,
      path: "/webhooks/messaging",
      params,
      ...over,
    });

  test("a message signed by Twilio for our address is accepted", () => {
    expect(check()).toBe(true);
  });

  test("a trailing slash on the base address does not matter", () => {
    expect(check({ publicBaseUrl: `${BASE}/` })).toBe(true);
  });

  test("a changed body, a wrong token, a wrong address or no signature are all refused", () => {
    expect(check({ params: { ...params, Body: "Hi there" } })).toBe(false);
    expect(check({ authToken: "x".repeat(32) })).toBe(false);
    expect(check({ publicBaseUrl: "https://other.example.net" })).toBe(false);
    expect(check({ signature: null })).toBe(false);
    expect(check({ signature: "" })).toBe(false);
    expect(check({ signature: "not-a-signature" })).toBe(false);
  });

  test("with the token or the public address missing nothing can be verified", () => {
    expect(check({ authToken: undefined })).toBe(false);
    expect(check({ publicBaseUrl: undefined })).toBe(false);
  });
});

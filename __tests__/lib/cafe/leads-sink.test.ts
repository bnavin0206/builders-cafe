import { describe, test, expect, vi } from "vitest";
import { createHmac } from "node:crypto";
import { buildLead, sendLead, idempotencyKey } from "@/lib/cafe/leads-sink";

const lead = buildLead(
  {
    fullName: "Asha Rao",
    email: "Asha@Example.com",
    country: "India",
    foundInSegment: false,
    stage: "VERIFIED_USER",
    from: "whatsapp:+14155238886",
  } as any,
  { slug: "builders-cafe" },
  new Date("2026-11-12T10:00:00Z"),
);

const ok = () => new Response(null, { status: 200 });

describe("lead payload", () => {
  test("has the fields the client brief promises and no phone number", () => {
    expect(lead).toEqual({
      fullName: "Asha Rao",
      email: "Asha@Example.com",
      country: "India",
      foundInSegment: false,
      completedSignup: true,
      event: "builders-cafe",
      stage: "VERIFIED_USER",
      verifiedAt: "2026-11-12T10:00:00.000Z",
    });
    expect(JSON.stringify(lead)).not.toMatch(/\+91|whatsapp|phone/i);
  });

  test("the idempotency key ignores email case", () => {
    expect(idempotencyKey(lead)).toBe(idempotencyKey({ ...lead, email: "asha@example.com" }));
    expect(idempotencyKey(lead)).not.toBe(idempotencyKey({ ...lead, event: "other" }));
  });
});

describe("sendLead", () => {
  test("does nothing when no URL is set", async () => {
    const f = vi.fn();
    expect(await sendLead(lead, {}, f as any)).toBe("skipped");
    expect(f).not.toHaveBeenCalled();
  });

  test("posts signed JSON with an idempotency key", async () => {
    const f = vi.fn().mockResolvedValue(ok());
    const env = { LEADS_WEBHOOK_URL: "https://example.com/leads", LEADS_WEBHOOK_SECRET: "s3cret" };
    expect(await sendLead(lead, env, f as any)).toBe("sent");
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("https://example.com/leads");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify(lead));
    expect(init.headers["X-Signature"]).toBe(
      createHmac("sha256", "s3cret").update(init.body).digest("hex"),
    );
    expect(init.headers["Idempotency-Key"]).toBe(idempotencyKey(lead));
  });

  test("sends without a signature when no secret is set", async () => {
    const f = vi.fn().mockResolvedValue(ok());
    await sendLead(lead, { LEADS_WEBHOOK_URL: "https://example.com/leads" }, f as any);
    expect(f.mock.calls[0]![1].headers["X-Signature"]).toBeUndefined();
  });

  test("a failing endpoint is reported, not thrown", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const env = { LEADS_WEBHOOK_URL: "https://example.com/leads" };
    const bad = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    expect(await sendLead(lead, env, bad as any)).toBe("failed");
    const down = vi.fn().mockRejectedValue(new Error("network"));
    expect(await sendLead(lead, env, down as any)).toBe("failed");
    err.mockRestore();
  });
});

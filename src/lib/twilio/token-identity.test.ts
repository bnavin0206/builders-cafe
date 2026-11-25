import { describe, expect, it } from "vitest";
import twilio from "twilio";
import { tokenIdentity } from "./token-identity";

const make = (identity: string) => {
  const AccessToken = twilio.jwt.AccessToken;
  const t = new AccessToken("ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "SKaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "secret", { identity });
  t.addGrant(new AccessToken.SyncGrant({ serviceSid: "ISaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }));
  return t.toJwt();
};

describe("token identity", () => {
  it("reads who the token was made for", () => {
    expect(tokenIdentity(make("admin"))).toBe("admin");
    expect(tokenIdentity(make("mixologist"))).toBe("mixologist");
    expect(tokenIdentity(make("unknown"))).toBe("unknown");
  });
  it("gives nothing for text that is not a token", () => {
    expect(tokenIdentity("")).toBeUndefined();
    expect(tokenIdentity("abc")).toBeUndefined();
    expect(tokenIdentity("a.b.c")).toBeUndefined();
  });
});

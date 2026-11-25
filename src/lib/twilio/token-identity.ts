/**
 * Who a Sync access token was made for ("admin", "mixologist" or "unknown").
 * "unknown" means the browser did not send its login with the request, so Twilio
 * will refuse almost everything. Only the token's own text is read here; nothing is checked or trusted.
 */
export function tokenIdentity(token: string): string | undefined {
  try {
    const payload = token.split(".")[1];
    if (!payload) return undefined;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = typeof atob === "function" ? atob(base64) : Buffer.from(base64, "base64").toString("utf8");
    return JSON.parse(json)?.grants?.identity;
  } catch {
    return undefined;
  }
}

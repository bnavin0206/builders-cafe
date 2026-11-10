import { validateRequest } from "twilio";

/**
 * How strictly the WhatsApp webhook checks that a message really comes from
 * Twilio (it signs every request with the account's auth token).
 * - "report" (the default): a failed check is logged and the message is still
 *   processed, so a wrong address setting can never cut the cafe off.
 * - "enforce": a failed check is refused with 403. Switch it on with
 *   REQUIRE_TWILIO_SIGNATURE=true once the log shows no failures.
 * - "off": no check (REQUIRE_TWILIO_SIGNATURE=off).
 */
export type SignatureMode = "off" | "report" | "enforce";

export function signatureMode(env: Record<string, string | undefined> = process.env): SignatureMode {
  const v = (env.REQUIRE_TWILIO_SIGNATURE ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "enforce"].includes(v)) return "enforce";
  if (["off", "false", "0", "no"].includes(v)) return "off";
  return "report";
}

/**
 * True when the signature matches. Twilio signs the exact public address it
 * called, so the address is built from PUBLIC_BASE_URL and the path rather than
 * from the request, which inside the container shows an internal host.
 */
export function twilioSignatureValid(args: {
  authToken: string | undefined;
  signature: string | null;
  publicBaseUrl: string | undefined;
  path: string;
  params: Record<string, string>;
}): boolean {
  const { authToken, signature, publicBaseUrl, path, params } = args;
  if (!authToken || !signature || !publicBaseUrl) return false;
  const url = `${publicBaseUrl.replace(/\/+$/, "")}${path}`;
  try {
    return validateRequest(authToken, signature, url, params);
  } catch {
    return false;
  }
}

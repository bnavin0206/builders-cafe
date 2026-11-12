/**
 * Turns what a person types into +<country><number>, or null when it cannot be a mobile number.
 * Ten digits starting 6-9 are taken as Indian numbers; a leading 0, 91 or +91 is accepted.
 */
export function normalizePhone(input: string): string | null {
  const raw = input.trim();
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  let national = digits;
  if (national.length === 12 && national.startsWith("91")) national = national.slice(2);
  else if (national.length === 11 && national.startsWith("0")) national = national.slice(1);
  return /^[6-9]\d{9}$/.test(national) ? `+91${national}` : null;
}

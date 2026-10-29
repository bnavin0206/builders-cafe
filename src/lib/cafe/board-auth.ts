import { createHash, timingSafeEqual } from "node:crypto";

/** A shorter key is treated as no key: the board stays switched off. */
export const MIN_BOARD_KEY_LENGTH = 16;

/**
 * The TV order board is opened with a link that carries a secret key
 * (`.../board?key=...`), set in BOARD_KEY. With no key set the board is off.
 */
export function isBoardKey(candidate: string | null | undefined): boolean {
  const key = process.env.BOARD_KEY ?? "";
  if (key.length < MIN_BOARD_KEY_LENGTH || !candidate) return false;
  const a = createHash("sha256").update(key).digest();
  const b = createHash("sha256").update(candidate).digest();
  return timingSafeEqual(a, b);
}

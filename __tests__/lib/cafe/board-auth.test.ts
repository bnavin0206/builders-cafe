import { describe, test, expect, afterEach } from "vitest";
import { isBoardKey } from "@/lib/cafe/board-auth";

const KEY = "k3y-for-the-tv-0123456789abcdef";
const original = process.env.BOARD_KEY;
afterEach(() => {
  if (original === undefined) delete process.env.BOARD_KEY;
  else process.env.BOARD_KEY = original;
});

describe("isBoardKey", () => {
  test("accepts the right key", () => {
    process.env.BOARD_KEY = KEY;
    expect(isBoardKey(KEY)).toBe(true);
  });

  test("rejects a wrong, empty or missing key", () => {
    process.env.BOARD_KEY = KEY;
    for (const bad of ["nope", KEY + "x", KEY.slice(0, -1), "", null, undefined]) {
      expect(isBoardKey(bad as any)).toBe(false);
    }
  });

  test("with no BOARD_KEY the board is off, even for an empty or any key", () => {
    delete process.env.BOARD_KEY;
    for (const k of ["", "anything", undefined, null]) expect(isBoardKey(k as any)).toBe(false);
  });

  test("a key shorter than 16 characters counts as no key", () => {
    process.env.BOARD_KEY = "short";
    expect(isBoardKey("short")).toBe(false);
  });
});

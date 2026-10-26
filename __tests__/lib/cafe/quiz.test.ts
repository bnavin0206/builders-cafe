import { describe, test, expect } from "vitest";
import { quizBank } from "@/config/quiz-bank";
import {
  pickQuestions,
  parseOption,
  isCorrect,
  shuffle,
} from "@/lib/cafe/quiz";

const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

describe("quiz bank", () => {
  test("has 20 questions with 3 options and a valid correct index", () => {
    expect(quizBank).toHaveLength(20);
    const ids = new Set(quizBank.map((q) => q.id));
    expect(ids.size).toBe(20);
    for (const q of quizBank) {
      expect(q.options).toHaveLength(3);
      expect([0, 1, 2]).toContain(q.correct);
    }
  });
});

describe("pickQuestions", () => {
  test("returns 3 different ids from the bank", () => {
    const ids = pickQuestions(quizBank, 3, [], seeded(1));
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(quizBank.some((q) => q.id === id)).toBe(true);
  });

  test("different seeds give different sets over many draws", () => {
    const sets = new Set<string>();
    for (let s = 1; s <= 30; s++) {
      sets.add(pickQuestions(quizBank, 3, [], seeded(s)).join(","));
    }
    expect(sets.size).toBeGreaterThan(10);
  });

  test("a retry avoids questions already shown", () => {
    const first = pickQuestions(quizBank, 3, [], seeded(7));
    const retry = pickQuestions(quizBank, 3, first, seeded(8));
    expect(retry.some((id) => first.includes(id))).toBe(false);
  });

  test("falls back to seen questions when the bank is small", () => {
    const small = quizBank.slice(0, 4);
    const ids = pickQuestions(small, 3, ["q1", "q2", "q3"], seeded(3));
    expect(ids).toHaveLength(3);
    expect(ids[0]).toBe("q4");
  });

  test("never mutates the bank", () => {
    const before = quizBank.map((q) => q.id).join();
    pickQuestions(quizBank, 3, [], seeded(2));
    shuffle(quizBank, seeded(2));
    expect(quizBank.map((q) => q.id).join()).toBe(before);
  });
});

describe("parseOption and isCorrect", () => {
  const q = quizBank[0]!; // correct = 0

  test.each([
    ["1", 0],
    ["2", 1],
    ["3", 2],
    ["a", 0],
    [" B ", 1],
    ["c", 2],
    ["option b", 1],
    ["Option B", 1],
    ["option d", null],
    ["4", null],
    ["", null],
    ["hello", null],
  ])("parses %j", (reply, expected) => {
    expect(parseOption(reply, q)).toBe(expected);
  });

  test("checks the correct option", () => {
    expect(isCorrect(q, 0)).toBe(true);
    expect(isCorrect(q, 1)).toBe(false);
  });
});

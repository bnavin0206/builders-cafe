import { describe, test, expect } from "vitest";
import { quizBank } from "@/config/quiz-bank";
import {
  pickQuestions,
  parseOption,
  isCorrect,
  shuffle,
  formatQuestion,
} from "@/lib/cafe/quiz";

const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

describe("quiz bank", () => {
  test("has 30 questions with 3 or 4 options and a valid correct index", () => {
    expect(quizBank).toHaveLength(30);
    const ids = new Set(quizBank.map((q) => q.id));
    expect(ids.size).toBe(30);
    for (const q of quizBank) {
      expect([3, 4]).toContain(q.options.length);
      expect(Number.isInteger(q.correct)).toBe(true);
      expect(q.correct).toBeGreaterThanOrEqual(0);
      expect(q.correct).toBeLessThan(q.options.length);
      expect(new Set(q.options).size).toBe(q.options.length);
    }
  });

  test("the right answer is not always in the same position", () => {
    const positions = new Set(quizBank.map((q) => q.correct));
    expect(positions.size).toBe(4);
    const mostCommon = Math.max(
      ...[0, 1, 2, 3].map((p) => quizBank.filter((q) => q.correct === p).length),
    );
    expect(mostCommon).toBeLessThanOrEqual(10);
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
    const ids = pickQuestions(small, 3, [quizBank[0]!.id, quizBank[1]!.id, quizBank[2]!.id], seeded(3));
    expect(ids).toHaveLength(3);
    expect(ids[0]).toBe(quizBank[3]!.id);
  });

  test("never mutates the bank", () => {
    const before = quizBank.map((q) => q.id).join();
    pickQuestions(quizBank, 3, [], seeded(2));
    shuffle(quizBank, seeded(2));
    expect(quizBank.map((q) => q.id).join()).toBe(before);
  });
});

describe("parseOption and isCorrect", () => {
  const q = quizBank[0]!; // 4 options, correct = 0

  test.each([
    ["1", 0],
    ["2", 1],
    ["3", 2],
    ["4", 3],
    ["a", 0],
    [" B ", 1],
    ["c", 2],
    ["D", 3],
    ["5", null],
    ["e", null],
    ["", null],
    ["hello", null],
  ])("parses %j", (reply, expected) => {
    expect(parseOption(reply, q)).toBe(expected);
  });

  test("accepts the text of an option", () => {
    expect(parseOption(q.options[2]!.toUpperCase(), q)).toBe(2);
  });

  test("a question with 3 options does not accept 4", () => {
    const three = { ...q, options: q.options.slice(0, 3) };
    expect(parseOption("3", three)).toBe(2);
    expect(parseOption("4", three)).toBeNull();
    expect(parseOption("d", three)).toBeNull();
  });

  test("checks the correct option", () => {
    expect(isCorrect(q, 0)).toBe(true);
    expect(isCorrect(q, 1)).toBe(false);
  });
});

describe("formatQuestion", () => {
  test("lists every option and the numbers to reply with", () => {
    const q = quizBank[0]!;
    const text = formatQuestion(q, 1, 3);
    expect(text).toContain("Question 1 of 3");
    q.options.forEach((o, i) => expect(text).toContain(`${i + 1}. ${o}`));
    expect(text).toContain("Reply with 1, 2, 3 or 4.");
  });

  test("a 3-option question says 1, 2 or 3", () => {
    const three = { ...quizBank[0]!, options: quizBank[0]!.options.slice(0, 3) };
    expect(formatQuestion(three, 2, 3)).toContain("Reply with 1, 2 or 3.");
  });
});

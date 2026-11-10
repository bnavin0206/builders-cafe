import { describe, test, expect } from "vitest";
import { surveys } from "@/config/surveys";
import { answerText, formatSurveyQuestion, parseSurveyReply } from "@/lib/cafe/survey";
import { countFreeCoffees, istDay } from "@/lib/cafe/free-limit";

const single = surveys.general[0]!;
const multi = surveys.general[2]!;

describe("survey wording", () => {
  test("the developer survey has 5 questions and the general one 3", () => {
    expect(surveys.dev).toHaveLength(5);
    expect(surveys.general).toHaveLength(3);
  });

  test("every question has options, and Other points at its option", () => {
    for (const q of [...surveys.dev, ...surveys.general]) {
      expect(q.options.length).toBeGreaterThanOrEqual(3);
      if (q.other) expect(q.options[q.other - 1]).toBe("Other (please specify)");
      if (q.other) expect(q.multi).toBe(true);
    }
  });

  test("a question reads as a numbered message", () => {
    expect(formatSurveyQuestion(single, 1, 3)).toBe(
      "Question 1 of 3\nHow has your day-to-day workload evolved over the past 12 months?\n\n1. Increased\n2. Stayed the same\n3. Decreased\n\nReply with the number of your answer.",
    );
    expect(formatSurveyQuestion(multi, 3, 3)).toContain("Reply with the numbers of your answers, for example: 1,3");
  });
});

describe("survey replies", () => {
  test("a single-choice question takes exactly one valid number", () => {
    expect(parseSurveyReply("2", single)).toEqual([2]);
    expect(parseSurveyReply(" 3 ", single)).toEqual([3]);
    for (const bad of ["", "0", "4", "1,2", "two", "1.5", "-1", "01 02"]) {
      expect(parseSurveyReply(bad, single)).toBeNull();
    }
  });

  test("a select-all question takes several, in any order, separated by commas or spaces", () => {
    expect(parseSurveyReply("3,1", multi)).toEqual([1, 3]);
    expect(parseSurveyReply("1 2;5", multi)).toEqual([1, 2, 5]);
    expect(parseSurveyReply("1,1", multi)).toBeNull();
    expect(parseSurveyReply("1,6", multi)).toBeNull();
    expect(parseSurveyReply("1,x", multi)).toBeNull();
  });

  test("the saved answer joins the options, and Other carries the typed text", () => {
    expect(answerText(single, [3])).toBe("Decreased");
    expect(answerText(multi, [1, 3])).toBe("Problem-solving and critical thinking; AI and digital literacy");
    expect(answerText(multi, [2, 5], "Mentoring")).toBe("Creativity and innovation; Other: Mentoring");
  });
});

describe("free coffees a day", () => {
  const at = (iso: string) => new Date(iso);
  const order = (iso: string, data: object | null) => ({ dateCreated: at(iso), data });

  test("the day is the Bengaluru day, not the UTC day", () => {
    expect(istDay(at("2026-11-12T18:29:00Z"))).toBe("2026-11-12"); // 11:59 pm in Bengaluru
    expect(istDay(at("2026-11-12T18:31:00Z"))).toBe("2026-11-13"); // just after midnight
  });

  test("only today's free, not-cancelled orders count", () => {
    const now = at("2026-11-12T10:00:00Z");
    const items = [
      order("2026-11-12T04:00:00Z", { freeCoffee: true, status: "queued" }),
      order("2026-11-12T05:00:00Z", { freeCoffee: true, status: "delivered" }),
      order("2026-11-12T06:00:00Z", { freeCoffee: true, status: "cancelled" }), // given back
      order("2026-11-12T07:00:00Z", { status: "queued" }), // paid only
      order("2026-11-11T07:00:00Z", { freeCoffee: true, status: "queued" }), // yesterday
      order("2026-11-12T08:00:00Z", null),
    ];
    expect(countFreeCoffees(items, now)).toBe(2);
  });

  test("the count restarts at midnight in Bengaluru", () => {
    const items = [order("2026-11-12T18:00:00Z", { freeCoffee: true, status: "queued" })]; // 11:30 pm
    expect(countFreeCoffees(items, at("2026-11-12T18:20:00Z"))).toBe(1);
    expect(countFreeCoffees(items, at("2026-11-12T18:40:00Z"))).toBe(0); // 12:10 am next day
  });
});

import { describe, test, expect } from "vitest";
import { isCompletedSignup, leadRow, LEAD_HEADER, escapeCsv } from "@/lib/cafe/leads";
import { Stages } from "@/types";

describe("leads export", () => {
  test("header starts with the fields the client brief promises", () => {
    expect(LEAD_HEADER.slice(0, 7)).toEqual([
      "FullName", "Email", "Country", "FoundInSegment", "CompletedSignup", "Event", "Stage",
    ]);
  });

  test.each([
    [{ stage: Stages.NEW_USER }, false],
    [{ stage: Stages.NAME_CONFIRMED }, false],
    [{ stage: Stages.VERIFYING }, false],
    [{ stage: Stages.VERIFIED_USER }, true],
    [{ stage: Stages.QUIZ }, true],
    [{ stage: Stages.PICK_COFFEE }, true],
    [{ stage: Stages.AWAITING_PAYMENT }, true],
    [{ stage: Stages.REPEAT_CUSTOMER }, true],
    [{ stage: Stages.NEW_USER, completedSignup: true }, true],
    [{}, false],
  ])("completed signup for %j is %s", (record, expected) => {
    expect(isCompletedSignup(record)).toBe(expected);
  });

  test("writes a row in header order", () => {
    expect(
      leadRow({
        fullName: "Asha Rao",
        email: "asha@example.com",
        country: "India",
        foundInSegment: false,
        completedSignup: true,
        event: "builders-cafe",
        stage: Stages.FIRST_ORDER,
        quizResult: "passed",
        company: "Acme Ltd",
        city: "Chennai",
      }),
    ).toBe("Asha Rao,asha@example.com,India,false,true,builders-cafe,FIRST_ORDER,passed,Acme Ltd,Chennai");
  });

  test("escapes commas, quotes and newlines", () => {
    expect(escapeCsv('Rao, "Asha"')).toBe('"Rao, ""Asha"""');
    expect(escapeCsv("a\nb")).toBe('"a\nb"');
    expect(escapeCsv(null)).toBe("");
  });
});

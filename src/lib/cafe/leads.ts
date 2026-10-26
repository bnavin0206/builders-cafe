import type { AttendeeRecord } from "@/types";
import { Stages } from "@/types";

const VERIFIED_STAGES: string[] = [
  Stages.VERIFIED_USER,
  Stages.BLOCKED,
  Stages.QUIZ,
  Stages.QUIZ_FAILED,
  Stages.PICK_COFFEE,
  Stages.PICK_ADDONS,
  Stages.PICK_EXTRA,
  Stages.AWAITING_PAYMENT,
  Stages.FIRST_ORDER,
  Stages.REPEAT_CUSTOMER,
];

/** True once the attendee has verified their email, whatever they did next. */
export function isCompletedSignup(a: Partial<AttendeeRecord>): boolean {
  return a.completedSignup === true || VERIFIED_STAGES.includes(a.stage ?? "");
}

export function escapeCsv(value: unknown): string {
  const str = value == null ? "" : String(value);
  return str.includes(",") || str.includes('"') || str.includes("\n")
    ? `"${str.replace(/"/g, '""')}"`
    : str;
}

export const LEAD_HEADER = [
  "FullName",
  "Email",
  "Country",
  "FoundInSegment",
  "CompletedSignup",
  "Event",
  "Stage",
  "QuizResult",
  "Company",
  "JobTitle",
];

export function leadRow(a: Partial<AttendeeRecord>): string {
  return [
    a.fullName,
    a.email,
    a.country,
    a.foundInSegment === true,
    isCompletedSignup(a),
    a.event,
    a.stage,
    a.quizResult,
    a.company,
    a.jobTitle,
  ]
    .map(escapeCsv)
    .join(",");
}

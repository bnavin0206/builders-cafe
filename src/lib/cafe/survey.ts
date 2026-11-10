import type { SurveyQuestion } from "@/config/surveys";

/** One survey question as a text message: the question, numbered options, how to reply. */
export function formatSurveyQuestion(q: SurveyQuestion, number: number, total: number): string {
  const lines = q.options.map((o, i) => `${i + 1}. ${o}`);
  const how = q.multi
    ? "Reply with the numbers of your answers, for example: 1,3"
    : "Reply with the number of your answer.";
  return `Question ${number} of ${total}\n${q.text}\n\n${lines.join("\n")}\n\n${how}`;
}

/**
 * The option numbers in a reply, or null when the reply is not valid: every
 * item must be a number on the list, none twice, and a single-choice question
 * takes exactly one. Numbers can be separated by commas, spaces or semicolons.
 */
export function parseSurveyReply(text: string, q: SurveyQuestion): number[] | null {
  const parts = text.split(/[\s,;]+/).filter(Boolean);
  if (parts.length === 0) return null;
  const picks: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,2}$/.test(p)) return null;
    const n = Number(p);
    if (n < 1 || n > q.options.length || picks.includes(n)) return null;
    picks.push(n);
  }
  if (!q.multi && picks.length !== 1) return null;
  return picks.sort((a, b) => a - b);
}

/** What is saved for a question: the chosen options, "Other" replaced by what was typed. */
export function answerText(q: SurveyQuestion, picks: number[], otherText?: string): string {
  return picks
    .map((n) => (q.other === n ? `Other: ${otherText ?? ""}`.trim() : q.options[n - 1]))
    .join("; ");
}

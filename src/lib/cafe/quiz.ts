import type { QuizQuestion } from "@/config/quiz-bank";

export type Rng = () => number;

/**
 * Pick `count` different questions at random. Questions in `exclude` (ids
 * already shown on an earlier attempt) are used only when the rest of the bank
 * is too small, so a retry shows new questions whenever possible.
 */
export function pickQuestions(
  bank: QuizQuestion[],
  count: number,
  exclude: string[] = [],
  rng: Rng = Math.random,
): string[] {
  const fresh = bank.filter((q) => !exclude.includes(q.id));
  const seen = bank.filter((q) => exclude.includes(q.id));
  const pool = [...shuffle(fresh, rng), ...shuffle(seen, rng)];
  return pool.slice(0, count).map((q) => q.id);
}

export function shuffle<T>(items: T[], rng: Rng = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Turn a reply such as "2", " b ", "Option B" into an option index, or null. */
export function parseOption(
  reply: string,
  question: QuizQuestion,
): 0 | 1 | 2 | null {
  const text = reply.trim().toLowerCase();
  if (!text) return null;
  const letters = ["a", "b", "c"];
  for (let i = 0; i < 3; i++) {
    if (text === String(i + 1) || text === letters[i]) return i as 0 | 1 | 2;
  }
  for (let i = 0; i < 3; i++) {
    if (text === question.options[i]!.trim().toLowerCase()) return i as 0 | 1 | 2;
  }
  return null;
}

export function isCorrect(question: QuizQuestion, option: number): boolean {
  return question.correct === option;
}

export function questionById(
  bank: QuizQuestion[],
  id: string,
): QuizQuestion | undefined {
  return bank.find((q) => q.id === id);
}

export function formatQuestion(
  question: QuizQuestion,
  position: number,
  total: number,
): string {
  const lines = question.options.map((o, i) => `${i + 1}. ${o}`);
  return [
    `Question ${position} of ${total}`,
    question.text,
    "",
    ...lines,
    "",
    "Reply with 1, 2 or 3.",
  ].join("\n");
}

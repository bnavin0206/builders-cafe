export interface QuizQuestion {
  id: string;
  text: string;
  // Exactly 3 options, shown as 1, 2 and 3.
  options: [string, string, string];
  // Index (0, 1 or 2) of the correct option.
  correct: 0 | 1 | 2;
}

// PLACEHOLDER questions. The client supplies the real 15 questions, their 3
// options and the correct option. Replace this list; nothing else changes.
export const quizBank: QuizQuestion[] = Array.from({ length: 15 }, (_, i) => ({
  id: `q${i + 1}`,
  text: `Placeholder question ${i + 1}: which option is correct?`,
  options: ["Option A", "Option B", "Option C"] as [string, string, string],
  correct: (i % 3) as 0 | 1 | 2,
}));

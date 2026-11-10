// The two surveys asked after the quiz. Wording is from the client (approved).
// A customer who got every quiz answer right gets the developer survey; anyone
// else gets the general one. Every question is required.
export type SurveyKind = "dev" | "general";

export interface SurveyQuestion {
  id: string;
  text: string;
  options: string[];
  /** "Select all that apply": the customer replies with several numbers. */
  multi: boolean;
  /** 1-based number of the "Other (please specify)" option, when there is one. */
  other?: number;
}

export const surveys: Record<SurveyKind, SurveyQuestion[]> = {
  dev: [
    {
      id: "dev-1",
      text: "What are some of the key factors that influence your day-to-day workload and work-life balance?",
      options: [
        "Managing project deadlines and workloads",
        "Keeping up with evolving technologies and developing new skills",
        "Balancing productivity expectations with available resources",
        "Adapting to changing project requirements and priorities",
      ],
      multi: false,
    },
    {
      id: "dev-2",
      text: "Has AI made you more efficient at your job?",
      options: [
        "Yes",
        "No noticeable difference",
        "AI has made some tasks slower",
        "I do not use AI for work",
      ],
      multi: false,
    },
    {
      id: "dev-3",
      text: "How has the adoption of AI tools influenced productivity expectations?",
      options: [
        "Opportunities to take on more tasks have increased",
        "Expectations around work output have remained largely the same",
        "AI has helped streamline workloads and improve efficiency",
        "Not applicable, I do not use AI at work",
      ],
      multi: false,
    },
    {
      id: "dev-4",
      text: "What takes up the most time that you would rather spend building? (Select all that apply)",
      options: [
        "Debugging and fixing existing code",
        "Documentation and reporting",
        "Managing tools and system integrations",
        "Repetitive coding and testing",
        "Other (please specify)",
      ],
      multi: true,
      other: 5,
    },
    {
      id: "dev-5",
      text: "How often do you use AI tools outside of work (e.g., for personal projects, learning, or daily tasks)?",
      options: [
        "Frequently (daily or almost daily)",
        "Occasionally (a few times a month)",
        "Rarely",
        "I do not use AI outside work",
      ],
      multi: false,
    },
  ],
  general: [
    {
      id: "gen-1",
      text: "How has your day-to-day workload evolved over the past 12 months?",
      options: ["Increased", "Stayed the same", "Decreased"],
      multi: false,
    },
    {
      id: "gen-2",
      text: "How has AI influenced the way you work?",
      options: [
        "Significantly improved my productivity",
        "Helped me complete certain tasks faster",
        "Made little or no difference",
        "I do not use AI at work",
      ],
      multi: false,
    },
    {
      id: "gen-3",
      text: "As AI becomes more common in the workplace, which skills do you think will become most valuable? (Select all that apply)",
      options: [
        "Problem-solving and critical thinking",
        "Creativity and innovation",
        "AI and digital literacy",
        "Communication and collaboration",
        "Other (please specify)",
      ],
      multi: true,
      other: 5,
    },
  ],
};

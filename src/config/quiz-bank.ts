export interface QuizQuestion {
  id: string;
  category: string;
  text: string;
  // 3 or 4 options, shown as 1, 2, 3 (and 4).
  options: string[];
  // Index (0 to options.length - 1) of the correct option.
  correct: number;
}

// The client's questions (questions.json), loaded as is. The option order was
// shuffled once with a fixed seed so the right answer is not always in the
// same position. Keep it fixed: the answer is looked up by position, so
// changing it while an attendee is in the quiz would mislead them.
export const quizBank: QuizQuestion[] = [
  {
    id: "tech1",
    category: "tech",
    text: "What does \"API\" stand for?",
    options: ["Application Programming Interface","Advanced Programming Interface","Application Protocol Interchange","Automated Program Integration"],
    correct: 0,
  },
  {
    id: "tech2",
    category: "tech",
    text: "Which HTTP status code means \"Not Found\"?",
    options: ["500","404","200","301"],
    correct: 1,
  },
  {
    id: "tech3",
    category: "tech",
    text: "Which port does HTTPS use by default?",
    options: ["8080","80","443","22"],
    correct: 2,
  },
  {
    id: "tech4",
    category: "tech",
    text: "What does \"SDK\" stand for?",
    options: ["Standard Development Key","System Design Kit","Source Deployment Kit","Software Development Kit"],
    correct: 3,
  },
  {
    id: "tech5",
    category: "tech",
    text: "Which protocol is used to send email?",
    options: ["SMTP","HTTP","FTP","SSH"],
    correct: 0,
  },
  {
    id: "tech6",
    category: "tech",
    text: "Which of these is a JavaScript runtime?",
    options: ["Angular","Node.js","Laravel","Vue"],
    correct: 1,
  },
  {
    id: "tech7",
    category: "tech",
    text: "What does \"HTTP\" stand for?",
    options: ["Host Transfer Text Protocol","High Transfer Text Protocol","HyperText Transfer Protocol","HyperText Transport Process"],
    correct: 2,
  },
  {
    id: "tech8",
    category: "tech",
    text: "In HTTP, \"GET\", \"POST\", \"PUT\", \"DELETE\" are called:",
    options: ["Adjectives","Adverbs","Nouns","Verbs"],
    correct: 3,
  },
  {
    id: "tech9",
    category: "tech",
    text: "In JavaScript, what is the output of \"true === 1\"?",
    options: ["false","null","NaN","true"],
    correct: 0,
  },
  {
    id: "tech10",
    category: "tech",
    text: "What does \"REST\" stand for in REST API?",
    options: ["Registered Entity State Transfer","Representational State Transfer","Reliable State Transport","Remote Execution State Transfer"],
    correct: 1,
  },
  {
    id: "tech11",
    category: "tech",
    text: "What does \"DNS\" stand for?",
    options: ["Dynamic Network System","Distributed Node Service","Domain Name System","Data Name Service"],
    correct: 2,
  },
  {
    id: "twilio1",
    category: "twilio",
    text: "What does \"TwiML\" stand for?",
    options: ["Twilio Multi Language","Text with Instant Messaging Language","Twilio Manifest","Twilio Markup Language"],
    correct: 3,
  },
  {
    id: "twilio2",
    category: "twilio",
    text: "Which Twilio product handles programmable voice calls?",
    options: ["Twilio Voice","Segment","Flex","SendGrid"],
    correct: 0,
  },
  {
    id: "twilio3",
    category: "twilio",
    text: "What is one of Twilio's core values?",
    options: ["Ship It","Draw The Owl","Dream Big","Build Faster"],
    correct: 1,
  },
  {
    id: "twilio4",
    category: "twilio",
    text: "Which product is Twilio's customer data platform?",
    options: ["Verify","Flex","Segment","Studio"],
    correct: 2,
  },
  {
    id: "twilio5",
    category: "twilio",
    text: "Which file format does Twilio use for programmable voice instructions?",
    options: ["YAML","HTML","JSON","XML (TwiML)"],
    correct: 3,
  },
  {
    id: "twilio6",
    category: "twilio",
    text: "Which Twilio product is designed for two-factor authentication?",
    options: ["Verify","Studio","Conversations","Voice"],
    correct: 0,
  },
  {
    id: "twilio7",
    category: "twilio",
    text: "In what year was Twilio founded?",
    options: ["2005","2008","2010","2012"],
    correct: 1,
  },
  {
    id: "twilio8",
    category: "twilio",
    text: "What is the name of Twilio's drag-and-drop communication flow builder?",
    options: ["Flex","Functions","Studio","Autopilot"],
    correct: 2,
  },
  {
    id: "geek1",
    category: "geek",
    text: "In \"The Matrix\", what pill does Neo take?",
    options: ["Blue","Green","Yellow","Red"],
    correct: 3,
  },
  {
    id: "geek2",
    category: "geek",
    text: "Who is the creator of Linux?",
    options: ["Linus Torvalds","Bill Gates","Richard Stallman","Steve Jobs"],
    correct: 0,
  },
  {
    id: "geek3",
    category: "geek",
    text: "In Star Wars, who says \"I am your father\"?",
    options: ["Obi-Wan Kenobi","Darth Vader","Yoda","Luke Skywalker"],
    correct: 1,
  },
  {
    id: "geek4",
    category: "geek",
    text: "What is the answer to life, the universe, and everything?",
    options: ["100","0","42","1"],
    correct: 2,
  },
  {
    id: "geek5",
    category: "geek",
    text: "Which language was the first version of Twitter written in?",
    options: ["JavaScript","Python","Java","Ruby"],
    correct: 3,
  },
  {
    id: "geek6",
    category: "geek",
    text: "What does the acronym \"RTFM\" stand for (polite version)?",
    options: ["Read The Fine Manual","Run The Full Module","Read The Free Manual","Return To File Management"],
    correct: 0,
  },
  {
    id: "geek7",
    category: "geek",
    text: "What is the registry number of Captain Picard's starship in Star Trek: TNG?",
    options: ["NCC-74656","NCC-1701-D","NCC-1701","NX-01"],
    correct: 1,
  },
  {
    id: "geek8",
    category: "geek",
    text: "Who was the director of the movie \"2001: A Space Odyssey\"?",
    options: ["George Lucas","Ridley Scott","Stanley Kubrick","Christopher Nolan"],
    correct: 2,
  },
  {
    id: "geek9",
    category: "geek",
    text: "What programming language was created by Guido van Rossum?",
    options: ["Ruby","Go","Perl","Python"],
    correct: 3,
  },
  {
    id: "geek10",
    category: "geek",
    text: "In \"The Hitchhiker's Guide to the Galaxy\", what is the name of the depressed robot?",
    options: ["Marvin","HAL","Data","R2-D2"],
    correct: 0,
  },
  {
    id: "geek11",
    category: "geek",
    text: "What is the name of the AI computer in the movie \"2001: A Space Odyssey\"?",
    options: ["GLaDOS","HAL 9000","JARVIS","WALL-E"],
    correct: 1,
  },
];

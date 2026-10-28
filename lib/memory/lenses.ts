/**
 * Who is reading: the "ask my memory" section and the contact pitch adapt to it. Remembered per
 * browser; the section's switch and the contact block stay in step through a window event.
 */
export const LENSES = ["founder", "recruiter", "engineer"] as const;
export type Lens = (typeof LENSES)[number];

export const LENS_LABEL: Record<Lens, string> = {
  founder: "Founder",
  recruiter: "Recruiter",
  engineer: "Engineer",
};

export const LENS_QUESTIONS: Record<Lens, readonly string[]> = {
  founder: [
    "Can you automate quoting and follow-ups for a small business?",
    "What did XecSuite do for logistics teams?",
    "Do you make video ads?",
  ],
  recruiter: [
    "How many years of front-end experience do you have?",
    "Which AI models have you shipped with?",
    "Are you certified in Adobe Commerce?",
  ],
  engineer: [
    "How does the NewsStocks pipeline work?",
    "How do you route between private and frontier models?",
    "What stack did you use for e-commerce checkouts?",
  ],
};

export const LENS_PITCH: Record<Lens, string> = {
  founder:
    "Tell me what your business needs: a website, an app, a voice agent, automated posts and ads, or something that doesn't have a name yet. Send a line and I'll usually reply within a day.",
  recruiter:
    "I'm open to AI engineering and senior front-end roles, remote or in London, Ontario. Send the role and I'll usually reply within a day.",
  engineer:
    "Want to compare notes on agents, model routing or a gnarly front end? Send a line and I'll usually reply within a day.",
};

export const DAY_PROMPTS = [
  "Day 1: Share what long-term commitment means to each of you.",
  "Day 2: Discuss how each person handles conflict and repair.",
  "Day 3: Align on weekly communication expectations.",
  "Day 4: Talk through boundaries with work, friends, and family.",
  "Day 5: Compare lifestyle pace and social energy needs.",
  "Day 6: Discuss financial values and future planning habits.",
  "Day 7: Talk about emotional reassurance and independence.",
  "Day 8: Share your vision for partnership roles.",
  "Day 9: Discuss major life goals over the next 3 years.",
  "Day 10: Explore compatibility around home, routine, and rest.",
  "Day 11: Discuss children/family expectations if relevant.",
  "Day 12: Share non-negotiables and flexible preferences.",
  "Day 13: Reflect on where you feel aligned and uncertain.",
  "Day 14: Decide whether to continue, pause, or respectfully close."
] as const;

export function promptForDay(day: number): string {
  const index = Math.min(Math.max(day, 1), 14) - 1;
  return DAY_PROMPTS[index] ?? DAY_PROMPTS[0];
}

export function topicSuggestions(): string[] {
  return [
    "How do you want us to repair after conflict?",
    "What does reassurance look like for you?",
    "How much planning vs spontaneity feels healthy?",
    "How do you picture family and lifestyle priorities?",
    "What weekly rhythm would feel sustainable for us?",
    "What are your top long-term relationship values?"
  ];
}

import type { LucyExtractionSample } from "@/lib/onboarding/lucy/extractionAccuracy";

export const LUCY_EXTRACTION_SAMPLES: LucyExtractionSample[] = [
  // Internal set (20)
  { id: "i-1", source: "internal", input: "we had different life goals and timelines", expected: { past_attribution: "misaligned_goals" } },
  { id: "i-2", source: "internal", input: "the issue was communication and constant conflict", expected: { past_attribution: "conflict_comm" } },
  { id: "i-3", source: "internal", input: "i felt unseen and emotionally distant from them", expected: { past_attribution: "emotional_disconnect" } },
  { id: "i-4", source: "internal", input: "i felt smothered and needed more independence", expected: { past_attribution: "autonomy" } },
  { id: "i-5", source: "internal", input: "distance and work timing got in the way", expected: { past_attribution: "external" } },

  { id: "i-6", source: "internal", input: "i resolve conflict right away in the moment", expected: { conflict_speed: 1 } },
  { id: "i-7", source: "internal", input: "i usually lean in pretty quickly after cooling down", expected: { conflict_speed: 2 } },
  { id: "i-8", source: "internal", input: "it depends and varies by situation", expected: { conflict_speed: 3 } },
  { id: "i-9", source: "internal", input: "i need time to process first", expected: { conflict_speed: 4 } },
  { id: "i-10", source: "internal", input: "i go silent for days and need a lot of space", expected: { conflict_speed: 5 } },

  { id: "i-11", source: "internal", input: "when stressed i need someone to listen and hear me", expected: { support_need: "validation" } },
  { id: "i-12", source: "internal", input: "practical help and solutions calm me down", expected: { support_need: "practical" } },
  { id: "i-13", source: "internal", input: "being close and held helps most", expected: { support_need: "presence" } },
  { id: "i-14", source: "internal", input: "space first then check in later", expected: { support_need: "space" } },
  { id: "i-15", source: "internal", input: "healthy distraction helps me reset", expected: { support_need: "distraction" } },

  { id: "i-16", source: "internal", input: "i am an open book and share deeply", expected: { emotional_openness: 1 } },
  { id: "i-17", source: "internal", input: "i open up once safe and usually with trust", expected: { emotional_openness: 2 } },
  { id: "i-18", source: "internal", input: "i am mixed and depends on context", expected: { emotional_openness: 3 } },
  { id: "i-19", source: "internal", input: "i am private and guarded", expected: { emotional_openness: 4 } },
  { id: "i-20", source: "internal", input: "i keep it in and rarely share feelings", expected: { emotional_openness: 5 } },

  // Pilot set (20)
  { id: "p-1", source: "pilot", input: "i show love mostly through acts and quality time", expected: { love_expression: ["acts", "time"] } },
  { id: "p-2", source: "pilot", input: "my care looks like words and physical closeness", expected: { love_expression: ["words", "physical"] } },
  { id: "p-3", source: "pilot", input: "i show love with thoughtful gifts and acts", expected: { love_expression: ["gifts", "acts"] } },
  { id: "p-4", source: "pilot", input: "quality time and words are my defaults", expected: { love_expression: ["time", "words"] } },
  { id: "p-5", source: "pilot", input: "physical closeness plus quality time", expected: { love_expression: ["physical", "time"] } },

  { id: "p-6", source: "pilot", input: "i want an independent together relationship", expected: { relationship_vision: "independent" } },
  { id: "p-7", source: "pilot", input: "my ideal is deeply intertwined and enmeshed", expected: { relationship_vision: "enmeshed" } },
  { id: "p-8", source: "pilot", input: "friendship and best-friend foundation matters most", expected: { relationship_vision: "friendship" } },
  { id: "p-9", source: "pilot", input: "i want a safe and stable partnership", expected: { relationship_vision: "safe" } },
  { id: "p-10", source: "pilot", input: "shared adventure is the dream", expected: { relationship_vision: "adventure" } },

  { id: "p-11", source: "pilot", input: "my strengths are consistency and loyalty", expected: { relational_strengths: ["consistency", "loyalty"] } },
  { id: "p-12", source: "pilot", input: "i bring honesty and joy", expected: { relational_strengths: ["honesty", "joy"] } },
  { id: "p-13", source: "pilot", input: "support and loyalty are my top strengths", expected: { relational_strengths: ["support", "loyalty"] } },
  { id: "p-14", source: "pilot", input: "consistency with support is what i bring", expected: { relational_strengths: ["consistency", "support"] } },
  { id: "p-15", source: "pilot", input: "honesty and consistency", expected: { relational_strengths: ["honesty", "consistency"] } },

  { id: "p-16", source: "pilot", input: "i want deeper honesty this time", expected: { growth_intention: "depth" } },
  { id: "p-17", source: "pilot", input: "better balance matters most now", expected: { growth_intention: "balance" } },
  { id: "p-18", source: "pilot", input: "i want to feel chosen consistently", expected: { growth_intention: "chosen" } },
  { id: "p-19", source: "pilot", input: "i want less conflict and more calm peace", expected: { growth_intention: "peace" } },
  { id: "p-20", source: "pilot", input: "real alignment is what i need", expected: { growth_intention: "alignment" } }
];

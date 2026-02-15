export type LookingFor = "marriage_minded" | "serious_relationship" | "exploring";

export type AgeRange = "24_30" | "31_37" | "38_45" | "46_plus";
export type LocationPreference = "same_city" | "relocatable" | "remote_ok";

export type BigFive = {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  emotionalStability: number;
};

export type Tendencies = {
  attachmentAnxiety: number;
  attachmentAvoidance: number;
  conflictRepair: number;
  emotionalRegulation: number;
  noveltyPreference: number;
};

export type OnboardingProfile = {
  id: string;
  firstName: string;
  ageRange: AgeRange;
  locationPreference: LocationPreference;
  intent: {
    lookingFor: LookingFor;
    timelineMonths: number;
    readiness: number;
    weeklyCapacity: number;
  };
  tendencies: Tendencies;
  personality: BigFive;
  createdAt: string;
};

export type MatchResult = {
  candidateId: string;
  candidateFirstName: string;
  totalScore: number;
  hardFilterPass: boolean;
  reasons: string[];
  topFitReasons: string[];
  potentialFrictionPoints: string[];
  conversationPrompts: string[];
  componentScores: {
    intent: number;
    lifestyle: number;
    attachment: number;
    conflictRegulation: number;
    personality: number;
    novelty: number;
  };
};

export type DecisionState =
  | "not_started"
  | "active_intro"
  | "active_values"
  | "active_stress_test"
  | "active_decision"
  | "completed"
  | "paused";

export type DecisionTrack = {
  id: string;
  userId: string;
  state: DecisionState;
  day: number;
  reflectionCount: number;
  createdAt: string;
  updatedAt: string;
  previousState: Exclude<DecisionState, "not_started" | "completed" | "paused"> | null;
};

export type AccountUser = {
  id: string;
  email: string;
  firstName: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
};

export type UserCalibration = {
  userId: string;
  weights: {
    intent: number;
    lifestyle: number;
    attachment: number;
    conflictRegulation: number;
    personality: number;
    novelty: number;
  };
  updatedAt: string;
};

export type UserPhoto = {
  id: string;
  slot: number;
  mimeType: string;
  storagePath: string;
  url: string;
  createdAt: string;
  updatedAt: string;
};

import type { DecisionTrack, LookingFor, OnboardingProfile } from "@/lib/domain/types";
import type { DecisionAction } from "@/lib/decision-track/stateMachine";
import { getPromptForDay, transitionDecisionTrack } from "@/lib/decision-track/stateMachine";

export type AppStats = {
  generatedTracks: number;
  savedProfiles: number;
  activeTracks: number;
  startedAt: string;
};

type SaveProfileInput = Omit<OnboardingProfile, "id" | "createdAt">;

export interface DatabaseClient {
  ping(): Promise<"ok">;
  incrementGeneratedTracks(): Promise<number>;
  saveLookingFor(value: LookingFor): Promise<void>;
  saveProfile(input: SaveProfileInput): Promise<OnboardingProfile>;
  getProfile(userId: string): Promise<OnboardingProfile | null>;
  getCandidatePool(excludeUserId: string): Promise<OnboardingProfile[]>;
  createDecisionTrack(userId: string): Promise<{ track: DecisionTrack; prompt: string }>;
  advanceDecisionTrack(
    trackId: string,
    action: DecisionAction
  ): Promise<{ track: DecisionTrack; prompt: string } | null>;
  getStats(): Promise<AppStats>;
}

class MockDatabaseClient implements DatabaseClient {
  private generatedTracks = 0;
  private lookingFor: LookingFor | null = null;
  private readonly startedAt = new Date().toISOString();
  private readonly profiles = new Map<string, OnboardingProfile>();
  private readonly tracks = new Map<string, DecisionTrack>();

  private readonly seedProfiles: OnboardingProfile[] = [
    {
      id: "seed-ava",
      firstName: "Ava",
      ageRange: "31_37",
      locationPreference: "same_city",
      intent: { lookingFor: "marriage_minded", timelineMonths: 18, readiness: 5, weeklyCapacity: 3 },
      tendencies: {
        attachmentAnxiety: 40,
        attachmentAvoidance: 35,
        conflictRepair: 78,
        emotionalRegulation: 74,
        noveltyPreference: 55
      },
      personality: {
        openness: 62,
        conscientiousness: 80,
        extraversion: 52,
        agreeableness: 76,
        emotionalStability: 68
      },
      createdAt: this.startedAt
    },
    {
      id: "seed-liam",
      firstName: "Liam",
      ageRange: "38_45",
      locationPreference: "relocatable",
      intent: {
        lookingFor: "serious_relationship",
        timelineMonths: 24,
        readiness: 4,
        weeklyCapacity: 2
      },
      tendencies: {
        attachmentAnxiety: 48,
        attachmentAvoidance: 42,
        conflictRepair: 72,
        emotionalRegulation: 70,
        noveltyPreference: 64
      },
      personality: {
        openness: 70,
        conscientiousness: 72,
        extraversion: 60,
        agreeableness: 66,
        emotionalStability: 64
      },
      createdAt: this.startedAt
    },
    {
      id: "seed-noah",
      firstName: "Noah",
      ageRange: "31_37",
      locationPreference: "remote_ok",
      intent: { lookingFor: "exploring", timelineMonths: 36, readiness: 3, weeklyCapacity: 1 },
      tendencies: {
        attachmentAnxiety: 58,
        attachmentAvoidance: 60,
        conflictRepair: 54,
        emotionalRegulation: 57,
        noveltyPreference: 84
      },
      personality: {
        openness: 83,
        conscientiousness: 55,
        extraversion: 66,
        agreeableness: 58,
        emotionalStability: 52
      },
      createdAt: this.startedAt
    }
  ];

  async ping(): Promise<"ok"> {
    return "ok";
  }

  async incrementGeneratedTracks(): Promise<number> {
    this.generatedTracks += 1;
    return this.generatedTracks;
  }

  async saveLookingFor(value: LookingFor): Promise<void> {
    this.lookingFor = value;
  }

  async saveProfile(input: SaveProfileInput): Promise<OnboardingProfile> {
    const profile: OnboardingProfile = {
      ...input,
      id: `user-${this.profiles.size + 1}`,
      createdAt: new Date().toISOString()
    };

    this.profiles.set(profile.id, profile);
    return profile;
  }

  async getProfile(userId: string): Promise<OnboardingProfile | null> {
    return this.profiles.get(userId) ?? null;
  }

  async getCandidatePool(excludeUserId: string): Promise<OnboardingProfile[]> {
    const userProfiles = [...this.profiles.values()].filter((profile) => profile.id !== excludeUserId);
    return [...this.seedProfiles, ...userProfiles];
  }

  async createDecisionTrack(userId: string): Promise<{ track: DecisionTrack; prompt: string }> {
    const now = new Date().toISOString();
    const track: DecisionTrack = {
      id: `track-${this.tracks.size + 1}`,
      userId,
      state: "not_started",
      day: 0,
      reflectionCount: 0,
      createdAt: now,
      updatedAt: now,
      previousState: null
    };

    const started = transitionDecisionTrack(track, "start");
    this.tracks.set(started.id, started);
    return { track: started, prompt: getPromptForDay(started.day) };
  }

  async advanceDecisionTrack(
    trackId: string,
    action: DecisionAction
  ): Promise<{ track: DecisionTrack; prompt: string } | null> {
    const existing = this.tracks.get(trackId);
    if (!existing) {
      return null;
    }

    const updated = transitionDecisionTrack(existing, action);
    this.tracks.set(trackId, updated);
    const prompt = getPromptForDay(updated.day === 0 ? 1 : updated.day);
    return { track: updated, prompt };
  }

  async getStats(): Promise<AppStats> {
    return {
      generatedTracks: this.generatedTracks,
      savedProfiles: this.profiles.size,
      activeTracks: this.tracks.size,
      startedAt: this.startedAt
    };
  }
}

declare global {
  var __mockDbClient__: MockDatabaseClient | undefined;
}

function getSingletonMockClient(): MockDatabaseClient {
  if (!globalThis.__mockDbClient__) {
    globalThis.__mockDbClient__ = new MockDatabaseClient();
  }
  return globalThis.__mockDbClient__;
}

export const db: DatabaseClient = getSingletonMockClient();

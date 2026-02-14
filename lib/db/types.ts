import type {
  AccountUser,
  DecisionTrack,
  LookingFor,
  MatchResult,
  OnboardingProfile,
  UserCalibration
} from "@/lib/domain/types";
import type { DecisionAction } from "@/lib/decision-track/stateMachine";

export type AppStats = {
  generatedTracks: number;
  savedProfiles: number;
  activeTracks: number;
  users: number;
  startedAt: string;
};

export type SaveProfileInput = Omit<OnboardingProfile, "id" | "createdAt">;
export type NewUserInput = { email: string; firstName: string; password: string };
export type AuthUserInput = { id: string; email: string; firstName: string };

export interface DatabaseClient {
  ping(): Promise<"ok">;
  incrementGeneratedTracks(): Promise<number>;
  saveLookingFor(userId: string, value: LookingFor): Promise<void>;
  createUser(input: NewUserInput): Promise<AccountUser>;
  upsertAuthUser(input: AuthUserInput): Promise<AccountUser>;
  getUserByEmail(email: string): Promise<AccountUser | null>;
  getUserById(id: string): Promise<AccountUser | null>;
  saveProfile(userId: string, input: SaveProfileInput): Promise<OnboardingProfile>;
  getProfile(userId: string): Promise<OnboardingProfile | null>;
  getCandidatePool(excludeUserId: string): Promise<OnboardingProfile[]>;
  saveMatchResults(userId: string, matches: MatchResult[]): Promise<void>;
  getCalibration(userId: string): Promise<UserCalibration | null>;
  saveCalibration(userId: string, feltRight: number): Promise<UserCalibration>;
  createDecisionTrack(userId: string): Promise<{ track: DecisionTrack; prompt: string }>;
  getTrackById(trackId: string): Promise<DecisionTrack | null>;
  advanceDecisionTrack(
    trackId: string,
    action: DecisionAction
  ): Promise<{ track: DecisionTrack; prompt: string } | null>;
  getStats(): Promise<AppStats>;
}

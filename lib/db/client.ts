import crypto from "node:crypto";
import type { AccountUser, DecisionTrack, MatchResult, OnboardingProfile, UserCalibration } from "@/lib/domain/types";
import type { DecisionAction } from "@/lib/decision-track/stateMachine";
import { getPromptForDay, transitionDecisionTrack } from "@/lib/decision-track/stateMachine";
import { createSalt, hashPassword } from "@/lib/security/password";
import { readStore, writeStore } from "@/lib/storage/secureStore";
import { seedProfiles } from "@/lib/db/seedProfiles";
import type { AppStats, AuthUserInput, DatabaseClient, NewUserInput, SaveProfileInput } from "@/lib/db/types";
import { validateServerEnv } from "@/lib/config/env.server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function nowIso(): string {
  return new Date().toISOString();
}

class EncryptedStoreClient implements DatabaseClient {
  async ping(): Promise<"ok"> {
    readStore();
    return "ok";
  }

  async incrementGeneratedTracks(): Promise<number> {
    const data = readStore();
    data.generatedTracks += 1;
    writeStore(data);
    return data.generatedTracks;
  }

  async saveLookingFor(userId: string, value: OnboardingProfile["intent"]["lookingFor"]): Promise<void> {
    const data = readStore();
    data.lookingFor[userId] = value;
    writeStore(data);
  }

  async createUser(input: NewUserInput): Promise<AccountUser> {
    const data = readStore();
    const existing = data.users.find((user) => user.email.toLowerCase() === input.email.toLowerCase());
    if (existing) {
      throw new Error("Email already exists");
    }

    const salt = createSalt();
    const user: AccountUser = {
      id: crypto.randomUUID(),
      email: input.email.trim().toLowerCase(),
      firstName: input.firstName.trim(),
      salt,
      passwordHash: hashPassword(input.password, salt),
      createdAt: nowIso()
    };
    data.users.push(user);
    writeStore(data);
    return user;
  }

  async upsertAuthUser(input: AuthUserInput): Promise<AccountUser> {
    const data = readStore();
    const existingIndex = data.users.findIndex(
      (user) => user.id === input.id || user.email.toLowerCase() === input.email.toLowerCase()
    );
    const existing = existingIndex >= 0 ? data.users[existingIndex] : null;
    const user: AccountUser = {
      id: input.id,
      email: input.email.trim().toLowerCase(),
      firstName: input.firstName.trim(),
      salt: existing?.salt ?? "external_auth",
      passwordHash: existing?.passwordHash ?? "external_auth",
      createdAt: existing?.createdAt ?? nowIso()
    };
    if (existingIndex >= 0) {
      data.users[existingIndex] = user;
    } else {
      data.users.push(user);
    }
    writeStore(data);
    return user;
  }

  async getUserByEmail(email: string): Promise<AccountUser | null> {
    const data = readStore();
    return data.users.find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null;
  }

  async getUserById(id: string): Promise<AccountUser | null> {
    const data = readStore();
    return data.users.find((user) => user.id === id) ?? null;
  }

  async saveProfile(userId: string, input: SaveProfileInput): Promise<OnboardingProfile> {
    const data = readStore();
    const existingIndex = data.profiles.findIndex((profile) => profile.id === userId);
    const existing = existingIndex >= 0 ? data.profiles[existingIndex] : null;
    const profile: OnboardingProfile = {
      ...input,
      id: userId,
      createdAt: existing?.createdAt ?? nowIso()
    };

    if (existingIndex >= 0) {
      data.profiles[existingIndex] = profile;
    } else {
      data.profiles.push(profile);
    }
    writeStore(data);
    return profile;
  }

  async getProfile(userId: string): Promise<OnboardingProfile | null> {
    const data = readStore();
    return data.profiles.find((profile) => profile.id === userId) ?? null;
  }

  async getCandidatePool(excludeUserId: string): Promise<OnboardingProfile[]> {
    const data = readStore();
    const userProfiles = data.profiles.filter((profile) => profile.id !== excludeUserId);
    return [...seedProfiles, ...userProfiles];
  }

  async saveMatchResults(): Promise<void> {}

  async getCalibration(userId: string): Promise<UserCalibration | null> {
    const data = readStore();
    return data.calibrations.find((entry) => entry.userId === userId) ?? null;
  }

  async saveCalibration(userId: string, feltRight: number): Promise<UserCalibration> {
    const data = readStore();
    const base = (feltRight - 3) * 0.02;
    const current =
      data.calibrations.find((entry) => entry.userId === userId) ??
      ({
        userId,
        weights: {
          intent: 0.25,
          lifestyle: 0.2,
          attachment: 0.15,
          conflictRegulation: 0.2,
          personality: 0.15,
          novelty: 0.05
        },
        updatedAt: nowIso()
      } satisfies UserCalibration);

    current.weights.conflictRegulation = Math.max(0.1, current.weights.conflictRegulation + base);
    current.weights.intent = Math.max(0.15, current.weights.intent + base / 2);
    current.weights.personality = Math.max(0.1, current.weights.personality - base / 2);

    const total =
      current.weights.intent +
      current.weights.lifestyle +
      current.weights.attachment +
      current.weights.conflictRegulation +
      current.weights.personality +
      current.weights.novelty;

    current.weights.intent /= total;
    current.weights.lifestyle /= total;
    current.weights.attachment /= total;
    current.weights.conflictRegulation /= total;
    current.weights.personality /= total;
    current.weights.novelty /= total;
    current.updatedAt = nowIso();

    const existingIndex = data.calibrations.findIndex((entry) => entry.userId === userId);
    if (existingIndex >= 0) {
      data.calibrations[existingIndex] = current;
    } else {
      data.calibrations.push(current);
    }
    writeStore(data);
    return current;
  }

  async createDecisionTrack(userId: string): Promise<{ track: DecisionTrack; prompt: string }> {
    const data = readStore();
    const track: DecisionTrack = {
      id: crypto.randomUUID(),
      userId,
      state: "not_started",
      day: 0,
      reflectionCount: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      previousState: null
    };
    const started = transitionDecisionTrack(track, "start");
    data.tracks.push(started);
    writeStore(data);
    return { track: started, prompt: getPromptForDay(started.day) };
  }

  async getTrackById(trackId: string): Promise<DecisionTrack | null> {
    const data = readStore();
    return data.tracks.find((track) => track.id === trackId) ?? null;
  }

  async advanceDecisionTrack(
    trackId: string,
    action: DecisionAction
  ): Promise<{ track: DecisionTrack; prompt: string } | null> {
    const data = readStore();
    const index = data.tracks.findIndex((track) => track.id === trackId);
    if (index < 0) {
      return null;
    }
    const current = data.tracks[index];
    if (!current) {
      return null;
    }
    const updated = transitionDecisionTrack(current, action);
    data.tracks[index] = updated;
    writeStore(data);
    return { track: updated, prompt: getPromptForDay(updated.day === 0 ? 1 : updated.day) };
  }

  async getStats(): Promise<AppStats> {
    const data = readStore();
    return {
      generatedTracks: data.generatedTracks,
      savedProfiles: data.profiles.length,
      activeTracks: data.tracks.length,
      users: data.users.length,
      startedAt: data.startedAt
    };
  }
}

class SupabaseRlsClient implements DatabaseClient {
  private async supabase() {
    return createServerSupabaseClient();
  }

  private profileFromRow(row: Record<string, unknown>): OnboardingProfile {
    return {
      id: String(row.user_id),
      firstName: String(row.first_name),
      ageRange: row.age_range as OnboardingProfile["ageRange"],
      locationPreference: row.location_preference as OnboardingProfile["locationPreference"],
      intent: row.intent as OnboardingProfile["intent"],
      tendencies: row.tendencies as OnboardingProfile["tendencies"],
      personality: row.personality as OnboardingProfile["personality"],
      createdAt: String(row.created_at)
    };
  }

  private userFromRow(row: Record<string, unknown>): AccountUser {
    return {
      id: String(row.id ?? ""),
      email: String(row.email ?? ""),
      firstName: String(row.first_name ?? ""),
      salt: String(row.salt ?? ""),
      passwordHash: String(row.password_hash ?? ""),
      createdAt: String(row.created_at ?? "")
    };
  }

  private trackFromRow(row: Record<string, unknown>): DecisionTrack {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      state: row.state as DecisionTrack["state"],
      day: Number(row.day),
      reflectionCount: Number(row.reflection_count),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      previousState: (row.previous_state ?? null) as DecisionTrack["previousState"]
    };
  }

  async ping(): Promise<"ok"> {
    const supabase = await this.supabase();
    const { error } = await supabase.from("app_users").select("id").limit(1);
    if (error) {
      throw new Error("Supabase request failed");
    }
    return "ok";
  }

  async incrementGeneratedTracks(): Promise<number> {
    return 0;
  }

  async saveLookingFor(): Promise<void> {
    return;
  }

  async createUser(input: NewUserInput): Promise<AccountUser> {
    const existing = await this.getUserByEmail(input.email);
    if (existing) {
      throw new Error("Email already exists");
    }
    const user: AccountUser = {
      id: crypto.randomUUID(),
      email: input.email.trim().toLowerCase(),
      firstName: input.firstName.trim(),
      salt: "external_auth",
      passwordHash: "external_auth",
      createdAt: nowIso()
    };
    return user;
  }

  async upsertAuthUser(input: AuthUserInput): Promise<AccountUser> {
    const supabase = await this.supabase();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user || authData.user.id !== input.id) {
      throw new Error("Unauthorized");
    }

    const { data, error } = await supabase
      .from("app_users")
      .upsert(
        {
          id: input.id,
          email: input.email.trim().toLowerCase(),
          first_name: input.firstName.trim(),
          password_hash: "external_auth",
          salt: "external_auth"
        },
        { onConflict: "id" }
      )
      .select("*")
      .single();

    if (error || !data) {
      throw new Error("Supabase request failed");
    }

    return this.userFromRow(data as Record<string, unknown>);
  }

  async getUserByEmail(email: string): Promise<AccountUser | null> {
    const supabase = await this.supabase();
    const { data, error } = await supabase
      .from("app_users")
      .select("*")
      .eq("email", email.toLowerCase())
      .maybeSingle();

    if (error) {
      throw new Error("Supabase request failed");
    }

    return data ? this.userFromRow(data as Record<string, unknown>) : null;
  }

  async getUserById(id: string): Promise<AccountUser | null> {
    const supabase = await this.supabase();
    const { data, error } = await supabase.from("app_users").select("*").eq("id", id).maybeSingle();

    if (error) {
      throw new Error("Supabase request failed");
    }

    return data ? this.userFromRow(data as Record<string, unknown>) : null;
  }

  async saveProfile(userId: string, input: SaveProfileInput): Promise<OnboardingProfile> {
    const supabase = await this.supabase();
    const { data, error } = await supabase
      .from("onboarding_profiles")
      .upsert(
        {
          user_id: userId,
          first_name: input.firstName,
          age_range: input.ageRange,
          location_preference: input.locationPreference,
          intent: input.intent,
          tendencies: input.tendencies,
          personality: input.personality,
          updated_at: nowIso()
        },
        { onConflict: "user_id" }
      )
      .select("*")
      .single();

    if (error || !data) {
      throw new Error("Supabase request failed");
    }

    return this.profileFromRow(data as Record<string, unknown>);
  }

  async getProfile(userId: string): Promise<OnboardingProfile | null> {
    const supabase = await this.supabase();
    const { data, error } = await supabase
      .from("onboarding_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new Error("Supabase request failed");
    }

    return data ? this.profileFromRow(data as Record<string, unknown>) : null;
  }

  async getCandidatePool(excludeUserId: string): Promise<OnboardingProfile[]> {
    const supabase = await this.supabase();
    const { data } = await supabase
      .from("onboarding_profiles")
      .select("*")
      .neq("user_id", excludeUserId)
      .limit(50);

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    return [...seedProfiles, ...rows.map((row) => this.profileFromRow(row))];
  }

  async saveMatchResults(userId: string, matches: MatchResult[]): Promise<void> {
    if (matches.length === 0) {
      return;
    }

    const payload = matches.map((match) => ({
      user_id: userId,
      candidate_id: match.candidateId,
      candidate_first_name: match.candidateFirstName,
      total_score: match.totalScore,
      hard_filter_pass: match.hardFilterPass,
      reasons: match.reasons,
      top_fit_reasons: match.topFitReasons,
      potential_friction_points: match.potentialFrictionPoints,
      conversation_prompts: match.conversationPrompts,
      component_scores: match.componentScores
    }));

    const supabase = await this.supabase();
    const { error } = await supabase.from("match_results").insert(payload);
    if (error) {
      throw new Error("Supabase request failed");
    }
  }

  async getCalibration(userId: string): Promise<UserCalibration | null> {
    const supabase = await this.supabase();
    const { data, error } = await supabase
      .from("user_calibrations")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new Error("Supabase request failed");
    }

    if (!data) {
      return null;
    }

    return {
      userId: String(data.user_id),
      weights: data.weights as UserCalibration["weights"],
      updatedAt: String(data.updated_at)
    };
  }

  async saveCalibration(userId: string, feltRight: number): Promise<UserCalibration> {
    const current =
      (await this.getCalibration(userId)) ??
      ({
        userId,
        weights: {
          intent: 0.25,
          lifestyle: 0.2,
          attachment: 0.15,
          conflictRegulation: 0.2,
          personality: 0.15,
          novelty: 0.05
        },
        updatedAt: nowIso()
      } satisfies UserCalibration);

    const base = (feltRight - 3) * 0.02;
    current.weights.conflictRegulation = Math.max(0.1, current.weights.conflictRegulation + base);
    current.weights.intent = Math.max(0.15, current.weights.intent + base / 2);
    current.weights.personality = Math.max(0.1, current.weights.personality - base / 2);

    const total =
      current.weights.intent +
      current.weights.lifestyle +
      current.weights.attachment +
      current.weights.conflictRegulation +
      current.weights.personality +
      current.weights.novelty;

    current.weights.intent /= total;
    current.weights.lifestyle /= total;
    current.weights.attachment /= total;
    current.weights.conflictRegulation /= total;
    current.weights.personality /= total;
    current.weights.novelty /= total;
    current.updatedAt = nowIso();

    const supabase = await this.supabase();
    const { data, error } = await supabase
      .from("user_calibrations")
      .upsert(
        {
          user_id: current.userId,
          weights: current.weights,
          updated_at: current.updatedAt
        },
        { onConflict: "user_id" }
      )
      .select("*")
      .single();

    if (error || !data) {
      throw new Error("Supabase request failed");
    }

    return {
      userId: String(data.user_id),
      weights: data.weights as UserCalibration["weights"],
      updatedAt: String(data.updated_at)
    };
  }

  async createDecisionTrack(userId: string): Promise<{ track: DecisionTrack; prompt: string }> {
    const seed: DecisionTrack = {
      id: crypto.randomUUID(),
      userId,
      state: "not_started",
      day: 0,
      reflectionCount: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      previousState: null
    };

    const started = transitionDecisionTrack(seed, "start");
    const supabase = await this.supabase();
    const { data, error } = await supabase
      .from("decision_tracks")
      .insert({
        id: started.id,
        user_id: started.userId,
        state: started.state,
        day: started.day,
        reflection_count: started.reflectionCount,
        created_at: started.createdAt,
        updated_at: started.updatedAt,
        previous_state: started.previousState
      })
      .select("*")
      .single();

    if (error || !data) {
      throw new Error("Supabase request failed");
    }

    const track = this.trackFromRow(data as Record<string, unknown>);
    return { track, prompt: getPromptForDay(track.day) };
  }

  async getTrackById(trackId: string): Promise<DecisionTrack | null> {
    const supabase = await this.supabase();
    const { data, error } = await supabase
      .from("decision_tracks")
      .select("*")
      .eq("id", trackId)
      .maybeSingle();

    if (error) {
      throw new Error("Supabase request failed");
    }

    return data ? this.trackFromRow(data as Record<string, unknown>) : null;
  }

  async advanceDecisionTrack(
    trackId: string,
    action: DecisionAction
  ): Promise<{ track: DecisionTrack; prompt: string } | null> {
    const existing = await this.getTrackById(trackId);
    if (!existing) {
      return null;
    }

    const updated = transitionDecisionTrack(existing, action);
    const supabase = await this.supabase();
    const { data, error } = await supabase
      .from("decision_tracks")
      .update({
        state: updated.state,
        day: updated.day,
        reflection_count: updated.reflectionCount,
        updated_at: updated.updatedAt,
        previous_state: updated.previousState
      })
      .eq("id", trackId)
      .select("*")
      .single();

    if (error || !data) {
      return null;
    }

    const track = this.trackFromRow(data as Record<string, unknown>);
    return { track, prompt: getPromptForDay(track.day === 0 ? 1 : track.day) };
  }

  async getStats(): Promise<AppStats> {
    const supabase = await this.supabase();
    const [users, profiles, tracks] = await Promise.all([
      supabase.from("app_users").select("id", { count: "exact", head: true }),
      supabase.from("onboarding_profiles").select("user_id", { count: "exact", head: true }),
      supabase.from("decision_tracks").select("id", { count: "exact", head: true })
    ]);

    return {
      generatedTracks: tracks.count ?? 0,
      savedProfiles: profiles.count ?? 0,
      activeTracks: tracks.count ?? 0,
      users: users.count ?? 0,
      startedAt: nowIso()
    };
  }
}

class ResilientDatabaseClient implements DatabaseClient {
  constructor(
    private readonly primary: DatabaseClient,
    private readonly fallback: DatabaseClient
  ) {}

  private async withFallback<T>(operation: string, run: () => Promise<T>, runFallback: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        const message = error instanceof Error ? error.message : "unknown";
        console.warn(`[db] primary client failed for ${operation}, using local fallback`, { message });
      }
      return runFallback();
    }
  }

  ping() {
    return this.withFallback("ping", () => this.primary.ping(), () => this.fallback.ping());
  }
  incrementGeneratedTracks() {
    return this.withFallback(
      "incrementGeneratedTracks",
      () => this.primary.incrementGeneratedTracks(),
      () => this.fallback.incrementGeneratedTracks()
    );
  }
  saveLookingFor(userId: string, value: OnboardingProfile["intent"]["lookingFor"]) {
    return this.withFallback(
      "saveLookingFor",
      () => this.primary.saveLookingFor(userId, value),
      () => this.fallback.saveLookingFor(userId, value)
    );
  }
  createUser(input: NewUserInput) {
    return this.withFallback("createUser", () => this.primary.createUser(input), () => this.fallback.createUser(input));
  }
  upsertAuthUser(input: AuthUserInput) {
    return this.withFallback(
      "upsertAuthUser",
      () => this.primary.upsertAuthUser(input),
      () => this.fallback.upsertAuthUser(input)
    );
  }
  getUserByEmail(email: string) {
    return this.withFallback(
      "getUserByEmail",
      () => this.primary.getUserByEmail(email),
      () => this.fallback.getUserByEmail(email)
    );
  }
  getUserById(id: string) {
    return this.withFallback("getUserById", () => this.primary.getUserById(id), () => this.fallback.getUserById(id));
  }
  saveProfile(userId: string, input: SaveProfileInput) {
    return this.withFallback(
      "saveProfile",
      () => this.primary.saveProfile(userId, input),
      () => this.fallback.saveProfile(userId, input)
    );
  }
  getProfile(userId: string) {
    return this.withFallback(
      "getProfile",
      () => this.primary.getProfile(userId),
      () => this.fallback.getProfile(userId)
    );
  }
  getCandidatePool(excludeUserId: string) {
    return this.withFallback(
      "getCandidatePool",
      () => this.primary.getCandidatePool(excludeUserId),
      () => this.fallback.getCandidatePool(excludeUserId)
    );
  }
  saveMatchResults(userId: string, matches: MatchResult[]) {
    return this.withFallback(
      "saveMatchResults",
      () => this.primary.saveMatchResults(userId, matches),
      () => this.fallback.saveMatchResults(userId, matches)
    );
  }
  getCalibration(userId: string) {
    return this.withFallback(
      "getCalibration",
      () => this.primary.getCalibration(userId),
      () => this.fallback.getCalibration(userId)
    );
  }
  saveCalibration(userId: string, feltRight: number) {
    return this.withFallback(
      "saveCalibration",
      () => this.primary.saveCalibration(userId, feltRight),
      () => this.fallback.saveCalibration(userId, feltRight)
    );
  }
  createDecisionTrack(userId: string) {
    return this.withFallback(
      "createDecisionTrack",
      () => this.primary.createDecisionTrack(userId),
      () => this.fallback.createDecisionTrack(userId)
    );
  }
  getTrackById(trackId: string) {
    return this.withFallback(
      "getTrackById",
      () => this.primary.getTrackById(trackId),
      () => this.fallback.getTrackById(trackId)
    );
  }
  advanceDecisionTrack(trackId: string, action: DecisionAction) {
    return this.withFallback(
      "advanceDecisionTrack",
      () => this.primary.advanceDecisionTrack(trackId, action),
      () => this.fallback.advanceDecisionTrack(trackId, action)
    );
  }
  getStats() {
    return this.withFallback("getStats", () => this.primary.getStats(), () => this.fallback.getStats());
  }
}

type EnvLike = {
  APP_ENCRYPTION_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  ALLOW_LOCAL_FALLBACK?: string;
};

export function resolveDatabaseClient(env: EnvLike = process.env): DatabaseClient {
  validateServerEnv(env);

  const url = env.SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY;
  const strictSupabase = env.NODE_ENV === "production" || env.VERCEL_ENV === "preview";
  const localFallbackAllowed =
    env.NODE_ENV === "test" || env.NODE_ENV === "development" || env.ALLOW_LOCAL_FALLBACK === "true";

  if (url && anonKey) {
    const primary = new SupabaseRlsClient();
    if (localFallbackAllowed && !strictSupabase) {
      return new ResilientDatabaseClient(primary, new EncryptedStoreClient());
    }
    return primary;
  }

  if (strictSupabase) {
    throw new Error("Supabase-only mode: SUPABASE_URL and SUPABASE_ANON_KEY are required in production/preview.");
  }

  if (!localFallbackAllowed) {
    throw new Error("Local fallback disabled: set ALLOW_LOCAL_FALLBACK=true or configure Supabase env vars.");
  }

  return new EncryptedStoreClient();
}

declare global {
  var __dbClient__: DatabaseClient | undefined;
}

if (!globalThis.__dbClient__) {
  globalThis.__dbClient__ = resolveDatabaseClient();
}

export const db: DatabaseClient = globalThis.__dbClient__;

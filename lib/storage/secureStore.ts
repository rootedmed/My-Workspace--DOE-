import fs from "node:fs";
import path from "node:path";
import type { AccountUser, DecisionTrack, OnboardingProfile, UserCalibration } from "@/lib/domain/types";
import { decryptString, encryptString } from "@/lib/security/crypto";

export type PersistedData = {
  startedAt: string;
  generatedTracks: number;
  lookingFor: Record<string, string | null>;
  users: AccountUser[];
  profiles: OnboardingProfile[];
  tracks: DecisionTrack[];
  calibrations: UserCalibration[];
};

const storeDir = path.join(process.cwd(), ".tmp");
const storePath = path.join(storeDir, "secure-db.enc");

const initialData: PersistedData = {
  startedAt: new Date().toISOString(),
  generatedTracks: 0,
  lookingFor: {},
  users: [],
  profiles: [],
  tracks: [],
  calibrations: []
};

function ensureStoreFile(): void {
  if (!fs.existsSync(storeDir)) {
    fs.mkdirSync(storeDir, { recursive: true });
  }
  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, encryptString(JSON.stringify(initialData)), "utf8");
  }
}

export function readStore(): PersistedData {
  ensureStoreFile();
  const payload = fs.readFileSync(storePath, "utf8");
  try {
    const raw = decryptString(payload);
    return JSON.parse(raw) as PersistedData;
  } catch {
    return initialData;
  }
}

export function writeStore(data: PersistedData): void {
  ensureStoreFile();
  fs.writeFileSync(storePath, encryptString(JSON.stringify(data)), "utf8");
}

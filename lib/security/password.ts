import crypto from "node:crypto";

export function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

export function createSalt(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function verifyPassword(password: string, salt: string, hash: string): boolean {
  const candidate = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(hash, "hex"));
}

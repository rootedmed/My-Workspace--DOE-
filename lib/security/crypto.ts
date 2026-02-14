import crypto from "node:crypto";

const ALGO = "aes-256-gcm";

function getKeyMaterial(): Buffer {
  const keyFromEnv = process.env.APP_ENCRYPTION_KEY;
  if (keyFromEnv) {
    const normalized = keyFromEnv.trim();
    const asBuffer = Buffer.from(normalized, "base64");
    if (asBuffer.length === 32) {
      return asBuffer;
    }
    return crypto.createHash("sha256").update(normalized).digest();
  }

  // Test/dev fallback so local setup works; production should set APP_ENCRYPTION_KEY.
  return crypto.createHash("sha256").update("dev-only-key-change-me").digest();
}

export function encryptString(plainText: string): string {
  const key = getKeyMaterial();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptString(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid encrypted payload");
  }

  const key = getKeyMaterial();
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final()
  ]);
  return decrypted.toString("utf8");
}

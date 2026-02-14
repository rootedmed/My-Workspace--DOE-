import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ALGO = "aes-256-gcm";
const storeDir = path.join(process.cwd(), ".tmp");
const storePath = path.join(storeDir, "secure-db.enc");

function keyMaterial() {
  const value = process.env.APP_ENCRYPTION_KEY ?? "dev-only-key-change-me";
  const asBuffer = Buffer.from(value, "base64");
  if (asBuffer.length === 32) {
    return asBuffer;
  }
  return crypto.createHash("sha256").update(value).digest();
}

function encrypt(plainText) {
  const iv = crypto.randomBytes(12);
  const key = keyMaterial();
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

function decrypt(payload) {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  const key = keyMaterial();
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final()
  ]);
  return decrypted.toString("utf8");
}

function scrypt(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function ensureStore() {
  if (!fs.existsSync(storeDir)) {
    fs.mkdirSync(storeDir, { recursive: true });
  }
  if (!fs.existsSync(storePath)) {
    const initial = {
      startedAt: new Date().toISOString(),
      generatedTracks: 0,
      lookingFor: {},
      users: [],
      profiles: [],
      tracks: [],
      calibrations: []
    };
    fs.writeFileSync(storePath, encrypt(JSON.stringify(initial)), "utf8");
  }
}

function readData() {
  ensureStore();
  const encrypted = fs.readFileSync(storePath, "utf8");
  return JSON.parse(decrypt(encrypted));
}

function writeData(data) {
  fs.writeFileSync(storePath, encrypt(JSON.stringify(data)), "utf8");
}

const data = readData();

const demoUsers = [
  { id: "user-100", email: "maya@example.com", firstName: "Maya", password: "demo-password" },
  { id: "user-101", email: "ryan@example.com", firstName: "Ryan", password: "demo-password" }
];

for (const demo of demoUsers) {
  if (!data.users.some((entry) => entry.email === demo.email)) {
    const salt = crypto.randomBytes(16).toString("hex");
    data.users.push({
      id: demo.id,
      email: demo.email,
      firstName: demo.firstName,
      salt,
      passwordHash: scrypt(demo.password, salt),
      createdAt: new Date().toISOString()
    });
  }
}

writeData(data);
console.log("Seeded demo users:", demoUsers.map((user) => user.email).join(", "));

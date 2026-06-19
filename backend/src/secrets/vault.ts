import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Encrypted secrets vault.
 * Master key derived from LAB_MASTER_KEY env var, or from a key file on disk.
 * Cipher: AES-256-GCM.
 */

const KEY_FILE = process.env.LAB_MASTER_KEY_FILE ?? join(import.meta.dir, "..", "..", "data", "master.key");

function loadMasterKey(): Buffer {
  const envKey = process.env.LAB_MASTER_KEY;
  if (envKey) {
    return createHash("sha256").update(envKey).digest();
  }
  if (existsSync(KEY_FILE)) {
    return Buffer.from(readFileSync(KEY_FILE, "utf8").trim(), "base64");
  }
  // Auto-generate a master key on first run
  const key = randomBytes(32);
  mkdirSync(join(KEY_FILE, ".."), { recursive: true });
  writeFileSync(KEY_FILE, key.toString("base64"), { mode: 0o600 });
  console.log(`[vault] generated new master key at ${KEY_FILE}`);
  return key;
}

const MASTER_KEY = loadMasterKey();

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
}

export function encryptSecret(plain: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", MASTER_KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return {
    ciphertext: enc.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptSecret(s: EncryptedSecret): string {
  const decipher = createDecipheriv("aes-256-gcm", MASTER_KEY, Buffer.from(s.iv, "base64"));
  decipher.setAuthTag(Buffer.from(s.authTag, "base64"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(s.ciphertext, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}
